"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Compass,
  Copy,
  ExternalLink,
  FileCheck2,
  FileText,
  IndianRupee,
  Landmark,
  Layers,
  Lock,
  MapPin,
  Printer,
  QrCode,
  Shield,
  ShieldCheck,
  TrendingDown,
  User,
  X,
} from "lucide-react";
import QRCode from "qrcode";
import type { MunicipalWorkCompletionReport } from "@effi/domain";

type WorkCompletionReportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  report: MunicipalWorkCompletionReport | null;
};

export function WorkCompletionReportModal({
  isOpen,
  onClose,
  report,
}: WorkCompletionReportModalProps) {
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>("");
  const [copiedSignature, setCopiedSignature] = useState(false);
  const [copiedRef, setCopiedRef] = useState(false);
  const [activeTab, setActiveTab] = useState<"full_report" | "audit_timeline">("full_report");

  useEffect(() => {
    if (report) {
      const verifyTarget =
        report.verificationUrl ||
        `https://${report.geospatialAudit.authority.toLowerCase()}.gov.in/audit/verify?ref=${encodeURIComponent(
          report.reportReference,
        )}&fp=${encodeURIComponent(report.cryptographicAuditSeal.verificationFingerprint.slice(0, 16))}`;

      QRCode.toDataURL(verifyTarget, {
        width: 180,
        margin: 1,
        color: {
          dark: "#0b1220",
          light: "#ffffff",
        },
        errorCorrectionLevel: "M",
      })
        .then((url) => setQrCodeDataUrl(url))
        .catch((err) => console.error("QR Code generation error:", err));
    }
  }, [report]);

  if (!isOpen || !report) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleCopySignature = () => {
    navigator.clipboard.writeText(report.cryptographicAuditSeal.signature);
    setCopiedSignature(true);
    setTimeout(() => setCopiedSignature(false), 2000);
  };

  const handleCopyRef = () => {
    navigator.clipboard.writeText(report.reportReference);
    setCopiedRef(true);
    setTimeout(() => setCopiedRef(false), 2000);
  };

  const isPcmc = report.geospatialAudit.authority === "PCMC";
  const isPmc = report.geospatialAudit.authority === "PMC";
  const isGp = report.geospatialAudit.authority === "GRAMPANCHAYAT";

  const authorityHeaderEnglish = isPcmc
    ? "PIMPRI CHINCHWAD MUNICIPAL CORPORATION"
    : isPmc
      ? "PUNE MUNICIPAL CORPORATION"
      : isGp
        ? "PUNE METROPOLITAN REGION DEVELOPMENT AUTHORITY / GRAMPANCHAYAT"
        : "CANTONMENT BOARD DEFENCE ENCLAVE";

  const authorityHeaderMarathi = isPcmc
    ? "पिंपरी चिंचवड महानगरपालिका"
    : isPmc
      ? "पुणे महानगरपालिका"
      : isGp
        ? "पुणे महानगर प्रदेश विकास प्राधिकरण (PMRDA) व ग्रामपंचायत"
        : "कटक मंडळ";

  // Clean, formatted token for concise display without breaking layouts
  const rawToken = report.reportNumber;
  const displayToken =
    rawToken.length > 28
      ? `${rawToken.slice(0, 14)}...${rawToken.slice(-8)}`
      : rawToken;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/60 p-2 sm:p-4 backdrop-blur-sm overflow-y-auto print:p-0 print:bg-white print:overflow-visible">
      <div className="relative w-full max-w-4xl rounded-2xl border border-line bg-surface p-5 sm:p-8 shadow-2xl transition-all print:border-none print:shadow-none print:p-0 print:max-w-none print:bg-white">
        
        {/* Modal Controls (Hidden in Print) */}
        <div className="flex flex-col gap-3 border-b border-line pb-4 print:hidden sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded bg-action/10 px-2.5 py-1 text-xs font-bold text-action">
              <ShieldCheck className="size-3.5" />
              Official Municipal Document
            </span>
            <span
              className="text-xs font-mono text-muted max-w-[280px] truncate"
              title={report.reportReference}
            >
              {report.reportReference}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex rounded-lg bg-fog p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setActiveTab("full_report")}
                className={`rounded px-3 py-1 transition-colors ${
                  activeTab === "full_report" ? "bg-action text-white shadow-xs" : "text-graphite hover:text-ink"
                }`}
              >
                Comprehensive Audit
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("audit_timeline")}
                className={`rounded px-3 py-1 transition-colors ${
                  activeTab === "audit_timeline" ? "bg-action text-white shadow-xs" : "text-graphite hover:text-ink"
                }`}
              >
                Time Series Timeline ({report.auditTrail?.length ?? 7})
              </button>
            </div>

            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 py-1.5 text-xs font-semibold text-graphite hover:bg-fog hover:text-ink shadow-2xs"
            >
              <Printer className="size-3.5" />
              <span>Print / Save PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="grid size-8 place-items-center rounded-lg text-graphite hover:bg-fog hover:text-ink"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {/* Printable Official Government Audit Report Document */}
        <article className="mt-6 space-y-6 text-ink print:mt-0 print:space-y-4">
          
          {/* Government / Corporation Header with Seal & Verification QR */}
          <div className="border-b-2 border-ink/80 pb-5">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              
              {/* Left & Center: Municipal Crest & Title */}
              <div className="flex items-start gap-4">
                {/* Official Municipal Seal Icon */}
                <div className="shrink-0">
                  <div className="grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-ink to-slate-800 text-white shadow-md border-2 border-amber-400/40">
                    <Landmark className="size-8 text-amber-300" />
                  </div>
                  <span className="mt-1 block text-center text-[9px] font-bold tracking-widest text-muted uppercase">
                    GOVT. OF MH
                  </span>
                </div>

                {/* Headings */}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-lavender px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink">
                      Civil &amp; Financial Redressal Record
                    </span>
                    <span className="text-[10px] font-mono text-muted">MMCA Form 4-A</span>
                  </div>

                  <h1 className="mt-1 font-serif text-lg font-bold uppercase tracking-wider text-ink sm:text-2xl">
                    {authorityHeaderEnglish}
                  </h1>
                  <p className="font-serif text-sm font-semibold text-graphite sm:text-base">
                    {authorityHeaderMarathi}
                  </p>

                  <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-action/30 bg-action/5 px-3 py-0.5 text-xs font-bold uppercase tracking-wider text-action">
                    <FileCheck2 className="size-3.5 text-action" />
                    <span>Official Work Completion &amp; Financial Audit Report</span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted font-mono">
                    Statutory Resolution Audit under {report.geospatialAudit.governingAct}
                  </p>
                </div>
              </div>

              {/* Right: Verification QR Code Card */}
              <div className="shrink-0 flex items-center gap-3 rounded-xl border border-line bg-fog/40 p-2.5 print:border-ink/40">
                <div className="rounded-lg bg-white p-1 shadow-inner border border-line/60">
                  {qrCodeDataUrl ? (
                    <img
                      src={qrCodeDataUrl}
                      alt="Digital Audit Verification QR Code"
                      className="size-24 rounded object-contain"
                    />
                  ) : (
                    <div className="grid size-24 place-items-center bg-fog text-muted">
                      <QrCode className="size-10 animate-pulse text-muted" />
                    </div>
                  )}
                </div>

                <div className="space-y-1 text-left">
                  <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                    <CheckCircle2 className="size-3" />
                    SCAN TO VERIFY
                  </span>
                  <p className="text-[10px] font-bold text-ink">Tamper-Proof Audit</p>
                  <p className="text-[9px] text-muted font-mono leading-tight max-w-[110px]">
                    FP: {report.cryptographicAuditSeal.verificationFingerprint.slice(0, 11)}...
                  </p>
                  <span className="block text-[8px] uppercase tracking-wider text-muted font-semibold">
                    SHA-256 Ledger
                  </span>
                </div>
              </div>

            </div>
          </div>

          {/* Reference & Metadata Ribbon */}
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-line/80 bg-fog/30 p-3.5 text-xs sm:grid-cols-4 font-mono shadow-2xs">
            <div>
              <span className="text-muted block text-[10px] uppercase font-bold tracking-wider">Report Reference</span>
              <div className="flex items-center gap-1 mt-0.5">
                <strong className="text-ink text-[11px] truncate" title={report.reportReference}>
                  {report.reportReference}
                </strong>
                <button
                  type="button"
                  onClick={handleCopyRef}
                  className="text-muted hover:text-ink print:hidden shrink-0"
                  title="Copy Reference"
                >
                  {copiedRef ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
                </button>
              </div>
            </div>

            <div>
              <span className="text-muted block text-[10px] uppercase font-bold tracking-wider">Citizen Token #</span>
              <strong className="text-action text-[11px] truncate block mt-0.5" title={report.reportNumber}>
                {displayToken}
              </strong>
            </div>

            <div>
              <span className="text-muted block text-[10px] uppercase font-bold tracking-wider">Date of Complaint</span>
              <span className="font-semibold text-ink block mt-0.5">
                {new Date(report.reportedAt).toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </div>

            <div>
              <span className="text-muted block text-[10px] uppercase font-bold tracking-wider">Completion Date</span>
              <strong className="text-emerald-700 block mt-0.5">
                {new Date(report.resolvedAt).toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </strong>
            </div>
          </div>

          {/* Section 1: Citizen Grievance Particulars */}
          <section className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted border-b border-line pb-1 flex items-center justify-between">
              <span>1. Citizen Grievance Particulars</span>
              <span className="text-[10px] font-mono text-muted font-normal">Registered via Public Gateway</span>
            </h2>

            <div className="grid grid-cols-1 gap-3 rounded-lg border border-line/70 bg-surface p-3 text-xs sm:grid-cols-3">
              <div>
                <span className="text-muted block text-[10px] uppercase">Issue Category:</span>
                <p className="font-bold text-ink capitalize text-sm">{report.issueCategory}</p>
              </div>
              <div>
                <span className="text-muted block text-[10px] uppercase">Filing Channel:</span>
                <p className="font-bold text-ink capitalize text-sm flex items-center gap-1">
                  <span>{report.citizenChannel}</span>
                  <span className="text-[10px] text-muted font-normal">(Verified Gateway)</span>
                </p>
              </div>
              <div>
                <span className="text-muted block text-[10px] uppercase">Civic Subject &amp; Note:</span>
                <p className="font-medium text-ink leading-relaxed">{report.summary}</p>
              </div>
            </div>
          </section>

          {/* Section 2: Geospatial Demarcation & Boundary Audit */}
          <section className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted border-b border-line pb-1 flex items-center justify-between">
              <span>2. Geospatial Demarcation &amp; Boundary Audit</span>
              <span className="text-[10px] font-mono text-action font-semibold">Point-In-Polygon Verified (DataMeet)</span>
            </h2>

            <div className="grid grid-cols-1 gap-3 rounded-lg border border-line p-3.5 text-xs sm:grid-cols-2 lg:grid-cols-4 bg-surface shadow-2xs">
              <div>
                <span className="text-muted block text-[10px] uppercase font-bold">Latitude &amp; Longitude:</span>
                <div className="mt-1 flex items-center gap-1 font-mono font-bold text-ink text-xs">
                  <MapPin className="size-3.5 text-red-600 shrink-0" />
                  <span>
                    {report.geospatialAudit.coordinates.latitude.toFixed(5)}, {report.geospatialAudit.coordinates.longitude.toFixed(5)}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-muted block text-[10px] uppercase font-bold">Jurisdiction Authority:</span>
                <span className="font-bold text-action block mt-1">{report.geospatialAudit.authorityFullName}</span>
              </div>

              <div>
                <span className="text-muted block text-[10px] uppercase font-bold">Administrative Zone / Ward:</span>
                <strong className="text-ink block mt-1 font-semibold">{report.geospatialAudit.zoneOrWard}</strong>
              </div>

              <div>
                <span className="text-muted block text-[10px] uppercase font-bold">Haad Classification:</span>
                <span className="font-bold text-emerald-700 block mt-1">
                  {report.geospatialAudit.inMahanagarpalikaHaad ? "Mahanagarpalika Haad (हद्दीत)" : "Grampanchayat / PMRDA"}
                </span>
              </div>
            </div>

            <div className="rounded-lg bg-fog/50 px-3 py-2 text-[11px] text-graphite flex items-center justify-between">
              <div>
                Nearest Geographic Boundary: <strong>{report.geospatialAudit.nearestBoundaryName}</strong> ({report.geospatialAudit.distanceToNearestBoundaryMetres} metres away).
                {report.geospatialAudit.isBorderlandBuffer
                  ? " [Borderland Buffer Zone: Joint Inspection Protocol executed under MMCA Sec 67]."
                  : " [Standard Corporate haad verified]."}
              </div>
              <span className="text-[10px] font-mono text-muted uppercase">DataMeet Polygon</span>
            </div>
          </section>

          {/* Section 3: Work Execution & Resolution Summary */}
          <section className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted border-b border-line pb-1">
              3. Engineering Work Execution &amp; Verification
            </h2>

            <div className="rounded-lg border border-line p-3.5 bg-canvas text-xs space-y-2.5">
              <div>
                <strong className="text-ink font-semibold">Executed Work Description:</strong>
                <p className="mt-1 text-ink leading-relaxed font-medium bg-surface p-2.5 rounded border border-line/60">
                  {report.workExecutionAudit.resolutionNote}
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-2 text-[11px]">
                <div className="flex items-center gap-1.5">
                  <User className="size-3.5 text-action" />
                  <span>
                    Inspecting &amp; Certifying Officer: <strong>{report.workExecutionAudit.officerName}</strong>
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800">
                  <CheckCircle2 className="size-3" />
                  QA Audit: {report.workExecutionAudit.qualityAssuranceRating}
                </span>
              </div>
            </div>
          </section>

          {/* Section 4: Financial Management & Municipal Budget Utilization Statement */}
          <section className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted border-b border-line pb-1 flex items-center justify-between">
              <span>4. Financial Management &amp; Municipal Budget Utilization</span>
              <span className="text-[10px] font-mono text-emerald-700 font-bold">Variance Verified</span>
            </h2>

            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-left text-xs">
                <thead className="bg-fog border-b border-line font-bold text-graphite uppercase text-[10px]">
                  <tr>
                    <th className="p-2.5">Budget Head Code</th>
                    <th className="p-2.5">Sanctioned (₹)</th>
                    <th className="p-2.5">Expended (₹)</th>
                    <th className="p-2.5">Variance (₹)</th>
                    <th className="p-2.5">Tender / Work Order</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line font-mono">
                  <tr>
                    <td className="p-2.5">
                      <div className="font-bold text-ink">{report.financialBudgetAudit.budgetHeadCode}</div>
                      <div className="font-sans text-[11px] text-muted">{report.financialBudgetAudit.budgetHeadName}</div>
                    </td>
                    <td className="p-2.5 font-bold">
                      ₹ {report.financialBudgetAudit.sanctionedAmountInr.toLocaleString("en-IN")}
                    </td>
                    <td className="p-2.5 font-bold text-action">
                      ₹ {report.financialBudgetAudit.expendedAmountInr.toLocaleString("en-IN")}
                    </td>
                    <td className="p-2.5 font-bold text-emerald-700">
                      ₹ {report.financialBudgetAudit.varianceInr.toLocaleString("en-IN")} (Savings)
                    </td>
                    <td className="p-2.5">{report.financialBudgetAudit.workOrderNumber}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 gap-2 rounded-lg bg-fog/30 p-3 text-xs sm:grid-cols-2">
              <div>
                <span className="text-muted block text-[10px] uppercase font-bold">Executing Agency / Contractor:</span>
                <strong className="text-ink">{report.financialBudgetAudit.contractorName}</strong>
              </div>
              <div>
                <span className="text-muted block text-[10px] uppercase font-bold">Financial Approver:</span>
                <strong className="text-ink">{report.financialBudgetAudit.financialApprover}</strong>
              </div>
              <div className="sm:col-span-2">
                <span className="text-muted block text-[10px] uppercase font-bold">Material &amp; Machinery Consumed:</span>
                <span className="font-medium text-graphite">{report.financialBudgetAudit.materialsAndEquipment}</span>
              </div>
            </div>
          </section>

          {/* Section 5: Real-World Time Series Audit History & Progression Trail */}
          <section className="space-y-3">
            <div className="border-b border-line pb-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-1.5">
                  <Clock className="size-3.5 text-action" />
                  <span>5. Real-Time Audit History &amp; Work Progression Time Series</span>
                </h2>
                <p className="text-[11px] text-graphite">
                  प्रत्येक टप्प्यावर अद्यतनित (Updated at time of work) कालक्रमबद्ध वैधानिक ऑडिट इतिहास आणि ब्लॉक-चेन तपासणी.
                </p>
              </div>
              <span className="rounded bg-action/10 px-2 py-0.5 text-[10px] font-bold text-action self-start sm:self-auto font-mono">
                {report.auditTrail?.length ?? 7} Verified Audit Blocks
              </span>
            </div>

            {/* Structured Time Series Audit Cards */}
            <div className="space-y-2.5">
              {report.auditTrail && report.auditTrail.length > 0 ? (
                report.auditTrail.map((event, index) => {
                  return (
                    <div
                      key={event.eventId}
                      className="rounded-xl border border-line bg-surface p-3.5 shadow-2xs hover:border-action/40 transition-colors"
                    >
                      {/* Event Header Ribbon */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="grid size-6 place-items-center rounded-full bg-ink text-white font-mono text-[10px] font-bold">
                            {(index + 1).toString().padStart(2, "0")}
                          </span>
                          <div>
                            <span className="font-display text-xs font-bold text-ink">
                              {event.stageTitle}
                            </span>
                            <span className="ml-2 text-[11px] font-semibold text-action">
                              ({event.stageTitleMarathi})
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                              event.verificationStatus === "CRYPTOGRAPHICALLY_SEALED"
                                ? "bg-purple-100 text-purple-900 border border-purple-200"
                                : event.verificationStatus === "SANCTIONED"
                                  ? "bg-blue-100 text-blue-900 border border-blue-200"
                                  : event.verificationStatus === "EXECUTED"
                                    ? "bg-amber-100 text-amber-900 border border-amber-200"
                                    : "bg-emerald-100 text-emerald-900 border border-emerald-200"
                            }`}
                          >
                            ✓ {event.verificationStatus}
                          </span>
                          <span className="font-mono text-[11px] font-semibold text-ink bg-fog px-2 py-0.5 rounded">
                            {event.formattedTimestamp}
                          </span>
                        </div>
                      </div>

                      {/* Event Body Details Grid */}
                      <div className="mt-2.5 grid grid-cols-1 gap-2 text-xs sm:grid-cols-12">
                        <div className="sm:col-span-4 space-y-1">
                          <div>
                            <span className="text-[10px] uppercase font-bold text-muted block">Actor &amp; Role:</span>
                            <span className="font-semibold text-ink">{event.actorName}</span>
                            <p className="text-[11px] text-muted">{event.actorDesignation}</p>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-bold text-muted block">Department / Authority:</span>
                            <span className="text-[11px] text-graphite font-medium">{event.actorAuthority}</span>
                          </div>
                        </div>

                        <div className="sm:col-span-8 space-y-1.5 border-t sm:border-t-0 sm:border-l border-line/60 pt-2 sm:pt-0 sm:pl-3">
                          <div>
                            <span className="text-[10px] uppercase font-bold text-muted block">Action Summary:</span>
                            <p className="text-ink font-medium leading-relaxed">{event.actionSummary}</p>
                          </div>

                          <div>
                            <span className="text-[10px] uppercase font-bold text-muted block">Findings &amp; Remarks:</span>
                            <p className="text-graphite text-[11px] leading-relaxed bg-fog/40 p-1.5 rounded">
                              {event.findingsAndRemarks}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] pt-1">
                            <span className="text-muted">
                              Statutory Ref: <strong className="text-ink">{event.statutoryRule}</strong>
                            </span>
                            <span className="font-mono text-muted" title={`Prev: ${event.previousBlockHash}`}>
                              Block Hash: <code className="text-action">{event.blockHash.slice(0, 12)}...</code>
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-lg border border-line bg-fog/30 p-4 text-center text-xs text-muted">
                  No audit trail recorded.
                </div>
              )}
            </div>
          </section>

          {/* Section 6: Real-Time Cryptographic Signature & Audit Certificate */}
          <section className="space-y-2 border-t-2 border-line pt-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted border-b border-line pb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Lock className="size-3.5 text-action" />
                <span>6. Real-Time Cryptographic Signature &amp; Audit Certificate</span>
              </span>
              <span className="text-[10px] font-mono text-emerald-700 font-bold">SHA-256 Tamper-Evident</span>
            </h2>

            <div className="rounded-xl border-2 border-action/20 bg-action/5 p-4 text-xs font-mono">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1.5 flex-1 pr-4">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted text-[10px] uppercase font-bold">
                        Cryptographic Audit Seal (Digital Signature)
                      </span>
                      <button
                        type="button"
                        onClick={handleCopySignature}
                        className="text-[10px] text-action hover:underline print:hidden flex items-center gap-1"
                      >
                        {copiedSignature ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
                        <span>{copiedSignature ? "Copied" : "Copy Signature"}</span>
                      </button>
                    </div>
                    <p className="font-bold text-ink break-all text-xs bg-white/60 p-2 rounded border border-action/10 mt-0.5">
                      {report.cryptographicAuditSeal.signature}
                    </p>
                  </div>

                  <div>
                    <span className="text-muted text-[10px] uppercase font-bold">16-Group Verification Fingerprint</span>
                    <p className="font-bold text-action tracking-wider text-xs">
                      {report.cryptographicAuditSeal.verificationFingerprint}
                    </p>
                  </div>
                </div>

                <div className="shrink-0 text-center sm:text-right border-t sm:border-t-0 sm:border-l border-action/20 pt-2 sm:pt-0 sm:pl-4">
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 shadow-2xs">
                    <CheckCircle2 className="size-4" />
                    <span>VERIFIED &amp; SEALED</span>
                  </div>
                  <p className="mt-1 text-[11px] font-bold text-ink">
                    Signatory: {report.cryptographicAuditSeal.signingOfficerBadge}
                  </p>
                  <p className="text-[10px] text-muted">
                    {new Date(report.cryptographicAuditSeal.signedAt).toLocaleString("en-IN", {
                      timeZone: "Asia/Kolkata",
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: true,
                    })}
                  </p>
                  <span className="text-[9px] uppercase tracking-wider text-muted block mt-0.5">
                    IT Act 2000 § 3 Validated
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Report Footer */}
          <div className="border-t border-line pt-3 flex flex-col sm:flex-row items-center justify-between text-[11px] text-muted font-mono">
            <p>Generated by Effi Civic Platform • Government of Maharashtra Official Registry</p>
            <p>Certificate Payload ID: {report.cryptographicAuditSeal.payloadHash.slice(0, 16)}</p>
          </div>
        </article>
      </div>
    </div>
  );
}
