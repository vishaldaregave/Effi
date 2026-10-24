import { nextCaseStatus } from "@effi/case-workflow";
import type { UserIdentity } from "convex/server";
import { v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  acceptedEvidenceValidator,
  aiEvidenceAssessmentValidator,
  caseAuditEventValidator,
  channelValidator,
  caseStatusValidator,
  caseTranscriptContentValidator,
  citizenConfirmationResponseValidator,
  exactLocationValidator,
  issueCategoryValidator,
  priorityValidator,
  sourceCitationValidator,
} from "./case_contract";
import { assessResolutionEvidence } from "./resolution_assurance";

const maxInboxCases = 50;

const officerRole = v.union(v.literal("officer"), v.literal("admin"));
const maxResolutionNoteLength = 500;

const clerkActorName = (identity: UserIdentity): string | null => {
  const fullName = identity.name?.trim();
  if (fullName) return fullName;

  const splitName = [identity.givenName, identity.familyName]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(" ");
  if (splitName) return splitName;

  const nickname = identity.nickname?.trim() || identity.preferredUsername?.trim();
  return nickname || null;
};

export const requireOfficer = async (ctx: QueryCtx | MutationCtx) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Sign in to view cases.");
  const actor = await ctx.db.query("identities").withIndex("by_external_id", (q) => q.eq("externalId", identity.tokenIdentifier)).unique();
  if (!actor || (actor.role !== "officer" && actor.role !== "admin")) throw new Error("Only officers can view cases.");
  return { actor, actorName: clerkActorName(identity) };
};

const requireActorName = (actorName: string | null): string => {
  if (!actorName) throw new Error("Add a name to your Clerk profile before changing cases.");
  return actorName;
};

const requireCase = async (ctx: QueryCtx | MutationCtx, caseId: Id<"cases">) => {
  const record = await ctx.db.get(caseId);
  if (!record) throw new Error("Unknown case.");
  return record;
};

const requireAssignedActor = async (ctx: MutationCtx, caseId: Id<"cases">) => {
  const { actor, actorName } = await requireOfficer(ctx);
  const record = await requireCase(ctx, caseId);
  if (!record.assignedOfficerId) throw new Error("Assign this case before changing it.");
  if (actor.role !== "admin" && record.assignedOfficerId !== actor._id) {
    throw new Error("Only the assigned officer can change this case.");
  }
  if (record.status === "resolved") throw new Error("Resolved cases cannot be changed.");
  return { actor, actorName: requireActorName(actorName), record };
};

export const provisionOfficer = internalMutation({
  args: { externalId: v.string(), role: officerRole, displayName: v.optional(v.string()) },
  returns: v.object({ identityId: v.id("identities"), role: officerRole }),
  handler: async (ctx, args) => {
    const externalId = args.externalId.trim();
    if (!externalId) throw new Error("Provisioning requires the Clerk token identifier.");
    let displayName: string | undefined;
    if (args.displayName !== undefined) {
      displayName = args.displayName.trim();
      if (!displayName) throw new Error("The officer display name cannot be empty.");
      if (displayName.length > 80) throw new Error("The officer display name is too long.");
    }
    const existing = await ctx.db.query("identities").withIndex("by_external_id", (q) => q.eq("externalId", externalId)).unique();
    if (existing) {
      await ctx.db.patch(existing._id, displayName === undefined ? { role: args.role } : { role: args.role, displayName });
      return { identityId: existing._id, role: args.role };
    }
    const identityId = await ctx.db.insert("identities", displayName === undefined
      ? { externalId, role: args.role }
      : { externalId, role: args.role, displayName });
    return { identityId, role: args.role };
  },
});

const officerRoles = ["officer", "admin"] as const;

export const listOfficers = query({
  args: {},
  returns: v.array(v.object({
    officerId: v.id("identities"),
    name: v.string(),
    isMe: v.boolean(),
  })),
  handler: async (ctx) => {
    const { actor } = await requireOfficer(ctx);
    const rosters = await Promise.all(
      officerRoles.map(async (role) => await ctx.db.query("identities").withIndex("by_role", (q) => q.eq("role", role)).collect()),
    );
    return rosters
      .flat()
      .flatMap((entry) => {
        const name = entry.displayName?.trim();
        return name ? [{ officerId: entry._id, name, isMe: entry._id === actor._id }] : [];
      })
      .sort((left, right) => left.name.localeCompare(right.name));
  },
});

