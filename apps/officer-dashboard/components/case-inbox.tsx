"use client";

import { Compass, Plus, Search, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useConvexAuth, useQuery_experimental } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Badge, Button, Skeleton, type BadgeTone } from "@effi/ui-web";
import { routeComplaintByCoordinates, type Coordinates } from "@effi/domain";
import { ComplaintRegistrationModal } from "./complaint-registration-modal";
import { OfficerShell } from "./officer-shell";
import {
  caseCategoryLabels,
  caseChannelLabels,
  casePriorities,
  casePriorityLabels,
  caseStatuses,
  caseStatusLabels,
  countWorkload,
  filterCases,
  formatAbsoluteTime,
  formatRelativeTime,
  sortCases,
  type CasePriority,
  type CaseStatus,
  type CaseSummary,
  type InboxFilters,
  type InboxSort,
} from "./case-inbox-state";

const listCases = makeFunctionReference<"query", Record<string, never>, CaseSummary[]>("cases:listCases");

const priorityTones: Record<CasePriority, BadgeTone> = { critical: "ink", high: "lavender", medium: "fog", low: "outline" };
const statusTones: Record<CaseStatus, BadgeTone> = {
  new: "violet",
  assigned: "lavender",
  under_inspection: "orchid",
  work_in_progress: "fog",
  awaiting_confirmation: "orchid",
  resolved: "mint",
  disputed: "ink",
};

const caseCountLabel = (count: number) => `${count} ${count === 1 ? "case" : "cases"}`;

function FilterSelect<Value extends string>({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: readonly { value: Value; label: string }[];
  selected: readonly Value[];
  onChange: (value: Value | null) => void;
}) {
  return (
    <label>
      <span className="sr-only">{label}</span>
      <select
        className="min-h-9 min-w-[158px] rounded-md border border-line bg-surface px-3 pr-8 text-xs text-graphite transition-colors hover:border-action hover:text-ink focus-visible:outline-2 active:scale-[0.99] motion-reduce:transition-none"
        value={selected[0] ?? ""}
        onChange={(event) => onChange(options.find((option) => option.value === event.target.value)?.value ?? null)}
      >
        <option value="">All {label.toLowerCase()}</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 border-b border-line px-4 py-4 first:pl-0 sm:border-b-0 sm:border-l sm:first:border-l-0 sm:first:pl-5">
      <strong className="block font-display text-[34px] font-medium leading-none tracking-[-0.04em] tabular-nums text-ink">{value}</strong>
      <p className="mt-1.5 text-xs font-semibold text-muted">{label}</p>
    </div>
  );
}

function CaseRow({ entry, now }: { entry: CaseSummary; now: number }) {
  return (
    <li>
      <Link className="group grid min-h-[76px] grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 px-4 py-3.5 transition-colors hover:bg-[#fafaf8] focus-visible:outline-2 focus-visible:outline-offset-[-3px] active:bg-lavender/40 motion-reduce:transition-none md:grid-cols-[88px_minmax(0,1fr)_142px_32px] md:items-center md:gap-4 md:px-5" href={`/cases/${entry.caseId}`} aria-label={`Open case: ${entry.summary}`}>
        <div className="col-start-1 row-start-2 md:col-auto md:row-auto">
          <span className="sr-only">Priority</span>
          <Badge tone={priorityTones[entry.currentPriority]}>{casePriorityLabels[entry.currentPriority]}</Badge>
        </div>
        <div className="col-start-1 row-start-1 min-w-0 md:col-auto md:row-auto">
          <span className="sr-only">Case</span>
          <h2 className="text-pretty font-display text-[16px] font-semibold leading-tight tracking-[-0.01em] text-ink">{entry.summary}</h2>
          <p className="mt-1.5 flex flex-wrap gap-x-2.5 text-xs text-muted [&>span+span]:before:mr-2.5 [&>span+span]:before:content-['/']">
            <span>{caseCategoryLabels[entry.category]}</span>
            <span>{caseChannelLabels[entry.channel]}</span>
          </p>
        </div>
        <div className="col-start-2 row-start-2 flex min-w-0 flex-col items-end gap-2 md:col-auto md:row-auto md:items-start">
          <span className="sr-only">Status</span>
          <Badge tone={statusTones[entry.status]}>{caseStatusLabels[entry.status]}</Badge>
          <time className="text-xs text-muted" dateTime={new Date(entry.submittedAt).toISOString()} title={formatAbsoluteTime(entry.submittedAt)}>
            {formatRelativeTime(entry.submittedAt, now)}
          </time>
        </div>
        <span className="col-start-2 row-start-1 self-start text-sm text-ink transition-transform group-hover:translate-x-1 group-focus-visible:translate-x-1 motion-reduce:transition-none md:col-auto md:row-auto md:self-auto" aria-hidden="true">→</span>
      </Link>
    </li>
  );
}

