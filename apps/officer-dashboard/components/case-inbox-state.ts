export const caseStatuses = [
  "new",
  "assigned",
  "under_inspection",
  "work_in_progress",
  "awaiting_confirmation",
  "resolved",
  "disputed",
] as const;
export const casePriorities = ["critical", "high", "medium", "low"] as const;
export const caseCategories = ["roads", "sanitation", "water", "lighting", "drainage", "other"] as const;
export const caseChannels = ["telegram", "whatsapp", "app"] as const;

export type CaseStatus = (typeof caseStatuses)[number];
export type CasePriority = (typeof casePriorities)[number];
export type CaseCategory = (typeof caseCategories)[number];
export type CaseChannel = (typeof caseChannels)[number];

export type CaseSummary = {
  caseId: string;
  summary: string;
  category: CaseCategory;
  status: CaseStatus;
  currentPriority: CasePriority;
  reportedAt: number;
  submittedAt: number;
  channel: CaseChannel;
  isAssignedToMe: boolean;
};

export const caseStatusLabels: Record<CaseStatus, string> = {
  new: "New",
  assigned: "Assigned",
  under_inspection: "Under inspection",
  work_in_progress: "In progress",
  awaiting_confirmation: "Awaiting confirmation",
  resolved: "Resolved",
  disputed: "Disputed",
};

export const casePriorityLabels: Record<CasePriority, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const caseCategoryLabels: Record<CaseCategory, string> = {
  roads: "Roads",
  sanitation: "Sanitation",
  water: "Water",
  lighting: "Lighting",
  drainage: "Drainage",
  other: "Other",
};

export const caseChannelLabels: Record<CaseChannel, string> = {
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  app: "Citizen app",
};

export type InboxSort = "newest" | "oldest";
export type InboxFilters = { statuses: CaseStatus[]; priorities: CasePriority[] };

export function filterCases(cases: readonly CaseSummary[], filters: InboxFilters): CaseSummary[] {
  return cases.filter(
    (entry) =>
      (filters.statuses.length === 0 || filters.statuses.includes(entry.status)) &&
      (filters.priorities.length === 0 || filters.priorities.includes(entry.currentPriority)),
  );
}

export function sortCases(cases: readonly CaseSummary[], sort: InboxSort): CaseSummary[] {
  return [...cases].sort((left, right) =>
    sort === "newest" ? right.submittedAt - left.submittedAt : left.submittedAt - right.submittedAt,
  );
}

export type WorkloadCounts = { open: number; fresh: number; urgent: number; resolved: number };

export function countWorkload(cases: readonly CaseSummary[]): WorkloadCounts {
  const counts: WorkloadCounts = { open: 0, fresh: 0, urgent: 0, resolved: 0 };
  for (const entry of cases) {
    if (entry.status === "resolved") counts.resolved += 1;
    else counts.open += 1;
    if (entry.status === "new") counts.fresh += 1;
    if (entry.currentPriority === "critical" || entry.currentPriority === "high") counts.urgent += 1;
  }
  return counts;
}

export function formatRelativeTime(timestamp: number, now: number): string {
  const minutes = Math.floor(Math.max(0, now - timestamp) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(timestamp);
}

export function formatAbsoluteTime(timestamp: number): string {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
}
