import { describe, expect, it } from "vitest";
import { generateMunicipalWorkCompletionReport, verifyCryptographicAuditSeal } from "@effi/domain";
import QRCode from "qrcode";

describe("Work Completion & Financial Audit Report with Real-World Time Series", () => {
  const sampleReport = generateMunicipalWorkCompletionReport({
    reportNumber: "RPT-kh7d4ae1xxhsx86xedgmn2m0gx8gt862",
    caseId: "case-pothole-9921",
    issueCategory: "roads",
    summary: "Pothole filled with water on road near reporter's residency.",
    reportedAt: 1729680000000, // 23 Oct 2026, 10:14:00 IST
    resolvedAt: 1729766400000, // 24 Oct 2026, 16:30:00 IST (24h later)
    citizenChannel: "telegram",
    coordinates: { latitude: 18.45831, longitude: 73.8743 },
    resolutionNote: "Bituminous surface patch repair executed with hot-mix asphalt and roller compaction.",
    officerName: "Vishal Ghadge",
    officerBadge: "PMC-ENG-8820",
    officerRole: "Zonal Executive Engineer",
    financial: {
      budgetHeadCode: "PCMC-RDS-CAPEX-2026-401",
      budgetHeadName: "Bituminous Road Surface Restoration",
      sanctionedAmountInr: 45000,
      expendedAmountInr: 41200,
      contractorName: "Mahanagar Civil Infrastructure Pvt Ltd",
      workOrderNumber: "WO/2026/MUNICIPAL/PW/VY3D",
      materialsAndEquipment: "Bitumen VG-30: 4.2 MT, JCB Loader: 3.5 hrs, Roller compactor: 2 hrs, 6 skilled labor crew",
      financialApprover: "Chief Accounts Officer & Zonal Dy. Municipal Commissioner",
      sanctionDate: "2026-10-21",
      completionDate: "2026-10-24",
    },
  });

  it("produces clean, non-wrapping report reference and token format", () => {
    expect(sampleReport.reportReference).toBe(
      "AUD-PMC-RPT-kh7d4ae1xxhs-WO/2026/MUNICIPAL/PW/VY3",
    );
    expect(sampleReport.reportNumber).toBe("RPT-kh7d4ae1xxhsx86xedgmn2m0gx8gt862");
  });

  it("generates a valid QR code data URL for verification", async () => {
    expect(sampleReport.verificationUrl).toContain("pmc.gov.in/verify-audit");
    const dataUrl = await QRCode.toDataURL(sampleReport.verificationUrl, {
      width: 140,
      margin: 1,
    });
    expect(dataUrl).toContain("data:image/png;base64,");
  });

  it("contains complete 7-stage real-world time-series audit history with proper format", () => {
    expect(sampleReport.auditTrail).toHaveLength(7);

    // Stage 1: Grievance Intake
    const stage1 = sampleReport.auditTrail[0]!;
    expect(stage1.stageCode).toBe("STAGE-01-INTAKE");
    expect(stage1.verificationStatus).toBe("VERIFIED");
    expect(stage1.actorName).toContain("AI Citizen Gateway");
    expect(stage1.statutoryRule).toContain("MMCA 1949");
    expect(stage1.formattedTimestamp).toBeTruthy();

    // Stage 2: GIS Demarcation
    const stage2 = sampleReport.auditTrail[1]!;
    expect(stage2.stageCode).toBe("STAGE-02-GIS-DEMARCATION");
    expect(stage2.verificationStatus).toBe("VERIFIED");
    expect(stage2.actorAuthority).toContain("GIS Division");

    // Stage 3: Field Inspection
    const stage3 = sampleReport.auditTrail[2]!;
    expect(stage3.stageCode).toBe("STAGE-03-SITE-INSPECTION");
    expect(stage3.actionSummary).toContain("inspection");

    // Stage 4: Financial Budget Sanction
    const stage4 = sampleReport.auditTrail[3]!;
    expect(stage4.stageCode).toBe("STAGE-04-BUDGET-SANCTION");
    expect(stage4.verificationStatus).toBe("SANCTIONED");
    expect(stage4.findingsAndRemarks).toContain("45,000");

    // Stage 5: Civil Engineering Execution
    const stage5 = sampleReport.auditTrail[4]!;
    expect(stage5.stageCode).toBe("STAGE-05-CIVIL-EXECUTION");
    expect(stage5.verificationStatus).toBe("EXECUTED");
    expect(stage5.findingsAndRemarks).toContain("Bitumen VG-30");

    // Stage 6: QA Audit
    const stage6 = sampleReport.auditTrail[5]!;
    expect(stage6.stageCode).toBe("STAGE-06-QUALITY-ASSURANCE");
    expect(stage6.verificationStatus).toBe("AUDITED");

    // Stage 7: Final Seal
    const stage7 = sampleReport.auditTrail[6]!;
    expect(stage7.stageCode).toBe("STAGE-07-FINAL-SEAL");
    expect(stage7.verificationStatus).toBe("CRYPTOGRAPHICALLY_SEALED");
  });

  it("ensures audit trail timestamps advance chronologically and block hashes are chained", () => {
    const trail = sampleReport.auditTrail;
    for (let i = 1; i < trail.length; i++) {
      expect(trail[i]!.timestamp).toBeGreaterThanOrEqual(trail[i - 1]!.timestamp);
      expect(trail[i]!.previousBlockHash).toBe(trail[i - 1]!.blockHash);
    }
  });

  it("verifies the SHA-256 cryptographic audit seal successfully", () => {
    expect(verifyCryptographicAuditSeal(sampleReport.cryptographicAuditSeal)).toBe(true);
    expect(sampleReport.cryptographicAuditSeal.verificationFingerprint).toMatch(
      /^[A-F0-9]{4} : [A-F0-9]{4}/,
    );
  });
});