export const listCases = query({
  args: {},
  returns: v.array(v.object({
    caseId: v.id("cases"),
    summary: v.string(),
    category: issueCategoryValidator,
    status: caseStatusValidator,
    currentPriority: priorityValidator,
    reportedAt: v.number(),
    submittedAt: v.number(),
    channel: channelValidator,
    isAssignedToMe: v.boolean(),
  })),
  handler: async (ctx) => {
    const { actor } = await requireOfficer(ctx);
    return await Promise.all(
      (await ctx.db.query("cases")
        .withIndex("by_submitted_at")
        .order("desc")
        .take(maxInboxCases))
        .map((entry) => ({
          caseId: entry._id,
          summary: entry.summary,
          category: entry.category,
          status: entry.status,
          currentPriority: entry.currentPriority,
          reportedAt: entry.reportedAt,
          submittedAt: entry.submittedAt,
          channel: entry.channel,
          isAssignedToMe: entry.assignedOfficerId === actor._id,
        })),
    );
  },
});

const heatmapStatuses = ["new", "assigned", "under_inspection", "work_in_progress"] as const;

export const listHeatmapCases = query({
  args: {},
  returns: v.array(v.object({
    caseId: v.id("cases"),
    summary: v.string(),
    status: caseStatusValidator,
    currentPriority: priorityValidator,
    location: exactLocationValidator,
    submittedAt: v.number(),
  })),
  handler: async (ctx) => {
    await requireOfficer(ctx);
    const casesByStatus = await Promise.all(
      heatmapStatuses.map(async (status) => await ctx.db.query("cases")
        .withIndex("by_status_and_submitted_at", (q) => q.eq("status", status))
        .order("desc")
        .collect()),
    );

    return casesByStatus
      .flat()
      .map((entry) => ({
        caseId: entry._id,
        summary: entry.summary,
        status: entry.status,
        currentPriority: entry.currentPriority,
        location: entry.location,
        submittedAt: entry.submittedAt,
      }))
      .sort((left, right) => right.submittedAt - left.submittedAt);
  },
});

