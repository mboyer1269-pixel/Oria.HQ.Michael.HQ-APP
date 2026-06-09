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
} from "lucide-react";
import { Tooltip } from "./ui";
import { CockpitTopbar } from "./cockpit-topbar";
import { CommandPalette } from "./command-palette";

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
}

const NAV: NavItem[] = [
  { key: "hq", label: "HQ", href: "/hq", icon: Home, group: "Pilotage", tipTitle: "HQ", tipDetail: "Command surface privée — workspace overview, CEO brief, ledger, modules." },
  { key: "cockpit", label: "Cockpit", href: "/hq/cockpit", icon: LayoutDashboard, group: "Pilotage", tipTitle: "Cockpit", tipDetail: "Tout ce qui requiert ton attention aujourd'hui, en un écran." },
  { key: "missions", label: "Missions", href: "/hq/missions", icon: ListChecks, group: "Pilotage", tipTitle: "Missions", tipDetail: "Drafts, approbations et suivi d'exécution contrôlée." },
  { key: "agents", label: "Agents", href: "/hq/agents", icon: Bot, group: "Pilotage", tipTitle: "Agents · gouvernance", tipDetail: "Autonomie, knowledge packs, scorecards et file de revue." },
  { key: "skills", label: "Skills", href: "/hq/skills", icon: Sparkles, group: "Pilotage", tipTitle: "Skills", tipDetail: "Catalogue des compétences gouvernées." },
  { key: "runtime", label: "Runtime", href: "/hq/runtime", icon: CircleDot, group: "Pilotage", tipTitle: "Runtime", tipDetail: "Exécution verrouillée tant qu'une action n'est pas ledgerée et bornée.", tipMeta: "Verrouillé" },
  { key: "ventures", label: "Ventures", href: "/hq/ventures", icon: Building2, group: "Pilotage", tipTitle: "Ventures", tipDetail: "Portefeuille et file de décisions stratégiques." },
  { key: "documents", label: "Documents", href: "/dashboard/documents", icon: FileText, group: "Espace", tipTitle: "Documents", tipDetail: "Coffre privé : notes, décisions, SOPs." },
];

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  const base =
    "relative flex items-center gap-3 rounded-xl border px-[11px] py-2.5 text-[13px] font-semibold transition";
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
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 font-extrabold text-white shadow-[0_0_0_1px_rgba(139,92,246,.3)]">
            O
          </span>
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

        <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-[18px] px-5 pb-32 pt-[22px]">
          {children}
        </main>
      </div>

      {/* Global ⌘K navigation palette (navigation-only, no execution). */}
      <CommandPalette />
    </div>
  );
}
