"use client";

import { useState } from "react";
import {
  Banknote,
  CheckCircle2,
  FileCheck2,
  IndianRupee,
  Lock,
  Receipt,
  Shield,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import {
  generateMunicipalWorkCompletionReport,
  type Coordinates,
  type MunicipalWorkCompletionReport,
} from "@effi/domain";

type WorkCompletionModalProps = {
  isOpen: boolean;
  onClose: () => void;
  caseData: {
    caseId: string;
    reportNumber: string;
    summary: string;
    category: string;
    coordinates: Coordinates;
    channel: string;
    reportedAt: number;
    assignedOfficerName?: string | undefined;
  };
  onComplete: (report: MunicipalWorkCompletionReport) => void;
};

export function WorkCompletionModal({
  isOpen,
  onClose,
  caseData,
  onComplete,
}: WorkCompletionModalProps) {
  const [resolutionNote, setResolutionNote] = useState(
    "Work completed as per municipal standard specifications. Area cleared, inspected, and restored to safe civilian usage.",
  );
  const [budgetHeadCode, setBudgetHeadCode] = useState("PCMC-RDS-CAPEX-2026-401");
  const [budgetHeadName, setBudgetHeadName] = useState("Road Surface Repair & Bituminous Overlay");
  const [sanctionedAmount, setSanctionedAmount] = useState(45000);
  const [expendedAmount, setExpendedAmount] = useState(41200);
  const [contractorName, setContractorName] = useState("Mahanagar Civil Infrastructure Pvt Ltd");
  const [workOrderNumber, setWorkOrderNumber] = useState("WO/2026/PCMC/PW/8841");
  const [materials, setMaterials] = useState("Bitumen VG-30: 4.2 MT, JCB Loader: 3.5 hrs, Roller compactor: 2 hrs, 6 crew");
  const [financialApprover, setFinancialApprover] = useState("Chief Accounts Officer & Zonal Dy. Commissioner");
  const [officerBadge, setOfficerBadge] = useState("OFF-PCMC-4402");

  if (!isOpen) return null;

  const varianceInr = sanctionedAmount - expendedAmount;
  const isWithinBudget = varianceInr >= 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const report = generateMunicipalWorkCompletionReport({
      reportNumber: caseData.reportNumber,
      caseId: caseData.caseId,
      issueCategory: caseData.category,
      summary: caseData.summary,
      reportedAt: caseData.reportedAt,
      resolvedAt: Date.now(),
      citizenChannel: caseData.channel,
      coordinates: caseData.coordinates,
      resolutionNote,
      officerName: caseData.assignedOfficerName ?? "Rajesh Shinde (Zonal Officer)",
      officerBadge,
      officerRole: "Zonal Executive Engineer",
      financial: {
        budgetHeadCode,
        budgetHeadName,
        sanctionedAmountInr: sanctionedAmount,
        expendedAmountInr: expendedAmount,
        contractorName,
        workOrderNumber,
        materialsAndEquipment: materials,
        financialApprover,
        sanctionDate: new Date(Date.now() - 3 * 86400000).toISOString().split("T")[0]!,
        completionDate: new Date().toISOString().split("T")[0]!,
      },
    });

    onComplete(report);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-3xl rounded-2xl border border-line bg-surface p-6 shadow-2xl transition-all">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 grid size-8 place-items-center rounded-lg text-graphite hover:bg-fog hover:text-ink"
        >
          <X className="size-5" />
        </button>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                <FileCheck2 className="size-3" />
                Work Completion & Financial Audit
              </span>
              <span className="text-xs text-muted font-mono">{caseData.reportNumber}</span>
            </div>
            <h2 className="mt-1 font-display text-xl font-bold text-ink sm:text-2xl">
              Resolve Case with Financial & Cryptographic Audit
            </h2>
            <p className="text-xs text-graphite">
              Record executed work, budget expenditure, and sign the municipal audit trail with a real-time cryptographic seal.
            </p>
          </div>

          {/* Work Execution Note */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-muted">
              Work Execution Summary (कामाचा तपशील)
            </label>
            <textarea
              rows={2}
              required
              value={resolutionNote}
              onChange={(e) => setResolutionNote(e.target.value)}
              className="mt-1 w-full rounded-lg border border-line bg-canvas p-2.5 text-xs text-ink focus:border-action focus:outline-none"
            />
          </div>

          {/* Financial Management & Budget Section */}
          <div className="rounded-xl border border-line bg-fog/30 p-4">
            <div className="flex items-center justify-between border-b border-line pb-2">
              <span className="flex items-center gap-1.5 text-xs font-bold text-ink">
                <Banknote className="size-4 text-emerald-600" />
                <span>Financial Management & Budget Tracking</span>
              </span>
              <span className="text-[11px] text-muted">Public Municipal Accounts Register</span>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-[11px] font-semibold text-graphite">Budget Head Code</label>
                <input
                  type="text"
                  required
                  value={budgetHeadCode}
                  onChange={(e) => setBudgetHeadCode(e.target.value)}
                  className="mt-1 w-full rounded-md border border-line bg-surface px-2.5 py-1.5 font-mono text-xs text-ink"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-graphite">Budget Head Description</label>
                <input
                  type="text"
                  required
                  value={budgetHeadName}
                  onChange={(e) => setBudgetHeadName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs text-ink"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-graphite">Sanctioned Budget (₹ मंजूर निधी)</label>
                <div className="relative mt-1">
                  <input
                    type="number"
                    min={0}
                    required
                    value={sanctionedAmount}
                    onChange={(e) => setSanctionedAmount(parseFloat(e.target.value) || 0)}
                    className="w-full rounded-md border border-line bg-surface px-2.5 py-1.5 pl-6 font-mono text-xs font-bold text-ink"
                  />
                  <IndianRupee className="absolute left-1.5 top-2 size-3 text-muted" />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-graphite">Expended Amount (₹ प्रत्यक्ष खर्च)</label>
                <div className="relative mt-1">
                  <input
                    type="number"
                    min={0}
                    required
                    value={expendedAmount}
                    onChange={(e) => setExpendedAmount(parseFloat(e.target.value) || 0)}
                    className="w-full rounded-md border border-line bg-surface px-2.5 py-1.5 pl-6 font-mono text-xs font-bold text-ink"
                  />
                  <IndianRupee className="absolute left-1.5 top-2 size-3 text-muted" />
                </div>
              </div>

              {/* Budget Variance Card */}
              <div className="sm:col-span-2 flex items-center justify-between rounded-lg bg-surface p-3 border border-line">
                <span className="text-xs font-semibold text-graphite">Budget Variance Analysis:</span>
                <div className="flex items-center gap-2">
                  {isWithinBudget ? (
                    <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
                      <TrendingDown className="size-3.5" />
                      ₹ {varianceInr.toLocaleString("en-IN")} Savings (Under Budget)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded bg-red-100 px-2.5 py-1 text-xs font-bold text-red-800">
                      <TrendingUp className="size-3.5" />
                      ₹ {Math.abs(varianceInr).toLocaleString("en-IN")} Overrun
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-graphite">Contractor / Dept Agency</label>
                <input
                  type="text"
                  required
                  value={contractorName}
                  onChange={(e) => setContractorName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs text-ink"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-graphite">Work Order Reference</label>
                <input
                  type="text"
                  required
                  value={workOrderNumber}
                  onChange={(e) => setWorkOrderNumber(e.target.value)}
                  className="mt-1 w-full rounded-md border border-line bg-surface px-2.5 py-1.5 font-mono text-xs text-ink"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-graphite">Materials & Machinery Consumption Log</label>
                <input
                  type="text"
                  required
                  value={materials}
                  onChange={(e) => setMaterials(e.target.value)}
                  className="mt-1 w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs text-ink"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-graphite">Financial Approval Authority</label>
                <input
                  type="text"
                  required
                  value={financialApprover}
                  onChange={(e) => setFinancialApprover(e.target.value)}
                  className="mt-1 w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs text-ink"
                />
              </div>
            </div>
          </div>

          {/* Cryptographic Signing Callout */}
          <div className="flex items-start gap-3 rounded-xl border border-action/30 bg-action/5 p-3.5 text-xs text-ink">
            <Lock className="size-4 shrink-0 text-action mt-0.5" />
            <div className="flex-1">
              <strong className="font-bold text-action">Real-Time Cryptographic Audit Seal (SHA-256)</strong>
              <p className="mt-0.5 text-graphite leading-relaxed">
                Upon submitting, a tamper-evident digital signature will be generated across the case ID, coordinates, budget expenditure, and your officer badge to prevent post-completion modifications.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-line pt-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-line px-4 py-2 text-xs font-semibold text-graphite hover:bg-fog"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700"
            >
              <CheckCircle2 className="size-4" />
              <span>Sign & Generate Audit Report</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
