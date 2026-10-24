"use client";

import { useConvexAuth, useQuery_experimental } from "convex/react";
import { makeFunctionReference } from "convex/server";
import Link from "next/link";
import { useState, useEffect, type ReactNode } from "react";
import {
  Award,
  Building2,
  CheckCircle2,
  Compass,
  FileCheck2,
  FileText,
  IndianRupee,
  Lock,
  Printer,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Badge, Button, Skeleton, type BadgeTone } from "@effi/ui-web";
import {
  routeComplaintByCoordinates,
  generateMunicipalWorkCompletionReport,
  verifyCryptographicAuditSeal,
  type MunicipalWorkCompletionReport,
} from "@effi/domain";
import { CaseActions } from "./case-actions";
import { CaseAudit } from "./case-audit";
import { CaseChat } from "./case-chat/case-chat";
import { EvidenceViewer } from "./evidence-viewer";
import { OfficerShell } from "./officer-shell";
import { SourceConversation } from "./source-conversation";
import { WorkCompletionModal } from "./work-completion-modal";
import { WorkCompletionReportModal } from "./work-completion-report-modal";
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
  const routing = routeComplaintByCoordinates(
    { latitude: location.latitude, longitude: location.longitude },
    detail.case.category,
  );

  return (
    <aside className="overflow-hidden rounded-[10px] border border-line bg-surface max-[920px]:grid max-[920px]:grid-cols-2 max-[680px]:grid-cols-1 [&>section]:p-4 [&>section+section]:border-t [&>section+section]:border-line max-[920px]:[&>section+section]:border-l max-[920px]:[&>section+section]:border-t-0 max-[680px]:[&>section+section]:border-l-0 max-[680px]:[&>section+section]:border-t" aria-label="Confirmed case facts">
      <section>
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-graphite">Confirmed facts</p>
        <dl className="mt-3 [&>div]:flex [&>div]:justify-between [&>div]:gap-5 [&>div]:py-2.5 [&_dd]:text-right [&_dd]:font-display [&_dd]:font-semibold [&_dd]:text-ink [&_dt]:font-display [&_dt]:text-graphite">
          <div><dt>Category</dt><dd>{caseCategoryLabels[detail.case.category]}</dd></div>
          <div><dt>Source</dt><dd>{caseChannelLabels[detail.case.channel]}</dd></div>
          <div><dt>Reported</dt><dd>{formatAbsoluteTime(detail.case.reportedAt)}</dd></div>
          <div><dt>Submitted</dt><dd>{formatAbsoluteTime(detail.case.submittedAt)}</dd></div>
        </dl>
      </section>

      <section className="bg-fog/30">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-graphite">Mahanagarpalika Routing</p>
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
            routing.authority === "PCMC"
              ? "bg-blue-100 text-blue-800"
              : routing.authority === "PMC"
                ? "bg-purple-100 text-purple-800"
                : routing.authority === "GRAMPANCHAYAT"
                  ? "bg-amber-100 text-amber-800"
                  : "bg-emerald-100 text-emerald-800"
          }`}>
            {routing.authority} OFFICER
          </span>
        </div>
        <p className="mt-2 font-display text-[16px] font-semibold leading-tight text-ink">
          {routing.authorityFullName}
        </p>
        <p className="mt-0.5 text-xs text-graphite font-medium">
          {routing.inMahanagarpalikaHaad ? "Mahanagarpalika Haad (Municipal Limits)" : "Grampanchayat Haad / PMRDA"}
        </p>
        <dl className="mt-3 text-xs [&>div]:flex [&>div]:justify-between [&>div]:gap-3 [&>div]:py-1.5 [&_dt]:text-graphite [&_dd]:font-semibold [&_dd]:text-ink [&_dd]:text-right">
          <div><dt>Zone / Ward</dt><dd>{routing.zoneOrWard}</dd></div>
          <div><dt>Designated Officer</dt><dd className="max-w-[150px] truncate" title={routing.designatedOfficerTitle}>{routing.designatedOfficerTitle}</dd></div>
          <div><dt>Department</dt><dd className="max-w-[150px] truncate" title={routing.designatedDepartment}>{routing.designatedDepartment}</dd></div>
          <div><dt>SLA Target</dt><dd>{routing.slaTargetHours} hours</dd></div>
          <div><dt>Civic Helpline</dt><dd className="text-action font-mono">{routing.officeHelpline.split("/")[0]}</dd></div>
        </dl>
        {routing.isBorderlandBuffer && (
          <div className="mt-2.5 rounded border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-900 leading-tight">
            <strong>Border Buffer Zone (Within 350m):</strong> Joint inspection protocol (Section 67 MMCA) enforced between PCMC &amp; PMC.
          </div>
        )}
      </section>

      <section>
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-graphite">GPS Coordinates</p>
        <p className="mt-2.5 font-display text-[17px] font-semibold leading-tight tracking-[-0.025em] text-ink">
          {location.latitude.toFixed(5)}° N, {location.longitude.toFixed(5)}° E
        </p>
        <p className="mb-3.5 mt-1.5 text-[11px] text-graphite">{location.source === "current_gps" ? "Reported citizen GPS location" : "Selected pin on map"}</p>
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

function buildDefaultAuditReport(detail: CaseDetail, caseId: string): MunicipalWorkCompletionReport {
  return generateMunicipalWorkCompletionReport({
    reportNumber: detail.case.reportNumber,
    caseId,
    issueCategory: detail.case.category,
    summary: detail.case.summary,
    reportedAt: detail.case.reportedAt,
    resolvedAt: Date.now(),
    citizenChannel: detail.case.channel,
    coordinates: {
      latitude: detail.case.location.latitude,
      longitude: detail.case.location.longitude,
    },
    resolutionNote: detail.case.latestResolution?.resolutionNote ?? "Work completed as per municipal public works specifications.",
    officerName: detail.case.assignment?.officerName ?? "Pradeep Kulkarni",
    officerBadge: "OFF-PCMC-4402",
    officerRole: "Zonal Executive Engineer",
    financial: {
      budgetHeadCode: detail.case.category === "sanitation" ? "PCMC-SWM-REV-2026-118" : "PCMC-RDS-CAPEX-2026-401",
      budgetHeadName: detail.case.category === "sanitation" ? "Solid Waste & Bio-Sanitation Ops" : "Bituminous Road Surface Restoration",
      sanctionedAmountInr: 45000,
      expendedAmountInr: 41200,
      contractorName: "Mahanagar Civil Infrastructure Pvt Ltd",
      workOrderNumber: `WO/2026/MUNICIPAL/PW/${caseId.slice(-4).toUpperCase()}`,
      materialsAndEquipment: "Bitumen VG-30: 4.2 MT, JCB Loader: 3.5 hrs, Roller compactor: 2 hrs, 6 skilled labor crew",
      financialApprover: "Chief Accounts Officer & Zonal Dy. Municipal Commissioner",
      sanctionDate: new Date(Date.now() - 3 * 86400000).toISOString().split("T")[0]!,
      completionDate: new Date().toISOString().split("T")[0]!,
    },
  });
}

function FinancialAuditCard({
  detail,
  caseId,
  report,
  onOpenAuditModal,
  onOpenReportModal,
}: {
  detail: CaseDetail;
  caseId: string;
  report: MunicipalWorkCompletionReport | null;
  onOpenAuditModal: () => void;
  onOpenReportModal: () => void;
}) {
  const [copiedHash, setCopiedHash] = useState(false);

  const isResolvedOrInReview = detail.case.status === "resolved" || detail.case.status === "awaiting_confirmation" || detail.case.status === "work_in_progress";
  const activeReport = report ?? (isResolvedOrInReview ? buildDefaultAuditReport(detail, caseId) : null);

  if (!activeReport) {
    return (
      <section className="overflow-hidden rounded-[10px] border border-line bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-fog p-2 text-graphite">
              <IndianRupee className="size-4" />
            </div>
            <div>
              <h2 className="font-display text-base font-semibold text-ink">Municipal Financial Management &amp; Cryptographic Audit</h2>
              <p className="text-xs text-muted">Budget tracking and tamper-evident SHA-256 seal</p>
            </div>
          </div>
          <Button variant="dark" onClick={onOpenAuditModal} className="text-xs">
            Complete Work &amp; Audit Budget
          </Button>
        </div>
        <p className="mt-3 text-xs text-graphite leading-relaxed">
          When work on this complaint is completed, record the municipal budget code, sanctioned allocation, and contractor invoices. An immutable SHA-256 cryptographic signature will seal the audit report.
        </p>
      </section>
    );
  }

  const isVerified = verifyCryptographicAuditSeal(activeReport.cryptographicAuditSeal);
  const variance = activeReport.financialBudgetAudit.varianceInr;
  const isUnder = activeReport.financialBudgetAudit.isWithinBudget;

  const handleCopyHash = () => {
    navigator.clipboard.writeText(activeReport.cryptographicAuditSeal.payloadHash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  return (
    <section className="overflow-hidden rounded-[10px] border border-line bg-surface shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-fog/20 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-action/10 p-2 text-action">
            <ShieldCheck className="size-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-base font-semibold text-ink">
                Work Completion &amp; Financial Audit Report
              </h2>
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                isVerified ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
              }`}>
                <Lock className="size-3" />
                {isVerified ? "Cryptographic Signature Verified" : "Signature Invalid"}
              </span>
            </div>
            <p className="text-xs text-muted">
              Report Ref: <span className="font-mono text-ink">{activeReport.reportReference}</span> &bull; Signed via {activeReport.cryptographicAuditSeal.algorithm}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenAuditModal}
            className="rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-graphite hover:border-action hover:text-ink transition-colors shadow-sm"
          >
            Edit Budget &amp; Audit
          </button>
          <Button variant="primary" onClick={onOpenReportModal} className="inline-flex items-center gap-1.5 text-xs">
            <FileText className="size-3.5" />
            <span>View Official Report</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0 border-b border-line">
        <div className="p-4 sm:p-5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Sanctioned Budget</span>
          <p className="mt-1 font-display text-2xl font-bold text-ink tabular-nums">
            ₹{activeReport.financialBudgetAudit.sanctionedAmountInr.toLocaleString("en-IN")}
          </p>
          <p className="mt-0.5 text-xs text-graphite truncate" title={activeReport.financialBudgetAudit.budgetHeadName}>
            {activeReport.financialBudgetAudit.budgetHeadCode}
          </p>
        </div>

        <div className="p-4 sm:p-5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Expended Cost</span>
          <p className="mt-1 font-display text-2xl font-bold text-ink tabular-nums">
            ₹{activeReport.financialBudgetAudit.expendedAmountInr.toLocaleString("en-IN")}
          </p>
          <p className="mt-0.5 text-xs text-graphite truncate" title={activeReport.financialBudgetAudit.contractorName}>
            Contractor: {activeReport.financialBudgetAudit.contractorName}
          </p>
        </div>

        <div className="p-4 sm:p-5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Budget Variance</span>
          <div className="mt-1 flex items-center gap-1.5">
            {isUnder ? (
              <TrendingDown className="size-5 text-emerald-600" />
            ) : (
              <TrendingUp className="size-5 text-rose-600" />
            )}
            <p className={`font-display text-2xl font-bold tabular-nums ${isUnder ? "text-emerald-700" : "text-rose-700"}`}>
              {variance >= 0 ? "+₹" : "-₹"}{Math.abs(variance).toLocaleString("en-IN")}
            </p>
          </div>
          <p className={`mt-0.5 text-xs font-semibold ${isUnder ? "text-emerald-700" : "text-rose-700"}`}>
            {isUnder ? "Under Budget (Fiscal Savings)" : "Over Budget (Deficit)"}
          </p>
        </div>
      </div>

      <div className="p-4 sm:p-5 bg-fog/10">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Lock className="size-3.5 text-action" />
            <span className="text-xs font-bold uppercase tracking-wider text-graphite">Cryptographic Signature Seal</span>
          </div>
          <button
            type="button"
            onClick={handleCopyHash}
            className="text-xs font-medium text-action hover:underline"
          >
            {copiedHash ? "Copied Signature!" : "Copy SHA-256 Digest"}
          </button>
        </div>
        <div className="mt-2 overflow-x-auto rounded-lg bg-surface border border-line p-3">
          <p className="font-mono text-xs text-ink break-all select-all">
            {activeReport.cryptographicAuditSeal.signature}
          </p>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3 text-xs text-graphite">
          <div>
            Proper Zone: <strong className="text-ink">{activeReport.geospatialAudit.zoneOrWard}</strong> ({activeReport.geospatialAudit.coordinates.latitude.toFixed(5)}° N, {activeReport.geospatialAudit.coordinates.longitude.toFixed(5)}° E)
          </div>
          <div>
            Signed by: <strong className="text-ink">{activeReport.cryptographicAuditSeal.signingOfficerName}</strong> ({activeReport.cryptographicAuditSeal.signingOfficerBadge})
          </div>
        </div>
      </div>
    </section>
  );
}

