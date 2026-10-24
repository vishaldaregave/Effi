import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import {
  assessResolutionEvidence,
  haversineDistanceMeters,
} from "./resolution_assurance";

const officerIdentity = {
  tokenIdentifier: "clerk|officer-demo",
  subject: "officer-demo",
  name: "Demo Officer",
};

const secondOfficerIdentity = {
  tokenIdentifier: "clerk|officer-two",
  subject: "officer-two",
  name: "Second Officer",
};

const citizenIdentity = {
  tokenIdentifier: "clerk|citizen-owner",
  subject: "citizen-owner",
  name: "Aman Citizen",
};

const otherCitizenIdentity = {
  tokenIdentifier: "clerk|citizen-intruder",
  subject: "citizen-intruder",
  name: "Other Citizen",
};

type TestConvex = ReturnType<typeof convexTest>;

const seedCaseForResolution = async (t: TestConvex): Promise<Id<"cases">> => {
  return await t.run(async (ctx) => {
    const officer = await ctx.db.insert("identities", {
      externalId: officerIdentity.tokenIdentifier,
      role: "officer",
      displayName: "Demo Officer",
    });

    const citizen = await ctx.db.insert("identities", {
      externalId: citizenIdentity.tokenIdentifier,
      role: "citizen",
      displayName: "Aman Citizen",
    });

    const reportId = await ctx.db.insert("reports", {
      citizenId: citizen,
      reportNumber: "RPT-RES-101",
      channel: "app",
      conversationId: "conv-101",
      issue: "Deep pothole on SV Road near Metro Station",
      category: "roads",
      location: {
        source: "current_gps",
        latitude: 19.076,
        longitude: 72.8777,
      },
      primaryEvidence: [
        {
          attachmentId: "att-before-1",
          storageKey: "evidence/pothole-before.jpg",
          mediaType: "image/jpeg",
          sourceMessageId: "msg-1",
        },
      ],
      reportedAt: Date.now() - 3600000,
      submittedAt: Date.now() - 3500000,
    });

    return await ctx.db.insert("cases", {
      reportId,
      reportNumber: "RPT-RES-101",
      summary: "Deep pothole on SV Road near Metro Station",
      category: "roads",
      location: {
        source: "current_gps",
        latitude: 19.076,
        longitude: 72.8777,
      },
      reportedAt: Date.now() - 3600000,
      submittedAt: Date.now() - 3500000,
      recommendedPriority: "high",
      currentPriority: "high",
      priorityReasons: ["Pothole poses hazard to two-wheelers"],
      citations: [],
      acceptedEvidence: [
        {
          attachmentId: "att-before-1",
          storageKey: "evidence/pothole-before.jpg",
          mediaType: "image/jpeg",
          sourceMessageId: "msg-1",
        },
      ],
      channel: "app",
      conversationId: "conv-101",
      assignedOfficerId: officer,
      assignedOfficerName: "Demo Officer",
      status: "work_in_progress",
    });
  });
};

describe("haversineDistanceMeters", () => {
  it("calculates 0 meters for identical points", () => {
    expect(haversineDistanceMeters(19.076, 72.8777, 19.076, 72.8777)).toBe(0);
  });

  it("calculates approximate distance between nearby points", () => {
    // 0.001 deg latitude is roughly 111 meters
    const dist = haversineDistanceMeters(19.076, 72.8777, 19.077, 72.8777);
    expect(dist).toBeGreaterThan(100);
    expect(dist).toBeLessThan(120);
  });
});

