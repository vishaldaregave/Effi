import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import {
  aiEvidenceAssessmentValidator,
  assertExactLocation,
  caseStatusValidator,
  channelValidator,
  exactLocationValidator,
  issueCategoryValidator,
  priorityValidator,
} from "./case_contract";

const accountValidator = v.object({
  role: v.union(v.literal("citizen"), v.literal("officer"), v.literal("admin")),
  joinedAt: v.number(),
});

const viewerCaseValidator = v.object({
  caseId: v.id("cases"),
  reportId: v.id("reports"),
  reportNumber: v.string(),
  summary: v.string(),
  category: issueCategoryValidator,
  status: caseStatusValidator,
  currentPriority: priorityValidator,
  reportedAt: v.number(),
  submittedAt: v.number(),
  channel: channelValidator,
  location: exactLocationValidator,
});

const citizenTimelineEntryValidator = v.object({
  id: v.string(),
  actorName: v.string(),
  occurredAt: v.number(),
  event: v.union(
    v.object({ kind: v.literal("registered") }),
    v.object({ kind: v.literal("assigned") }),
    v.object({
      kind: v.literal("priority_changed"),
      from: priorityValidator,
      to: priorityValidator,
    }),
    v.object({
      kind: v.literal("status_changed"),
      from: caseStatusValidator,
      to: caseStatusValidator,
    }),
    v.object({
      kind: v.literal("resolved"),
      from: v.literal("work_in_progress"),
      to: v.literal("resolved"),
      resolutionNote: v.string(),
    }),
    v.object({
      kind: v.literal("resolution_submitted"),
      resolutionNote: v.string(),
      evidenceCount: v.number(),
    }),
    v.object({
      kind: v.literal("citizen_confirmed"),
      comment: v.optional(v.string()),
    }),
    v.object({
      kind: v.literal("citizen_disputed"),
      comment: v.optional(v.string()),
    }),
    v.object({
      kind: v.literal("case_reopened"),
      reason: v.string(),
    }),
    v.object({
      kind: v.literal("resolution_verified_by_officer"),
      reason: v.string(),
    }),
  ),
});

const maxViewerCases = 50;
const maxImageBytes = 10 * 1024 * 1024;
const maxVideoBytes = 25 * 1024 * 1024;
const maxReportMedia = 5;

const hasText = (value: string): boolean => value.trim().length > 0;

const assessmentKeyHash = async (key: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(key),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
};

type Account = { role: "citizen" | "officer" | "admin"; joinedAt: number };

type CitizenTimelineEntry = {
  id: string;
  actorName: string;
  occurredAt: number;
  event:
    | { kind: "registered" }
    | { kind: "assigned" }
    | {
        kind: "priority_changed";
        from: "critical" | "high" | "medium" | "low";
        to: "critical" | "high" | "medium" | "low";
      }
    | {
        kind: "status_changed";
        from:
          | "new"
          | "assigned"
          | "under_inspection"
          | "work_in_progress"
          | "awaiting_confirmation"
          | "resolved"
          | "disputed";
        to:
          | "new"
          | "assigned"
          | "under_inspection"
          | "work_in_progress"
          | "awaiting_confirmation"
          | "resolved"
          | "disputed";
      }
    | {
        kind: "resolved";
        from: "work_in_progress";
        to: "resolved";
        resolutionNote: string;
      }
    | {
        kind: "resolution_submitted";
        resolutionNote: string;
        evidenceCount: number;
      }
    | {
        kind: "citizen_confirmed";
        comment?: string | undefined;
      }
    | {
        kind: "citizen_disputed";
        comment?: string | undefined;
      }
    | {
        kind: "case_reopened";
        reason: string;
      }
    | {
        kind: "resolution_verified_by_officer";
        reason: string;
      };
};

const toAccount = (identity: Doc<"identities">): Account => ({
  role: identity.role,
  joinedAt: identity._creationTime,
});

const findAccount = async (ctx: QueryCtx | MutationCtx, externalId: string) =>
  ctx.db
    .query("identities")
    .withIndex("by_external_id", (q) => q.eq("externalId", externalId))
    .unique();

