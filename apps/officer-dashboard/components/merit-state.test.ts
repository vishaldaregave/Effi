import { describe, expect, it } from "vitest";
import {
  filterOfficers,
  formatDuration,
  formatPercentage,
  sortOfficers,
  type OfficerPerformance,
} from "./merit-state";

const sampleOfficers: OfficerPerformance[] = [
  {
    officerId: "off-1",
    name: "Vikram Sen",
    assignedCases: 15,
    currentWorkload: 4,
    awaitingConfirmation: 2,
    citizenConfirmed: 8,
    officerVerified: 1,
    totalResolved: 9,
    citizenDisputes: 1,
    reopenedCases: 1,
    repeatCases: 2,
    overdueCases: 0,
    medianResolutionMs: 7200000, // 2 hr
    confirmationRate: { percentage: 88.9, confirmed: 8, totalResponses: 9 },
    firstTimeRate: { percentage: 88.9, firstTime: 8, totalResolved: 9 },
  },
  {
    officerId: "off-2",
    name: "Anita Roy",
    assignedCases: 22,
    currentWorkload: 7,
    awaitingConfirmation: 3,
    citizenConfirmed: 11,
    officerVerified: 0,
    totalResolved: 11,
    citizenDisputes: 2,
    reopenedCases: 0,
    repeatCases: 1,
    overdueCases: 1,
    medianResolutionMs: 14400000, // 4 hr
    confirmationRate: { percentage: 84.6, confirmed: 11, totalResponses: 13 },
    firstTimeRate: { percentage: 84.6, firstTime: 11, totalResolved: 13 },
  },
  {
    officerId: "off-3",
    name: "Chandan Kumar",
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
    medianResolutionMs: null,
    confirmationRate: { percentage: null, confirmed: 0, totalResponses: 0 },
    firstTimeRate: { percentage: null, firstTime: 0, totalResolved: 0 },
  },
];

describe("merit-state helpers", () => {
  it("formats durations accurately and safely handles null", () => {
    expect(formatDuration(null)).toBe("No data");
    expect(formatDuration(1800000)).toBe("30 min");
    expect(formatDuration(7200000)).toBe("2.0 hr");
    expect(formatDuration(172800000)).toBe("2.0 days");
  });

  it("formats percentages with explicit sample sizes", () => {
    expect(formatPercentage(null, 0, 0)).toBe("No responses");
    expect(formatPercentage(88.9, 8, 9)).toBe("88.9% (8/9)");
  });

  it("filters officers by name case-insensitively", () => {
    const filtered = filterOfficers(sampleOfficers, "anita");
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.name).toBe("Anita Roy");

    const emptySearch = filterOfficers(sampleOfficers, "");
    expect(emptySearch).toHaveLength(3);

    const noMatch = filterOfficers(sampleOfficers, "xyz");
    expect(noMatch).toHaveLength(0);
  });

  it("sorts officers by various merit dimensions", () => {
    const sortedByName = sortOfficers(sampleOfficers, "name", "asc");
    expect(sortedByName[0]?.name).toBe("Anita Roy");
    expect(sortedByName[2]?.name).toBe("Vikram Sen");

    const sortedByWorkloadDesc = sortOfficers(sampleOfficers, "currentWorkload", "desc");
    expect(sortedByWorkloadDesc[0]?.name).toBe("Anita Roy"); // 7
    expect(sortedByWorkloadDesc[1]?.name).toBe("Vikram Sen"); // 4
    expect(sortedByWorkloadDesc[2]?.name).toBe("Chandan Kumar"); // 0

    const sortedByRateDesc = sortOfficers(sampleOfficers, "confirmationRate", "desc");
    expect(sortedByRateDesc[0]?.name).toBe("Vikram Sen"); // 88.9%
    expect(sortedByRateDesc[1]?.name).toBe("Anita Roy"); // 84.6%
    expect(sortedByRateDesc[2]?.name).toBe("Chandan Kumar"); // null -> -1
  });
});
