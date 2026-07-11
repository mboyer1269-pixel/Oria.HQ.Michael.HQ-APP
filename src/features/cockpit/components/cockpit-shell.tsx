import type { ReactNode } from "react";
import type { Route } from "next";
import Link from "next/link";
import {
  Bot,
  Building2,
  CircleDot,
  FileText,
  Home,
  LayoutDashboard,
  ListChecks,
  Sparkles,
  SendHorizonal,
  StickyNote,
  Workflow,
  Car,
} from "lucide-react";
import { Tooltip } from "./ui";
import { CockpitTopbar } from "./cockpit-topbar";
import { CommandPalette } from "./command-palette";
import { GovernanceBar } from "./governance-bar";
import { ActivityRail } from "./activity-rail";

// ---------------------------------------------------------------------------
// Cockpit shell — persistent sidebar + topbar + omnipresent Joris dock.
// Presentational; navigation points at existing routes. No I/O.
// ---------------------------------------------------------------------------

interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  group: "Pilotage" | "Espace";
  tipTitle: string;
  tipDetail: string;
  tipMeta?: string;
  count?: number;
  /** Inactive area: shown for context but not presented as a live, clickable module. */
  disabled?: boolean;
}

const NAV: NavItem[] = [
  { key: "hq", label: "HQ", href: "/hq", icon: Home, group: "Pilotage", tipTitle: "HQ", tipDetail: "Command surface privée — workspace overview, CEO brief, ledger, modules." },
  { key: "cockpit", label: "Cockpit", href: "/hq/cockpit", icon: LayoutDashboard, group: "Pilotage", tipTitle: "Cockpit", tipDetail: "Tout ce qui requiert ton attention aujourd'hui, en un écran." },
  { key: "missions", label: "Missions", href: "/hq/missions", icon: ListChecks, group: "Pilotage", tipTitle: "Missions", tipDetail: "Drafts, approbations et suivi d'exécution contrôlée." },
  { key: "agents", label: "Agents", href: "/hq/agents", icon: Bot, group: "Pilotage", tipTitle: "Agents · gouvernance", tipDetail: "Autonomie, knowledge packs, scorecards et file de revue." },
  { key: "workflows", label: "Workflows", href: "/hq/workflows", icon: Workflow, group: "Pilotage", tipTitle: "Workflows live", tipDetail: "Runs multi-agents en direct, lignes d'étapes et KPIs mesurés sur observations réelles." },
  { key: "skills", label: "Skills", href: "/hq/skills", icon: Sparkles, group: "Pilotage", tipTitle: "Skills", tipDetail: "Catalogue des compétences gouvernées." },
  { key: "runtime", label: "Runtime", href: "/hq/runtime", icon: CircleDot, group: "Pilotage", tipTitle: "Runtime", tipDetail: "Exécution verrouillée tant qu'une action n'est pas ledgerée et bornée.", tipMeta: "Verrouillé" },
  { key: "ventures", label: "Ventures", href: "/hq/ventures", icon: Building2, group: "Pilotage", tipTitle: "Ventures", tipDetail: "Portefeuille et file de décisions stratégiques." },
  { key: "outbound", label: "Send Desk", href: "/hq/outbound", icon: SendHorizonal, group: "Pilotage", tipTitle: "Send Desk", tipDetail: "File d'envoi ceo_single_send — un clic, un envoi, une preuve au ledger." },
  { key: "sales", label: "Sales Desk", href: "/hq/sales", icon: Car, group: "Pilotage", tipTitle: "Sales Desk", tipDetail: "File du matin, fiches Marketplace, capture leads — prepare-only." },
  { key: "notes", label: "Notes", href: "/hq/notes", icon: StickyNote, group: "Espace", tipTitle: "Notes CEO", tipDetail: "Scratchpad exécutif avec autosave." },
  { key: "documents", label: "Documents", href: "/dashboard/documents", icon: FileText, group: "Espace", tipTitle: "Documents", tipDetail: "En reconstruction — dossiers ouvrables, édition, permissions et audit trail.", tipMeta: "Bientôt" },
];

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  const base =
    "relative flex items-center gap-3 rounded-xl border px-[11px] py-2.5 text-[13px] font-semibold transition";

  // Inactive area: render as a non-interactive, dimmed row so it reads as
  // "present but not yet available" rather than a live, broken module.
  if (item.disabled) {
    return (
      <Tooltip title={item.tipTitle} detail={item.tipDetail} meta={item.tipMeta} align="left" className="w-full">
        <span
          aria-disabled="true"
          className={`${base} w-full cursor-not-allowed border-transparent text-[#5a6080] opacity-60`}
        >
          <Icon className="h-[17px] w-[17px] shrink-0" aria-hidden="true" />
          <span className="hidden md:inline">{item.label}</span>
          {item.tipMeta ? (
            <span className="ml-auto hidden rounded-full border border-white/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#646c8e] md:inline">
              {item.tipMeta}
            </span>
          ) : null}
        </span>
      </Tooltip>
    );
  }

  const state = active
    ? "border-violet-500/40 bg-gradient-to-br from-violet-500/22 to-indigo-500/[0.13] text-white"
    : "border-transparent text-[#98a1c4] hover:border-white/10 hover:bg-white/[0.04] hover:text-[#eff1fb]";
  return (
    <Tooltip title={item.tipTitle} detail={item.tipDetail} meta={item.tipMeta} align="left" className="w-full">
      <Link href={item.href as Route} className={`${base} ${state} w-full`}>
        {active ? (
          <span className="absolute -left-3.5 top-2 bottom-2 w-[3px] rounded bg-gradient-to-b from-violet-400 to-cyan-400" />
        ) : null}
        <Icon className="h-[17px] w-[17px] shrink-0" aria-hidden="true" />
        <span className="hidden md:inline">{item.label}</span>
      </Link>
    </Tooltip>
  );
}

