import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const officerIdentity = {
  tokenIdentifier: "clerk|officer-one",
  subject: "officer-one",
  name: "Arun Verma",
};

const secondOfficerIdentity = {
  tokenIdentifier: "clerk|officer-two",
  subject: "officer-two",
  name: "Bhavna Patel",
};

const citizenIdentity = {
  tokenIdentifier: "clerk|citizen-test",
  subject: "citizen-test",
  name: "Citizen Tester",
};

const setupTestEnvironment = async (t: ReturnType<typeof convexTest>) => {
  return await t.run(async (ctx) => {
    const officer1Id = await ctx.db.insert("identities", {
      externalId: officerIdentity.tokenIdentifier,
      role: "officer",
      displayName: "Arun Verma",
    });

    const officer2Id = await ctx.db.insert("identities", {
      externalId: secondOfficerIdentity.tokenIdentifier,
      role: "officer",
      displayName: "Bhavna Patel",
    });

    const citizenId = await ctx.db.insert("identities", {
      externalId: citizenIdentity.tokenIdentifier,
      role: "citizen",
      displayName: "Citizen Tester",
    });

    return { officer1Id, officer2Id, citizenId };
  });
};

describe("officer merit and accountability dashboard query", () => {
  it("enforces authentication and officer role authorization", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    await setupTestEnvironment(t);

    await expect(
      t.query(api.merit.getOfficerMeritDashboard, {}),
    ).rejects.toThrow("Sign in to view cases.");

    await expect(
      t.withIdentity(citizenIdentity).query(api.merit.getOfficerMeritDashboard, {}),
    ).rejects.toThrow("Only officers can view cases.");

    const result = await t
      .withIdentity(officerIdentity)
      .query(api.merit.getOfficerMeritDashboard, {});
    expect(result.summary.totalAssignedCases).toBe(0);
    expect(result.officers).toHaveLength(2);
  });

  it("handles empty database without division by zero or NaN", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    await setupTestEnvironment(t);

    const result = await t
      .withIdentity(officerIdentity)
      .query(api.merit.getOfficerMeritDashboard, { dateRange: "all" });

    expect(result.summary.totalAssignedCases).toBe(0);
    expect(result.summary.totalResolvedCases).toBe(0);
    expect(result.summary.citizenConfirmationRate.percentage).toBeNull();
    expect(result.summary.citizenConfirmationRate.totalResponses).toBe(0);
    expect(result.summary.firstTimeResolutionRate.percentage).toBeNull();
    expect(result.summary.medianResolutionMs).toBeNull();
    expect(result.metadata.wardSupportNote).toContain("Municipal ward boundaries are not modeled");
  });

  it("computes confirmed, manual-verified, disputed, and reopened cases accurately", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { officer1Id, citizenId } = await setupTestEnvironment(t);

    const now = Date.now();

    // Create Report and Case 1: Confirmed by citizen (first time resolved)
    await t.run(async (ctx) => {
      const report1 = await ctx.db.insert("reports", {
        citizenId,
        reportNumber: "EFFI-101",
        channel: "app",
        conversationId: "conv-101",
        issue: "Pothole on Main Road",
        category: "roads",
        location: { source: "current_gps", latitude: 12.97, longitude: 77.59 },
        primaryEvidence: [],
        reportedAt: now - 100_000,
        submittedAt: now - 100_000,
      });

      const case1 = await ctx.db.insert("cases", {
        reportId: report1,
        reportNumber: "EFFI-101",
        summary: "Pothole on Main Road",
        category: "roads",
        location: { source: "current_gps", latitude: 12.97, longitude: 77.59 },
        reportedAt: now - 100_000,
        submittedAt: now - 100_000,
        recommendedPriority: "medium",
        currentPriority: "medium",
        priorityReasons: ["Road surface damage"],
        citations: [],
        acceptedEvidence: [],
        channel: "app",
        conversationId: "conv-101",
        status: "resolved",
        assignedOfficerId: officer1Id,
        assignedOfficerName: "Arun Verma",
      });

      await ctx.db.insert("caseAuditEvents", {
        caseId: case1,
        actorIdentityId: officer1Id,
        actorName: "Arun Verma",
        occurredAt: now - 80_000,
        event: {
          kind: "resolution_submitted",
          from: "work_in_progress",
          to: "awaiting_confirmation",
          resolutionNote: "Repaired asphalt surface",
          evidenceCount: 1,
        },
      });

      await ctx.db.insert("caseAuditEvents", {
        caseId: case1,
        actorIdentityId: citizenId,
        actorName: "Citizen Tester",
        occurredAt: now - 50_000,
        event: {
          kind: "citizen_confirmed",
          from: "awaiting_confirmation",
          to: "resolved",
          comment: "Looks great, road is smooth now.",
        },
      });

      // Case 2: Disputed then manually verified by officer
      const report2 = await ctx.db.insert("reports", {
        citizenId,
        reportNumber: "EFFI-102",
        channel: "app",
        conversationId: "conv-102",
        issue: "Garbage accumulation",
        category: "sanitation",
        location: { source: "current_gps", latitude: 12.98, longitude: 77.60 },
        primaryEvidence: [],
        reportedAt: now - 200_000,
        submittedAt: now - 200_000,
      });

      const case2 = await ctx.db.insert("cases", {
        reportId: report2,
        reportNumber: "EFFI-102",
        summary: "Garbage accumulation",
        category: "sanitation",
        location: { source: "current_gps", latitude: 12.98, longitude: 77.60 },
        reportedAt: now - 200_000,
        submittedAt: now - 200_000,
        recommendedPriority: "high",
        currentPriority: "high",
        priorityReasons: ["Health hazard"],
        citations: [],
        acceptedEvidence: [],
        channel: "app",
        conversationId: "conv-102",
        status: "resolved",
        assignedOfficerId: officer1Id,
        assignedOfficerName: "Arun Verma",
      });

      await ctx.db.insert("caseAuditEvents", {
        caseId: case2,
        actorIdentityId: citizenId,
        actorName: "Citizen Tester",
        occurredAt: now - 150_000,
        event: {
          kind: "citizen_disputed",
          from: "awaiting_confirmation",
          to: "disputed",
          comment: "Bags left behind near corner.",
        },
      });

      await ctx.db.insert("caseAuditEvents", {
        caseId: case2,
        actorIdentityId: officer1Id,
        actorName: "Arun Verma",
        occurredAt: now - 100_000,
        event: {
          kind: "case_reopened",
          from: "disputed",
          to: "under_inspection",
          reason: "Re-cleared corner with team",
        },
      });

      await ctx.db.insert("caseAuditEvents", {
        caseId: case2,
        actorIdentityId: officer1Id,
        actorName: "Arun Verma",
        occurredAt: now - 60_000,
        event: {
          kind: "resolution_verified_by_officer",
          from: "disputed",
          to: "resolved",
          reason: "Verified site clear with geo-stamped footage",
        },
      });

      // Case 3: Currently awaiting confirmation
      const report3 = await ctx.db.insert("reports", {
        citizenId,
        reportNumber: "EFFI-103",
        channel: "app",
        conversationId: "conv-103",
        issue: "Streetlight not working",
        category: "lighting",
        location: { source: "current_gps", latitude: 12.99, longitude: 77.61 },
        primaryEvidence: [],
        reportedAt: now - 30_000,
        submittedAt: now - 30_000,
      });

      await ctx.db.insert("cases", {
        reportId: report3,
        reportNumber: "EFFI-103",
        summary: "Streetlight not working",
        category: "lighting",
        location: { source: "current_gps", latitude: 12.99, longitude: 77.61 },
        reportedAt: now - 30_000,
        submittedAt: now - 30_000,
        recommendedPriority: "medium",
        currentPriority: "medium",
        priorityReasons: ["Public safety"],
        citations: [],
        acceptedEvidence: [],
        channel: "app",
        conversationId: "conv-103",
        status: "awaiting_confirmation",
        assignedOfficerId: officer1Id,
        assignedOfficerName: "Arun Verma",
        repostCount: 2,
      });
    });

    const result = await t
      .withIdentity(officerIdentity)
      .query(api.merit.getOfficerMeritDashboard, { dateRange: "all" });

    // Verify summary counts
    expect(result.summary.totalAssignedCases).toBe(3);
    expect(result.summary.citizenConfirmedResolutions).toBe(1);
    expect(result.summary.officerVerifiedResolutions).toBe(1);
    expect(result.summary.totalResolvedCases).toBe(2);
    expect(result.summary.citizenDisputedCases).toBe(1);
    expect(result.summary.reopenedCases).toBe(1);
    expect(result.summary.awaitingConfirmationCases).toBe(1);
    expect(result.summary.repeatComplaintCases).toBe(1);
    expect(result.summary.totalReposts).toBe(2);

    // Citizen confirmation rate: 1 confirmed out of (1 confirmed + 1 disputed) = 50.0%
    expect(result.summary.citizenConfirmationRate.confirmed).toBe(1);
    expect(result.summary.citizenConfirmationRate.totalResponses).toBe(2);
    expect(result.summary.citizenConfirmationRate.percentage).toBe(50);

    // First time resolution: 1 out of 2 resolved cases had no dispute/reopen = 50.0%
    expect(result.summary.firstTimeResolutionRate.firstTime).toBe(1);
    expect(result.summary.firstTimeResolutionRate.totalResolved).toBe(2);
    expect(result.summary.firstTimeResolutionRate.percentage).toBe(50);

    // Median resolution time computed across Case 1 (50,000ms) and Case 2 (140,000ms) = 95,000ms
    expect(result.summary.medianResolutionMs).toBe(95_000);

    // Verify officer 1 specific numbers
    const arun = result.officers.find((o) => o.name === "Arun Verma");
    expect(arun).toBeDefined();
    expect(arun?.assignedCases).toBe(3);
    expect(arun?.citizenConfirmed).toBe(1);
    expect(arun?.officerVerified).toBe(1);
    expect(arun?.citizenDisputes).toBe(1);
    expect(arun?.reopenedCases).toBe(1);
    expect(arun?.awaitingConfirmation).toBe(1);
    expect(arun?.confirmationRate.percentage).toBe(50);
    expect(arun?.firstTimeRate.percentage).toBe(50);

    // Officer 2 (Bhavna Patel) had no cases assigned
    const bhavna = result.officers.find((o) => o.name === "Bhavna Patel");
    expect(bhavna).toBeDefined();
    expect(bhavna?.assignedCases).toBe(0);
    expect(bhavna?.confirmationRate.percentage).toBeNull();
  });

  it("respects date range boundaries", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { officer1Id, citizenId } = await setupTestEnvironment(t);

    const now = Date.now();
    const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;

    await t.run(async (ctx) => {
      const oldReport = await ctx.db.insert("reports", {
        citizenId,
        reportNumber: "EFFI-OLD",
        channel: "app",
        conversationId: "conv-old",
        issue: "Old resolved issue",
        category: "roads",
        location: { source: "current_gps", latitude: 12.97, longitude: 77.59 },
        primaryEvidence: [],
        reportedAt: tenDaysAgo,
        submittedAt: tenDaysAgo,
      });

      await ctx.db.insert("cases", {
        reportId: oldReport,
        reportNumber: "EFFI-OLD",
        summary: "Old resolved issue",
        category: "roads",
        location: { source: "current_gps", latitude: 12.97, longitude: 77.59 },
        reportedAt: tenDaysAgo,
        submittedAt: tenDaysAgo,
        recommendedPriority: "medium",
        currentPriority: "medium",
        priorityReasons: ["Historic issue"],
        citations: [],
        acceptedEvidence: [],
        channel: "app",
        conversationId: "conv-old",
        status: "resolved",
        assignedOfficerId: officer1Id,
        assignedOfficerName: "Arun Verma",
      });
    });

    // 7d window excludes the 10-day old case
    const sevenDayResult = await t
      .withIdentity(officerIdentity)
      .query(api.merit.getOfficerMeritDashboard, { dateRange: "7d" });
    expect(sevenDayResult.summary.totalAssignedCases).toBe(0);

    // 30d window includes the 10-day old case
    const thirtyDayResult = await t
      .withIdentity(officerIdentity)
      .query(api.merit.getOfficerMeritDashboard, { dateRange: "30d" });
    expect(thirtyDayResult.summary.totalAssignedCases).toBe(1);
  });
});
