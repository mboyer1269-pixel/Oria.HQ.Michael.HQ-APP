// src/features/cockpit/components/joris-presence.tsx
//
// Joris Presence — système de signal opérationnel visible.
//
// Quatre états dérivés de données réelles uniquement :
//   calm   → direction du jour générée, aucun problème détecté.
//   pulse  → idées capturées mais pas encore de direction pour aujourd'hui.
//   watch  → aucune activité récente (aucune idée ni direction depuis >48h).
//   alert  → erreur de chargement ou état impossible à résoudre.
//
// Pas d'avatar, pas d'animation décorative, pas de fiction.
// L'état doit refléter une condition réelle et vérifiable.

import type { DailyDirectionProjection } from "@/features/cockpit/events/daily-direction-projection";
import type { IdeaProjection } from "@/features/cockpit/events/idea-projection";

// ---------------------------------------------------------------------------
// State derivation
// ---------------------------------------------------------------------------

export type JorisPresenceState = "calm" | "pulse" | "watch" | "alert";

const STALE_THRESHOLD_MS = 48 * 60 * 60 * 1000; // 48 hours

function derivePresenceState(input: {
  ideas: IdeaProjection[];
  todayDirection: DailyDirectionProjection | null;
  loadError: boolean;
  todayIso: string;
}): { state: JorisPresenceState; label: string; detail: string } {
  if (input.loadError) {
    return {
      state: "alert",
      label: "Alerte",
      detail: "Lecture des events impossible. Vérifier la connexion Supabase.",
    };
  }

  if (input.todayDirection) {
    return {
      state: "calm",
      label: "Direction active",
      detail: `Plan du jour généré · event ${input.todayDirection.eventId.slice(0, 8)}`,
    };
  }

  if (input.ideas.length > 0) {
    // Check if the most recent idea is older than 48h (stale without direction)
    const mostRecentIdea = input.ideas.reduce((acc, idea) =>
      idea.recordedAt > acc.recordedAt ? idea : acc,
    );

    const ageMs = Date.now() - new Date(mostRecentIdea.recordedAt).getTime();
    if (ageMs > STALE_THRESHOLD_MS) {
      return {
        state: "watch",
        label: "Attention",
        detail: `${input.ideas.length} idée${input.ideas.length > 1 ? "s" : ""} non traitée${input.ideas.length > 1 ? "s" : ""} depuis plus de 48h.`,
      };
    }

    return {
      state: "pulse",
      label: "Ideas en attente",
      detail: `${input.ideas.length} idée${input.ideas.length > 1 ? "s" : ""} capturée${input.ideas.length > 1 ? "s" : ""} — direction pas encore générée.`,
    };
  }

  // Zero state — nothing captured, nothing generated.
  return {
    state: "watch",
    label: "En attente",
    detail: "Aucun event capturé. Démarre avec une première idée.",
  };
}

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
  todayIso,
}: {
  ideas: IdeaProjection[];
  todayDirection: DailyDirectionProjection | null;
  loadError: boolean;
  todayIso: string;
}) {
  const { state, label, detail } = derivePresenceState({
    ideas,
    todayDirection,
    loadError,
    todayIso,
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