export function CockpitShell({
  children,
  active = "cockpit",
  crumb = "Cockpit",
  userInitial = "M",
}: {
  children: ReactNode;
  active?: string;
  crumb?: string;
  userInitial?: string;
}) {
  const pilotage = NAV.filter((n) => n.group === "Pilotage");
  const espace = NAV.filter((n) => n.group === "Espace");

  return (
    <div className="grid min-h-screen grid-cols-[64px_1fr] bg-[#080a16] md:grid-cols-[250px_1fr]">
      {/* Sidebar */}
      <aside className="sticky top-0 flex h-screen flex-col gap-1.5 overflow-auto border-r border-white/[0.06] bg-gradient-to-b from-[#0c1020]/95 to-[#080b18]/95 p-3.5 backdrop-blur-xl">
        <div className="flex items-center gap-3 px-2 pb-4 pt-1.5">
          <svg
            viewBox="0 0 512 512"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            className="h-9 w-9 shrink-0 rounded-xl shadow-[0_0_0_1px_rgba(245,158,11,.25)]"
          >
            <rect width="512" height="512" rx="112" fill="#0A0A0A" />
            <path
              d="M256 80L336 144V272C336 316.183 300.183 352 256 352C211.817 352 176 316.183 176 272V144L256 80Z"
              fill="#F59E0B"
            />
            <path d="M160 392H352" stroke="#E5E5E5" strokeWidth="32" strokeLinecap="round" />
            <path d="M224 176H288" stroke="#0A0A0A" strokeWidth="28" strokeLinecap="round" />
            <path d="M224 240H288" stroke="#0A0A0A" strokeWidth="28" strokeLinecap="round" />
          </svg>
          <span className="hidden md:block">
            <span className="block text-[15px] font-bold text-[#eff1fb]">ORIA HQ</span>
            <span className="block text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[#646c8e]">
              Michael
            </span>
          </span>
        </div>

        <p className="hidden px-2.5 pb-1.5 pt-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[#646c8e] md:block">
          Pilotage
        </p>
        {pilotage.map((item) => (
          <SidebarLink key={item.key} item={item} active={item.key === active} />
        ))}

        <p className="hidden px-2.5 pb-1.5 pt-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[#646c8e] md:block">
          Espace
        </p>
        {espace.map((item) => (
          <SidebarLink key={item.key} item={item} active={item.key === active} />
        ))}

        <div className="mt-auto hidden border-t border-white/[0.06] pt-3 text-[11.5px] leading-relaxed text-[#646c8e] md:block">
          <span className="text-emerald-400">●</span> workspace actif · human-on-the-loop
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-col">
        <CockpitTopbar crumb={crumb} userInitial={userInitial} />

        {/* Read-only governance doctrine bar (no execution). */}
        <GovernanceBar />

        {/* Read-only activity rail (no fabricated events, no ledger writes). */}
        <ActivityRail />

        <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-[18px] px-5 pb-32 pt-[22px]">
          {children}
        </main>
      </div>

      {/* Global ⌘K navigation palette (navigation-only, no execution). */}
      <CommandPalette />
    </div>
  );
}
