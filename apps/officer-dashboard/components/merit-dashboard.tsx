"use client";

import { useConvexAuth, useQuery_experimental } from "convex/react";
import { makeFunctionReference } from "convex/server";
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpDown,
  Award,
  CheckCircle2,
  Clock3,
  Info,
  RefreshCw,
  Search,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { OfficerShell } from "./officer-shell";
import {
  filterOfficers,
  formatDuration,
  formatPercentage,
  sortOfficers,
  type MeritDashboardData,
  type MeritDateRange,
  type OfficerSortKey,
} from "./merit-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const getOfficerMeritDashboard = makeFunctionReference<
  "query",
  { dateRange?: MeritDateRange; officerId?: string },
  MeritDashboardData
>("merit:getOfficerMeritDashboard");

function MetricCard({
  title,
  value,
  detail,
  icon,
}: {
  title: string;
  value: string;
  detail: string;
  icon: ReactNode;
}) {
  return (
    <Card className="gap-3 rounded-[10px] border-line bg-surface py-4 shadow-none">
      <CardHeader className="gap-2 px-5 pb-0">
        <div className="flex items-center justify-between gap-3">
          <CardDescription className="text-xs font-semibold text-graphite">{title}</CardDescription>
          <span className="grid size-7 place-items-center rounded-full bg-lavender text-action">{icon}</span>
        </div>
        <CardTitle className="font-display text-[1.85rem] font-medium tracking-[-0.04em] text-ink tabular-nums">
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pt-1 text-xs leading-relaxed text-muted">{detail}</CardContent>
    </Card>
  );
}