describe("assessResolutionEvidence algorithm", () => {
  it("flags insufficient evidence when no completion media is submitted", async () => {
    const result = await assessResolutionEvidence({
      category: "roads",
      summary: "Pothole on Main Road",
      resolutionNote: "Repaved the pothole with hot mix asphalt.",
      originalEvidence: [{ attachmentId: "before-1", mediaType: "image/jpeg" }],
      completionEvidence: [],
      originalLocation: { latitude: 19.076, longitude: 72.8777 },
    });

    expect(result.recommendation).toBe("insufficient_evidence");
    expect(result.manualReviewRequired).toBe(true);
    expect(result.reasons).toEqual(
      expect.arrayContaining([expect.stringMatching(/No after-repair photos/i)]),
    );
  });

  it("flags brief completion notes as requiring review", async () => {
    const result = await assessResolutionEvidence({
      category: "roads",
      summary: "Pothole on Main Road",
      resolutionNote: "Fixed", // < 10 characters
      originalEvidence: [{ attachmentId: "before-1", mediaType: "image/jpeg" }],
      completionEvidence: [{ attachmentId: "after-1", mediaType: "image/jpeg" }],
      originalLocation: { latitude: 19.076, longitude: 72.8777 },
    });

    expect(result.recommendation).toBe("requires_review");
    expect(result.reasons).toEqual(
      expect.arrayContaining([expect.stringMatching(/too brief/i)]),
    );
  });

  it("flags geographic drift exceeding 500 meters", async () => {
    const result = await assessResolutionEvidence({
      category: "roads",
      summary: "Pothole on Main Road",
      resolutionNote: "Fresh asphalt patch applied and roller compacted.",
      originalEvidence: [{ attachmentId: "before-1", mediaType: "image/jpeg" }],
      completionEvidence: [{ attachmentId: "after-1", mediaType: "image/jpeg" }],
      originalLocation: { latitude: 19.076, longitude: 72.8777 },
      completionLocation: { latitude: 19.086, longitude: 72.8777 }, // ~1.1 km away
    });

    expect(result.recommendation).toBe("requires_review");
    expect(result.reasons).toEqual(
      expect.arrayContaining([expect.stringMatching(/exceeds 500m threshold/i)]),
    );
  });

  it("incorporates custom vision evaluator success cleanly", async () => {
    const mockVision = async () => ({
      recommendation: "supports_resolution" as const,
      reasons: ["Before pothole cavity is completely leveled in after photo."],
      uncertainty: 0.12,
      provider: "mock_vision_v1",
      manualReviewRequired: false,
    });

    const result = await assessResolutionEvidence({
      category: "roads",
      summary: "Pothole on Main Road",
      resolutionNote: "Fresh asphalt patch applied and roller compacted.",
      originalEvidence: [{ attachmentId: "before-1", mediaType: "image/jpeg" }],
      completionEvidence: [{ attachmentId: "after-1", mediaType: "image/jpeg" }],
      originalLocation: { latitude: 19.076, longitude: 72.8777 },
      completionLocation: { latitude: 19.0761, longitude: 72.8777 },
      visionEvaluator: mockVision,
    });

    expect(result.recommendation).toBe("supports_resolution");
    expect(result.provider).toBe("mock_vision_v1");
    expect(result.reasons).toEqual(
      expect.arrayContaining([expect.stringMatching(/completely leveled/i)]),
    );
  });

  it("handles vision evaluator failures safely without crashing", async () => {
    const failingVision = async () => {
      throw new Error("Vision provider quota exceeded 429");
    };

    const result = await assessResolutionEvidence({
      category: "roads",
      summary: "Pothole on Main Road",
      resolutionNote: "Fresh asphalt patch applied and roller compacted.",
      originalEvidence: [{ attachmentId: "before-1", mediaType: "image/jpeg" }],
      completionEvidence: [{ attachmentId: "after-1", mediaType: "image/jpeg" }],
      originalLocation: { latitude: 19.076, longitude: 72.8777 },
      visionEvaluator: failingVision,
    });

    expect(result.recommendation).toBe("requires_review");
    expect(result.provider).toBe("vision_error");
    expect(result.manualReviewRequired).toBe(true);
    expect(result.reasons).toEqual(
      expect.arrayContaining([expect.stringMatching(/quota exceeded 429/i)]),
    );
  });
});