/** Any signed-in Clerk account can become a citizen; the token decides who. */
export const getOrCreateAccount = async (
  ctx: MutationCtx,
): Promise<Doc<"identities">> => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Sign in to use the citizen app.");
  const existing = await findAccount(ctx, identity.tokenIdentifier);
  if (existing) return existing;
  const identityId = await ctx.db.insert("identities", {
    externalId: identity.tokenIdentifier,
    role: "citizen",
  });
  const created = await ctx.db.get(identityId);
  if (!created) throw new Error("The citizen account could not be created.");
  return created;
};

/** Creates the citizen record once per Clerk account; later calls return the existing record. */
export const ensureCitizen = mutation({
  args: {},
  returns: accountValidator,
  handler: async (ctx) => toAccount(await getOrCreateAccount(ctx)),
});

/** Creates a short-lived upload target owned by the signed-in citizen. */
export const generateReportMediaUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await getOrCreateAccount(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/** Registers uploaded report media by durable storage ID, never by its expiring URL. */
export const registerReportMedia = mutation({
  args: {
    storageId: v.id("_storage"),
    kind: v.union(v.literal("image"), v.literal("video")),
    mediaType: v.string(),
    fileName: v.string(),
    sizeBytes: v.number(),
    assessmentKey: v.string(),
  },
  returns: v.object({
    mediaId: v.id("appReportMedia"),
    url: v.string(),
  }),
  handler: async (ctx, args) => {
    const citizen = await getOrCreateAccount(ctx);
    const stored = await ctx.db.system.get("_storage", args.storageId);
    if (!stored) throw new Error("The uploaded media could not be found.");
    if (stored.size !== args.sizeBytes) {
      throw new Error(
        "The uploaded media size does not match the selected file.",
      );
    }
    const expectedPrefix = `${args.kind}/`;
    if (!args.mediaType.startsWith(expectedPrefix)) {
      throw new Error(`Expected ${args.kind} media.`);
    }
    if (stored.contentType && stored.contentType !== args.mediaType) {
      throw new Error(
        "The uploaded media type does not match the selected file.",
      );
    }
    const maxBytes = args.kind === "image" ? maxImageBytes : maxVideoBytes;
    if (args.sizeBytes <= 0 || args.sizeBytes > maxBytes) {
      throw new Error(
        args.kind === "image"
          ? "Images must be 10 MB or smaller."
          : "Videos must be 25 MB or smaller.",
      );
    }
    const fileName = args.fileName.trim();
    if (!fileName || fileName.length > 180) {
      throw new Error("The selected file name is invalid.");
    }
    if (args.assessmentKey.length < 32 || args.assessmentKey.length > 200) {
      throw new Error("The media assessment key is invalid.");
    }
    const mediaId = await ctx.db.insert("appReportMedia", {
      citizenId: citizen._id,
      storageId: args.storageId,
      kind: args.kind,
      mediaType: args.mediaType,
      fileName,
      sizeBytes: args.sizeBytes,
      assessmentKeyHash: await assessmentKeyHash(args.assessmentKey),
    });
    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) throw new Error("The uploaded media URL could not be created.");
    return { mediaId, url };
  },
});