function InboxState({
  title,
  message,
  tone,
  detail,
  action,
}: {
  title: string;
  message: string;
  tone?: "error";
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className={`mt-4 grid min-h-64 content-center justify-items-start rounded-[10px] border border-line p-[clamp(1.5rem,4vw,3rem)] ${tone === "error" ? "bg-[#fdf5f5]" : "bg-surface"}`}>
      <h2 className="font-display text-[clamp(2rem,4vw,3rem)] font-medium leading-none tracking-tight text-ink">{title}</h2>
      <p className="mt-4 max-w-[52ch] leading-relaxed text-graphite">{message}</p>
      {detail ? <p className="mt-3 max-w-[72ch] font-mono text-xs leading-relaxed text-danger">{detail}</p> : null}
      {action}
    </div>
  );
}

function StatsSkeleton() {
  return (
    <div className="overflow-hidden rounded-[10px] border border-line bg-surface" aria-hidden="true">
      <div className="grid grid-cols-2 sm:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="px-4 py-4 sm:px-5">
            <Skeleton className="h-[38px] w-[54px]" />
            <Skeleton className="mt-3 h-2.5 w-[74px]" />
          </div>
        ))}
      </div>
      <div className="grid gap-3 border-t border-line px-4 py-3 sm:grid-cols-2 sm:px-5">
        {[4, 3].map((count) => (
          <div key={count} className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-2.5 w-12" />
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: count }, (_, index) => (
                <Skeleton key={index} className="h-[31px] w-[54px]" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="flex min-h-14 items-center justify-between border-b border-line px-5 py-2.5">
        <Skeleton className="h-[11px] w-[78px]" />
        <Skeleton className="h-9 w-[116px]" />
      </div>
      <div className="hidden grid-cols-[88px_minmax(0,1fr)_142px_32px] gap-4 bg-fog px-5 py-2.5 text-[10px] font-bold uppercase tracking-[0.04em] text-muted md:grid">
        <span>Priority</span>
        <span>Case</span>
        <span>Status</span>
        <span>Action</span>
      </div>
      <ul className="divide-y divide-line bg-surface">
        {[0, 1, 2].map((index) => (
          <li key={index}>
            <div className="grid min-h-[76px] grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3.5 md:grid-cols-[88px_minmax(0,1fr)_142px_32px] md:items-center md:gap-4 md:px-5">
              <div className="col-start-1 row-start-2 md:col-auto md:row-auto"><Skeleton className="h-[22px] w-[84px]" /></div>
              <div className="col-start-1 row-start-1 min-w-0 md:col-auto md:row-auto">
                <Skeleton className="h-[15px] w-[min(70%,420px)]" />
                <Skeleton className="mt-3 h-[11px] w-[min(45%,260px)]" />
              </div>
              <div className="col-start-2 row-start-2 md:col-auto md:row-auto">
                <Skeleton className="h-[22px] w-[84px]" />
              </div>
              <Skeleton className="col-start-2 row-start-1 h-3 w-[38px] md:col-auto md:row-auto" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CaseInbox({ initialView }: { initialView: "cases" | "assigned" }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const result = useQuery_experimental({ query: listCases, args: isAuthenticated && !isLoading ? {} : "skip" });
  const [statuses, setStatuses] = useState<CaseStatus[]>([]);
  const [priorities, setPriorities] = useState<CasePriority[]>([]);
  const [sort, setSort] = useState<InboxSort>("newest");
  const [search, setSearch] = useState("");
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [recentComplaint, setRecentComplaint] = useState<{
    reportNumber: string;
    summary: string;
    category: string;
    coordinates: Coordinates;
    routing: ReturnType<typeof routeComplaintByCoordinates>;
  } | null>(null);

  const cases = result.status === "success" ? result.data : null;
  const filters = useMemo<InboxFilters>(() => ({ statuses, priorities }), [statuses, priorities]);
  const visibleCases = useMemo(() => {
    if (!cases) return [];
    const normalizedSearch = search.trim().toLowerCase();
    const scopedCases = initialView === "assigned" ? cases.filter((entry) => entry.isAssignedToMe) : cases;
    const matchingCases = normalizedSearch
      ? scopedCases.filter((entry) => [entry.summary, caseCategoryLabels[entry.category], caseChannelLabels[entry.channel]].some((value) => value.toLowerCase().includes(normalizedSearch)))
      : scopedCases;
    return sortCases(filterCases(matchingCases, filters), sort);
  }, [cases, filters, initialView, search, sort]);

  const clearFilters = () => {
    setStatuses([]);
    setPriorities([]);
  };

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  let body: ReactNode;

  if (!isLoading && !isAuthenticated) {
    body = (
      <InboxState
        title="We could not verify your officer session"
        message="Sign out and sign in again. If it keeps failing, check that Convex accepts the Clerk token."
        tone="error"
      />
    );
  } else if (result.status === "error") {
    const denied = result.error.message.toLowerCase().includes("officer");
    body = denied ? (
      <InboxState
        title="This account is not an officer"
        message="Ask an Effi admin to grant the officer role, then reload this page."
      />
    ) : (
      <InboxState
        title="We could not load the case inbox"
        message="The connection to Convex dropped or the query failed. Retry the page, and check the Convex deployment if it keeps failing."
        tone="error"
        detail={result.error.message}
      />
    );
  } else if (cases === null) {
    body = (
      <div role="status" aria-live="polite">
        <span className="sr-only">Loading cases</span>
        <StatsSkeleton />
        <div className="mt-4 overflow-hidden rounded-[10px] border border-line bg-surface"><ListSkeleton /></div>
      </div>
    );
  } else if (cases.length === 0) {
    body = (
      <InboxState
        title="New reports land here"
        message="When a citizen confirms a report in Telegram or WhatsApp, Effi creates the case and it appears in this inbox in real time."
      />
    );
  } else {
    const counts = countWorkload(cases);
    body = (
      <>
        <section className="overflow-hidden rounded-[10px] border border-line bg-surface" aria-labelledby="workload-title">
          <h2 id="workload-title" className="sr-only">Workload and filters</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4">
            <StatTile label="Total cases" value={cases.length} />
            <StatTile label="Open" value={counts.open} />
            <StatTile label="New" value={counts.fresh} />
            <StatTile label="Resolved" value={counts.resolved} />
          </div>
          <div className="flex flex-wrap gap-2.5 border-t border-line px-4 py-3 sm:px-5">
            <FilterSelect
              label="Status"
              options={caseStatuses.map((status) => ({ value: status, label: caseStatusLabels[status] }))}
              selected={statuses}
              onChange={(status) => setStatuses(status ? [status] : [])}
            />
            <FilterSelect
              label="Priority"
              options={casePriorities.map((priority) => ({ value: priority, label: casePriorityLabels[priority] }))}
              selected={priorities}
              onChange={(priority) => setPriorities(priority ? [priority] : [])}
            />
          </div>
        </section>
        <div className="mt-4 overflow-hidden rounded-[10px] border border-line bg-surface">
          <div className="flex min-h-14 items-center justify-between gap-4 border-b border-line px-4 py-2.5 sm:px-5">
            <p className="text-xs text-graphite" aria-live="polite">
              {visibleCases.length === cases.length && initialView === "cases" ? caseCountLabel(cases.length) : `${visibleCases.length} of ${caseCountLabel(cases.length)}`}
            </p>
            <select
              className="min-h-9 rounded-md border border-line bg-surface px-3 pr-8 text-xs text-graphite transition-colors hover:border-action hover:text-ink focus-visible:outline-2 active:scale-[0.99] motion-reduce:transition-none"
              aria-label="Sort cases"
              value={sort}
              onChange={() => setSort((current) => current === "newest" ? "oldest" : "newest")}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </div>
          {visibleCases.length === 0 ? (
            <InboxState
              title="No cases match these filters"
              message="Clear the filters to see the full inbox."
              action={<Button variant="dark" onClick={clearFilters}>Clear filters</Button>}
            />
          ) : (
            <>
              <div className="hidden grid-cols-[88px_minmax(0,1fr)_142px_32px] gap-4 bg-fog px-5 py-2.5 text-[10px] font-bold uppercase tracking-[0.04em] text-muted md:grid" aria-hidden="true">
                <span>Priority</span>
                <span>Case</span>
                <span>Status</span>
                <span>Action</span>
              </div>
              <ul className="divide-y divide-line bg-surface">
                {visibleCases.map((entry) => <CaseRow key={entry.caseId} entry={entry} now={now} />)}
              </ul>
            </>
          )}
        </div>
      </>
    );
  }

  const assignedCount = cases?.filter((entry) => entry.isAssignedToMe).length;
  const searchControl = (
    <label className="flex h-10 w-full max-w-[520px] items-center gap-2.5 rounded-lg border border-[#d9dde2] bg-surface px-3 text-muted transition-shadow focus-within:border-action focus-within:ring-3 focus-within:ring-action/10 motion-reduce:transition-none">
      <Search className="size-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />
      <span className="sr-only">Search cases</span>
      <input className="w-full border-0 bg-transparent text-[13px] text-ink outline-none placeholder:text-muted" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search cases by keyword" />
    </label>
  );

  return (
    <OfficerShell activeNav={initialView} assignedCount={assignedCount} caseCount={cases?.length} search={searchControl}>
    <section className="w-full" aria-labelledby="case-inbox-title">
      <header className="pb-5 pt-6 sm:pb-6 sm:pt-7">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-[clamp(2.5rem,4vw,3.75rem)] font-medium leading-none tracking-[-0.04em] text-ink" id="case-inbox-title">{initialView === "assigned" ? "My assigned" : "Cases"}</h1>
            <p className="mt-3 max-w-[46ch] text-[15px] leading-relaxed text-graphite">{initialView === "assigned" ? "Cases currently assigned to your officer account." : "Review and manage confirmed civic issues."}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/jurisdiction"
              className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2 text-xs font-semibold text-graphite hover:border-action hover:text-ink transition-colors shadow-sm"
            >
              <Compass className="size-4 text-action" />
              <span>Haad &amp; Boundary Map</span>
            </Link>
            <Button
              variant="primary"
              onClick={() => setIsRegisterOpen(true)}
              className="inline-flex items-center gap-2"
            >
              <Plus className="size-4" />
              <span>Register Complaint (Auto-Route)</span>
            </Button>
          </div>
        </div>
      </header>

      {recentComplaint && (
        <div className="mb-6 rounded-xl border border-action/30 bg-action/5 p-4 sm:p-5 text-ink shadow-sm animate-in fade-in">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-action/20 p-2 text-action">
                <ShieldCheck className="size-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-bold text-action">
                    {recentComplaint.reportNumber}
                  </span>
                  <span className="rounded-full bg-surface px-2.5 py-0.5 text-[11px] font-bold text-ink border border-line">
                    Auto-Routed to {recentComplaint.routing.authority} Officer
                  </span>
                  <span className="text-xs text-muted">
                    ({recentComplaint.coordinates.latitude.toFixed(4)}° N, {recentComplaint.coordinates.longitude.toFixed(4)}° E)
                  </span>
                </div>
                <h3 className="mt-1 font-display text-base font-semibold text-ink">
                  {recentComplaint.summary}
                </h3>
                <p className="mt-1 text-xs text-graphite">
                  Designated Officer: <strong className="text-ink">{recentComplaint.routing.designatedOfficerTitle}</strong> &bull; {recentComplaint.routing.designatedDepartment} &bull; Zone: <span className="font-medium text-ink">{recentComplaint.routing.zoneOrWard}</span> &bull; SLA: <strong className="text-action">{recentComplaint.routing.slaTargetHours}h</strong>
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setRecentComplaint(null)}
              className="text-xs text-muted hover:text-ink underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {body}

      <ComplaintRegistrationModal
        isOpen={isRegisterOpen}
        onClose={() => setIsRegisterOpen(false)}
        onRegistered={(complaint) => {
          setRecentComplaint(complaint);
        }}
      />
    </section>
    </OfficerShell>
  );
}
