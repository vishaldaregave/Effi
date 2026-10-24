export type MeritDateRange = "7d" | "30d" | "90d" | "all";

export type RateMetric = {
  percentage: number | null;
  numerator: number;
  denominator: number;
};

export type OfficerPerformance = {
  officerId: string;
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
  medianResolutionMs: number | null;
  confirmationRate: {
    percentage: number | null;
    confirmed: number;
    totalResponses: number;
  };
  firstTimeRate: {
    percentage: number | null;
    firstTime: number;
    totalResolved: number;
  };
};

export type MeritDashboardData = {
  metadata: {
    evaluatedAt: number;
    selectedRange: MeritDateRange;
    windowStart?: number;
    wardSupportNote: string;
  };
  summary: {
    totalAssignedCases: number;
    currentActiveWorkload: number;
    awaitingConfirmationCases: number;
    citizenConfirmedResolutions: number;
    officerVerifiedResolutions: number;
    legacyResolutions: number;
    totalResolvedCases: number;
    citizenDisputedCases: number;
    reopenedCases: number;
    repeatComplaintCases: number;
    totalReposts: number;
    overdueSlaCases: number;
    unconfiguredSlaCases: number;
    medianResolutionMs: number | null;
    citizenConfirmationRate: {
      percentage: number | null;
      confirmed: number;
      totalResponses: number;
    };
    firstTimeResolutionRate: {
      percentage: number | null;
      firstTime: number;
      totalResolved: number;
    };
  };
  officers: OfficerPerformance[];
};

export type OfficerSortKey =
  | "name"
  | "assignedCases"
  | "currentWorkload"
  | "citizenConfirmed"
  | "officerVerified"
  | "citizenDisputes"
  | "reopenedCases"
  | "confirmationRate"
  | "medianResolutionMs";

export const formatDuration = (milliseconds: number | null): string => {
  if (milliseconds === null) return "No data";
  const hours = milliseconds / (60 * 60 * 1000);
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 24) return `${hours < 10 ? hours.toFixed(1) : Math.round(hours)} hr`;
  const days = hours / 24;
  return `${days < 10 ? days.toFixed(1) : Math.round(days)} days`;
};

export const formatPercentage = (
  percentage: number | null,
  numerator: number,
  denominator: number,
): string => {
  if (percentage === null || denominator === 0) return "No responses";
  return `${percentage.toFixed(1)}% (${numerator}/${denominator})`;
};

export const filterOfficers = (
  officers: readonly OfficerPerformance[],
  searchQuery: string,
): OfficerPerformance[] => {
  const query = searchQuery.trim().toLowerCase();
  if (!query) return [...officers];
  return officers.filter((officer) => officer.name.toLowerCase().includes(query));
};

export const sortOfficers = (
  officers: readonly OfficerPerformance[],
  sortKey: OfficerSortKey,
  direction: "asc" | "desc",
): OfficerPerformance[] => {
  return [...officers].sort((left, right) => {
    let comparison = 0;
    switch (sortKey) {
      case "name":
        comparison = left.name.localeCompare(right.name);
        break;
      case "assignedCases":
        comparison = left.assignedCases - right.assignedCases;
        break;
      case "currentWorkload":
        comparison = left.currentWorkload - right.currentWorkload;
        break;
      case "citizenConfirmed":
        comparison = left.citizenConfirmed - right.citizenConfirmed;
        break;
      case "officerVerified":
        comparison = left.officerVerified - right.officerVerified;
        break;
      case "citizenDisputes":
        comparison = left.citizenDisputes - right.citizenDisputes;
        break;
      case "reopenedCases":
        comparison = left.reopenedCases - right.reopenedCases;
        break;
      case "confirmationRate": {
        const leftRate = left.confirmationRate.percentage ?? -1;
        const rightRate = right.confirmationRate.percentage ?? -1;
        comparison = leftRate - rightRate;
        break;
      }
      case "medianResolutionMs": {
        const leftMs = left.medianResolutionMs ?? Number.MAX_SAFE_INTEGER;
        const rightMs = right.medianResolutionMs ?? Number.MAX_SAFE_INTEGER;
        comparison = leftMs - rightMs;
        break;
      }
    }
    return direction === "asc" ? comparison : -comparison;
  });
};
