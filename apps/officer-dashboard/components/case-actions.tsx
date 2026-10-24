"use client";

import { useMutation, useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { Badge, type BadgeTone } from "@effi/ui-web";
import type {
  CaseDetail,
  CaseLocation,
  ResolutionRecommendation,
} from "./case-detail-types";
import {
  casePriorities,
  casePriorityLabels,
  caseStatusLabels,
  formatAbsoluteTime,
  type CasePriority,
} from "./case-inbox-state";

type OfficerOption = { officerId: string; name: string; isMe: boolean };

const assignCase = makeFunctionReference<
  "mutation",
  { caseId: string; officerId?: string },
  { status: "assigned"; officerName: string }
>("cases:assignCase");

const listOfficers = makeFunctionReference<
  "query",
  Record<string, never>,
  OfficerOption[]
>("cases:listOfficers");

const overridePriority = makeFunctionReference<
  "mutation",
  { caseId: string; priority: CasePriority },
  { priority: CasePriority }
>("cases:overridePriority");

const advanceCaseStatus = makeFunctionReference<
  "mutation",
  { caseId: string; action: { kind: "advance" } | { kind: "resolve"; resolutionNote: string } },
  { status: CaseDetail["case"]["status"] }
>("cases:advanceCaseStatus");

const generateResolutionMediaUploadUrl = makeFunctionReference<
  "mutation",
  Record<string, never>,
  string
>("cases:generateResolutionMediaUploadUrl");

const submitResolutionMutation = makeFunctionReference<
  "mutation",
  {
    caseId: string;
    resolutionNote: string;
    evidence: {
      attachmentId: string;
      storageId?: string;
      storageKey: string;
      mediaType: string;
      sourceMessageId: string;
    }[];
    location?: CaseLocation;
    directVerify?: boolean;
  },
  {
    status: CaseDetail["case"]["status"];
  }
>("cases:submitResolution");

const reopenCaseMutation = makeFunctionReference<
  "mutation",
  { caseId: string; reason: string; targetStatus?: "work_in_progress" | "under_inspection" },
  { status: CaseDetail["case"]["status"] }
>("cases:reopenCase");

const verifyResolutionMutation = makeFunctionReference<
  "mutation",
  { caseId: string; reason: string },
  { status: "resolved" }
>("cases:verifyResolution");

type PendingAction =
  | "assign"
  | "priority"
  | "status"
  | "resolve"
  | "reopen"
  | "verify"
  | "upload"
  | null;

const nextActionLabels = {
  assigned: "Start inspection",
  under_inspection: "Start work",
  work_in_progress: "Resolve case",
} as const;

const recommendationTones: Record<ResolutionRecommendation, BadgeTone> = {
  supports_resolution: "mint",
  requires_review: "orchid",
  insufficient_evidence: "lavender",
  resolution_disputed: "ink",
};

const recommendationLabels: Record<ResolutionRecommendation, string> = {
  supports_resolution: "Supports resolution",
  requires_review: "Requires review",
  insufficient_evidence: "Insufficient evidence",
  resolution_disputed: "Resolution disputed",
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "The case could not be updated.";

const parsePriority = (value: string): CasePriority => {
  switch (value) {
    case "critical":
    case "high":
    case "medium":
    case "low":
      return value;
    default:
      throw new Error("Unknown case priority.");
  }
};

export const shouldShowAssignmentNotice = (detail: CaseDetail["case"]): boolean =>
  detail.status !== "resolved" && Boolean(detail.assignment) && !detail.canAct;

export const nearbyRepostLabel = (count: number): string => {
  if (count === 0) return "No nearby reposts yet";
  return count === 1 ? "1 nearby repost" : `${count} nearby reposts`;
};

function ActionPrompt({
  repostCount,
  children,
}: {
  repostCount: number;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-2">
      {repostCount > 0 ? (
        <p className="text-[11px] font-semibold text-danger">
          {nearbyRepostLabel(repostCount)} within 3 km
        </p>
      ) : null}
      <div className="relative">
        {children}
        {repostCount > 0 ? (
          <span
            className="pointer-events-none absolute -right-1.5 -top-2 grid size-5 place-items-center rounded-full bg-danger text-[10px] font-bold tabular-nums text-white ring-2 ring-surface"
            aria-hidden="true"
          >
            {repostCount}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function CaseActions({
  caseId,
  detail,
}: {
  caseId: string;
  detail: CaseDetail["case"];
}) {
  const assign = useMutation(assignCase);
  const changePriority = useMutation(overridePriority);
  const advanceStatus = useMutation(advanceCaseStatus);
  const getUploadUrl = useMutation(generateResolutionMediaUploadUrl);
  const submitResolution = useMutation(submitResolutionMutation);
  const reopenCase = useMutation(reopenCaseMutation);
  const verifyResolution = useMutation(verifyResolutionMutation);
  const officers = useQuery(listOfficers, {});

  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [priority, setPriority] = useState<CasePriority>(detail.currentPriority);
  const [pending, setPending] = useState<PendingAction>(null);
  const [error, setError] = useState<string | null>(null);

  // Resolution form state
  const [showResolution, setShowResolution] = useState(false);
  const [resolutionNote, setResolutionNote] = useState("");
  const [stagedEvidence, setStagedEvidence] = useState<
    { attachmentId: string; storageId?: string; storageKey: string; mediaType: string; sourceMessageId: string; previewUrl: string }[]
  >([]);
  const [includeGps, setIncludeGps] = useState(true);
  const [directVerifyToggle, setDirectVerifyToggle] = useState(false);

  // Dispute / Reopen form state
  const [showReopenForm, setShowReopenForm] = useState(false);
  const [reopenReason, setReopenReason] = useState("");

  // Direct verify form state
  const [showVerifyForm, setShowVerifyForm] = useState(false);
  const [verifyReason, setVerifyReason] = useState("");

  const isPending = pending !== null;
  const assigneeOptions = officers ?? [];
  const selectedAssigneeId =
    assigneeId ??
    assigneeOptions.find((officer) => officer.isMe)?.officerId ??
    assigneeOptions[0]?.officerId ??
    null;

  const run = async (action: Exclude<PendingAction, null>, update: () => Promise<unknown>) => {
    setPending(action);
    setError(null);
    try {
      await update();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(null);
    }
  };

  const submitPriority = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await run("priority", async () => await changePriority({ caseId, priority }));
  };

  const submitAssignment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedAssigneeId) return;
    await run("assign", async () => await assign({ caseId, officerId: selectedAssigneeId }));
  };

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    if (stagedEvidence.length + files.length > 5) {
      setError("You can attach up to 5 completion photos.");
      return;
    }

    setPending("upload");
    setError(null);

    try {
      const uploadedItems: typeof stagedEvidence = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
          throw new Error("Only images and videos are supported as completion evidence.");
        }
        if (file.size > 20 * 1024 * 1024) {
          throw new Error("Each evidence file must be smaller than 20 MB.");
        }

        const uploadUrl = await getUploadUrl({});
        const uploadRes = await fetch(uploadUrl, {
          method: "POST",
          headers: { "content-type": file.type },
          body: file,
        });

        if (!uploadRes.ok) {
          throw new Error("Failed to upload completion evidence.");
        }

        const { storageId } = (await uploadRes.json()) as { storageId: string };
        uploadedItems.push({
          attachmentId: `after-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          storageId,
          storageKey: `evidence/resolution-${file.name}`,
          mediaType: file.type,
          sourceMessageId: "officer-resolution-upload",
          previewUrl: URL.createObjectURL(file),
        });
      }

      setStagedEvidence((prev) => [...prev, ...uploadedItems]);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(null);
    }
  };

  const handleRemoveStagedEvidence = (attachmentId: string) => {
    setStagedEvidence((prev) => prev.filter((item) => item.attachmentId !== attachmentId));
  };

  const handleResolutionSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await run("resolve", async () => {
      let location: CaseLocation | undefined;
      if (includeGps && typeof navigator !== "undefined" && navigator.geolocation) {
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 6000 });
          });
          location = {
            source: "current_gps",
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
        } catch {
          // Fall back gracefully if GPS permission is denied or timed out
        }
      }

      const evidencePayload = stagedEvidence.map(
        ({ attachmentId, storageId, storageKey, mediaType, sourceMessageId }) => ({
          attachmentId,
          ...(storageId ? { storageId } : {}),
          storageKey,
          mediaType,
          sourceMessageId,
        }),
      );

      await submitResolution({
        caseId,
        resolutionNote,
        evidence: evidencePayload,
        ...(location ? { location } : {}),
        directVerify: directVerifyToggle,
      });

      setShowResolution(false);
      setStagedEvidence([]);
      setResolutionNote("");
    });
  };

  const handleReopenSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await run("reopen", async () => {
      await reopenCase({
        caseId,
        reason: reopenReason,
      });
      setShowReopenForm(false);
      setReopenReason("");
    });
  };

  const handleVerifySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await run("verify", async () => {
      await verifyResolution({
        caseId,
        reason: verifyReason,
      });
      setShowVerifyForm(false);
      setVerifyReason("");
    });
  };

  const actionLabel =
    detail.status === "assigned" || detail.status === "under_inspection"
      ? nextActionLabels[detail.status]
      : null;

  return (
    <section
      className="grid gap-4 rounded-[10px] border border-line bg-surface p-4"
      aria-labelledby="case-actions-title"
    >
      <div>
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-graphite">
          Officer actions
        </p>
        <h2 className="text-xl font-semibold tracking-[-0.015em] text-ink" id="case-actions-title">
          Move this case forward
        </h2>
      </div>

      <dl className="grid gap-2.5 [&>div]:flex [&>div]:justify-between [&>div]:gap-5 [&>div]:border-b [&>div]:border-line [&>div]:pb-2.5 [&_dd]:text-right [&_dd]:text-xs [&_dd]:font-semibold [&_dd]:text-graphite [&_dt]:text-xs [&_dt]:text-muted">
        <div>
          <dt>Assignment</dt>
          <dd>{detail.assignment?.officerName ?? "Unassigned"}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{caseStatusLabels[detail.status]}</dd>
        </div>
      </dl>

      {!detail.assignment && detail.status === "new" ? (
        assigneeOptions.length > 0 ? (
          <form
            className="grid gap-2 [&>label]:text-[11px] [&>label]:font-semibold [&>label]:uppercase [&>label]:tracking-[0.04em] [&>label]:text-muted"
            onSubmit={(event) => void submitAssignment(event)}
          >
            <label htmlFor="case-assignee">Assign to</label>
            <div className="flex gap-2">
              <select
                className="min-h-10 min-w-0 flex-1 rounded-md border border-line bg-surface px-3 text-xs text-ink"
                id="case-assignee"
                value={selectedAssigneeId ?? ""}
                onChange={(event) => setAssigneeId(event.target.value)}
                disabled={isPending}
              >
                {assigneeOptions.map((officer) => (
                  <option key={officer.officerId} value={officer.officerId}>
                    {officer.name}
                    {officer.isMe ? " (you)" : ""}
                  </option>
                ))}
              </select>
              <button
                className="min-h-10 rounded-md border border-action bg-action px-3.5 text-xs font-semibold text-white transition-colors hover:bg-action-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                type="submit"
                disabled={isPending || !selectedAssigneeId}
              >
                {pending === "assign" ? "Assigning" : "Assign"}
              </button>
            </div>
          </form>
        ) : (
          <button
            className="min-h-10 rounded-md border border-action bg-action px-3.5 text-xs font-semibold text-white transition-colors hover:bg-action-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            disabled={isPending}
            onClick={() => void run("assign", async () => await assign({ caseId }))}
          >
            {pending === "assign" ? "Assigning" : "Assign to me"}
          </button>
        )
      ) : null}

      {shouldShowAssignmentNotice(detail) ? (
        <p className="text-xs leading-relaxed text-muted">
          Only the assigned officer or an administrator can update this case.
        </p>
      ) : null}

      {detail.canAct && detail.status !== "resolved" ? (
        <form
          className="grid gap-2 [&>label]:text-[11px] [&>label]:font-semibold [&>label]:uppercase [&>label]:tracking-[0.04em] [&>label]:text-muted"
          onSubmit={(event) => void submitPriority(event)}
        >
          <label htmlFor="case-priority">Priority</label>
          <div className="flex gap-2">
            <select
              className="min-h-10 min-w-0 flex-1 rounded-md border border-line bg-surface px-3 text-xs text-ink"
              id="case-priority"
              value={priority}
              onChange={(event) => setPriority(parsePriority(event.target.value))}
              disabled={isPending}
            >
              {casePriorities.map((value) => (
                <option key={value} value={value}>
                  {casePriorityLabels[value]}
                </option>
              ))}
            </select>
            <button
              className="min-h-10 rounded-md border border-line bg-surface px-3.5 text-xs font-semibold text-graphite transition-colors hover:border-action hover:text-ink active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              type="submit"
              disabled={isPending || priority === detail.currentPriority}
            >
              {pending === "priority" ? "Saving" : "Save priority"}
            </button>
          </div>
        </form>
      ) : null}

      {detail.canAct && actionLabel ? (
        <ActionPrompt repostCount={detail.repostCount}>
          <button
            className="min-h-10 w-full rounded-md border border-action bg-action px-3.5 text-xs font-semibold text-white transition-colors hover:bg-action-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            disabled={isPending}
            onClick={() =>
              void run("status", async () => await advanceStatus({ caseId, action: { kind: "advance" } }))
            }
          >
            {pending === "status" ? "Updating" : actionLabel}
          </button>
        </ActionPrompt>
      ) : null}

      {/* Work in progress: show button to start resolution */}
      {detail.canAct && detail.status === "work_in_progress" && !showResolution ? (
        <ActionPrompt repostCount={detail.repostCount}>
          <button
            className="min-h-10 w-full rounded-md border border-action bg-action px-3.5 text-xs font-semibold text-white transition-colors hover:bg-action-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            disabled={isPending}
            onClick={() => setShowResolution(true)}
          >
            Submit completion evidence
          </button>
        </ActionPrompt>
      ) : null}

      {/* Resolution submission form */}
      {detail.canAct && (detail.status === "work_in_progress" || detail.status === "disputed") && showResolution ? (
        <form
          className="grid gap-3 rounded-lg border border-line bg-fog/50 p-3.5"
          onSubmit={(event) => void handleResolutionSubmit(event)}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-[0.04em] text-ink">
              Submit resolution evidence
            </span>
            <button
              type="button"
              className="text-xs text-muted hover:text-ink"
              onClick={() => setShowResolution(false)}
            >
              Close
            </button>
          </div>

          <div className="grid gap-1.5">
            <label
              className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted"
              htmlFor="resolution-note"
            >
              Work completed note
            </label>
            <textarea
              className="min-h-24 resize-y rounded-md border border-line bg-surface px-3 py-2 text-xs leading-relaxed text-ink focus:border-action focus:ring-2 focus:ring-action/10"
              id="resolution-note"
              maxLength={500}
              required
              value={resolutionNote}
              onChange={(event) => setResolutionNote(event.target.value)}
              placeholder="Describe repairs performed, materials used, and final condition."
            />
          </div>

          <div className="grid gap-1.5">
            <label
              className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted"
              htmlFor="resolution-files"
            >
              After-repair photos (up to 5)
            </label>
            <input
              className="block w-full text-xs text-graphite file:mr-3 file:rounded-md file:border-0 file:bg-surface file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-ink hover:file:bg-line"
              id="resolution-files"
              type="file"
              accept="image/*,video/*"
              multiple
              disabled={isPending || stagedEvidence.length >= 5}
              onChange={(event) => void handleFileUpload(event)}
            />
            {stagedEvidence.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {stagedEvidence.map((item) => (
                  <div
                    key={item.attachmentId}
                    className="group relative size-16 overflow-hidden rounded-md border border-line bg-surface"
                  >
                    <img
                      src={item.previewUrl}
                      alt="Uploaded repair evidence"
                      className="size-full object-cover"
                    />
                    <button
                      type="button"
                      className="absolute right-0.5 top-0.5 rounded-full bg-ink/80 px-1 text-[10px] text-white opacity-0 group-hover:opacity-100"
                      onClick={() => handleRemoveStagedEvidence(item.attachmentId)}
                      aria-label="Remove image"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <label className="flex items-center gap-2 text-xs text-graphite">
            <input
              type="checkbox"
              checked={includeGps}
              onChange={(e) => setIncludeGps(e.target.checked)}
              className="rounded border-line text-action focus:ring-action"
            />
            Attach current GPS location for verification
          </label>

          <label className="flex items-center gap-2 text-xs text-graphite">
            <input
              type="checkbox"
              checked={directVerifyToggle}
              onChange={(e) => setDirectVerifyToggle(e.target.checked)}
              className="rounded border-line text-action focus:ring-action"
            />
            Directly verify (supervisory bypass if evidence is conclusive)
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button
              className="min-h-9 rounded-md border border-line bg-surface px-3 text-xs font-semibold text-graphite transition-colors hover:border-action hover:text-ink"
              type="button"
              disabled={isPending}
              onClick={() => setShowResolution(false)}
            >
              Cancel
            </button>
            <button
              className="min-h-9 rounded-md border border-action bg-action px-3.5 text-xs font-semibold text-white transition-colors hover:bg-action-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              type="submit"
              disabled={isPending || resolutionNote.trim().length === 0}
            >
              {pending === "resolve" ? "Submitting" : "Submit for assurance"}
            </button>
          </div>
        </form>
      ) : null}

      {/* Awaiting citizen confirmation state */}
      {detail.status === "awaiting_confirmation" ? (
        <div className="grid gap-3 rounded-lg border border-line bg-fog/40 p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-[0.04em] text-graphite">
              Awaiting citizen response
            </span>
            <Badge tone="orchid">Awaiting confirmation</Badge>
          </div>

          <p className="text-xs leading-relaxed text-ink">
            Completion evidence has been submitted. The citizen received a verification card on
            their app to confirm or dispute the fix.
          </p>

          {detail.latestResolution ? (
            <div className="rounded-md border border-line bg-surface p-2.5 text-xs">
              <p className="font-semibold text-graphite">Submitted resolution note</p>
              <p className="mt-1 text-ink">{detail.latestResolution.resolutionNote}</p>
              <div className="mt-2.5 flex items-center justify-between border-t border-line pt-2 text-[11px] text-muted">
                <span>By {detail.latestResolution.officerName}</span>
                <span>{formatAbsoluteTime(detail.latestResolution.submittedAt)}</span>
              </div>
            </div>
          ) : null}

          {detail.latestResolution?.aiAssessment ? (
            <div className="rounded-md border border-line bg-surface p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-[0.04em] text-graphite">
                  AI evidence assessment
                </span>
                <Badge
                  tone={
                    recommendationTones[detail.latestResolution.aiAssessment.recommendation] ?? "fog"
                  }
                >
                  {recommendationLabels[detail.latestResolution.aiAssessment.recommendation] ??
                    detail.latestResolution.aiAssessment.recommendation}
                </Badge>
              </div>

              <ul className="mt-2 grid list-disc gap-1 pl-4 text-xs text-ink marker:text-action">
                {detail.latestResolution.aiAssessment.reasons.map((reason, idx) => (
                  <li key={idx}>{reason}</li>
                ))}
              </ul>

              <div className="mt-2 flex items-center justify-between border-t border-line pt-2 text-[10px] text-muted">
                <span>Model provider: {detail.latestResolution.aiAssessment.provider}</span>
                <span>
                  Confidence: {Math.round(detail.latestResolution.aiAssessment.confidence * 100)}%
                </span>
              </div>
            </div>
          ) : null}

          {detail.canAct && !showVerifyForm ? (
            <button
              type="button"
              className="mt-1 min-h-9 rounded-md border border-line bg-surface px-3 text-xs font-semibold text-graphite hover:border-action hover:text-ink"
              onClick={() => setShowVerifyForm(true)}
            >
              Verify resolution directly
            </button>
          ) : null}

          {detail.canAct && showVerifyForm ? (
            <form className="mt-2 grid gap-2" onSubmit={(e) => void handleVerifySubmit(e)}>
              <label
                className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted"
                htmlFor="verify-reason"
              >
                Verification reason
              </label>
              <input
                id="verify-reason"
                type="text"
                className="min-h-9 rounded-md border border-line bg-surface px-3 text-xs text-ink focus:border-action"
                placeholder="Field inspection confirmed complete."
                required
                value={verifyReason}
                onChange={(e) => setVerifyReason(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded px-2.5 py-1 text-xs text-muted"
                  onClick={() => setShowVerifyForm(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending || !verifyReason.trim()}
                  className="rounded-md bg-action px-3 py-1.5 text-xs font-semibold text-white"
                >
                  {pending === "verify" ? "Verifying" : "Confirm verification"}
                </button>
              </div>
            </form>
          ) : null}
        </div>
      ) : null}

      {/* Disputed state */}
      {detail.status === "disputed" ? (
        <div className="grid gap-3 rounded-lg border border-danger/30 bg-danger/5 p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-[0.04em] text-danger">
              Citizen disputed resolution
            </span>
            <Badge tone="ink">Disputed</Badge>
          </div>

          <p className="text-xs text-ink">
            The reporting citizen reviewed the completion evidence and flagged that the problem
            remains unresolved.
          </p>

          {detail.latestResolution?.citizenConfirmation?.comment ? (
            <blockquote className="rounded-md border-l-2 border-danger bg-surface p-2.5 text-xs italic text-ink">
              &ldquo;{detail.latestResolution.citizenConfirmation.comment}&rdquo;
            </blockquote>
          ) : null}

          {detail.canAct && !showReopenForm && !showResolution ? (
            <div className="flex gap-2">
              <button
                type="button"
                className="min-h-9 flex-1 rounded-md border border-action bg-action px-3 text-xs font-semibold text-white hover:bg-action-hover"
                onClick={() => setShowReopenForm(true)}
              >
                Reopen case for rework
              </button>
              <button
                type="button"
                className="min-h-9 rounded-md border border-line bg-surface px-3 text-xs font-semibold text-graphite hover:border-action"
                onClick={() => setShowResolution(true)}
              >
                Submit new evidence
              </button>
            </div>
          ) : null}

          {detail.canAct && showReopenForm ? (
            <form className="mt-2 grid gap-2" onSubmit={(e) => void handleReopenSubmit(e)}>
              <label
                className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted"
                htmlFor="reopen-reason"
              >
                Reopening reason
              </label>
              <textarea
                id="reopen-reason"
                className="min-h-20 rounded-md border border-line bg-surface px-3 py-2 text-xs text-ink"
                placeholder="Explain the rework plan or crew redeployment."
                required
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded px-2.5 py-1 text-xs text-muted"
                  onClick={() => setShowReopenForm(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending || !reopenReason.trim()}
                  className="rounded-md bg-action px-3 py-1.5 text-xs font-semibold text-white"
                >
                  {pending === "reopen" ? "Reopening" : "Confirm reopen"}
                </button>
              </div>
            </form>
          ) : null}
        </div>
      ) : null}

      {/* Resolved state */}
      {detail.status === "resolved" ? (
        <div className="grid gap-2.5 rounded-lg border border-line bg-fog/20 p-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-[0.04em] text-graphite">
              Resolution verified
            </span>
            <Badge tone="mint">Resolved</Badge>
          </div>
          {detail.latestResolution?.citizenConfirmation?.verdict === "confirmed" ? (
            <p className="text-xs text-graphite">
              Verified with citizen confirmation.
              {detail.latestResolution.citizenConfirmation.comment ? (
                <span className="mt-1 block italic text-ink">
                  &ldquo;{detail.latestResolution.citizenConfirmation.comment}&rdquo;
                </span>
              ) : null}
            </p>
          ) : (
            <p className="text-xs text-muted">
              This case has been verified as resolved. Audit timeline below.
            </p>
          )}
        </div>
      ) : null}

      {error ? (
        <p className="text-xs leading-relaxed text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
