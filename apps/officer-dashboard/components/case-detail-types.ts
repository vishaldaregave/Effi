import type { CaseCategory, CaseChannel, CasePriority, CaseStatus } from "./case-inbox-state";

export type CaseLocation = {
  source: "current_gps" | "selected_pin";
  latitude: number;
  longitude: number;
};

export type CaseCitation =
  | { kind: "transcript_message"; sourceMessageId: string; explanation: string }
  | { kind: "accepted_evidence"; attachmentId: string; explanation: string };

export type CaseEvidence = {
  attachmentId: string;
  storageKey: string;
  storageId?: string;
  url: string | null;
  mediaType: string;
  sourceMessageId: string;
};

export type TranscriptAttachment = {
  attachmentId: string;
  storageKey: string;
  storageId?: string;
  mediaType: string;
  accepted: boolean;
};

export type TranscriptContent =
  | {
      kind: "citizen_message";
      text?: string;
      voiceTranscript?: string;
      action?: "confirm" | "edit" | "help" | "cancel";
      location?: CaseLocation;
      attachments: TranscriptAttachment[];
    }
  | { kind: "effi_message"; text: string }
  | {
      kind: "input_request";
      text: string;
      requestId: string;
      prompt: string;
      options: { id: string; label: string }[];
      allowFreeform: boolean;
    };

export type CaseTranscriptMessage = {
  sourceMessageId: string;
  sequence: number;
  direction: "citizen" | "effi";
  occurredAt: number;
  content: TranscriptContent;
};

export type ResolutionRecommendation =
  | "supports_resolution"
  | "requires_review"
  | "insufficient_evidence"
  | "resolution_disputed";

export type AiEvidenceAssessment = {
  recommendation: ResolutionRecommendation;
  confidence: number;
  reasons: string[];
  provider: string;
  manualReviewRequired: boolean;
  assessedAt: number;
};

export type CitizenConfirmation = {
  verdict: "confirmed" | "disputed";
  respondedAt: number;
  comment?: string;
};

export type CaseResolution = {
  resolutionId: string;
  officerName: string;
  resolutionNote: string;
  submittedAt: number;
  evidence: CaseEvidence[];
  location?: CaseLocation;
  aiAssessment: AiEvidenceAssessment;
  citizenConfirmation?: CitizenConfirmation;
};

export type CaseAuditEvent =
  | { kind: "case_assigned"; assignedOfficerId: string; assignedOfficerName?: string }
  | { kind: "priority_changed"; from: CasePriority; to: CasePriority }
  | { kind: "status_changed"; from: CaseStatus; to: CaseStatus }
  | { kind: "case_resolved"; from: "work_in_progress"; to: "resolved"; resolutionNote: string }
  | {
      kind: "resolution_submitted";
      from: CaseStatus;
      to: "awaiting_confirmation" | "resolved";
      resolutionNote: string;
      evidenceCount: number;
      aiRecommendation?: ResolutionRecommendation;
    }
  | { kind: "citizen_confirmed"; from: "awaiting_confirmation"; to: "resolved"; comment?: string }
  | { kind: "citizen_disputed"; from: "awaiting_confirmation"; to: "disputed"; comment?: string }
  | { kind: "case_reopened"; from: "disputed"; to: CaseStatus; reason: string }
  | { kind: "resolution_verified_by_officer"; from: CaseStatus; to: "resolved"; reason: string };

export type CaseAuditEntry = {
  eventId: string;
  actorName: string;
  occurredAt: number;
  event: CaseAuditEvent;
};

export type CaseDetail = {
  case: {
    reportNumber: string;
    summary: string;
    category: CaseCategory;
    location: CaseLocation;
    reportedAt: number;
    submittedAt: number;
    recommendedPriority: CasePriority;
    currentPriority: CasePriority;
    priorityReasons: string[];
    citations: CaseCitation[];
    acceptedEvidence: CaseEvidence[];
    channel: CaseChannel;
    conversationId: string;
    status: CaseStatus;
    assignment: { officerName: string } | null;
    repostCount: number;
    canAct: boolean;
    latestResolution?: CaseResolution | null;
  };
  transcript: CaseTranscriptMessage[];
  audit: CaseAuditEntry[];
};
