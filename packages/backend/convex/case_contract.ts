import { v } from "convex/values";

export const channelValidator = v.union(v.literal("telegram"), v.literal("whatsapp"), v.literal("app"));

type ExactLocationInput = {
  latitude: number;
  longitude: number;
  place?: { name: string; formattedAddress: string };
};

export const assertExactLocation = (location: ExactLocationInput): void => {
  if (!Number.isFinite(location.latitude) || location.latitude < -90 || location.latitude > 90) {
    throw new Error("The confirmed latitude is invalid.");
  }
  if (!Number.isFinite(location.longitude) || location.longitude < -180 || location.longitude > 180) {
    throw new Error("The confirmed longitude is invalid.");
  }
  if (location.place) {
    const name = location.place.name.trim();
    const address = location.place.formattedAddress.trim();
    if (!name || name.length > 160) throw new Error("The confirmed place name is invalid.");
    if (!address || address.length > 320) throw new Error("The confirmed address is invalid.");
  }
};

export const issueCategoryValidator = v.union(
  v.literal("roads"),
  v.literal("sanitation"),
  v.literal("water"),
  v.literal("lighting"),
  v.literal("drainage"),
  v.literal("other"),
);
export const priorityValidator = v.union(
  v.literal("critical"),
  v.literal("high"),
  v.literal("medium"),
  v.literal("low"),
);
export const caseStatusValidator = v.union(
  v.literal("new"),
  v.literal("assigned"),
  v.literal("under_inspection"),
  v.literal("work_in_progress"),
  v.literal("awaiting_confirmation"),
  v.literal("resolved"),
  v.literal("disputed"),
);

export const resolutionRecommendationValidator = v.union(
  v.literal("supports_resolution"),
  v.literal("requires_review"),
  v.literal("insufficient_evidence"),
  v.literal("resolution_disputed"),
);

export const aiEvidenceAssessmentValidator = v.object({
  recommendation: resolutionRecommendationValidator,
  reasons: v.array(v.string()),
  evidenceReferences: v.array(v.string()),
  uncertainty: v.number(),
  assessedAt: v.number(),
  provider: v.string(),
  manualReviewRequired: v.boolean(),
});


export const caseAuditEventValidator = v.union(
  v.object({
    kind: v.literal("case_assigned"),
    assignedOfficerId: v.id("identities"),
    assignedOfficerName: v.optional(v.string()),
  }),
  v.object({ kind: v.literal("priority_changed"), from: priorityValidator, to: priorityValidator }),
  v.object({ kind: v.literal("status_changed"), from: caseStatusValidator, to: caseStatusValidator }),
  v.object({
    kind: v.literal("case_resolved"),
    from: v.literal("work_in_progress"),
    to: v.literal("resolved"),
    resolutionNote: v.string(),
  }),
  v.object({
    kind: v.literal("resolution_submitted"),
    from: caseStatusValidator,
    to: v.literal("awaiting_confirmation"),
    resolutionNote: v.string(),
    evidenceCount: v.number(),
    aiRecommendation: v.optional(resolutionRecommendationValidator),
  }),
  v.object({
    kind: v.literal("citizen_confirmed"),
    from: v.literal("awaiting_confirmation"),
    to: v.literal("resolved"),
    comment: v.optional(v.string()),
  }),
  v.object({
    kind: v.literal("citizen_disputed"),
    from: v.literal("awaiting_confirmation"),
    to: v.literal("disputed"),
    comment: v.optional(v.string()),
    evidenceCount: v.optional(v.number()),
  }),
  v.object({
    kind: v.literal("case_reopened"),
    from: v.literal("disputed"),
    to: caseStatusValidator,
    reason: v.string(),
  }),
  v.object({
    kind: v.literal("resolution_verified_by_officer"),
    from: caseStatusValidator,
    to: v.literal("resolved"),
    reason: v.string(),
  }),
);
export const locationSourceValidator = v.union(v.literal("current_gps"), v.literal("selected_pin"));
export const exactLocationValidator = v.object({
  source: locationSourceValidator,
  latitude: v.number(),
  longitude: v.number(),
  place: v.optional(v.object({
    name: v.string(),
    formattedAddress: v.string(),
  })),
});

export const acceptedEvidenceValidator = v.object({
  attachmentId: v.string(),
  storageKey: v.string(),
  storageId: v.optional(v.id("_storage")),
  mediaType: v.string(),
  sourceMessageId: v.string(),
});

