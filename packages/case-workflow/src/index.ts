import type { CaseStatus } from "@effi/domain";

const nextStatusByStatus: Readonly<Record<CaseStatus, CaseStatus | null>> = {
  new: "assigned",
  assigned: "under_inspection",
  under_inspection: "work_in_progress",
  work_in_progress: "awaiting_confirmation",
  awaiting_confirmation: "resolved",
  disputed: "work_in_progress",
  resolved: null,
};

const allowedTransitions: Readonly<Record<CaseStatus, readonly CaseStatus[]>> = {
  new: ["assigned"],
  assigned: ["under_inspection"],
  under_inspection: ["work_in_progress"],
  work_in_progress: ["awaiting_confirmation", "resolved"],
  awaiting_confirmation: ["resolved", "disputed"],
  disputed: ["work_in_progress", "under_inspection", "resolved"],
  resolved: [],
};

export const nextCaseStatus = (status: CaseStatus): CaseStatus | null => nextStatusByStatus[status];

export const isAllowedCaseTransition = (from: CaseStatus, to: CaseStatus): boolean =>
  allowedTransitions[from]?.includes(to) ?? false;

export type CaseAuditEvent = { type: "case.status_changed"; from: CaseStatus; to: CaseStatus; occurredAt: string };

export const transitionCase = (from: CaseStatus, to: CaseStatus, occurredAt: string): CaseAuditEvent => {
  if (!isAllowedCaseTransition(from, to)) throw new Error(`Invalid case status transition: ${from} -> ${to}`);
  return { type: "case.status_changed", from, to, occurredAt };
};
