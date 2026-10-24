import {
  casePriorityLabels,
  caseStatusLabels,
  caseStatuses,
  type CasePriority,
  type CaseStatus,
} from "./case-status-data";

export type CitizenTimelineEntry = {
  id: string;
  actorName: string;
  occurredAt: number;
  event:
    | { kind: "registered" }
    | { kind: "assigned" }
    | { kind: "priority_changed"; from: CasePriority; to: CasePriority }
    | { kind: "status_changed"; from: CaseStatus; to: CaseStatus }
    | { kind: "resolved"; from: "work_in_progress"; to: "resolved"; resolutionNote: string }
    | {
        kind: "resolution_submitted";
        resolutionNote: string;
        evidenceCount: number;
        aiRecommendation?: string;
      }
    | { kind: "citizen_confirmed"; comment?: string }
    | { kind: "citizen_disputed"; comment?: string }
    | { kind: "case_reopened"; reason: string }
    | { kind: "resolution_verified_by_officer"; reason: string };
};

export type CitizenEvidence = {
  attachmentId: string;
  mediaType: string;
  url: string | null;
};

export function statusStepState(step: CaseStatus, current: CaseStatus): "complete" | "current" | "upcoming" {
  const stepIndex = caseStatuses.indexOf(step);
  const currentIndex = caseStatuses.indexOf(current);
  if (stepIndex < currentIndex) return "complete";
  if (stepIndex === currentIndex) return "current";
  return "upcoming";
}

export function caseMedia(evidence: readonly CitizenEvidence[]): CitizenEvidence[] {
  return evidence.filter((entry) => {
    const mediaType = entry.mediaType.toLowerCase();
    return mediaType.startsWith("image/") || mediaType.startsWith("video/");
  });
}

export function timelineEntryTitle(entry: CitizenTimelineEntry): string {
  switch (entry.event.kind) {
    case "registered":
      return "Case registered";
    case "assigned":
      return "Issue assigned";
    case "priority_changed":
      return `Priority changed from ${casePriorityLabels[entry.event.from]} to ${casePriorityLabels[entry.event.to]}`;
    case "status_changed":
      return `Moved to ${caseStatusLabels[entry.event.to]}`;
    case "resolved":
      return "Issue resolved";
    case "resolution_submitted":
      return "Repair evidence submitted";
    case "citizen_confirmed":
      return "Resolution confirmed by you";
    case "citizen_disputed":
      return "Resolution disputed by you";
    case "case_reopened":
      return "Case reopened for rework";
    case "resolution_verified_by_officer":
      return "Resolution verified by officer";
    default: {
      const unhandled: never = entry.event;
      return unhandled;
    }
  }
}
