"use client";

import { useEffect, useRef, useState } from "react";
import {
  Banknote,
  Bot,
  Cloud,
  Database,
  Lock,
  type LucideIcon,
  ScrollText,
  ShieldCheck,
} from "lucide-react";

// ---------------------------------------------------------------------------
// system-popover.tsx — read-only "Posture système" popover for CockpitTopbar.
//
// Honest, static posture only. No server calls, no mutations, no live health,
// no fabricated success / revenue / approvals. Every line states a conservative
// posture (verrouillé / encadré / lecture seule / partiel / inconnu). This is a
// declared posture, NOT a live readout — the detailed read-model stays on the
// HQ Operator snapshot. Client UI only.
// ---------------------------------------------------------------------------

type Posture = "locked" | "guarded" | "read-only" | "partial" | "unknown";

const PILL: Record<Posture, { label: string; cls: string }> = {
  locked: { label: "verrouillé", cls: "border-red-500/30 bg-red-500/10 text-red-300" },
  guarded: { label: "encadré", cls: "border-amber-500/30 bg-amber-500/10 text-amber-300" },
  "read-only": { label: "lecture seule", cls: "border-white/15 bg-white/[0.05] text-neutral-300" },
  partial: { label: "partiel", cls: "border-orange-500/30 bg-orange-500/10 text-orange-300" },
  unknown: { label: "inconnu", cls: "border-white/10 bg-white/[0.03] text-neutral-500" },
};

type Item = { id: string; icon: LucideIcon; label: string; note: string; posture: Posture };

// Static, conservative posture. No value here is derived from a live probe; it
// describes the governance stance, not a health check.
const ITEMS: Item[] = [
  { id: "runtime", icon: Lock, label: "Runtime agentique", note: "Exécution verrouillée · approbation requise", posture: "locked" },
  { id: "actions", icon: Bot, label: "Actions", note: "Proposition seulement · aucune exécution directe", posture: "guarded" },
  { id: "ledger", icon: ScrollText, label: "Ledger", note: "Journal d'audit visible · écritures contrôlées", posture: "read-only" },
  { id: "finance", icon: Banknote, label: "Données financières", note: "Sources réelles seulement · aucun chiffre simulé", posture: "read-only" },
  { id: "supabase", icon: Database, label: "Supabase", note: "État session · non attesté ici", posture: "partial" },
  { id: "deploy", icon: Cloud, label: "Déploiement", note: "Non attesté dans cette vue", posture: "unknown" },
];

export function SystemPopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Posture système (lecture seule)"
        className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition ${
          open
            ? "border-white/20 bg-[#141a2c]/80 text-[#eff1fb]"
            : "border-white/10 bg-[#141a2c]/60 text-[#98a1c4] hover:border-white/20 hover:text-[#eff1fb]"
        }`}
      >
        <ShieldCheck className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
        <span className="hidden md:inline">Système</span>
        {/* Amber (not green): signals a controlled/locked posture, not "healthy". */}
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden="true" />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Posture système"
          className="absolute right-0 top-11 z-50 w-[300px] max-w-[88vw] rounded-xl border border-neutral-700 bg-[#161616] p-2.5 shadow-2xl"
        >
          <div className="px-1.5 pb-2 pt-1">
            <div className="text-[12.5px] font-bold text-neutral-100">Posture système</div>
            <div className="mt-0.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-amber-300/90">
              Lecture seule · aucune exécution
            </div>
          </div>

          <ul className="space-y-0.5">
            {ITEMS.map((it) => {
              const Icon = it.icon;
              const pill = PILL[it.posture];
              return (
                <li key={it.id} className="flex items-start gap-2.5 rounded-lg px-1.5 py-1.5">
                  <Icon className="mt-0.5 h-[15px] w-[15px] shrink-0 text-neutral-400" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] font-semibold text-neutral-100">{it.label}</span>
                      <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${pill.cls}`}>
                        {pill.label}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[10.5px] leading-snug text-neutral-500">{it.note}</p>
                  </div>
                </li>
              );
            })}
          </ul>

          <p className="mt-1.5 border-t border-neutral-800 px-1.5 pt-2 text-[10px] leading-relaxed text-neutral-600">
            Posture déclarée, pas un relevé live. Le statut détaillé reste sur la page HQ (Aperçu opérateur).
          </p>
        </div>
      ) : null}
    </div>
  );
}
