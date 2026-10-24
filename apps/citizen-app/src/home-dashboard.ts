import type { CaseCategory, CaseStatus } from "@/case-status";

export type CitizenCaseSummary = {
  caseId: string;
  reportNumber: string;
  summary: string;
  category: CaseCategory;
  status: CaseStatus;
  submittedAt: number;
  location: {
    latitude: number;
    longitude: number;
    place?: { name: string; formattedAddress: string };
  };
};

export type HomeOverview = {
  submitted: number;
  assigned: number;
  inProgress: number;
  resolved: number;
};

export function countHomeOverview(cases: readonly CitizenCaseSummary[]): HomeOverview {
  const overview: HomeOverview = {
    submitted: cases.length,
    assigned: 0,
    inProgress: 0,
    resolved: 0,
  };

  for (const entry of cases) {
    switch (entry.status) {
      case "new":
        break;
      case "assigned":
        overview.assigned += 1;
        break;
      case "under_inspection":
      case "work_in_progress":
      case "awaiting_confirmation":
      case "disputed":
        overview.inProgress += 1;
        break;
      case "resolved":
        overview.resolved += 1;
        break;
      default: {
        const exhaustiveStatus: never = entry.status;
        return exhaustiveStatus;
      }
    }
  }

  return overview;
}

export function recentCitizenCases(cases: readonly CitizenCaseSummary[]): CitizenCaseSummary[] {
  return cases.slice(0, 3);
}

export function greetingForHour(hour: number): "Good morning" | "Good evening" {
  return hour < 12 ? "Good morning" : "Good evening";
}

export function citizenFirstName(user: { firstName: string | null; username: string | null } | null): string {
  return user?.firstName?.trim() || user?.username?.trim() || "Citizen";
}

export function formatHomeRelativeTime(timestamp: number, now: number): string {
  const minutes = Math.floor(Math.max(0, now - timestamp) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(timestamp);
}