export const citizenConfirmationResponseValidator = v.object({
  verdict: v.union(v.literal("confirmed"), v.literal("disputed")),
  respondedAt: v.number(),
  comment: v.optional(v.string()),
  evidence: v.optional(v.array(acceptedEvidenceValidator)),
});

export const sourceCitationValidator = v.union(
  v.object({
    kind: v.literal("transcript_message"),
    sourceMessageId: v.string(),
    explanation: v.string(),
  }),
  v.object({
    kind: v.literal("accepted_evidence"),
    attachmentId: v.string(),
    explanation: v.string(),
  }),
);

export const caseBriefValidator = v.object({
  summary: v.string(),
  category: issueCategoryValidator,
  priority: v.object({
    priority: priorityValidator,
    reasons: v.array(v.string()),
  }),
  citations: v.array(sourceCitationValidator),
});

export const transcriptInputRequestValidator = v.object({
  requestId: v.string(),
  prompt: v.string(),
  options: v.array(v.object({ id: v.string(), label: v.string() })),
  allowFreeform: v.boolean(),
});

const transcriptAttachmentPayloadValidator = v.object({
  id: v.string(),
  kind: v.union(v.literal("image"), v.literal("audio"), v.literal("video")),
  mediaType: v.string(),
  platformUrl: v.string(),
  quality: v.optional(v.union(
    v.literal("satisfactory"),
    v.literal("insufficient"),
    v.literal("unrelated"),
    v.literal("unusable"),
    v.literal("uncertain"),
    v.literal("undecodable"),
  )),
  decodable: v.optional(v.boolean()),
  inspected: v.optional(v.boolean()),
  platformReference: v.optional(v.string()),
  storageKey: v.optional(v.string()),
  decodeStatus: v.optional(v.union(v.literal("decoded"), v.literal("undecodable"))),
  observation: v.optional(v.string()),
});

const voicePayloadValidator = v.object({
  attachmentId: v.string(),
  mediaType: v.string(),
  platformReference: v.string(),
  storageKey: v.string(),
  status: v.union(
    v.literal("pending"),
    v.literal("transcribed"),
    v.literal("unintelligible"),
    v.literal("language_unknown"),
    v.literal("failed"),
  ),
  languageCode: v.optional(v.string()),
});

export const citizenTranscriptPayloadValidator = v.object({
  id: v.string(),
  providerEventId: v.optional(v.string()),
  channel: channelValidator,
  conversationId: v.string(),
  senderId: v.string(),
  text: v.optional(v.string()),
  voiceTranscript: v.optional(v.string()),
  voice: v.optional(voicePayloadValidator),
  action: v.optional(v.union(v.literal("confirm"), v.literal("edit"), v.literal("help"), v.literal("cancel"))),
  attachments: v.optional(v.array(transcriptAttachmentPayloadValidator)),
  location: v.optional(exactLocationValidator),
  receivedAt: v.string(),
});

export const effiTranscriptPayloadValidator = v.object({
  role: v.literal("assistant"),
  text: v.string(),
  source: v.union(v.literal("assistant_message"), v.literal("input_request")),
  inputRequest: v.optional(transcriptInputRequestValidator),
});

export const anonymousTranscriptPayloadValidator = v.union(
  citizenTranscriptPayloadValidator,
  effiTranscriptPayloadValidator,
);

export const normalizedTranscriptAttachmentValidator = v.object({
  attachmentId: v.string(),
  storageKey: v.string(),
  storageId: v.optional(v.id("_storage")),
  mediaType: v.string(),
  accepted: v.boolean(),
});

export const caseTranscriptContentValidator = v.union(
  v.object({
    kind: v.literal("citizen_message"),
    text: v.optional(v.string()),
    voiceTranscript: v.optional(v.string()),
    action: v.optional(v.union(v.literal("confirm"), v.literal("edit"), v.literal("help"), v.literal("cancel"))),
    location: v.optional(exactLocationValidator),
    attachments: v.array(normalizedTranscriptAttachmentValidator),
  }),
  v.object({
    kind: v.literal("effi_message"),
    text: v.string(),
  }),
  v.object({
    kind: v.literal("input_request"),
    text: v.string(),
    requestId: v.string(),
    prompt: v.string(),
    options: v.array(v.object({ id: v.string(), label: v.string() })),
    allowFreeform: v.boolean(),
  }),
);