export function MeritDashboard() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const [selectedRange, setSelectedRange] = useState<MeritDateRange>("30d");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<OfficerSortKey>("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const queryArgs = useMemo(() => ({ dateRange: selectedRange }), [selectedRange]);

  const result = useQuery_experimental({
    query: getOfficerMeritDashboard,
    args: isAuthenticated && !authLoading ? queryArgs : "skip",
  });

  const data = result.status === "success" ? result.data : null;
  const isLoading = authLoading || (result.status !== "success" && result.status !== "error");
  const error = result.status === "error" ? result.error : null;

  const officers = data?.officers;
  const displayedOfficers = useMemo(() => {
    if (!officers) return [];
    const filtered = filterOfficers(officers, searchQuery);
    return sortOfficers(filtered, sortKey, sortDirection);
  }, [officers, searchQuery, sortKey, sortDirection]);

  const toggleSort = (key: OfficerSortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("desc");
    }
  };

  return (
    <OfficerShell activeNav="merit">
      <section className="space-y-6 pt-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-[26px] font-semibold leading-tight tracking-[-0.02em] text-ink">
              Officer Merit & Accountability
            </h1>
            <p className="mt-1 text-xs text-graphite">
              Verifiable civic resolution quality, citizen confirmation, and timely handling.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs font-medium text-graphite">
              <span>Timeframe:</span>
              <Select
                value={selectedRange}
                onValueChange={(val) => setSelectedRange(val as MeritDateRange)}
              >
                <SelectTrigger className="h-9 w-[140px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="90d">Last 90 days</SelectItem>
                  <SelectItem value="all">All time</SelectItem>
                </SelectContent>
              </Select>
            </label>
          </div>
        </div>

        <Alert className="border-line bg-lavender/30 text-ink">
          <Info className="size-4 text-action" />
          <AlertTitle className="text-xs font-semibold">Integrity and schema boundaries</AlertTitle>
          <AlertDescription className="text-xs leading-relaxed text-graphite">
            Rankings and performance metrics are based on verified civic outcomes rather than raw closure volume.
            Municipal ward assignments are currently not modeled in the database schema; geographical locations are
            captured through verified GPS coordinates and reverse-geocoded place names.
          </AlertDescription>
        </Alert>

        {authLoading || isLoading ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-lg" />
              ))}
            </div>
            <Skeleton className="h-64 rounded-lg" />
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Error loading merit data</AlertTitle>
            <AlertDescription className="text-xs">{error.message}</AlertDescription>
          </Alert>
        ) : !data ? (
          <div className="rounded-lg border border-line bg-surface p-8 text-center text-xs text-muted">
            No grievance records found for this period.
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                title="Assigned complaints"
                value={data.summary.totalAssignedCases.toString()}
                detail={`${data.summary.currentActiveWorkload} in active progress, ${data.summary.awaitingConfirmationCases} awaiting citizen response`}
                icon={<UsersRound className="size-4" />}
              />
              <MetricCard
                title="Citizen confirmed"
                value={data.summary.citizenConfirmedResolutions.toString()}
                detail={`Confirmation rate: ${formatPercentage(
                  data.summary.citizenConfirmationRate.percentage,
                  data.summary.citizenConfirmationRate.confirmed,
                  data.summary.citizenConfirmationRate.totalResponses,
                )}`}
                icon={<CheckCircle2 className="size-4" />}
              />
              <MetricCard
                title="Officer verified"
                value={data.summary.officerVerifiedResolutions.toString()}
                detail="Manually closed with recorded verification justification"
                icon={<ShieldCheck className="size-4" />}
              />
              <MetricCard
                title="Citizen disputes"
                value={data.summary.citizenDisputedCases.toString()}
                detail={`${data.summary.reopenedCases} case(s) reopened for field re-inspection`}
                icon={<AlertTriangle className="size-4" />}
              />
              <MetricCard
                title="First-time resolution"
                value={
                  data.summary.firstTimeResolutionRate.percentage !== null
                    ? `${data.summary.firstTimeResolutionRate.percentage.toFixed(1)}%`
                    : "No data"
                }
                detail={`${data.summary.firstTimeResolutionRate.firstTime} of ${data.summary.firstTimeResolutionRate.totalResolved} resolved without dispute or reopen`}
                icon={<Award className="size-4" />}
              />
              <MetricCard
                title="Repeat complaints"
                value={`${data.summary.repeatComplaintCases} cases`}
                detail={`${data.summary.totalReposts} citizen co-reports logged`}
                icon={<RefreshCw className="size-4" />}
              />
              <MetricCard
                title="Overdue statutory SLA"
                value={`${data.summary.overdueSlaCases} cases`}
                detail={`Evaluated for roads, lighting, and sanitation (${data.summary.unconfiguredSlaCases} non-statutory)`}
                icon={<Clock3 className="size-4" />}
              />
              <MetricCard
                title="Median resolution time"
                value={formatDuration(data.summary.medianResolutionMs)}
                detail="Measured from citizen submission to final resolution"
                icon={<Clock3 className="size-4" />}
              />
            </div>

            <Card className="rounded-[10px] border-line bg-surface shadow-none">
              <CardHeader className="gap-4 px-6 pt-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="font-display text-lg font-semibold text-ink">
                      Officer Accountability & Performance
                    </CardTitle>
                    <CardDescription className="text-xs text-graphite">
                      Individual officer resolution breakdown with explicit sample sizes.
                    </CardDescription>
                  </div>
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-2.5 top-2.5 size-4 text-muted" />
                    <input
                      type="text"
                      placeholder="Search officer name..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="h-9 w-full rounded-md border border-line bg-canvas pl-9 pr-3 text-xs text-ink placeholder:text-muted focus:border-action focus:outline-none"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-6 pb-6">
                {displayedOfficers.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-line p-8 text-center text-xs text-muted">
                    {searchQuery ? "No officers match the search query." : "No assigned officers found."}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-line hover:bg-transparent">
                          <TableHead className="cursor-pointer text-xs font-semibold text-graphite" onClick={() => toggleSort("name")}>
                            <span className="flex items-center gap-1">Officer Name <ArrowUpDown className="size-3" /></span>
                          </TableHead>
                          <TableHead className="text-xs font-semibold text-graphite">Ward</TableHead>
                          <TableHead className="cursor-pointer text-right text-xs font-semibold text-graphite" onClick={() => toggleSort("assignedCases")}>
                            <span className="flex items-center justify-end gap-1">Assigned <ArrowUpDown className="size-3" /></span>
                          </TableHead>
                          <TableHead className="cursor-pointer text-right text-xs font-semibold text-graphite" onClick={() => toggleSort("currentWorkload")}>
                            <span className="flex items-center justify-end gap-1">Workload <ArrowUpDown className="size-3" /></span>
                          </TableHead>
                          <TableHead className="cursor-pointer text-right text-xs font-semibold text-graphite" onClick={() => toggleSort("citizenConfirmed")}>
                            <span className="flex items-center justify-end gap-1">Confirmed <ArrowUpDown className="size-3" /></span>
                          </TableHead>
                          <TableHead className="cursor-pointer text-right text-xs font-semibold text-graphite" onClick={() => toggleSort("officerVerified")}>
                            <span className="flex items-center justify-end gap-1">Verified <ArrowUpDown className="size-3" /></span>
                          </TableHead>
                          <TableHead className="cursor-pointer text-right text-xs font-semibold text-graphite" onClick={() => toggleSort("citizenDisputes")}>
                            <span className="flex items-center justify-end gap-1">Disputes <ArrowUpDown className="size-3" /></span>
                          </TableHead>
                          <TableHead className="cursor-pointer text-right text-xs font-semibold text-graphite" onClick={() => toggleSort("reopenedCases")}>
                            <span className="flex items-center justify-end gap-1">Reopened <ArrowUpDown className="size-3" /></span>
                          </TableHead>
                          <TableHead className="cursor-pointer text-right text-xs font-semibold text-graphite" onClick={() => toggleSort("confirmationRate")}>
                            <span className="flex items-center justify-end gap-1">Confirmation Rate <ArrowUpDown className="size-3" /></span>
                          </TableHead>
                          <TableHead className="cursor-pointer text-right text-xs font-semibold text-graphite" onClick={() => toggleSort("medianResolutionMs")}>
                            <span className="flex items-center justify-end gap-1">Median Time <ArrowUpDown className="size-3" /></span>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {displayedOfficers.map((officer) => (
                          <TableRow key={officer.officerId} className="border-line">
                            <TableCell className="text-xs font-semibold text-ink">
                              {officer.name}
                            </TableCell>
                            <TableCell className="text-xs text-muted">
                              <span className="text-[11px] italic">Not modeled</span>
                            </TableCell>
                            <TableCell className="text-right text-xs font-medium text-ink tabular-nums">
                              {officer.assignedCases}
                            </TableCell>
                            <TableCell className="text-right text-xs tabular-nums text-muted">
                              <span className="text-ink">{officer.currentWorkload} active</span>
                              {officer.awaitingConfirmation > 0 && (
                                <span className="ml-1 text-[11px] text-orchid">
                                  ({officer.awaitingConfirmation} pending)
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-right text-xs font-medium text-action tabular-nums">
                              {officer.citizenConfirmed}
                            </TableCell>
                            <TableCell className="text-right text-xs font-medium text-graphite tabular-nums">
                              {officer.officerVerified}
                            </TableCell>
                            <TableCell className="text-right text-xs font-medium text-ink tabular-nums">
                              {officer.citizenDisputes > 0 ? (
                                <Badge variant="outline" className="border-ink bg-ink text-white text-[10px]">
                                  {officer.citizenDisputes}
                                </Badge>
                              ) : (
                                "0"
                              )}
                            </TableCell>
                            <TableCell className="text-right text-xs tabular-nums text-muted">
                              {officer.reopenedCases}
                            </TableCell>
                            <TableCell className="text-right text-xs font-medium tabular-nums text-ink">
                              {formatPercentage(
                                officer.confirmationRate.percentage,
                                officer.confirmationRate.confirmed,
                                officer.confirmationRate.totalResponses,
                              )}
                            </TableCell>
                            <TableCell className="text-right text-xs tabular-nums text-muted">
                              {formatDuration(officer.medianResolutionMs)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </section>
    </OfficerShell>
  );
}
