import { describe, expect, it } from "vitest";
import {
  HAAD_DIFFERENCE_MATRIX,
  JURISDICTION_FEATURES,
  buildOverpassBoundaryQuery,
  distanceBetweenCoordinatesMetres,
  generateCryptographicAuditSeal,
  generateMunicipalWorkCompletionReport,
  isPointInPolygon,
  resolveJurisdiction,
  routeComplaintByCoordinates,
  verifyCryptographicAuditSeal,
  PCMC_BOUNDARY_COORDINATES,
  PMC_BOUNDARY_COORDINATES,
} from "./geospatial";

describe("Geospatial Coordinate Distinction: PCMC vs PMC vs Grampanchayat", () => {
  it("correctly identifies Wakad coordinates as PCMC Mahanagarpalika Haad", () => {
    // Wakad center (18.598, 73.763)
    const result = resolveJurisdiction({ latitude: 18.598, longitude: 73.763 });

    expect(result.authority).toBe("PCMC");
    expect(result.inMahanagarpalikaHaad).toBe(true);
    expect(result.authorityFullName).toContain("Pimpri-Chinchwad");
    expect(result.governingAct).toContain("Maharashtra Municipal Corporations Act");
    expect(result.grievanceHelpline).toContain("8888 00 6666");
  });

  it("correctly identifies Aundh coordinates as PMC Mahanagarpalika Haad", () => {
    // Aundh DP Road (18.558, 73.807)
    const result = resolveJurisdiction({ latitude: 18.558, longitude: 73.807 });

    expect(result.authority).toBe("PMC");
    expect(result.inMahanagarpalikaHaad).toBe(true);
    expect(result.authorityFullName).toContain("Pune Municipal Corporation");
    expect(result.detectedZoneOrPanchayat).toContain("Aundh");
    expect(result.grievanceHelpline).toContain("1800 1030 222");
  });

  it("correctly identifies Hinjawadi IT Park as Grampanchayat (Outside Mahanagarpalika Haad)", () => {
    // Hinjawadi Phase 1 (18.591, 73.738)
    const result = resolveJurisdiction({ latitude: 18.591, longitude: 73.738 });

    expect(result.authority).toBe("GRAMPANCHAYAT");
    expect(result.inMahanagarpalikaHaad).toBe(false);
    expect(result.classification).toContain("grampanchayat");
    expect(result.authorityFullName).toContain("Hinjawadi Grampanchayat");
    expect(result.propertyTaxSystem).toContain("Namuna 8");
    expect(result.governingAct).toContain("Maharashtra Village Panchayats Act");
  });

  it("correctly detects Khadki Cantonment as Defence Enclave", () => {
    // Khadki Cantonment Bazar (18.563, 73.839)
    const result = resolveJurisdiction({ latitude: 18.563, longitude: 73.839 });

    expect(result.authority).toBe("CANTONMENT");
    expect(result.inMahanagarpalikaHaad).toBe(false);
    expect(result.classification).toBe("cantonment_board");
    expect(result.governingAct).toContain("Cantonments Act");
  });

  it("flags borderland collision warning near Dapodi-Bopodi Harris Bridge border", () => {
    // Exactly at Harris Bridge boundary (18.577, 73.826)
    const result = resolveJurisdiction({ latitude: 18.577, longitude: 73.826 });

    expect(result.distanceToNearestBoundaryMetres).toBeLessThanOrEqual(350);
    expect(result.isBorderlandBuffer).toBe(true);
    expect(result.jointResolutionProtocol).toBeDefined();
    expect(result.jointResolutionProtocol).toContain("Borderland Notice");
  });

  it("includes all 6 key civic comparison categories in HAAD_DIFFERENCE_MATRIX", () => {
    const categories = new Set(HAAD_DIFFERENCE_MATRIX.map((item) => item.category));

    expect(categories.has("governance")).toBe(true);
    expect(categories.has("property_tax")).toBe(true);
    expect(categories.has("building_permission")).toBe(true);
    expect(categories.has("water_supply")).toBe(true);
    expect(categories.has("waste_management")).toBe(true);
    expect(categories.has("grievance_redressal")).toBe(true);

    for (const item of HAAD_DIFFERENCE_MATRIX) {
      expect(item.mahanagarpalikaHaad.title).toBeTruthy();
      expect(item.grampanchayat.title).toBeTruthy();
      expect(item.practicalImpactOnCitizen).toBeTruthy();
      expect(item.recommendedOfficerAction).toBeTruthy();
    }
  });

  it("verifies ray casting and Haversine distance computations", () => {
    const pcmcCenter = { latitude: 18.6279, longitude: 73.7995 };
    const pmcCenter = { latitude: 18.5204, longitude: 73.8567 };

    expect(isPointInPolygon(pcmcCenter, PCMC_BOUNDARY_COORDINATES)).toBe(true);
    expect(isPointInPolygon(pmcCenter, PMC_BOUNDARY_COORDINATES)).toBe(true);

    const distance = distanceBetweenCoordinatesMetres(pcmcCenter, pmcCenter);
    // Distance between Pimpri and central Pune is roughly 12-16 km
    expect(distance).toBeGreaterThan(10_000);
    expect(distance).toBeLessThan(20_000);
  });

  it("builds valid Overpass queries for PCMC, PMC, and talukas", () => {
    const pcmcQuery = buildOverpassBoundaryQuery("pcmc_boundary");
    expect(pcmcQuery).toContain("Pimpri");

    const pmcQuery = buildOverpassBoundaryQuery("pmc_boundary");
    expect(pmcQuery).toContain("Pune");

    const talukaQuery = buildOverpassBoundaryQuery("talukas_boundaries");
    expect(talukaQuery).toContain("Haveli");
  });

  it("routes incoming complaint coordinates directly to correct Mahanagarpalika / Grampanchayat officer", () => {
    // Wakad PCMC complaint
    const pcmcRoute = routeComplaintByCoordinates({ latitude: 18.598, longitude: 73.763 }, "roads");
    expect(pcmcRoute.authority).toBe("PCMC");
    expect(pcmcRoute.inMahanagarpalikaHaad).toBe(true);
    expect(pcmcRoute.designatedDepartment).toContain("Civil Engineering");
    expect(pcmcRoute.designatedOfficerTitle).toContain("Executive Engineer");
    expect(pcmcRoute.officeHelpline).toContain("8888 00 6666");

    // Aundh PMC complaint
    const pmcRoute = routeComplaintByCoordinates({ latitude: 18.558, longitude: 73.807 }, "water");
    expect(pmcRoute.authority).toBe("PMC");
    expect(pmcRoute.inMahanagarpalikaHaad).toBe(true);
    expect(pmcRoute.designatedDepartment).toContain("Water Supply");
    expect(pmcRoute.designatedOfficerTitle).toContain("Ward Officer");
    expect(pmcRoute.officeHelpline).toContain("1800 1030 222");

    // Hinjawadi Grampanchayat complaint
    const gpRoute = routeComplaintByCoordinates({ latitude: 18.591, longitude: 73.738 }, "sanitation");
    expect(gpRoute.authority).toBe("GRAMPANCHAYAT");
    expect(gpRoute.inMahanagarpalikaHaad).toBe(false);
    expect(gpRoute.designatedOfficerTitle).toContain("Gram Sevak");
    expect(gpRoute.officeHelpline).toContain("020-25933300");
  });

  it("generates and verifies tamper-evident Cryptographic Audit Seal using SHA-256", () => {
    const seal = generateCryptographicAuditSeal({
      caseId: "case-pothole-991",
      reportNumber: "REP-2026-PCMC-0442",
      category: "roads",
      latitude: 18.598,
      longitude: 73.763,
      authority: "PCMC",
      zoneOrWard: "PCMC Zone D",
      inHaad: true,
      resolutionNote: "Repaired 14 sqm bituminous road patch with hot-mix asphalt and compaction.",
      sanctionedAmountInr: 45000,
      expendedAmountInr: 41200,
      workOrderNumber: "WO/2026/PCMC/PW/8841",
      signingOfficerName: "Rajesh Shinde",
      signingOfficerBadge: "PCMC-ENG-4402",
      signingOfficerRole: "Zonal Executive Engineer",
    });

    expect(seal.signature).toMatch(/^SIG-EFFI-SHA256-[0-9A-F]{64}$/);
    expect(seal.algorithm).toBe("SHA-256");
    expect(seal.payloadHash).toHaveLength(64);
    expect(seal.verificationFingerprint).toContain(":");

    // Validation passes for genuine seal
    expect(verifyCryptographicAuditSeal(seal)).toBe(true);

    // Tampering with payload fails validation
    const tamperedSeal = {
      ...seal,
      canonicalPayload: seal.canonicalPayload.replace("41200", "99999"),
    };
    expect(verifyCryptographicAuditSeal(tamperedSeal)).toBe(false);
  });

  it("generates complete Municipal Work Completion & Financial Audit Report with budget tracking", () => {
    const report = generateMunicipalWorkCompletionReport({
      reportNumber: "REP-2026-PMC-0108",
      caseId: "case-water-leak-552",
      issueCategory: "water",
      summary: "High pressure pipeline rupture near DP Road Aundh",
      reportedAt: Date.now() - 86400000,
      resolvedAt: Date.now(),
      citizenChannel: "whatsapp",
      coordinates: { latitude: 18.558, longitude: 73.807 },
      resolutionNote: "Replaced 4-inch ductile iron pipe sleeve and pressure tested to 4.5 bar.",
      officerName: "Sanjay Patil",
      officerBadge: "PMC-WTR-1108",
      officerRole: "Aundh Ward Water Engineer",
      financial: {
        budgetHeadCode: "PMC-WTR-2026-OPEX-102",
        budgetHeadName: "Distribution Pipeline Emergency Maintenance",
        sanctionedAmountInr: 60000,
        expendedAmountInr: 54500,
        contractorName: "Shree Ganesh Civil Utilities Ltd",
        workOrderNumber: "WO/PMC/2026/WTR/319",
        materialsAndEquipment: "DI Sleeve, Rubber Gaskets, Excavator 4 hrs, 4 fitters",
        financialApprover: "Chief Accounts Officer & Zonal Dy Commissioner",
        sanctionDate: "2026-10-20",
        completionDate: "2026-10-24",
      },
    });

    expect(report.reportReference).toContain("PMC");
    expect(report.geospatialAudit.authority).toBe("PMC");
    expect(report.geospatialAudit.inMahanagarpalikaHaad).toBe(true);
    expect(report.financialBudgetAudit.varianceInr).toBe(5500); // 60,000 - 54,500 = 5,500 savings
    expect(report.financialBudgetAudit.isWithinBudget).toBe(true);
    expect(report.cryptographicAuditSeal.signature).toContain("SIG-EFFI-SHA256-");
    expect(report.verificationUrl).toContain("pmc.gov.in");

    // Real-world Time Series Audit Trail
    expect(report.auditTrail.length).toBe(7);
    const firstEvent = report.auditTrail[0]!;
    expect(firstEvent.stageCode).toBe("STAGE-01-INTAKE");
    expect(firstEvent.verificationStatus).toBe("VERIFIED");
    expect(firstEvent.formattedTimestamp).toBeTruthy();

    const lastEvent = report.auditTrail[6]!;
    expect(lastEvent.stageCode).toBe("STAGE-07-FINAL-SEAL");
    expect(lastEvent.verificationStatus).toBe("CRYPTOGRAPHICALLY_SEALED");
    expect(lastEvent.blockHash).toBeTruthy();

    // Verify chronological order in real-world time series
    for (let i = 1; i < report.auditTrail.length; i++) {
      expect(report.auditTrail[i]!.timestamp).toBeGreaterThanOrEqual(report.auditTrail[i - 1]!.timestamp);
      expect(report.auditTrail[i]!.previousBlockHash).toBe(report.auditTrail[i - 1]!.blockHash);
    }
  });
});

