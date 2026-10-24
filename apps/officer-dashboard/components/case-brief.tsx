"use client";

import { useConvexAuth, useQuery_experimental } from "convex/react";
import { makeFunctionReference } from "convex/server";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, Skeleton, type BadgeTone } from "@effi/ui-web";
import { CaseActions } from "./case-actions";
import { CaseAudit } from "./case-audit";
import { CaseChat } from "./case-chat/case-chat";
import { EvidenceViewer } from "./evidence-viewer";
import { OfficerShell } from "./officer-shell";
import { SourceConversation } from "./source-conversation";
import type { CaseDetail } from "./case-detail-types";
import {
  caseCategoryLabels,
  caseChannelLabels,
  casePriorityLabels,
  caseStatusLabels,
  formatAbsoluteTime,
  type CasePriority,
  type CaseStatus,
} from "./case-inbox-state";

const getCase = makeFunctionReference<"query", { caseId: string }, CaseDetail>("cases:getCase");
const priorityTones: Record<CasePriority, BadgeTone> = {
  critical: "ink",
  high: "lavender",
  medium: "fog",
  low: "outline",
};
const statusTones: Record<CaseStatus, BadgeTone> = {
  new: "violet",
  assigned: "lavender",
  under_inspection: "orchid",
  work_in_progress: "fog",
  awaiting_confirmation: "orchid",
  resolved: "mint",
  disputed: "ink",
};

function DetailSkeleton() {
  return (
    <div className="grid min-h-[420px] content-center justify-items-start rounded-[10px] border border-line bg-surface px-6 py-9 sm:min-h-[520px] sm:p-14" role="status" aria-live="polite">
      <span className="sr-only">Loading case</span>
      <Skeleton className="h-16 w-[min(520px,72vw)]" />
      <Skeleton className="mt-12 h-[360px] w-[min(760px,76vw)] rounded-lg" />
    </div>
  );
}

function DetailError({ message }: { message: string }) {
  const unknownCase = message.toLowerCase().includes("unknown case");
  return (
    <div className="grid min-h-[420px] content-center justify-items-start rounded-[10px] border border-line bg-surface px-6 py-9 sm:min-h-[520px] sm:p-14">
      <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-graphite">Case unavailable</p>
      <h1 className="max-w-[13ch] font-display text-[clamp(2.375rem,5vw,3.625rem)] font-medium leading-none tracking-tight">{unknownCase ? "This case does not exist." : "We could not load this case."}</h1>
      <p className="mt-[18px] max-w-[52ch] text-muted">{unknownCase ? "The case may have been removed or the link is incorrect." : message}</p>
      <Link className="mt-7 text-[13px] font-semibold text-ink underline-offset-4 hover:underline" href="/">Return to case inbox</Link>
    </div>
  );
}

function CitationList({ detail }: { detail: CaseDetail }) {
  return (
    <ol className="mt-4 grid list-decimal gap-2.5 pl-[18px] font-display text-[13px] text-ink marker:text-action [&_a]:underline-offset-3 [&_a:hover]:underline">
      {detail.case.citations.map((citation, index) => {
        const href = citation.kind === "transcript_message"
          ? `#message-${citation.sourceMessageId}`
          : `#evidence-${citation.attachmentId}`;
        return (
          <li key={`${citation.kind}-${index}`}>
            <a href={href}>{citation.explanation}</a>
          </li>
        );
      })}
    </ol>
  );
}

