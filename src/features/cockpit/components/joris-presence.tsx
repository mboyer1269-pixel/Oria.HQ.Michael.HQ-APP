// src/features/cockpit/components/joris-presence.tsx
//
// Joris Presence — le voyant opérationnel du cockpit.
//
// Purement présentationnel. Les quatre états et leur dérivation vivent dans
// joris-presence-state.ts, où ils sont testés : un voyant qui annonce « calme »
// alors que rien n'est en main est pire que pas de voyant, et une logique
// scellée dans un .tsx ne se teste pas.
//
// Pas d'avatar, pas d'animation décorative, pas de fiction.

import {
  derivePresenceState,
  type JorisPresenceState,
  type PresenceDirection,
  type PresenceIdea,
} from "@/features/cockpit/joris-presence-state";

// ---------------------------------------------------------------------------
// Visual tokens per state
// ---------------------------------------------------------------------------

const STATE_TOKENS: Record<
  JorisPresenceState,
  { dot: string; badge: string; border: string }
> = {
  calm: {
    dot: "bg-emerald-400",
    badge: "border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-200",
    border: "border-emerald-500/20",
  },
  pulse: {
    dot: "bg-amber-400",
    badge: "border-amber-400/25 bg-amber-400/[0.08] text-amber-200",
    border: "border-amber-500/20",
  },
  watch: {
    dot: "bg-orange-400",
    badge: "border-orange-400/25 bg-orange-400/[0.08] text-orange-200",
    border: "border-orange-500/20",
  },
  alert: {
    dot: "bg-rose-400",
    badge: "border-rose-400/25 bg-rose-400/[0.08] text-rose-200",
    border: "border-rose-500/20",
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function JorisPresence({
  ideas,
  todayDirection,
  loadError,
  nowMs,
}: {
  ideas: readonly PresenceIdea[];
  todayDirection: PresenceDirection | null;
  loadError: boolean;
  /** Read by the caller, not here — a component must not read the clock while
      rendering, and passing it keeps this whole path pure and testable. */
  nowMs: number;
}) {
  const { state, label, detail } = derivePresenceState({
    ideas,
    todayDirection,
    loadError,
    nowMs,
  });

  const tokens = STATE_TOKENS[state];

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border ${tokens.border} bg-[#0d1120]/60 px-4 py-3`}
      role="status"
      aria-label={`Joris Presence: ${label}`}
    >
      {/* Dot signal — no animation, just a real indicator */}
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tokens.dot}`} aria-hidden="true" />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-bold text-[#eff1fb]">Joris</span>
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${tokens.badge}`}
          >
            {label}
          </span>
        </div>
        <p className="mt-0.5 truncate text-[11px] text-[#6f7899]">{detail}</p>
      </div>
    </div>
  );
}