export const getCase = query({
  args: { caseId: v.id("cases") },
  returns: v.object({
    case: v.object({
      reportNumber: v.string(),
      summary: v.string(),
      category: issueCategoryValidator,
      location: exactLocationValidator,
      reportedAt: v.number(),
      submittedAt: v.number(),
      recommendedPriority: priorityValidator,
      currentPriority: priorityValidator,
      priorityReasons: v.array(v.string()),
      citations: v.array(sourceCitationValidator),
      acceptedEvidence: v.array(v.object({
        attachmentId: v.string(),
        storageKey: v.string(),
        storageId: v.optional(v.id("_storage")),
        url: v.union(v.string(), v.null()),
        mediaType: v.string(),
        sourceMessageId: v.string(),
      })),
      channel: channelValidator,
      conversationId: v.string(),
      status: caseStatusValidator,
      assignment: v.union(v.object({ officerName: v.string() }), v.null()),
      repostCount: v.number(),
      canAct: v.boolean(),
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
              storageId: v.optional(v.id("_storage")),
              storageKey: v.string(),
              sourceMessageId: v.string(),
              url: v.union(v.string(), v.null()),
            }),
          ),
          location: v.optional(exactLocationValidator),
          aiAssessment: v.optional(aiEvidenceAssessmentValidator),
          citizenConfirmation: v.optional(citizenConfirmationResponseValidator),
        }),
      ),
    }),
    transcript: v.array(v.object({
      sourceMessageId: v.string(),
      sequence: v.number(),
      direction: v.union(v.literal("citizen"), v.literal("effi")),
      occurredAt: v.number(),
      content: caseTranscriptContentValidator,
    })),
    audit: v.array(v.object({
      eventId: v.id("caseAuditEvents"),
      actorName: v.string(),
      occurredAt: v.number(),
      event: caseAuditEventValidator,
    })),
  }),
  handler: async (ctx, args) => {
    const { actor } = await requireOfficer(ctx);
    const record = await requireCase(ctx, args.caseId);
    const transcript = await ctx.db.query("caseTranscriptMessages")
      .withIndex("by_case_id_and_sequence", (q) => q.eq("caseId", record._id))
      .order("asc")
      .collect();
    const audit = await ctx.db.query("caseAuditEvents")
      .withIndex("by_case_id_and_occurred_at", (q) => q.eq("caseId", record._id))
      .order("asc")
      .collect();
    const acceptedEvidence = await Promise.all(record.acceptedEvidence.map(async (evidence) => ({
      ...evidence,
      url: evidence.storageId ? await ctx.storage.getUrl(evidence.storageId) : null,
    })));

    let latestResolution: {
      resolutionId: Id<"caseResolutions">;
      officerName: string;
      resolutionNote: string;
      submittedAt: number;
      location?: {
        source: "current_gps" | "selected_pin";
        latitude: number;
        longitude: number;
        place?: { name: string; formattedAddress: string };
      };
      evidence: Array<{
        attachmentId: string;
        mediaType: string;
        storageId?: Id<"_storage">;
        storageKey: string;
        sourceMessageId: string;
        url: string | null;
      }>;
      aiAssessment?: {
        recommendation: "supports_resolution" | "requires_review" | "insufficient_evidence" | "resolution_disputed";
        reasons: string[];
        evidenceReferences: string[];
        uncertainty: number;
        assessedAt: number;
        provider: string;
        manualReviewRequired: boolean;
      };
      citizenConfirmation?: {
        verdict: "confirmed" | "disputed";
        respondedAt: number;
        comment?: string;
        evidence?: Array<{
          attachmentId: string;
          storageKey: string;
          storageId?: Id<"_storage">;
          mediaType: string;
          sourceMessageId: string;
        }>;
      };
    } | undefined = undefined;

    if (record.latestResolutionId) {
      const res = await ctx.db.get(record.latestResolutionId);
      if (res) {
        const resolutionEvidence = await Promise.all(
          res.evidence.map(async (ev) => ({
            ...ev,
            url: ev.storageId ? await ctx.storage.getUrl(ev.storageId) : null,
          })),
        );
        latestResolution = {
          resolutionId: res._id,
          officerName: res.officerName,
          resolutionNote: res.resolutionNote,
          submittedAt: res.submittedAt,
          evidence: resolutionEvidence,
          location: res.location,
          aiAssessment: res.aiAssessment,
          citizenConfirmation: res.citizenConfirmation,
        };
      }
    }

    return {
      case: {
        reportNumber: record.reportNumber,
        summary: record.summary,
        category: record.category,
        location: record.location,
        reportedAt: record.reportedAt,
        submittedAt: record.submittedAt,
        recommendedPriority: record.recommendedPriority,
        currentPriority: record.currentPriority,
        priorityReasons: record.priorityReasons,
        citations: record.citations,
        acceptedEvidence,
        channel: record.channel,
        conversationId: record.conversationId,
        status: record.status,
        assignment: record.assignedOfficerId && record.assignedOfficerName
          ? { officerName: record.assignedOfficerName }
          : null,
        repostCount: record.repostCount ?? 0,
        canAct: Boolean(
          record.status !== "resolved"
          && record.assignedOfficerId
          && (actor.role === "admin" || record.assignedOfficerId === actor._id),
        ),
        latestResolution,
      },
      transcript: transcript.map((message) => ({
        sourceMessageId: message.sourceMessageId,
        sequence: message.sequence,
        direction: message.direction,
        occurredAt: message.occurredAt,
        content: message.content,
      })),
      audit: audit.map((entry) => ({
        eventId: entry._id,
        actorName: entry.actorName,
        occurredAt: entry.occurredAt,
        event: entry.event,
      })),
    };
  },
});

