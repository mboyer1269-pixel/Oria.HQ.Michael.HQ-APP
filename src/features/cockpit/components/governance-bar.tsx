import { ChevronRight, GitBranch, Lock } from "lucide-react";

// ---------------------------------------------------------------------------
// governance-bar.tsx — compact, read-only governance posture bar for
// CockpitShell. It states the Oria operating DOCTRINE
// (Proposer → Approuver → Journaliser → Exécuter[verrouillé]) — not a live
// pipeline status. No interactivity, no server calls, no mutations, no
// execution affordance, no fabricated health / approval / revenue.
// Presentational only.
// ---------------------------------------------------------------------------

// Doctrine steps (imperatives, not live state). The note is the conservative
// posture for each step. The terminal "Exécuter" step is rendered separately
// as explicitly locked.
const CHAIN = [
  { label: "Proposer", note: "agents" },
  { label: "Approuver", note: "humain requis" },
  { label: "Journaliser", note: "audit obligatoire" },
] as const;

export function GovernanceBar() {
  return (
    <div
      role="note"
      aria-label="Posture de gouvernance, lecture seule"
      className="flex h-10 shrink-0 items-center gap-3 overflow-x-auto border-b border-white/[0.06] bg-[#080b16]/60 px-5 text-[11.5px] backdrop-blur-xl"
    >
      <span className="flex shrink-0 items-center gap-1.5 font-semibold text-[#98a1c4]">
        <GitBranch className="h-3.5 w-3.5 text-violet-400" aria-hidden="true" />
        Gouvernance
      </span>

      {/* Operating doctrine — describes the required sequence, not a live readout. */}
      <span className="flex shrink-0 items-center gap-1">
        {CHAIN.map((step) => (
          <span key={step.label} className="flex items-center gap-1">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#646c8e]" aria-hidden="true" />
              <span className="font-semibold text-[#c9cee4]">{step.label}</span>
              <span className="hidden text-[#646c8e] sm:inline">{step.note}</span>
            </span>
            <ChevronRight className="h-3 w-3 shrink-0 text-[#3a4061]" aria-hidden="true" />
          </span>
        ))}
        {/* Terminal step is explicitly locked — no live execution from here. */}
        <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5">
          <Lock className="h-3 w-3 text-red-300" aria-hidden="true" />
          <span className="font-semibold text-red-200">Exécuter</span>
          <span className="text-red-300/80">verrouillé</span>
        </span>
      </span>

      <span className="ml-auto hidden shrink-0 items-center gap-2 text-[#646c8e] lg:flex">
        Lecture seule · aucune action directe
      </span>
    </div>
  );
}