describe("resolution assurance engine convex workflow", () => {
  it("officer submits resolution moving case to awaiting_confirmation", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const caseId = await seedCaseForResolution(t);

    const submissionResult = await t
      .withIdentity(officerIdentity)
      .mutation(api.cases.submitResolution, {
        caseId,
        resolutionNote: "Cold patch asphalt applied and smoothed across 4 sq ft cavity.",
        evidence: [
          {
            attachmentId: "att-after-1",
            mediaType: "image/jpeg",
            storageKey: "evidence/after-repair.jpg",
            sourceMessageId: "officer-repair-upload",
          },
        ],
        location: {
          source: "current_gps",
          latitude: 19.07605,
          longitude: 72.87772,
        },
      });

    expect(submissionResult.status).toBe("awaiting_confirmation");
    expect(submissionResult.aiAssessment.recommendation).toBeDefined();

    // Verify case in database
    const detail = await t
      .withIdentity(officerIdentity)
      .query(api.cases.getCase, { caseId });

    expect(detail.case.status).toBe("awaiting_confirmation");
    expect(detail.case.latestResolution).toBeDefined();
    expect(detail.case.latestResolution?.resolutionNote).toContain("Cold patch asphalt");
    expect(detail.audit.at(-1)?.event.kind).toBe("resolution_submitted");
  });

  it("case remains in awaiting_confirmation if citizen has not responded yet", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const caseId = await seedCaseForResolution(t);

    await t.withIdentity(officerIdentity).mutation(api.cases.submitResolution, {
      caseId,
      resolutionNote: "Street drain blockage cleared with vacuum suction pump.",
      evidence: [
        {
          attachmentId: "att-after-pump",
          mediaType: "image/jpeg",
          storageKey: "evidence/pump.jpg",
          sourceMessageId: "pump-msg",
        },
      ],
    });

    // Check citizen view
    const citizenDetail = await t
      .withIdentity(citizenIdentity)
      .query(api.citizen.viewerCase, { caseId });

    expect(citizenDetail?.case.status).toBe("awaiting_confirmation");
    expect(citizenDetail?.latestResolution?.resolutionNote).toContain("Street drain blockage cleared");
    expect(citizenDetail?.latestResolution?.citizenConfirmation).toBeUndefined();
  });

  it("citizen confirms resolution and case transitions to verified resolved", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const caseId = await seedCaseForResolution(t);

    await t.withIdentity(officerIdentity).mutation(api.cases.submitResolution, {
      caseId,
      resolutionNote: "Replaced faulty LED streetlight fixture on pole 14.",
      evidence: [
        {
          attachmentId: "att-after-light",
          mediaType: "image/jpeg",
          storageKey: "evidence/light.jpg",
          sourceMessageId: "light-msg",
        },
      ],
    });

    // Citizen confirms
    const confirmResult = await t
      .withIdentity(citizenIdentity)
      .mutation(api.citizen.confirmResolution, {
        caseId,
        verdict: "confirmed",
        comment: "Thank you, the light is shining brightly tonight!",
      });

    expect(confirmResult.status).toBe("resolved");
    expect(confirmResult.verdict).toBe("confirmed");

    // Case is now verified resolved
    const updated = await t
      .withIdentity(citizenIdentity)
      .query(api.citizen.viewerCase, { caseId });

    expect(updated?.case.status).toBe("resolved");
    expect(updated?.latestResolution?.citizenConfirmation?.verdict).toBe("confirmed");
    expect(updated?.latestResolution?.citizenConfirmation?.comment).toContain("shining brightly");

    // Check timeline entry
    const confirmedTimeline = updated?.timeline.find(
      (entry) => entry.event.kind === "citizen_confirmed",
    );
    expect(confirmedTimeline).toBeDefined();
  });

  it("citizen disputes resolution, moving case to disputed with feedback", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const caseId = await seedCaseForResolution(t);

    await t.withIdentity(officerIdentity).mutation(api.cases.submitResolution, {
      caseId,
      resolutionNote: "Swept garbage pile into bin.",
      evidence: [
        {
          attachmentId: "att-after-bin",
          mediaType: "image/jpeg",
          storageKey: "evidence/bin.jpg",
          sourceMessageId: "bin-msg",
        },
      ],
    });

    // Citizen disputes
    const disputeResult = await t
      .withIdentity(citizenIdentity)
      .mutation(api.citizen.confirmResolution, {
        caseId,
        verdict: "disputed",
        comment: "Half the garbage is still strewn along the pavement.",
      });

    expect(disputeResult.status).toBe("disputed");
    expect(disputeResult.verdict).toBe("disputed");

    // Officer inspects disputed case
    const officerDetail = await t
      .withIdentity(officerIdentity)
      .query(api.cases.getCase, { caseId });

    expect(officerDetail.case.status).toBe("disputed");
    expect(officerDetail.case.latestResolution?.citizenConfirmation?.verdict).toBe("disputed");
    expect(officerDetail.case.latestResolution?.citizenConfirmation?.comment).toContain(
      "Half the garbage is still strewn",
    );

    // Audit has citizen_disputed
    expect(officerDetail.audit.at(-1)?.event.kind).toBe("citizen_disputed");
  });

  it("officer reopens a disputed case back to work_in_progress while preserving full history", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const caseId = await seedCaseForResolution(t);

    await t.withIdentity(officerIdentity).mutation(api.cases.submitResolution, {
      caseId,
      resolutionNote: "First repair attempt.",
      evidence: [
        {
          attachmentId: "att-1",
          mediaType: "image/jpeg",
          storageKey: "evidence/1.jpg",
          sourceMessageId: "1",
        },
      ],
    });

    await t.withIdentity(citizenIdentity).mutation(api.citizen.confirmResolution, {
      caseId,
      verdict: "disputed",
      comment: "Still leaking water.",
    });

    // Reopen case
    const reopenResult = await t
      .withIdentity(officerIdentity)
      .mutation(api.cases.reopenCase, {
        caseId,
        reason: "Dispatched second crew with pipe sealant to fix remaining leak.",
      });

    expect(reopenResult.status).toBe("work_in_progress");

    const detail = await t
      .withIdentity(officerIdentity)
      .query(api.cases.getCase, { caseId });

    expect(detail.case.status).toBe("work_in_progress");
    expect(detail.audit.some((e) => e.event.kind === "case_reopened")).toBe(true);

    // Can submit resolution a second time
    const secondResolution = await t
      .withIdentity(officerIdentity)
      .mutation(api.cases.submitResolution, {
        caseId,
        resolutionNote: "Replaced cracked gasket and sealed junction pipe.",
        evidence: [
          {
            attachmentId: "att-2",
            mediaType: "image/jpeg",
            storageKey: "evidence/2.jpg",
            sourceMessageId: "2",
          },
        ],
      });

    expect(secondResolution.status).toBe("awaiting_confirmation");
  });

  it("rejects unauthorized citizen from confirming another user's case", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const caseId = await seedCaseForResolution(t);

    await t.withIdentity(officerIdentity).mutation(api.cases.submitResolution, {
      caseId,
      resolutionNote: "Repair completed.",
      evidence: [
        {
          attachmentId: "att-x",
          mediaType: "image/jpeg",
          storageKey: "evidence/x.jpg",
          sourceMessageId: "x",
        },
      ],
    });

    // Other citizen attempts confirmation
    await expect(
      t.withIdentity(otherCitizenIdentity).mutation(api.citizen.confirmResolution, {
        caseId,
        verdict: "confirmed",
      }),
    ).rejects.toThrow(/only respond to your own/i);
  });

  it("rejects unauthorized officer from submitting resolution on another officer's case", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const caseId = await seedCaseForResolution(t);

    await t.run(async (ctx) => {
      await ctx.db.insert("identities", {
        externalId: secondOfficerIdentity.tokenIdentifier,
        role: "officer",
        displayName: "Second Officer",
      });
    });

    await expect(
      t.withIdentity(secondOfficerIdentity).mutation(api.cases.submitResolution, {
        caseId,
        resolutionNote: "Intruder officer resolution attempt.",
        evidence: [],
      }),
    ).rejects.toThrow(/only the assigned officer can change/i);
  });

  it("prevents duplicate confirmation responses on the same resolution", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const caseId = await seedCaseForResolution(t);

    await t.withIdentity(officerIdentity).mutation(api.cases.submitResolution, {
      caseId,
      resolutionNote: "Repaired pipeline valve.",
      evidence: [
        {
          attachmentId: "att-valve",
          mediaType: "image/jpeg",
          storageKey: "evidence/valve.jpg",
          sourceMessageId: "valve-msg",
        },
      ],
    });

    await t.withIdentity(citizenIdentity).mutation(api.citizen.confirmResolution, {
      caseId,
      verdict: "confirmed",
    });

    // Attempt second response
    await expect(
      t.withIdentity(citizenIdentity).mutation(api.citizen.confirmResolution, {
        caseId,
        verdict: "confirmed",
      }),
    ).rejects.toThrow(/not awaiting citizen confirmation/i);
  });

  it("allows authorized officer to manually verify resolution", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const caseId = await seedCaseForResolution(t);

    await t.withIdentity(officerIdentity).mutation(api.cases.submitResolution, {
      caseId,
      resolutionNote: "Repaired water pump.",
      evidence: [
        {
          attachmentId: "att-p",
          mediaType: "image/jpeg",
          storageKey: "evidence/p.jpg",
          sourceMessageId: "p",
        },
      ],
    });

    // Officer verifies resolution directly
    const verifyResult = await t
      .withIdentity(officerIdentity)
      .mutation(api.cases.verifyResolution, {
        caseId,
        reason: "Supervisor field inspection confirmed water flow restored.",
      });

    expect(verifyResult.status).toBe("resolved");

    const detail = await t
      .withIdentity(officerIdentity)
      .query(api.cases.getCase, { caseId });

    expect(detail.case.status).toBe("resolved");
    expect(detail.audit.at(-1)?.event.kind).toBe("resolution_verified_by_officer");
  });

  it("preserves original complaint evidence immutability throughout resolution and reopen lifecycle", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const caseId = await seedCaseForResolution(t);

    const initialDetail = await t
      .withIdentity(officerIdentity)
      .query(api.cases.getCase, { caseId });

    const originalEvidenceSnapshot = JSON.parse(
      JSON.stringify(initialDetail.case.acceptedEvidence),
    );

    // Submit resolution with different completion evidence
    await t.withIdentity(officerIdentity).mutation(api.cases.submitResolution, {
      caseId,
      resolutionNote: "Repaved roadway with bituminous concrete.",
      evidence: [
        {
          attachmentId: "after-repair-photo",
          mediaType: "image/jpeg",
          storageKey: "evidence/after.jpg",
          sourceMessageId: "msg-after",
        },
      ],
    });

    // Citizen disputes
    await t.withIdentity(citizenIdentity).mutation(api.citizen.confirmResolution, {
      caseId,
      verdict: "disputed",
      comment: "Surface is uneven.",
    });

    // Reopen case to under_inspection
    await t.withIdentity(officerIdentity).mutation(api.cases.reopenCase, {
      caseId,
      reason: "Inspect surface roughness before relaying.",
      targetStatus: "under_inspection",
    });

    const reopenedDetail = await t
      .withIdentity(officerIdentity)
      .query(api.cases.getCase, { caseId });

    expect(reopenedDetail.case.status).toBe("under_inspection");
    // Verify acceptedEvidence is completely unchanged
    expect(reopenedDetail.case.acceptedEvidence).toEqual(originalEvidenceSnapshot);
  });

  it("rejects resolution submission if case is not in progress or disputed", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const caseId = await seedCaseForResolution(t);

    // Set case to new
    await t.run(async (ctx) => {
      await ctx.db.patch(caseId, { status: "new" });
    });

    await expect(
      t.withIdentity(officerIdentity).mutation(api.cases.submitResolution, {
        caseId,
        resolutionNote: "Premature resolution.",
        evidence: [],
      }),
    ).rejects.toThrow(/only cases in progress or disputed/i);
  });

  it("validates resolution note bounds and evidence item limits", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const caseId = await seedCaseForResolution(t);

    // Empty note
    await expect(
      t.withIdentity(officerIdentity).mutation(api.cases.submitResolution, {
        caseId,
        resolutionNote: "   ",
        evidence: [],
      }),
    ).rejects.toThrow(/resolution note must contain between 1 and 500 characters/i);

    // Too many evidence items (> 5)
    const tooManyItems = Array.from({ length: 6 }, (_, i) => ({
      attachmentId: `att-${i}`,
      mediaType: "image/jpeg",
      storageKey: `evidence/${i}.jpg`,
      sourceMessageId: `msg-${i}`,
    }));

    await expect(
      t.withIdentity(officerIdentity).mutation(api.cases.submitResolution, {
        caseId,
        resolutionNote: "Too many photos.",
        evidence: tooManyItems,
      }),
    ).rejects.toThrow(/maximum of 5 completion evidence items/i);
  });

  it("supports resolution submission via legacy advanceCaseStatus mutation", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const caseId = await seedCaseForResolution(t);

    const advanceResult = await t
      .withIdentity(officerIdentity)
      .mutation(api.cases.advanceCaseStatus, {
        caseId,
        action: {
          kind: "resolve",
          resolutionNote: "Advanced via legacy method with asphalt patch.",
          evidence: [
            {
              attachmentId: "legacy-after",
              mediaType: "image/jpeg",
              storageKey: "evidence/legacy.jpg",
              sourceMessageId: "legacy-msg",
            },
          ],
        },
      });

    expect(advanceResult.status).toBe("awaiting_confirmation");

    const detail = await t
      .withIdentity(officerIdentity)
      .query(api.cases.getCase, { caseId });

    expect(detail.case.status).toBe("awaiting_confirmation");
    expect(detail.case.latestResolution?.resolutionNote).toContain("Advanced via legacy method");
  });
});
