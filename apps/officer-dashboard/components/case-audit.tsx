import type { ReactNode } from "react";
import type { CaseAuditEntry } from "./case-detail-types";
import { casePriorityLabels, caseStatusLabels, formatAbsoluteTime } from "./case-inbox-state";

function AuditDescription({ entry }: { entry: CaseAuditEntry }): ReactNode {
  const event = entry.event;
  switch (event.kind) {
    case "case_assigned":
      return <p>Assigned the case to {event.assignedOfficerName ?? entry.actorName}</p>;
    case "priority_changed":
      return <p>Changed priority from {casePriorityLabels[event.from]} to {casePriorityLabels[event.to]}</p>;
    case "status_changed":
      return <p>Moved the case from {caseStatusLabels[event.from]} to {caseStatusLabels[event.to]}</p>;
    case "case_resolved":
      return (
        <>
          <p>Resolved the case</p>
          <blockquote>{event.resolutionNote}</blockquote>
        </>
      );
    case "resolution_submitted":
      return (
        <>
          <p>Submitted completion evidence ({event.evidenceCount} {event.evidenceCount === 1 ? "photo" : "photos"})</p>
          <blockquote>{event.resolutionNote}</blockquote>
          {event.aiRecommendation ? (
            <span className="mt-1 block text-[11px] font-semibold text-action">
              AI recommendation: {event.aiRecommendation.replace(/_/g, " ")}
            </span>
          ) : null}
        </>
      );
    case "citizen_confirmed":
      return (
        <>
          <p className="font-semibold text-action">Citizen confirmed resolution</p>
          {event.comment ? <blockquote>{event.comment}</blockquote> : null}
        </>
      );
    case "citizen_disputed":
      return (
        <>
          <p className="font-semibold text-danger">Citizen disputed resolution</p>
          {event.comment ? <blockquote>{event.comment}</blockquote> : null}
        </>
      );
    case "case_reopened":
      return (
        <>
          <p>Reopened case to {caseStatusLabels[event.to]}</p>
          <blockquote>{event.reason}</blockquote>
        </>
      );
    case "resolution_verified_by_officer":
      return (
        <>
          <p className="font-semibold text-action">Verified resolution directly</p>
          <blockquote>{event.reason}</blockquote>
        </>
      );
    default: {
      const unhandled: never = event;
      return unhandled;
    }
  }
}

export function CaseAudit({ submittedAt, entries }: { submittedAt: number; entries: readonly CaseAuditEntry[] }) {
  return (
    <section className="overflow-hidden rounded-[10px] border border-line bg-surface" aria-labelledby="audit-title">
      <div className="flex min-h-[72px] items-end justify-between gap-5 border-b border-line p-4 sm:px-5 sm:py-4">
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-graphite">Audit history</p>
          <h2 className="text-xl font-semibold tracking-[-0.015em] text-ink" id="audit-title">What changed</h2>
        </div>
        <span className="font-display text-xs text-graphite">{entries.length + 1} {entries.length === 0 ? "event" : "events"}</span>
      </div>
      <ol className="divide-y divide-line">
        <li className="grid grid-cols-[12px_minmax(0,1fr)] gap-3 px-4 py-4 sm:grid-cols-[14px_minmax(0,1fr)_auto] sm:px-5">
          <span className="mt-1.5 size-2 rounded-full border-2 border-surface bg-[#72b8e7]" aria-hidden="true" />
          <div className="[&_blockquote]:mt-2 [&_blockquote]:border-l-2 [&_blockquote]:border-line [&_blockquote]:pl-3 [&_blockquote]:text-xs [&_blockquote]:text-muted">
            <p className="font-display text-[13px] leading-relaxed text-ink">Case registered</p>
            <span className="mt-1 block font-display text-[11px] text-graphite">Effi</span>
          </div>
          <time className="col-start-2 text-left font-display text-[11px] leading-relaxed text-graphite sm:col-auto sm:text-right" dateTime={new Date(submittedAt).toISOString()}>{formatAbsoluteTime(submittedAt)}</time>
        </li>
        {entries.map((entry) => (
          <li className="grid grid-cols-[12px_minmax(0,1fr)] gap-3 px-4 py-4 sm:grid-cols-[14px_minmax(0,1fr)_auto] sm:px-5" key={entry.eventId}>
            <span className="mt-1.5 size-2 rounded-full border-2 border-surface bg-[#72b8e7]" aria-hidden="true" />
            <div className="font-display text-[13px] leading-relaxed text-ink [&_blockquote]:mt-2 [&_blockquote]:border-l-2 [&_blockquote]:border-line [&_blockquote]:pl-3 [&_blockquote]:text-xs [&_blockquote]:text-muted">
              <AuditDescription entry={entry} />
              <span className="mt-1 block text-[11px] text-graphite">{entry.actorName}</span>
            </div>
            <time className="col-start-2 text-left font-display text-[11px] leading-relaxed text-graphite sm:col-auto sm:text-right" dateTime={new Date(entry.occurredAt).toISOString()}>{formatAbsoluteTime(entry.occurredAt)}</time>
          </li>
        ))}
      </ol>
    </section>
  );
}