function CaseFacts({ detail }: { detail: CaseDetail }) {
  const location = detail.case.location;
  const mapQuery = encodeURIComponent(`${location.latitude},${location.longitude}`);
  const mapEmbedUrl = `https://www.google.com/maps?q=${mapQuery}&z=16&output=embed`;
  return (
    <aside className="overflow-hidden rounded-[10px] border border-line bg-surface max-[920px]:grid max-[920px]:grid-cols-3 max-[680px]:grid-cols-1 [&>section]:p-4 [&>section+section]:border-t [&>section+section]:border-line max-[920px]:[&>section+section]:border-l max-[920px]:[&>section+section]:border-t-0 max-[680px]:[&>section+section]:border-l-0 max-[680px]:[&>section+section]:border-t" aria-label="Confirmed case facts">
      <section>
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-graphite">Confirmed facts</p>
        <dl className="mt-3 [&>div]:flex [&>div]:justify-between [&>div]:gap-5 [&>div]:py-2.5 [&_dd]:text-right [&_dd]:font-display [&_dd]:font-semibold [&_dd]:text-ink [&_dt]:font-display [&_dt]:text-graphite">
          <div><dt>Category</dt><dd>{caseCategoryLabels[detail.case.category]}</dd></div>
          <div><dt>Source</dt><dd>{caseChannelLabels[detail.case.channel]}</dd></div>
          <div><dt>Reported</dt><dd>{formatAbsoluteTime(detail.case.reportedAt)}</dd></div>
          <div><dt>Submitted</dt><dd>{formatAbsoluteTime(detail.case.submittedAt)}</dd></div>
        </dl>
      </section>
      <section>
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-graphite">Location</p>
        <p className="mt-2.5 font-display text-[21px] font-semibold leading-tight tracking-[-0.025em] text-ink">{location.source === "current_gps" ? "Reported GPS location" : "Selected map location"}</p>
        <p className="mb-3.5 mt-1.5 text-[11px] text-graphite">Pin captured with the citizen report</p>
        <div className="aspect-[16/10] overflow-hidden rounded-md border border-line bg-fog [&_iframe]:block [&_iframe]:size-full [&_iframe]:border-0">
          <iframe
            src={mapEmbedUrl}
            title="Reported location on Google Maps"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </section>
      <section>
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-graphite">Priority recommendation</p>
        <div className="mt-3.5 flex items-center justify-between gap-3 text-[11px] text-muted">
          <Badge tone={priorityTones[detail.case.recommendedPriority]}>{casePriorityLabels[detail.case.recommendedPriority]}</Badge>
          {detail.case.currentPriority !== detail.case.recommendedPriority ? <span>Current: {casePriorityLabels[detail.case.currentPriority]}</span> : null}
        </div>
        <ul className="mt-4 grid list-disc gap-2 pl-[18px] font-display text-[13px] text-ink marker:text-[#f2a63b]">
          {detail.case.priorityReasons.map((reason) => <li key={reason}>{reason}</li>)}
        </ul>
        <p className="mb-1 mt-6 text-[10px] font-bold uppercase tracking-[0.08em] text-graphite">Sources</p>
        <CitationList detail={detail} />
      </section>
    </aside>
  );
}

export function CaseBrief({ caseId }: { caseId: string }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const result = useQuery_experimental({ query: getCase, args: isAuthenticated && !isLoading ? { caseId } : "skip" });

  let body: ReactNode;
  if (!isLoading && !isAuthenticated) body = <DetailError message="Your officer session could not be verified." />;
  else if (result.status === "error") body = <DetailError message={result.error.message} />;
  else if (result.status !== "success") body = <DetailSkeleton />;
  else {
    const detail = result.data;
    body = (
      <>
        <header className="col-start-1 row-start-2 grid gap-4 py-5 sm:py-6 min-[1440px]:grid-cols-[minmax(0,1fr)_minmax(300px,0.82fr)] min-[1440px]:items-stretch">
          <div className="flex min-w-0 items-end py-1 min-[1440px]:py-3">
            <div className="min-w-0">
              <h1 className="max-w-[20ch] text-balance font-display text-[clamp(2.25rem,4vw,3.5rem)] font-medium leading-[1.02] tracking-[-0.04em] text-ink">{detail.case.summary}</h1>
            </div>
          </div>
          <div className="grid gap-3">
            <EvidenceViewer evidence={detail.case.acceptedEvidence} compact />
            {detail.case.latestResolution?.evidence && detail.case.latestResolution.evidence.length > 0 ? (
              <EvidenceViewer
                evidence={detail.case.latestResolution.evidence}
                title="Repair completion photos"
                subtitle="Officer resolution evidence"
                compact
              />
            ) : null}
          </div>
        </header>
        <div className="contents">
          <div className="col-start-1 row-start-3 grid gap-4 max-[920px]:row-start-4">
            <SourceConversation messages={detail.transcript} />
            <CaseAudit submittedAt={detail.case.submittedAt} entries={detail.audit} />
          </div>
          <div className="sticky top-20 col-start-2 row-span-2 row-start-2 grid gap-4 self-start max-[920px]:static max-[920px]:col-start-1 max-[920px]:row-start-3">
            <div className="justify-self-start">
              <Badge tone={statusTones[detail.case.status]}>{caseStatusLabels[detail.case.status]}</Badge>
            </div>
            <CaseActions key={`${detail.case.status}-${detail.case.currentPriority}-${detail.case.assignment?.officerName ?? "unassigned"}`} caseId={caseId} detail={detail.case} />
            <CaseFacts detail={detail} />
          </div>
        </div>
        <CaseChat caseId={caseId} />
      </>
    );
  }

  return (
    <OfficerShell activeNav="cases">
    <section className="grid w-full grid-cols-[minmax(0,1fr)_320px] gap-x-4 max-[920px]:grid-cols-1">
      <div className="col-span-full row-start-1 flex min-h-14 items-center border-b border-line sm:min-h-16">
        <Link className="font-display text-sm font-semibold text-ink before:mr-3 before:content-['←'] hover:underline hover:underline-offset-4" href="/">Case inbox</Link>
      </div>
      {body}
    </section>
    </OfficerShell>
  );
}
