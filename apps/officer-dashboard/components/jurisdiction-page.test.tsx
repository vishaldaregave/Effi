import { describe, expect, it } from "vitest";
import { resolveJurisdiction, buildOverpassBoundaryQuery } from "@effi/domain";

describe("Officer Dashboard Jurisdiction Resolution Integration", () => {
  it("resolves PCMC Zone D for Wakad coordinates", () => {
    const res = resolveJurisdiction({ latitude: 18.598, longitude: 73.763 });
    expect(res.authority).toBe("PCMC");
    expect(res.inMahanagarpalikaHaad).toBe(true);
    expect(res.detectedZoneOrPanchayat).toContain("Zone D");
    expect(res.grievanceHelpline).toContain("8888 00 6666");
  });

  it("resolves PMC Aundh Ward for Aundh coordinates", () => {
    const res = resolveJurisdiction({ latitude: 18.558, longitude: 73.807 });
    expect(res.authority).toBe("PMC");
    expect(res.inMahanagarpalikaHaad).toBe(true);
    expect(res.detectedZoneOrPanchayat).toContain("Aundh");
    expect(res.grievanceHelpline).toContain("1800 1030 222");
  });

  it("resolves Grampanchayat for Hinjawadi coordinates", () => {
    const res = resolveJurisdiction({ latitude: 18.591, longitude: 73.738 });
    expect(res.authority).toBe("GRAMPANCHAYAT");
    expect(res.inMahanagarpalikaHaad).toBe(false);
    expect(res.planningAuthority).toContain("PMRDA");
  });

  it("triggers collision buffer protocol within 350m of boundary", () => {
    const res = resolveJurisdiction({ latitude: 18.577, longitude: 73.826 });
    expect(res.isBorderlandBuffer).toBe(true);
    expect(res.jointResolutionProtocol).toBeDefined();
  });

  it("generates correct Overpass QL boundary query for PCMC and PMC", () => {
    const query = buildOverpassBoundaryQuery("pcmc_boundary");
    expect(query).toContain("Pimpri");
    expect(query).toContain("relation");
  });
});
