import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  acceptedEvidenceValidator,
  aiEvidenceAssessmentValidator,
  anonymousTranscriptPayloadValidator,
  caseAuditEventValidator,
  caseBriefValidator,
  caseStatusValidator,
  caseTranscriptContentValidator,
  channelValidator,
  citizenConfirmationResponseValidator,
  exactLocationValidator,
  issueCategoryValidator,
  priorityValidator,
  sourceCitationValidator,
} from "./case_contract";

export default defineSchema({
  identities: defineTable({
    externalId: v.string(),
    role: v.union(
      v.literal("citizen"),
      v.literal("officer"),
      v.literal("admin"),
    ),
    displayName: v.optional(v.string()),
  })
    .index("by_external_id", ["externalId"])
    .index("by_role", ["role"]),
  appReportMedia: defineTable({
    citizenId: v.id("identities"),
    storageId: v.id("_storage"),
    kind: v.union(v.literal("image"), v.literal("video")),
    mediaType: v.string(),
    fileName: v.string(),
    sizeBytes: v.number(),
    assessmentKeyHash: v.string(),
    assessment: v.optional(
      v.union(v.literal("satisfactory"), v.literal("insufficient")),
    ),
    assessedAt: v.optional(v.number()),
  }).index("by_citizen_id", ["citizenId"]),
  anonymousReportDrafts: defineTable({
    scopeKey: v.string(),
    channel: channelValidator,
    phase: v.union(
      v.literal("gathering"),
      v.literal("awaiting_confirmation"),
      v.literal("authentication_pending"),
      v.literal("registered"),
      v.literal("cancelled"),
    ),
    sessionId: v.string(),
    lastActivityAt: v.number(),
    nextMessageSequence: v.number(),
  })
    .index("by_scope_key_and_last_activity_at", ["scopeKey", "lastActivityAt"])
    .index("by_phase_and_last_activity_at", ["phase", "lastActivityAt"]),
  anonymousReportMessages: defineTable({
    draftId: v.id("anonymousReportDrafts"),
    providerMessageId: v.string(),
    receivedAt: v.number(),
    sequence: v.number(),
    direction: v.union(v.literal("citizen"), v.literal("effi")),
    payload: anonymousTranscriptPayloadValidator,
  })
    .index("by_draft_id_and_provider_message_id", [
      "draftId",
      "providerMessageId",
    ])
    .index("by_draft_id_and_sequence", ["draftId", "sequence"]),
  pendingSubmissions: defineTable({
    draftId: v.optional(v.id("anonymousReportDrafts")),
    claimTokenHash: v.string(),
    scopeKey: v.string(),
    channel: channelValidator,
    conversationId: v.string(),
    expiresAt: v.number(),
    claimedReportId: v.optional(v.id("reports")),
    issue: v.string(),
    category: issueCategoryValidator,
    location: exactLocationValidator,
    primaryEvidence: v.array(acceptedEvidenceValidator),
    reportedAt: v.number(),
    caseBrief: caseBriefValidator,
  })
    .index("by_claim_token_hash", ["claimTokenHash"])
    .index("by_scope_key", ["scopeKey"])
    .index("by_draft_id", ["draftId"]),
  reports: defineTable({
    pendingSubmissionId: v.optional(v.id("pendingSubmissions")),
    clientSubmissionId: v.optional(v.string()),
    citizenId: v.id("identities"),
    reportNumber: v.string(),
    channel: channelValidator,
    conversationId: v.string(),
    issue: v.string(),
    category: issueCategoryValidator,
    location: exactLocationValidator,
    primaryEvidence: v.array(acceptedEvidenceValidator),
    reportedAt: v.number(),
    submittedAt: v.number(),
  })
    .index("by_pending_submission_id", ["pendingSubmissionId"])
    .index("by_report_number", ["reportNumber"])
    .index("by_citizen_id", ["citizenId"])
    .index("by_citizen_id_and_client_submission_id", [
      "citizenId",
      "clientSubmissionId",
    ]),
  cases: defineTable({
    reportId: v.id("reports"),
    reportNumber: v.string(),
    summary: v.string(),
    category: issueCategoryValidator,
    location: exactLocationValidator,
    reportedAt: v.number(),
    submittedAt: v.number(),
    recommendedPriority: priorityValidator,
    currentPriority: priorityValidator,
    priorityReasons: v.array(v.string()),
    citations: v.array(sourceCitationValidator),
    acceptedEvidence: v.array(acceptedEvidenceValidator),
    channel: channelValidator,
    conversationId: v.string(),
    status: caseStatusValidator,
    assignedOfficerId: v.optional(v.id("identities")),
    assignedOfficerName: v.optional(v.string()),
    repostCount: v.optional(v.number()),
    latestResolutionId: v.optional(v.id("caseResolutions")),
  })
    .index("by_report_id", ["reportId"])
    .index("by_submitted_at", ["submittedAt"])
    .index("by_status_and_submitted_at", ["status", "submittedAt"])
    .index("by_current_priority_and_submitted_at", [
      "currentPriority",
      "submittedAt",
    ]),
  caseResolutions: defineTable({
    caseId: v.id("cases"),
    officerId: v.id("identities"),
    officerName: v.string(),
    resolutionNote: v.string(),
    evidence: v.array(acceptedEvidenceValidator),
    location: v.optional(exactLocationValidator),
    submittedAt: v.number(),
    aiAssessment: v.optional(aiEvidenceAssessmentValidator),
    citizenConfirmation: v.optional(citizenConfirmationResponseValidator),
  })
    .index("by_case_id", ["caseId"])
    .index("by_case_id_and_submitted_at", ["caseId", "submittedAt"]),
  caseReposts: defineTable({
    caseId: v.id("cases"),
    citizenId: v.id("identities"),
    latitude: v.number(),
    longitude: v.number(),
  }).index("by_case_id_and_citizen_id", ["caseId", "citizenId"]),
  caseAuditEvents: defineTable({
    caseId: v.id("cases"),
    actorIdentityId: v.id("identities"),
    actorName: v.string(),
    occurredAt: v.number(),
    event: caseAuditEventValidator,
  }).index("by_case_id_and_occurred_at", ["caseId", "occurredAt"]),
  caseTranscriptMessages: defineTable({
    caseId: v.id("cases"),
    sourceMessageId: v.string(),
    sequence: v.number(),
    direction: v.union(v.literal("citizen"), v.literal("effi")),
    occurredAt: v.number(),
    content: caseTranscriptContentValidator,
  }).index("by_case_id_and_sequence", ["caseId", "sequence"]),
  caseChats: defineTable({
    caseId: v.id("cases"),
    title: v.string(),
    createdAt: v.number(),
    lastMessageAt: v.number(),
  }).index("by_case_id_and_last_message_at", ["caseId", "lastMessageAt"]),
  caseChatMessages: defineTable({
    caseId: v.id("cases"),
    chatId: v.optional(v.id("caseChats")),
    officerIdentityId: v.id("identities"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    parts: v.array(v.record(v.string(), v.any())),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  }).index("by_chat_id_and_created_at", ["chatId", "createdAt"]),
  slaDocuments: defineTable({
    documentKey: v.string(),
    title: v.string(),
    version: v.string(),
    effectiveDate: v.string(),
    disclaimer: v.string(),
    sourceFileName: v.string(),
    storageId: v.id("_storage"),
    checksum: v.string(),
    pageCount: v.number(),
    active: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_document_key_and_active", ["documentKey", "active"])
    .index("by_document_key_and_version", ["documentKey", "version"]),
  slaChunks: defineTable({
    documentId: v.id("slaDocuments"),
    documentKey: v.string(),
    title: v.string(),
    version: v.string(),
    pageNumber: v.number(),
    category: v.union(
      v.literal("general"),
      v.literal("potholes"),
      v.literal("sanitation"),
      v.literal("streetlights"),
    ),
    heading: v.string(),
    text: v.string(),
    embedding: v.array(v.float64()),
    active: v.boolean(),
  })
    .index("by_document_id_and_page_number", ["documentId", "pageNumber"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 4096,
      filterFields: ["active", "category"],
    }),
  submissionAuditEvents: defineTable({
    pendingSubmissionId: v.id("pendingSubmissions"),
    reportId: v.id("reports"),
    kind: v.literal("claimed"),
    occurredAt: v.number(),
  }).index("by_pending_submission_id", ["pendingSubmissionId"]),
  channelAcknowledgements: defineTable({
    reportId: v.id("reports"),
    channel: channelValidator,
    conversationId: v.string(),
    state: v.union(
      v.literal("reserved"),
      v.literal("delivered"),
      v.literal("failed"),
    ),
    reservedAt: v.number(),
    deliveredAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
  }).index("by_report_id", ["reportId"]),
});
