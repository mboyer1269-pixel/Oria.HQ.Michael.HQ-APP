"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  ArrowUp,
  Bot,
  Building2,
  CalendarCheck,
  CheckCheck,
  CircleDot,
  CornerDownLeft,
  FileText,
  Home,
  LayoutDashboard,
  ListChecks,
  type LucideIcon,
  MessageSquare,
  ScrollText,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

// ---------------------------------------------------------------------------
// command-palette.tsx — global ⌘K palette for the cockpit shell.
//
// NAVIGATION ONLY. Every entry either routes to an existing page or scrolls to
// an existing on-page anchor (falling back to the /hq home that owns the
// anchor). No entry executes an agent action, approves anything, unlocks
// runtime, writes to the ledger, calls a server action, or mutates data.
//
// Opens via ⌘K / Ctrl-K, or the `cockpit:open-palette` window event dispatched
// by the topbar search affordance. Closes via Escape, backdrop click, or a
// selection.
// ---------------------------------------------------------------------------

type PaletteItem = {
  group: string;
  label: string;
  icon: LucideIcon;
  href: string;
  /** true → href is an on-page anchor (#id): scroll if present, else go to /hq. */
  anchor?: boolean;
  kbd?: string;
};

// Routes are all real, already-shipped pages. Anchors are ids that exist on the
// /hq home (command-center, mission-draft-pending, agenda-panel, ledger-activity,
// ceo-brief, operator-snapshot).
const ITEMS: PaletteItem[] = [
  { group: "Aller à", label: "HQ", icon: Home, href: "/hq", kbd: "G H" },
  { group: "Aller à", label: "Cockpit", icon: LayoutDashboard, href: "/hq/cockpit", kbd: "G C" },
  { group: "Aller à", label: "Missions", icon: ListChecks, href: "/hq/missions", kbd: "G M" },
  { group: "Aller à", label: "Agents", icon: Bot, href: "/hq/agents", kbd: "G A" },
  { group: "Aller à", label: "Skills", icon: Sparkles, href: "/hq/skills", kbd: "G S" },
  { group: "Aller à", label: "Runtime · verrouillé", icon: CircleDot, href: "/hq/runtime" },
  { group: "Aller à", label: "Ventures", icon: Building2, href: "/hq/ventures", kbd: "G V" },
  { group: "Aller à", label: "Documents", icon: FileText, href: "/dashboard/documents" },
  { group: "Sur cette page", label: "Parler à Joris", icon: MessageSquare, href: "#command-center", anchor: true },
  { group: "Sur cette page", label: "File d'approbation", icon: CheckCheck, href: "#mission-draft-pending", anchor: true },
  { group: "Sur cette page", label: "Agenda du jour", icon: CalendarCheck, href: "#agenda-panel", anchor: true },
  { group: "Sur cette page", label: "Décisions · Ledger", icon: ScrollText, href: "#ledger-activity", anchor: true },
  { group: "Sur cette page", label: "CEO Brief", icon: Sparkles, href: "#ceo-brief", anchor: true },
  { group: "Sur cette page", label: "Aperçu opérateur", icon: ShieldCheck, href: "#operator-snapshot", anchor: true },
];

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ITEMS;
    return ITEMS.filter((it) => `${it.label} ${it.group}`.toLowerCase().includes(q));
  }, [query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setIndex(0);
  }, []);

  const openPalette = useCallback(() => {
    setQuery("");
    setIndex(0);
    setOpen(true);
  }, []);

  const run = useCallback(
    (item: PaletteItem) => {
      close();
      if (item.anchor) {
        const el = typeof document !== "undefined" ? document.querySelector(item.href) : null;
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        } else {
          // The anchor lives on the /hq home — route there carrying the hash.
          router.push(`/hq${item.href}` as Route);
        }
      } else {
        router.push(item.href as Route);
      }
    },
    [router, close],
  );

  // Open from the topbar search affordance.
  useEffect(() => {
    window.addEventListener("cockpit:open-palette", openPalette);
    return () => window.removeEventListener("cockpit:open-palette", openPalette);
  }, [openPalette]);

  // Keyboard: ⌘K / Ctrl-K toggles; Escape closes; arrows move; Enter selects.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) close();
        else openPalette();
        return;
      }
      if (!open) return;
      if (e.key === "Escape") {
        close();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = results[index];
        if (item) run(item);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, results, index, run, close, openPalette]);

  // Focus the input when the palette opens (DOM side-effect only).
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open]);

  if (!open) return null;

  const groups: { label: string; items: PaletteItem[] }[] = [];
  results.forEach((r) => {
    let g = groups.find((x) => x.label === r.group);
    if (!g) {
      g = { label: r.group, items: [] };
      groups.push(g);
    }
    g.items.push(r);
  });

  return (
    <div
      onMouseDown={() => close()}
      className="fixed inset-0 z-[300] flex items-start justify-center bg-black/60 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Palette de navigation"
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="flex max-h-[70vh] w-[600px] max-w-[92vw] flex-col overflow-hidden rounded-2xl border border-neutral-700 bg-[#161616] shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-neutral-800 px-4 py-3.5">
          <Search className="h-[18px] w-[18px] text-neutral-500" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            placeholder="Naviguer vers une page ou une section…"
            aria-label="Rechercher une page ou une section"
            className="flex-1 bg-transparent text-[15px] text-neutral-100 outline-none placeholder:text-neutral-600"
          />
          <kbd className="rounded border border-neutral-700 bg-neutral-900 px-1.5 py-0.5 font-mono text-[10.5px] text-neutral-500">
            esc
          </kbd>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {results.length === 0 ? (
            <div className="px-4 py-7 text-center text-[13px] text-neutral-500">
              Aucun résultat pour « {query} »
            </div>
          ) : (
            groups.map((g) => (
              <div key={g.label} className="mb-1.5">
                <div className="px-2.5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-600">
                  {g.label}
                </div>
                {g.items.map((it) => {
                  const flatIndex = results.indexOf(it);
                  const active = flatIndex === index;
                  const Icon = it.icon;
                  return (
                    <button
                      key={`${it.group}-${it.label}`}
                      type="button"
                      onMouseEnter={() => setIndex(flatIndex)}
                      onClick={() => run(it)}
                      className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition ${
                        active ? "bg-amber-500/15" : "hover:bg-white/[0.04]"
                      }`}
                    >
                      <span
                        className={`grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg border ${
                          active ? "border-amber-500/30 bg-amber-500/15" : "border-neutral-800 bg-neutral-900"
                        }`}
                      >
                        <Icon
                          className={`h-[15px] w-[15px] ${active ? "text-amber-300" : "text-neutral-400"}`}
                          aria-hidden="true"
                        />
                      </span>
                      <span className={`flex-1 text-[13.5px] font-semibold ${active ? "text-neutral-100" : "text-neutral-300"}`}>
                        {it.label}
                      </span>
                      {it.kbd ? (
                        <kbd className="rounded border border-neutral-800 bg-neutral-900 px-1.5 py-0.5 font-mono text-[10px] text-neutral-500">
                          {it.kbd}
                        </kbd>
                      ) : null}
                      {active ? <CornerDownLeft className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" /> : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center gap-4 border-t border-neutral-800 px-4 py-2.5 text-[11px] text-neutral-600">
          <span className="inline-flex items-center gap-1.5">
            <ArrowUp className="h-3 w-3" aria-hidden="true" /> naviguer
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CornerDownLeft className="h-3 w-3" aria-hidden="true" /> ouvrir
          </span>
          <span className="ml-auto inline-flex items-center gap-1.5 text-neutral-500">
            <Sparkles className="h-3 w-3 text-amber-400" aria-hidden="true" /> Navigation seule · aucune exécution
          </span>
        </div>
      </div>
    </div>
  );
}