export function CaseBrief({ caseId }: { caseId: string }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const result = useQuery_experimental({ query: getCase, args: isAuthenticated && !isLoading ? { caseId } : "skip" });

  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [auditReport, setAuditReport] = useState<MunicipalWorkCompletionReport | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(`effi_audit_report_${caseId}`);
      if (stored) {
        setAuditReport(JSON.parse(stored) as MunicipalWorkCompletionReport);
      }
    } catch {
      // LocalStorage access might fail in private browsing
    }
  }, [caseId]);

  const handleAuditComplete = (report: MunicipalWorkCompletionReport) => {
    setAuditReport(report);
    setIsAuditModalOpen(false);
    setIsReportModalOpen(true);
    try {
      localStorage.setItem(`effi_audit_report_${caseId}`, JSON.stringify(report));
    } catch {
      // Ignore
    }
  };

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
            <FinancialAuditCard
              detail={detail}
              caseId={caseId}
              report={auditReport}
              onOpenAuditModal={() => setIsAuditModalOpen(true)}
              onOpenReportModal={() => setIsReportModalOpen(true)}
            />
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

        <WorkCompletionModal
          isOpen={isAuditModalOpen}
          onClose={() => setIsAuditModalOpen(false)}
          caseData={{
            caseId,
            reportNumber: detail.case.reportNumber,
            summary: detail.case.summary,
            category: detail.case.category,
            coordinates: {
              latitude: detail.case.location.latitude,
              longitude: detail.case.location.longitude,
            },
            channel: detail.case.channel,
            reportedAt: detail.case.reportedAt,
            assignedOfficerName: detail.case.assignment?.officerName,
          }}
          onComplete={handleAuditComplete}
        />

        <WorkCompletionReportModal
          isOpen={isReportModalOpen}
          onClose={() => setIsReportModalOpen(false)}
          report={auditReport ?? buildDefaultAuditReport(detail, caseId)}
        />
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