export const assignCase = mutation({
  args: { caseId: v.id("cases"), officerId: v.optional(v.id("identities")) },
  returns: v.object({ status: v.literal("assigned"), officerName: v.string() }),
  handler: async (ctx, args) => {
    const officer = await requireOfficer(ctx);
    const actor = officer.actor;
    const actorName = requireActorName(officer.actorName);
    const record = await requireCase(ctx, args.caseId);
    const assignedStatus = "assigned" as const;
    if (record.assignedOfficerId) throw new Error("This case is already assigned.");
    if (record.status !== "new") throw new Error("Only a new case can be assigned.");
    const target = args.officerId ? await ctx.db.get(args.officerId) : actor;
    if (!target || (target.role !== "officer" && target.role !== "admin")) {
      throw new Error("Choose an officer to assign this case to.");
    }
    const targetName = target._id === actor._id ? actorName : target.displayName?.trim();
    if (!targetName) throw new Error("The selected officer needs a name on their profile before assignment.");
    const occurredAt = Date.now();
    await ctx.db.patch(record._id, { assignedOfficerId: target._id, assignedOfficerName: targetName, status: assignedStatus });
    await ctx.db.insert("caseAuditEvents", {
      caseId: record._id,
      actorIdentityId: actor._id,
      actorName,
      occurredAt,
      event: { kind: "case_assigned", assignedOfficerId: target._id, assignedOfficerName: targetName },
    });
    await ctx.db.insert("caseAuditEvents", {
      caseId: record._id,
      actorIdentityId: actor._id,
      actorName,
      occurredAt,
      event: { kind: "status_changed", from: "new", to: "assigned" },
    });
    return { status: assignedStatus, officerName: actorName };
  },
});

export const overridePriority = mutation({
  args: { caseId: v.id("cases"), priority: priorityValidator },
  returns: v.object({ priority: priorityValidator }),
  handler: async (ctx, args) => {
    const { actor, actorName, record } = await requireAssignedActor(ctx, args.caseId);
    if (record.currentPriority === args.priority) throw new Error("Choose a different priority.");
    await ctx.db.patch(record._id, { currentPriority: args.priority });
    await ctx.db.insert("caseAuditEvents", {
      caseId: record._id,
      actorIdentityId: actor._id,
      actorName,
      occurredAt: Date.now(),
      event: { kind: "priority_changed", from: record.currentPriority, to: args.priority },
    });
    return { priority: args.priority };
  },
});

export const advanceCaseStatus = mutation({
  args: {
    caseId: v.id("cases"),
    action: v.union(
      v.object({ kind: v.literal("advance") }),
      v.object({
        kind: v.literal("resolve"),
        resolutionNote: v.string(),
        evidence: v.optional(v.array(acceptedEvidenceValidator)),
        location: v.optional(exactLocationValidator),
        directVerify: v.optional(v.boolean()),
      }),
    ),
  },
  returns: v.object({ status: caseStatusValidator }),
  handler: async (ctx, args) => {
    const { actor, actorName, record } = await requireAssignedActor(ctx, args.caseId);
    const nextStatus = nextCaseStatus(record.status);
    if (!nextStatus || nextStatus === "assigned") throw new Error("This case cannot advance from its current status.");
    const occurredAt = Date.now();
    if (args.action.kind === "resolve") {
      const resolutionNote = args.action.resolutionNote.trim();
      if (!resolutionNote || resolutionNote.length > maxResolutionNoteLength) {
        throw new Error(`The resolution note must contain between 1 and ${maxResolutionNoteLength} characters.`);
      }

      if (args.action.directVerify === true || (!args.action.evidence?.length && args.action.directVerify !== false)) {
        await ctx.db.patch(record._id, { status: "resolved" });
        await ctx.db.insert("caseAuditEvents", {
          caseId: record._id,
          actorIdentityId: actor._id,
          actorName,
          occurredAt,
          event: { kind: "case_resolved", from: record.status as "work_in_progress", to: "resolved", resolutionNote },
        });
        return { status: "resolved" as const };
      }

      const assessment = await assessResolutionEvidence({
        category: record.category,
        summary: record.summary,
        resolutionNote,
        originalEvidence: record.acceptedEvidence,
        completionEvidence: args.action.evidence ?? [],
        originalLocation: { latitude: record.location.latitude, longitude: record.location.longitude },
        completionLocation: args.action.location
          ? { latitude: args.action.location.latitude, longitude: args.action.location.longitude }
          : undefined,
      });

      const resolutionId = await ctx.db.insert("caseResolutions", {
        caseId: record._id,
        officerId: actor._id,
        officerName: actorName,
        resolutionNote,
        evidence: args.action.evidence ?? [],
        location: args.action.location,
        submittedAt: occurredAt,
        aiAssessment: assessment,
      });

      await ctx.db.patch(record._id, {
        status: "awaiting_confirmation",
        latestResolutionId: resolutionId,
      });

      await ctx.db.insert("caseAuditEvents", {
        caseId: record._id,
        actorIdentityId: actor._id,
        actorName,
        occurredAt,
        event: {
          kind: "resolution_submitted",
          from: record.status,
          to: "awaiting_confirmation",
          resolutionNote,
          evidenceCount: args.action.evidence?.length ?? 0,
          aiRecommendation: assessment.recommendation,
        },
      });

      return { status: "awaiting_confirmation" as const };
    }

    if (args.action.kind !== "advance") throw new Error("A resolution note is only accepted when resolving a case.");
    await ctx.db.patch(record._id, { status: nextStatus });
    await ctx.db.insert("caseAuditEvents", {
      caseId: record._id,
      actorIdentityId: actor._id,
      actorName,
      occurredAt,
      event: { kind: "status_changed", from: record.status, to: nextStatus },
    });
    return { status: nextStatus };
  },
});

