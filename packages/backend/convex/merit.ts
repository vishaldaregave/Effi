import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireOfficer } from "./cases";
import type { Doc, Id } from "./_generated/dataModel";

export const meritDateRangeValidator = v.union(
  v.literal("7d"),
  v.literal("30d"),
  v.literal("90d"),
  v.literal("all"),
);

export type MeritDateRange = "7d" | "30d" | "90d" | "all";

const dateRangeMilliseconds = (range: MeritDateRange): number | null => {
  switch (range) {
    case "7d":
      return 7 * 24 * 60 * 60 * 1000;
    case "30d":
      return 30 * 24 * 60 * 60 * 1000;
    case "90d":
      return 90 * 24 * 60 * 60 * 1000;
    case "all":
      return null;
  }
};

const workingDayStartHour = 8;
const workingDayEndHour = 18;
const hourMs = 60 * 60 * 1000;

type SlaTarget =
  | { kind: "calendar"; hours: number }
  | { kind: "working"; hours: number };

const statutorySlaTarget = (category: string, priority: string): SlaTarget | null => {
  switch (category) {
    case "roads":
      if (priority === "critical") return { kind: "calendar", hours: 2 };
      if (priority === "high") return { kind: "working", hours: 10 };
      return { kind: "working", hours: 50 };
    case "sanitation":
      if (priority === "critical") return { kind: "calendar", hours: 2 };
      if (priority === "high") return { kind: "working", hours: 10 };
      return null;
    case "lighting":
      if (priority === "critical") return { kind: "calendar", hours: 1 };
      if (priority === "high") return { kind: "working", hours: 10 };
      return null;
    default:
      return null;
  }
};

const workingMillisecondsBetween = (start: number, end: number): number => {
  if (end <= start) return 0;
  let total = 0;
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const lastDay = new Date(end);
  lastDay.setHours(0, 0, 0, 0);

  while (cursor.getTime() <= lastDay.getTime()) {
    const weekday = cursor.getDay();
    if (weekday !== 0 && weekday !== 6) {
      const windowStart = new Date(cursor);
      windowStart.setHours(workingDayStartHour, 0, 0, 0);
      const windowEnd = new Date(cursor);
      windowEnd.setHours(workingDayEndHour, 0, 0, 0);
      const overlapStart = Math.max(start, windowStart.getTime());
      const overlapEnd = Math.min(end, windowEnd.getTime());
      total += Math.max(0, overlapEnd - overlapStart);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return total;
};

const isCaseOverdue = (
  record: Doc<"cases">,
  resolvedAt: number | null,
  now: number,
): boolean | null => {
  const target = statutorySlaTarget(record.category, record.currentPriority);
  if (!target) return null;
  const targetMs = target.hours * hourMs;
  const end = resolvedAt ?? now;
  const elapsed =
    target.kind === "calendar"
      ? Math.max(0, end - record.submittedAt)
      : workingMillisecondsBetween(record.submittedAt, end);
  return elapsed > targetMs;
};

const calculateMedian = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? null;
  }
  const low = sorted[middle - 1] ?? 0;
  const high = sorted[middle] ?? 0;
  return Math.round((low + high) / 2);
};

