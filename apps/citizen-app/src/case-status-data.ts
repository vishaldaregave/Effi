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

export type CaseStatus = (typeof caseStatuses)[number];
export type CasePriority = (typeof casePriorities)[number];
export type CaseCategory = (typeof caseCategories)[number];

export const caseStatusLabels: Record<CaseStatus, string> = {
  new: "New",
  assigned: "Assigned",
  under_inspection: "Under inspection",
  work_in_progress: "In progress",
  awaiting_confirmation: "Awaiting confirmation",
  resolved: "Resolved",
  disputed: "Disputed",
};

export const caseStatusDescriptions: Record<CaseStatus, string> = {
  new: "Your report has been received.",
  assigned: "An officer is responsible for this report.",
  under_inspection: "The reported issue is being inspected.",
  work_in_progress: "Work is underway.",
  awaiting_confirmation: "An officer submitted completion evidence. Please confirm whether the issue is resolved.",
  resolved: "The reported issue has been verified and resolved.",
  disputed: "You reported that the issue remains unresolved. It is queued for review.",
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