export const generateResolutionMediaUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireOfficer(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const submitResolution = mutation({
  args: {
    caseId: v.id("cases"),
    resolutionNote: v.string(),
    evidence: v.array(acceptedEvidenceValidator),
    location: v.optional(exactLocationValidator),
    directVerify: v.optional(v.boolean()),
  },
  returns: v.object({
    status: caseStatusValidator,
    resolutionId: v.id("caseResolutions"),
    aiAssessment: aiEvidenceAssessmentValidator,
  }),
  handler: async (ctx, args) => {
    const { actor, actorName, record } = await requireAssignedActor(ctx, args.caseId);
    if (record.status !== "work_in_progress" && record.status !== "disputed") {
      throw new Error("Only cases in progress or disputed can be submitted for resolution.");
    }

    const resolutionNote = args.resolutionNote.trim();
    if (!resolutionNote || resolutionNote.length > maxResolutionNoteLength) {
      throw new Error(`The resolution note must contain between 1 and ${maxResolutionNoteLength} characters.`);
    }

    if (args.evidence.length > 5) {
      throw new Error("A maximum of 5 completion evidence items can be submitted.");
    }

    for (const item of args.evidence) {
      if (item.storageId) {
        const stored = await ctx.db.system.get("_storage", item.storageId);
        if (!stored) {
          throw new Error("The completion evidence media could not be found.");
        }
      }
    }

    const assessment = await assessResolutionEvidence({
      category: record.category,
      summary: record.summary,
      resolutionNote,
      originalEvidence: record.acceptedEvidence,
      completionEvidence: args.evidence,
      originalLocation: { latitude: record.location.latitude, longitude: record.location.longitude },
      completionLocation: args.location
        ? { latitude: args.location.latitude, longitude: args.location.longitude }
        : undefined,
    });

    const occurredAt = Date.now();
    const resolutionId = await ctx.db.insert("caseResolutions", {
      caseId: record._id,
      officerId: actor._id,
      officerName: actorName,
      resolutionNote,
      evidence: args.evidence,
      location: args.location,
      submittedAt: occurredAt,
      aiAssessment: assessment,
    });

    const isDirectVerify = args.directVerify === true && (actor.role === "admin" || assessment.recommendation === "supports_resolution");
    const nextStatus = isDirectVerify ? "resolved" : "awaiting_confirmation";

    await ctx.db.patch(record._id, {
      status: nextStatus,
      latestResolutionId: resolutionId,
    });

    if (isDirectVerify) {
      await ctx.db.insert("caseAuditEvents", {
        caseId: record._id,
        actorIdentityId: actor._id,
        actorName,
        occurredAt,
        event: {
          kind: "resolution_verified_by_officer",
          from: record.status,
          to: "resolved",
          reason: resolutionNote,
        },
      });
    } else {
      await ctx.db.insert("caseAuditEvents", {
        caseId: record._id,
        actorIdentityId: actor._id,
        actorName,
        occurredAt,
        event: {
          kind: "resolution_submitted",
          from: record.status,
          to: "awaiting_confirmation",
          resolutionNote,
          evidenceCount: args.evidence.length,
          aiRecommendation: assessment.recommendation,
        },
      });
    }

    return {
      status: nextStatus,
      resolutionId,
      aiAssessment: assessment,
    };
  },
});

export const reopenCase = mutation({
  args: {
    caseId: v.id("cases"),
    reason: v.string(),
    targetStatus: v.optional(v.union(v.literal("work_in_progress"), v.literal("under_inspection"))),
  },
  returns: v.object({ status: caseStatusValidator }),
  handler: async (ctx, args) => {
    const { actor, actorName, record } = await requireAssignedActor(ctx, args.caseId);
    if (record.status !== "disputed") {
      throw new Error("Only disputed cases can be reopened.");
    }
    const reason = args.reason.trim();
    if (!reason || reason.length > maxResolutionNoteLength) {
      throw new Error(`Reopening requires a reason between 1 and ${maxResolutionNoteLength} characters.`);
    }
    const targetStatus = args.targetStatus ?? "work_in_progress";
    const occurredAt = Date.now();
    await ctx.db.patch(record._id, { status: targetStatus });
    await ctx.db.insert("caseAuditEvents", {
      caseId: record._id,
      actorIdentityId: actor._id,
      actorName,
      occurredAt,
      event: {
        kind: "case_reopened",
        from: "disputed",
        to: targetStatus,
        reason,
      },
    });
    return { status: targetStatus };
  },
});

export const verifyResolution = mutation({
  args: {
    caseId: v.id("cases"),
    reason: v.string(),
  },
  returns: v.object({ status: v.literal("resolved") }),
  handler: async (ctx, args) => {
    const { actor, actorName, record } = await requireAssignedActor(ctx, args.caseId);
    if (record.status !== "awaiting_confirmation" && record.status !== "disputed" && record.status !== "work_in_progress") {
      throw new Error("Only cases awaiting confirmation, disputed, or in progress can be verified.");
    }
    const reason = args.reason.trim();
    if (!reason || reason.length > maxResolutionNoteLength) {
      throw new Error(`Verification requires a reason between 1 and ${maxResolutionNoteLength} characters.`);
    }
    const occurredAt = Date.now();
    await ctx.db.patch(record._id, { status: "resolved" });
    await ctx.db.insert("caseAuditEvents", {
      caseId: record._id,
      actorIdentityId: actor._id,
      actorName,
      occurredAt,
      event: {
        kind: "resolution_verified_by_officer",
        from: record.status,
        to: "resolved",
        reason,
      },
    });
    return { status: "resolved" as const };
  },
});

export const assignActiveCases = mutation({
  args: {},
  handler: async (ctx) => {
    let officer = await ctx.db
      .query("identities")
      .withIndex("by_role", (q) => q.eq("role", "officer"))
      .first();
    if (!officer) {
      officer = await ctx.db
        .query("identities")
        .withIndex("by_role", (q) => q.eq("role", "admin"))
        .first();
    }
    const officerId = officer?._id;
    const officerName = officer?.displayName ?? "Officer Vishal";
    const allCases = await ctx.db.query("cases").collect();
    let updated = 0;
    for (const c of allCases) {
      if (c.status === "new" || c.status === "awaiting_confirmation") {
        await ctx.db.patch(c._id, {
          status: "assigned",
          assignedOfficerId: officerId,
          assignedOfficerName: officerName,
        });
        updated++;
      }
    }
    return { updated, officerName };
  },
});