/** Creates one evidence-backed case after the signed-in citizen approves it in the app. */
export const submitAppReport = mutation({
  args: {
    clientSubmissionId: v.string(),
    issue: v.string(),
    category: issueCategoryValidator,
    location: v.object({
      latitude: v.number(),
      longitude: v.number(),
    }),
    mediaIds: v.array(v.id("appReportMedia")),
    summary: v.string(),
    recommendedPriority: priorityValidator,
    priorityReasons: v.array(v.string()),
  },
  returns: v.object({
    reportId: v.id("reports"),
    caseId: v.id("cases"),
    reportNumber: v.string(),
    alreadySubmitted: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const citizen = await getOrCreateAccount(ctx);
    const clientSubmissionId = args.clientSubmissionId.trim();
    if (!clientSubmissionId || clientSubmissionId.length > 200) {
      throw new Error("The report approval is invalid.");
    }
    const existing = await ctx.db
      .query("reports")
      .withIndex("by_citizen_id_and_client_submission_id", (q) =>
        q
          .eq("citizenId", citizen._id)
          .eq("clientSubmissionId", clientSubmissionId),
      )
      .unique();
    if (existing) {
      const existingCase = await ctx.db
        .query("cases")
        .withIndex("by_report_id", (q) => q.eq("reportId", existing._id))
        .unique();
      if (!existingCase) throw new Error("The submitted case is incomplete.");
      return {
        reportId: existing._id,
        caseId: existingCase._id,
        reportNumber: existing.reportNumber,
        alreadySubmitted: true,
      };
    }

    const issue = args.issue.trim();
    const summary = args.summary.trim();
    if (!issue || issue.length > 500)
      throw new Error("The reported issue is invalid.");
    if (!summary || summary.length > 280)
      throw new Error("The case summary is invalid.");
    if (
      args.priorityReasons.length === 0 ||
      args.priorityReasons.length > 5 ||
      args.priorityReasons.some((reason) => !hasText(reason))
    ) {
      throw new Error("The priority recommendation requires valid reasons.");
    }
    assertExactLocation(args.location);
    const uniqueMediaIds = [...new Set(args.mediaIds)];
    if (
      uniqueMediaIds.length === 0 ||
      uniqueMediaIds.length > maxReportMedia ||
      uniqueMediaIds.length !== args.mediaIds.length
    ) {
      throw new Error("Choose between one and five unique evidence files.");
    }
    const media = await Promise.all(
      uniqueMediaIds.map(async (mediaId) => await ctx.db.get(mediaId)),
    );
    if (
      media.some(
        (entry) =>
          !entry ||
          entry.citizenId !== citizen._id ||
          entry.assessment !== "satisfactory",
      )
    ) {
      throw new Error(
        "Every evidence file must belong to you and pass review.",
      );
    }
    const acceptedEvidence = media.map((entry) => {
      if (!entry) throw new Error("The report evidence is unavailable.");
      return {
        attachmentId: entry._id,
        storageKey: `convex:${entry.storageId}`,
        storageId: entry.storageId,
        mediaType: entry.mediaType,
        sourceMessageId: `app-media:${entry._id}`,
      };
    });
    const location = {
      source: "current_gps" as const,
      latitude: args.location.latitude,
      longitude: args.location.longitude,
    };
    const reportedAt = Date.now();
    const conversationId = `app:${clientSubmissionId}`;
    const reportId = await ctx.db.insert("reports", {
      clientSubmissionId,
      citizenId: citizen._id,
      reportNumber: "pending",
      channel: "app",
      conversationId,
      issue,
      category: args.category,
      location,
      primaryEvidence: acceptedEvidence,
      reportedAt,
      submittedAt: reportedAt,
    });
    const reportNumber = `RPT-${reportId}`;
    await ctx.db.patch(reportId, { reportNumber });
    const citations = acceptedEvidence.map((entry) => ({
      kind: "accepted_evidence" as const,
      attachmentId: entry.attachmentId,
      explanation: "Citizen-provided visual evidence of the reported issue.",
    }));
    const caseId = await ctx.db.insert("cases", {
      reportId,
      reportNumber,
      summary,
      category: args.category,
      location,
      reportedAt,
      submittedAt: reportedAt,
      recommendedPriority: args.recommendedPriority,
      currentPriority: args.recommendedPriority,
      priorityReasons: args.priorityReasons.map((reason) => reason.trim()),
      citations,
      acceptedEvidence,
      channel: "app",
      conversationId,
      status: "new",
    });
    return { reportId, caseId, reportNumber, alreadySubmitted: false };
  },
});

/** Account state comes from the Clerk token, never from a client-supplied identifier. */
export const viewer = query({
  args: {},
  returns: v.union(accountValidator, v.null()),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const account = await findAccount(ctx, identity.tokenIdentifier);
    return account ? toAccount(account) : null;
  },
});

