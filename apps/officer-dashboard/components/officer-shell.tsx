"use client";

import { UserButton, useUser } from "@clerk/nextjs";
import { Award, BarChart3, ClipboardList, MapPinned, Menu, UserRound, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState, type ReactNode } from "react";

type OfficerNav = "cases" | "assigned" | "heatmap" | "analytics" | "merit";

type OfficerShellProps = {
  activeNav: OfficerNav;
  assignedCount?: number | undefined;
  caseCount?: number | undefined;
  children: ReactNode;
  contentMode?: "contained" | "full-bleed";
  search?: ReactNode;
};

const navIcons = { cases: ClipboardList, assigned: UserRound, heatmap: MapPinned, analytics: BarChart3, merit: Award } as const;

function NavIcon({ kind }: { kind: keyof typeof navIcons }) {
  const Icon = navIcons[kind];
  return <Icon className="size-[21px] shrink-0" strokeWidth={1.75} aria-hidden="true" />;
}

function Sidebar({ activeNav, assignedCount, caseCount, onNavigate }: Omit<OfficerShellProps, "children" | "search"> & { onNavigate: () => void }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-[248px] -translate-x-full flex-col overflow-hidden border-r border-line bg-canvas transition-transform duration-300 group-data-[menu=open]/workspace:translate-x-0 motion-reduce:transition-none lg:sticky lg:top-0 lg:h-[100dvh] lg:translate-x-0">
      <div className="px-5 pb-5 pt-5">
        <Link className="block font-display text-[34px] font-semibold leading-none tracking-[-0.055em] text-ink" href="/" onClick={onNavigate}>Effi</Link>
        <p className="mt-2 font-display text-[10px] leading-[1.35] text-graphite">People / Progress / Safer Communities</p>
      </div>

      <nav className="grid gap-1 px-3 py-2" aria-label="Officer workspace">
        <Link className={`grid min-h-11 grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-lg px-3 text-sm transition-colors duration-200 focus-visible:outline-2 active:scale-[0.98] motion-reduce:transition-none ${activeNav === "cases" ? "bg-lavender font-semibold text-ink" : "text-graphite hover:bg-lavender/50 hover:text-ink"}`} href="/" onClick={onNavigate}>
          <NavIcon kind="cases" />
          <span>Cases</span>
          {caseCount !== undefined ? <strong>{caseCount}</strong> : null}
        </Link>
        <Link className={`grid min-h-11 grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-lg px-3 text-sm transition-colors duration-200 focus-visible:outline-2 active:scale-[0.98] motion-reduce:transition-none ${activeNav === "assigned" ? "bg-lavender font-semibold text-ink" : "text-graphite hover:bg-lavender/50 hover:text-ink"}`} href="/?view=assigned" onClick={onNavigate}>
          <NavIcon kind="assigned" />
          <span>My assigned</span>
          {assignedCount !== undefined ? <strong>{assignedCount}</strong> : null}
        </Link>
        <Link className={`grid min-h-11 grid-cols-[24px_minmax(0,1fr)] items-center gap-2.5 rounded-lg px-3 text-sm transition-colors duration-200 focus-visible:outline-2 active:scale-[0.98] motion-reduce:transition-none ${activeNav === "heatmap" ? "bg-lavender font-semibold text-ink" : "text-graphite hover:bg-lavender/50 hover:text-ink"}`} href="/heatmap" onClick={onNavigate}>
          <NavIcon kind="heatmap" /><span>Heatmap</span>
        </Link>
        <Link className={`grid min-h-11 grid-cols-[24px_minmax(0,1fr)] items-center gap-2.5 rounded-lg px-3 text-sm transition-colors duration-200 focus-visible:outline-2 active:scale-[0.98] motion-reduce:transition-none ${activeNav === "analytics" ? "bg-lavender font-semibold text-ink" : "text-graphite hover:bg-lavender/50 hover:text-ink"}`} href="/analytics" onClick={onNavigate}>
          <NavIcon kind="analytics" /><span>Analytics</span>
        </Link>
        <Link className={`grid min-h-11 grid-cols-[24px_minmax(0,1fr)] items-center gap-2.5 rounded-lg px-3 text-sm transition-colors duration-200 focus-visible:outline-2 active:scale-[0.98] motion-reduce:transition-none ${activeNav === "merit" ? "bg-lavender font-semibold text-ink" : "text-graphite hover:bg-lavender/50 hover:text-ink"}`} href="/merit" onClick={onNavigate}>
          <NavIcon kind="merit" /><span>Merit</span>
        </Link>
      </nav>

      <div className="relative mt-auto h-[236px] shrink-0 px-5 pb-5 text-ink">
        <Image
          className="pointer-events-none absolute bottom-[52px] left-1/2 h-auto w-[166px] -translate-x-1/2"
          src="/brand/civic-dome-v1.png"
          alt=""
          width={1009}
          height={1558}
          sizes="248px"
        />
        <p className="absolute inset-x-5 bottom-5 font-display text-sm leading-tight">One Platform<br />Better Governance</p>
      </div>
    </aside>
  );
}

export function OfficerShell({ activeNav, assignedCount, caseCount, children, contentMode = "contained", search }: OfficerShellProps) {
  const { user } = useUser();
  const [menuOpen, setMenuOpen] = useState(false);
  const officerName = user?.fullName ?? user?.firstName ?? "Officer";

  return (
    <div data-menu={menuOpen ? "open" : "closed"} className="group/workspace grid min-h-[100dvh] grid-cols-1 bg-canvas lg:grid-cols-[248px_minmax(0,1fr)]">
      <button className={`fixed inset-0 z-30 bg-ink/30 backdrop-blur-sm transition-opacity lg:hidden ${menuOpen ? "opacity-100" : "pointer-events-none opacity-0"}`} type="button" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />
      <Sidebar activeNav={activeNav} assignedCount={assignedCount} caseCount={caseCount} onNavigate={() => setMenuOpen(false)} />
      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between gap-4 border-b border-line bg-canvas/90 px-4 py-2.5 backdrop-blur-xl sm:px-5 lg:gap-5 lg:px-6">
          <button className="grid size-10 shrink-0 place-items-center rounded-lg text-ink transition-colors hover:bg-lavender active:scale-[0.98] lg:hidden" type="button" aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-expanded={menuOpen} onClick={() => setMenuOpen((current) => !current)}>
            {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
          <div className="min-w-0 flex-1">{search}</div>
          <div className="flex items-center gap-3">
            <div className="hidden leading-tight sm:grid">
              <strong className="font-display text-sm font-semibold text-ink">{officerName}</strong>
              <span className="mt-1 text-[11px] text-muted">Field officer</span>
            </div>
            <UserButton />
          </div>
        </header>
        <main className={contentMode === "full-bleed" ? "h-[calc(100dvh-64px)] overflow-hidden" : "mx-auto w-full max-w-[1480px] px-4 pb-10 sm:px-5 lg:px-6 lg:pb-12"}>{children}</main>
      </div>
    </div>
  );
}
