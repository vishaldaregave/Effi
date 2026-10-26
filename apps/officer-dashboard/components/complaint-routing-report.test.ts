import { describe, expect, it } from "vitest";
import {
  routeComplaintByCoordinates,
  generateMunicipalWorkCompletionReport,
  verifyCryptographicAuditSeal,
  computeSha256,
} from "@effi/domain";

describe("Complaint Routing & Municipal Cryptographic Work Completion Audit", () => {
  it("calculates latitude/longitude and correctly routes to PCMC officer", () => {
    // Wakad / Hinjawadi Bridge (PCMC)
    const routing = routeComplaintByCoordinates({ latitude: 18.598, longitude: 73.763 }, "roads");

    expect(routing.authority).toBe("PCMC");
    expect(routing.inMahanagarpalikaHaad).toBe(true);
    expect(routing.designatedOfficerTitle).toContain("Executive Engineer");
    expect(routing.designatedDepartment).toContain("PCMC");
    expect(routing.slaTargetHours).toBe(48);
  });

  it("calculates latitude/longitude and correctly routes to PMC officer", () => {
    // Aundh Parihar Chowk (PMC)
    const routing = routeComplaintByCoordinates({ latitude: 18.558, longitude: 73.807 }, "water");

    expect(routing.authority).toBe("PMC");
    expect(routing.inMahanagarpalikaHaad).toBe(true);
    expect(routing.designatedOfficerTitle).toContain("Assistant Municipal Commissioner");
    expect(routing.designatedDepartment).toContain("PMC");
    expect(routing.slaTargetHours).toBe(12);
  });

  it("calculates latitude/longitude and correctly routes to Grampanchayat officer", () => {
    // Hinjawadi IT Park (Grampanchayat Maan / Hinjawadi)
    const routing = routeComplaintByCoordinates({ latitude: 18.591, longitude: 73.738 }, "sanitation");

    expect(routing.authority).toBe("GRAMPANCHAYAT");
    expect(routing.inMahanagarpalikaHaad).toBe(false);
    expect(routing.designatedOfficerTitle).toContain("Gram Sevak");
    expect(routing.slaTargetHours).toBeGreaterThanOrEqual(24);
  });

  it("detects border buffer collision between PCMC and PMC at Harris Bridge", () => {
    // Dapodi / Bopodi Harris Bridge border
    const routing = routeComplaintByCoordinates({ latitude: 18.577, longitude: 73.826 }, "roads");

    expect(routing.isBorderlandBuffer).toBe(true);
    expect(routing.routingNotes).toContain("boundary buffer zone");
  });

  it("generates municipal work completion report with proper zone, budget audit and cryptographic signature", () => {
    const report = generateMunicipalWorkCompletionReport({
      reportNumber: "PCMC-2026-8890",
      caseId: "case-road-reconstruction-77",
      issueCategory: "roads",
      summary: "Pothole crater restoration and bituminous sealing",
      reportedAt: Date.now() - 86400000,
      resolvedAt: Date.now(),
      citizenChannel: "whatsapp",
      coordinates: { latitude: 18.598, longitude: 73.763 },
      resolutionNote: "Re-excavated, compacted with 40mm aggregate, and laid VG-30 bituminous asphalt.",
      officerName: "Pradeep Kulkarni",
      officerBadge: "OFF-PCMC-4402",
      officerRole: "Executive Engineer (Public Works)",
      financial: {
        budgetHeadCode: "PCMC-RDS-CAPEX-2026-401",
        budgetHeadName: "Road Surface Restoration",
        sanctionedAmountInr: 50000,
        expendedAmountInr: 44200,
        contractorName: "Mahanagar Civil Infrastructure Pvt Ltd",
        workOrderNumber: "WO/2026/PCMC/PW/8841",
        materialsAndEquipment: "Bitumen VG-30: 4.5 MT, JCB Loader: 3 hrs",
        financialApprover: "Chief Accounts Officer",
        sanctionDate: "2026-04-10",
        completionDate: "2026-04-12",
      },
    });

    // Verification of proper zone & coordinates
    expect(report.geospatialAudit.authority).toBe("PCMC");
    expect(report.geospatialAudit.coordinates.latitude).toBeCloseTo(18.598);
    expect(report.geospatialAudit.coordinates.longitude).toBeCloseTo(73.763);
    expect(report.geospatialAudit.inMahanagarpalikaHaad).toBe(true);

    // Verification of financial audit & budget variance
    expect(report.financialBudgetAudit.sanctionedAmountInr).toBe(50000);
    expect(report.financialBudgetAudit.expendedAmountInr).toBe(44200);
    expect(report.financialBudgetAudit.varianceInr).toBe(5800);
    expect(report.financialBudgetAudit.isWithinBudget).toBe(true);

    // Verification of real-time cryptographic audit seal
    expect(report.cryptographicAuditSeal.algorithm).toBe("SHA-256");
    expect(report.cryptographicAuditSeal.signature).toMatch(/^SIG-EFFI-SHA256-[0-9A-F]{64}$/i);
    expect(verifyCryptographicAuditSeal(report.cryptographicAuditSeal)).toBe(true);

    // Tampering test: altering budget invalidates signature
    const tamperedSeal = {
      ...report.cryptographicAuditSeal,
      canonicalPayload: report.cryptographicAuditSeal.canonicalPayload.replace("50000", "99999"),
    };
    expect(verifyCryptographicAuditSeal(tamperedSeal)).toBe(false);
  });
});