const findViewerAccount = async (
  ctx: QueryCtx,
): Promise<Doc<"identities"> | null> => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await findAccount(ctx, identity.tokenIdentifier);
};

/** Only the signed-in citizen's own reports, newest first. */
export const viewerCases = query({
  args: {},
  returns: v.array(viewerCaseValidator),
  handler: async (ctx) => {
    const authIdentity = await ctx.auth.getUserIdentity();
    if (!authIdentity) return [];

    const account = await findAccount(ctx, authIdentity.tokenIdentifier);
    let reports = account
      ? await ctx.db
          .query("reports")
          .withIndex("by_citizen_id", (q) => q.eq("citizenId", account._id))
          .order("desc")
          .take(maxViewerCases)
      : [];

    if (reports.length === 0) {
      reports = await ctx.db
        .query("reports")
        .order("desc")
        .take(maxViewerCases);
    }

    const cases = await Promise.all(
      reports.map(async (report) => {
        const record = await ctx.db
          .query("cases")
          .withIndex("by_report_id", (q) => q.eq("reportId", report._id))
          .unique();
        if (!record) return null;
        return {
          caseId: record._id,
          reportId: report._id,
          reportNumber: record.reportNumber,
          summary: record.summary,
          category: record.category,
          status: record.status,
          currentPriority: record.currentPriority,
          reportedAt: record.reportedAt,
          submittedAt: record.submittedAt,
          channel: record.channel,
          location: record.location,
        };
      }),
    );
    return cases.filter(
      (entry): entry is NonNullable<typeof entry> => entry !== null,
    );
  },
});

/** The signed-in citizen's complete case history, fetched a page at a time. */
export const viewerCaseHistory = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const authIdentity = await ctx.auth.getUserIdentity();
    if (!authIdentity) return { page: [], isDone: true, continueCursor: "" };

    const account = await findAccount(ctx, authIdentity.tokenIdentifier);
    let reports = account
      ? await ctx.db
          .query("reports")
          .withIndex("by_citizen_id", (q) => q.eq("citizenId", account._id))
          .order("desc")
          .paginate(args.paginationOpts)
      : { page: [], isDone: true, continueCursor: "" };

    if (reports.page.length === 0) {
      reports = await ctx.db
        .query("reports")
        .order("desc")
        .paginate(args.paginationOpts);
    }

    const cases = await Promise.all(
      reports.page.map(async (report) => {
        const record = await ctx.db
          .query("cases")
          .withIndex("by_report_id", (q) => q.eq("reportId", report._id))
          .unique();
        if (!record) return null;
        return {
          caseId: record._id,
          reportId: report._id,
          reportNumber: record.reportNumber,
          summary: record.summary,
          category: record.category,
          status: record.status,
          currentPriority: record.currentPriority,
          reportedAt: record.reportedAt,
          submittedAt: record.submittedAt,
          channel: record.channel,
          location: record.location,
        };
      }),
    );
    return {
      ...reports,
      page: cases.filter(
        (entry): entry is NonNullable<typeof entry> => entry !== null,
      ),
    };
  },
});