export const getOfficerMeritDashboard = query({
  args: {
    dateRange: v.optional(meritDateRangeValidator),
    officerId: v.optional(v.id("identities")),
  },
  returns: v.object({
    metadata: v.object({
      evaluatedAt: v.number(),
      selectedRange: meritDateRangeValidator,
      windowStart: v.optional(v.number()),
      wardSupportNote: v.string(),
    }),
    summary: v.object({
      totalAssignedCases: v.number(),
      currentActiveWorkload: v.number(),
      awaitingConfirmationCases: v.number(),
      citizenConfirmedResolutions: v.number(),
      officerVerifiedResolutions: v.number(),
      legacyResolutions: v.number(),
      totalResolvedCases: v.number(),
      citizenDisputedCases: v.number(),
      reopenedCases: v.number(),
      repeatComplaintCases: v.number(),
      totalReposts: v.number(),
      overdueSlaCases: v.number(),
      unconfiguredSlaCases: v.number(),
      medianResolutionMs: v.union(v.number(), v.null()),
      citizenConfirmationRate: v.object({
        percentage: v.union(v.number(), v.null()),
        confirmed: v.number(),
        totalResponses: v.number(),
      }),
      firstTimeResolutionRate: v.object({
        percentage: v.union(v.number(), v.null()),
        firstTime: v.number(),
        totalResolved: v.number(),
      }),
    }),
    officers: v.array(
      v.object({
        officerId: v.id("identities"),
        name: v.string(),
        assignedCases: v.number(),
        currentWorkload: v.number(),
        awaitingConfirmation: v.number(),
        citizenConfirmed: v.number(),
        officerVerified: v.number(),
        totalResolved: v.number(),
        citizenDisputes: v.number(),
        reopenedCases: v.number(),
        repeatCases: v.number(),
        overdueCases: v.number(),
        medianResolutionMs: v.union(v.number(), v.null()),
        confirmationRate: v.object({
          percentage: v.union(v.number(), v.null()),
          confirmed: v.number(),
          totalResponses: v.number(),
        }),
        firstTimeRate: v.object({
          percentage: v.union(v.number(), v.null()),
          firstTime: v.number(),
          totalResolved: v.number(),
        }),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    await requireOfficer(ctx);

    const now = Date.now();
    const range = args.dateRange ?? "30d";
    const windowMs = dateRangeMilliseconds(range);
    const windowStart = windowMs !== null ? now - windowMs : undefined;

    let cases = await ctx.db
      .query("cases")
      .withIndex("by_submitted_at")
      .order("desc")
      .collect();

    if (windowStart !== undefined) {
      cases = cases.filter((entry) => entry.submittedAt >= windowStart);
    }

    if (args.officerId) {
      cases = cases.filter((entry) => entry.assignedOfficerId === args.officerId);
    }

    const assignedCases = cases.filter((entry) => Boolean(entry.assignedOfficerId));

    const officerRosters = await Promise.all([
      ctx.db.query("identities").withIndex("by_role", (q) => q.eq("role", "officer")).collect(),
      ctx.db.query("identities").withIndex("by_role", (q) => q.eq("role", "admin")).collect(),
    ]);
    const allOfficers = officerRosters.flat();

    const officerMap = new Map<
      Id<"identities">,
      {
        officerId: Id<"identities">;
        name: string;
        assignedCases: number;
        currentWorkload: number;
        awaitingConfirmation: number;
        citizenConfirmed: number;
        officerVerified: number;
        totalResolved: number;
        citizenDisputes: number;
        reopenedCases: number;
        repeatCases: number;
        overdueCases: number;
        resolutionDurations: number[];
        firstTimeCount: number;
      }
    >();

    for (const officer of allOfficers) {
      const name = officer.displayName?.trim() || "Field Officer";
      officerMap.set(officer._id, {
        officerId: officer._id,
        name,
        assignedCases: 0,
        currentWorkload: 0,
        awaitingConfirmation: 0,
        citizenConfirmed: 0,
        officerVerified: 0,
        totalResolved: 0,
        citizenDisputes: 0,
        reopenedCases: 0,
        repeatCases: 0,
        overdueCases: 0,
        resolutionDurations: [],
        firstTimeCount: 0,
      });
    }

    let summaryCitizenConfirmed = 0;
    let summaryOfficerVerified = 0;
    let summaryLegacyResolved = 0;
    let summaryCitizenDisputed = 0;
    let summaryReopenedCases = 0;
    let summaryRepeatComplaintCases = 0;
    let summaryTotalReposts = 0;
    let summaryOverdueSlaCases = 0;
    let summaryUnconfiguredSlaCases = 0;
    let summaryCurrentActiveWorkload = 0;
    let summaryAwaitingConfirmation = 0;
    const summaryResolutionDurations: number[] = [];
    let summaryFirstTimeResolvedCount = 0;

    for (const record of assignedCases) {
      const officerId = record.assignedOfficerId!;
      let officerEntry = officerMap.get(officerId);
      if (!officerEntry) {
        officerEntry = {
          officerId,
          name: record.assignedOfficerName || "Assigned Officer",
          assignedCases: 0,
          currentWorkload: 0,
          awaitingConfirmation: 0,
          citizenConfirmed: 0,
          officerVerified: 0,
          totalResolved: 0,
          citizenDisputes: 0,
          reopenedCases: 0,
          repeatCases: 0,
          overdueCases: 0,
          resolutionDurations: [],
          firstTimeCount: 0,
        };
        officerMap.set(officerId, officerEntry);
      }

      officerEntry.assignedCases += 1;

      const audits = await ctx.db
        .query("caseAuditEvents")
        .withIndex("by_case_id_and_occurred_at", (q) => q.eq("caseId", record._id))
        .order("asc")
        .collect();

      const hasCitizenConfirmed = audits.some((a) => a.event.kind === "citizen_confirmed");
      const hasOfficerVerified = audits.some((a) => a.event.kind === "resolution_verified_by_officer");
      const hasLegacyResolved = audits.some((a) => a.event.kind === "case_resolved");
      const hasCitizenDisputed = audits.some((a) => a.event.kind === "citizen_disputed");
      const hasReopened = audits.some((a) => a.event.kind === "case_reopened");

      if (hasCitizenDisputed) {
        summaryCitizenDisputed += 1;
        officerEntry.citizenDisputes += 1;
      }

      if (hasReopened) {
        summaryReopenedCases += 1;
        officerEntry.reopenedCases += 1;
      }

      const reposts = record.repostCount ?? 0;
      if (reposts > 0) {
        summaryRepeatComplaintCases += 1;
        summaryTotalReposts += reposts;
        officerEntry.repeatCases += 1;
      }

      let finalResolvedAt: number | null = null;
      if (record.status === "resolved") {
        const resolveAudit = [...audits].reverse().find(
          (a) =>
            a.event.kind === "citizen_confirmed" ||
            a.event.kind === "resolution_verified_by_officer" ||
            a.event.kind === "case_resolved",
        );
        finalResolvedAt = resolveAudit?.occurredAt ?? record.submittedAt;

        if (hasCitizenConfirmed) {
          summaryCitizenConfirmed += 1;
          officerEntry.citizenConfirmed += 1;
        } else if (hasOfficerVerified) {
          summaryOfficerVerified += 1;
          officerEntry.officerVerified += 1;
        } else if (hasLegacyResolved) {
          summaryLegacyResolved += 1;
        }

        officerEntry.totalResolved += 1;

        const duration = Math.max(0, finalResolvedAt - record.submittedAt);
        summaryResolutionDurations.push(duration);
        officerEntry.resolutionDurations.push(duration);

        if (!hasCitizenDisputed && !hasReopened) {
          summaryFirstTimeResolvedCount += 1;
          officerEntry.firstTimeCount += 1;
        }
      } else if (record.status === "awaiting_confirmation") {
        summaryAwaitingConfirmation += 1;
        officerEntry.awaitingConfirmation += 1;
      } else {
        summaryCurrentActiveWorkload += 1;
        officerEntry.currentWorkload += 1;
      }

      const overdue = isCaseOverdue(record, finalResolvedAt, now);
      if (overdue === true) {
        summaryOverdueSlaCases += 1;
        officerEntry.overdueCases += 1;
      } else if (overdue === null) {
        summaryUnconfiguredSlaCases += 1;
      }
    }

    const totalResolved = summaryCitizenConfirmed + summaryOfficerVerified + summaryLegacyResolved;
    const totalResponses = summaryCitizenConfirmed + summaryCitizenDisputed;

    const confirmationPercentage =
      totalResponses > 0
        ? Math.round((summaryCitizenConfirmed / totalResponses) * 1000) / 10
        : null;

    const firstTimePercentage =
      totalResolved > 0
        ? Math.round((summaryFirstTimeResolvedCount / totalResolved) * 1000) / 10
        : null;

    const officerRows = Array.from(officerMap.values())
      .filter((officer) => (args.officerId ? officer.officerId === args.officerId : true))
      .map((entry) => {
        const officerResponses = entry.citizenConfirmed + entry.citizenDisputes;
        const confRate =
          officerResponses > 0
            ? Math.round((entry.citizenConfirmed / officerResponses) * 1000) / 10
            : null;

        const ftRate =
          entry.totalResolved > 0
            ? Math.round((entry.firstTimeCount / entry.totalResolved) * 1000) / 10
            : null;

        return {
          officerId: entry.officerId,
          name: entry.name,
          assignedCases: entry.assignedCases,
          currentWorkload: entry.currentWorkload,
          awaitingConfirmation: entry.awaitingConfirmation,
          citizenConfirmed: entry.citizenConfirmed,
          officerVerified: entry.officerVerified,
          totalResolved: entry.totalResolved,
          citizenDisputes: entry.citizenDisputes,
          reopenedCases: entry.reopenedCases,
          repeatCases: entry.repeatCases,
          overdueCases: entry.overdueCases,
          medianResolutionMs: calculateMedian(entry.resolutionDurations),
          confirmationRate: {
            percentage: confRate,
            confirmed: entry.citizenConfirmed,
            totalResponses: officerResponses,
          },
          firstTimeRate: {
            percentage: ftRate,
            firstTime: entry.firstTimeCount,
            totalResolved: entry.totalResolved,
          },
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name));

    return {
      metadata: {
        evaluatedAt: now,
        selectedRange: range,
        ...(windowStart !== undefined ? { windowStart } : {}),
        wardSupportNote:
          "Municipal ward boundaries are not modeled in current schema. Locations are captured via verified GPS coordinates and reverse-geocoded place names.",
      },
      summary: {
        totalAssignedCases: assignedCases.length,
        currentActiveWorkload: summaryCurrentActiveWorkload,
        awaitingConfirmationCases: summaryAwaitingConfirmation,
        citizenConfirmedResolutions: summaryCitizenConfirmed,
        officerVerifiedResolutions: summaryOfficerVerified,
        legacyResolutions: summaryLegacyResolved,
        totalResolvedCases: totalResolved,
        citizenDisputedCases: summaryCitizenDisputed,
        reopenedCases: summaryReopenedCases,
        repeatComplaintCases: summaryRepeatComplaintCases,
        totalReposts: summaryTotalReposts,
        overdueSlaCases: summaryOverdueSlaCases,
        unconfiguredSlaCases: summaryUnconfiguredSlaCases,
        medianResolutionMs: calculateMedian(summaryResolutionDurations),
        citizenConfirmationRate: {
          percentage: confirmationPercentage,
          confirmed: summaryCitizenConfirmed,
          totalResponses,
        },
        firstTimeResolutionRate: {
          percentage: firstTimePercentage,
          firstTime: summaryFirstTimeResolvedCount,
          totalResolved,
        },
      },
      officers: officerRows,
    };
  },
});