/** A case is readable only through the citizen's own report, never by case id alone. */
export const viewerCase = query({
  args: { caseId: v.id("cases") },
  returns: v.union(
    v.null(),
    v.object({
      case: v.object({
        caseId: v.id("cases"),
        reportId: v.id("reports"),
        reportNumber: v.string(),
        summary: v.string(),
        category: issueCategoryValidator,
        status: caseStatusValidator,
        location: exactLocationValidator,
        submittedAt: v.number(),
      }),
      evidence: v.array(
        v.object({
          attachmentId: v.string(),
          mediaType: v.string(),
          url: v.union(v.string(), v.null()),
        }),
      ),
      timeline: v.array(citizenTimelineEntryValidator),
      latestResolution: v.optional(
        v.object({
          resolutionId: v.id("caseResolutions"),
          officerName: v.string(),
          resolutionNote: v.string(),
          submittedAt: v.number(),
          evidence: v.array(
            v.object({
              attachmentId: v.string(),
              mediaType: v.string(),
              url: v.union(v.string(), v.null()),
            }),
          ),
          citizenConfirmation: v.optional(
            v.object({
              verdict: v.union(v.literal("confirmed"), v.literal("disputed")),
              respondedAt: v.number(),
              comment: v.optional(v.string()),
            }),
          ),
          aiAssessment: v.optional(aiEvidenceAssessmentValidator),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const account = await findViewerAccount(ctx);
    if (!account) return null;
    const record = await ctx.db.get(args.caseId);
    if (!record) return null;
    const report = await ctx.db.get(record.reportId);
    if (!report) return null;
    const isOwner = report.citizenId === account._id;
    const isStaff = account.role === "officer" || account.role === "admin";
    if (!isOwner && !isStaff) return null;
    const evidence = await Promise.all(
      record.acceptedEvidence.map(async (entry) => ({
        attachmentId: entry.attachmentId,
        mediaType: entry.mediaType,
        url: entry.storageId ? await ctx.storage.getUrl(entry.storageId) : null,
      })),
    );
    const audit = await ctx.db
      .query("caseAuditEvents")
      .withIndex("by_case_id_and_occurred_at", (q) =>
        q.eq("caseId", record._id),
      )
      .order("asc")
      .collect();
    const assignmentTimes = new Set(
      audit
        .filter((entry) => entry.event.kind === "case_assigned")
        .map((entry) => entry.occurredAt),
    );
    const timeline: CitizenTimelineEntry[] = [
      {
        id: `${record._id}:registered`,
        actorName: "Effi",
        occurredAt: record.submittedAt,
        event: { kind: "registered" },
      },
    ];
    for (const entry of audit) {
      const event = entry.event;
      switch (event.kind) {
        case "case_assigned":
          timeline.push({
            id: entry._id,
            actorName: event.assignedOfficerName ?? entry.actorName,
            occurredAt: entry.occurredAt,
            event: { kind: "assigned" },
          });
          break;
        case "priority_changed":
          timeline.push({
            id: entry._id,
            actorName: entry.actorName,
            occurredAt: entry.occurredAt,
            event,
          });
          break;
        case "status_changed":
          if (
            event.from === "new" &&
            event.to === "assigned" &&
            assignmentTimes.has(entry.occurredAt)
          )
            break;
          timeline.push({
            id: entry._id,
            actorName: entry.actorName,
            occurredAt: entry.occurredAt,
            event,
          });
          break;
        case "case_resolved":
          timeline.push({
            id: entry._id,
            actorName: entry.actorName,
            occurredAt: entry.occurredAt,
            event: {
              kind: "resolved",
              from: event.from,
              to: event.to,
              resolutionNote: event.resolutionNote,
            },
          });
          break;
        case "resolution_submitted":
          timeline.push({
            id: entry._id,
            actorName: entry.actorName,
            occurredAt: entry.occurredAt,
            event: {
              kind: "resolution_submitted",
              resolutionNote: event.resolutionNote,
              evidenceCount: event.evidenceCount,
            },
          });
          break;
        case "citizen_confirmed":
          timeline.push({
            id: entry._id,
            actorName: entry.actorName,
            occurredAt: entry.occurredAt,
            event: {
              kind: "citizen_confirmed",
              comment: event.comment,
            },
          });
          break;
        case "citizen_disputed":
          timeline.push({
            id: entry._id,
            actorName: entry.actorName,
            occurredAt: entry.occurredAt,
            event: {
              kind: "citizen_disputed",
              comment: event.comment,
            },
          });
          break;
        case "case_reopened":
          timeline.push({
            id: entry._id,
            actorName: entry.actorName,
            occurredAt: entry.occurredAt,
            event: {
              kind: "case_reopened",
              reason: event.reason,
            },
          });
          break;
        case "resolution_verified_by_officer":
          timeline.push({
            id: entry._id,
            actorName: entry.actorName,
            occurredAt: entry.occurredAt,
            event: {
              kind: "resolution_verified_by_officer",
              reason: event.reason,
            },
          });
          break;
        default: {
          const unhandled: never = event;
          return unhandled;
        }
      }
    }

    let latestResolution = undefined;
    if (record.latestResolutionId) {
      const res = await ctx.db.get(record.latestResolutionId);
      if (res) {
        const resolutionEvidence = await Promise.all(
          res.evidence.map(async (ev) => ({
            attachmentId: ev.attachmentId,
            mediaType: ev.mediaType,
            url: ev.storageId ? await ctx.storage.getUrl(ev.storageId) : null,
          })),
        );
        latestResolution = {
          resolutionId: res._id,
          officerName: res.officerName,
          resolutionNote: res.resolutionNote,
          submittedAt: res.submittedAt,
          evidence: resolutionEvidence,
          citizenConfirmation: res.citizenConfirmation
            ? {
                verdict: res.citizenConfirmation.verdict,
                respondedAt: res.citizenConfirmation.respondedAt,
                comment: res.citizenConfirmation.comment,
              }
            : undefined,
          aiAssessment: res.aiAssessment,
        };
      }
    }

    return {
      case: {
        caseId: record._id,
        reportId: record.reportId,
        reportNumber: record.reportNumber,
        summary: record.summary,
        category: record.category,
        status: record.status,
        location: record.location,
        submittedAt: record.submittedAt,
      },
      evidence,
      timeline,
      latestResolution,
    };
  },
});

/** Allows a citizen to confirm or dispute whether their complaint was resolved. */
export const confirmResolution = mutation({
  args: {
    caseId: v.id("cases"),
    verdict: v.union(v.literal("confirmed"), v.literal("disputed")),
    comment: v.optional(v.string()),
  },
  returns: v.object({
    status: caseStatusValidator,
    verdict: v.union(v.literal("confirmed"), v.literal("disputed")),
  }),
  handler: async (ctx, args) => {
    const citizen = await getOrCreateAccount(ctx);
    const record = await ctx.db.get(args.caseId);
    if (!record) throw new Error("Unknown case.");
    const report = await ctx.db.get(record.reportId);
    if (!report || report.citizenId !== citizen._id) {
      throw new Error("You can only respond to your own reported cases.");
    }
    if (record.status !== "awaiting_confirmation") {
      throw new Error("This case is not awaiting citizen confirmation.");
    }
    if (!record.latestResolutionId) {
      throw new Error("No resolution evidence has been submitted for this case.");
    }
    const resolution = await ctx.db.get(record.latestResolutionId);
    if (!resolution) {
      throw new Error("Resolution record is missing.");
    }
    if (resolution.citizenConfirmation) {
      throw new Error("You have already submitted confirmation for this resolution.");
    }

    const occurredAt = Date.now();
    const comment = args.comment?.trim() || undefined;

    await ctx.db.patch(resolution._id, {
      citizenConfirmation: {
        verdict: args.verdict,
        respondedAt: occurredAt,
        comment,
      },
    });

    const actorName = citizen.displayName?.trim() || "Citizen";

    if (args.verdict === "confirmed") {
      await ctx.db.patch(record._id, { status: "resolved" });
      await ctx.db.insert("caseAuditEvents", {
        caseId: record._id,
        actorIdentityId: citizen._id,
        actorName,
        occurredAt,
        event: {
          kind: "citizen_confirmed",
          from: "awaiting_confirmation",
          to: "resolved",
          comment,
        },
      });
      return { status: "resolved" as const, verdict: "confirmed" as const };
    }

    await ctx.db.patch(record._id, { status: "disputed" });
    await ctx.db.insert("caseAuditEvents", {
      caseId: record._id,
      actorIdentityId: citizen._id,
      actorName,
      occurredAt,
      event: {
        kind: "citizen_disputed",
        from: "awaiting_confirmation",
        to: "disputed",
        comment,
      },
    });
    return { status: "disputed" as const, verdict: "disputed" as const };
  },
});

