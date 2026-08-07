// src/features/cockpit/joris-presence-state.ts
//
// The operational signal shown beside Joris in the cockpit.
//
// Four states, every one of them derived from real events — never decorative,
// never optimistic by default:
//
//   calm   → today's direction exists; there is a plan.
//   pulse  → ideas captured, no direction yet today.
//   watch  → nothing captured, or the newest idea has sat untouched past the
//            staleness threshold.
//   alert  → the events could not be read at all.
//
// This lives apart from the component for one reason: a signal that reports
// "calm" when it should report "watch" is worse than no signal, and logic
// sealed inside a .tsx cannot be tested. The clock is injected for the same
// reason — a 48-hour threshold tested against the real Date.now() is a test
// that passes for two days and then starts lying.
//
// Types are structural so this module stays independent of the events layer:
// IdeaProjection and DailyDirectionProjection satisfy them without being
// imported.

export type JorisPresenceState = "calm" | "pulse" | "watch" | "alert";

export type PresenceSignal = {
  state: JorisPresenceState;
  label: string;
  detail: string;
};

/** Anything carrying a capture timestamp. */
export type PresenceIdea = { recordedAt: string };

/** Anything carrying the event that produced today's direction. */
export type PresenceDirection = { eventId: string };

/** Past this, a captured idea with no direction is no longer merely pending. */
export const STALE_THRESHOLD_MS = 48 * 60 * 60 * 1000;

export type PresenceInput = {
  ideas: readonly PresenceIdea[];
  todayDirection: PresenceDirection | null;
  loadError: boolean;
  /** Injected clock. Callers pass Date.now(); tests pass a fixed instant. */
  nowMs: number;
};

const plural = (count: number, word: string) =>
  `${count} ${word}${count > 1 ? "s" : ""}`;

/**
 * Reads the state of the workspace and names it.
 *
 * Order matters. A read failure outranks everything: if the events could not
 * be loaded, no other conclusion is available, and reporting "calm" from an
 * empty array would invent good news out of a broken query.
 */
export function derivePresenceState(input: PresenceInput): PresenceSignal {
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
    const newest = input.ideas.reduce((acc, idea) =>
      idea.recordedAt > acc.recordedAt ? idea : acc,
    );

    // An unparseable timestamp must not read as "brand new". NaN comparisons
    // are false, so an un-guarded subtraction would silently report "pulse".
    const recordedMs = new Date(newest.recordedAt).getTime();
    const unreadable = Number.isNaN(recordedMs);

    if (unreadable || input.nowMs - recordedMs > STALE_THRESHOLD_MS) {
      return {
        state: "watch",
        label: "Attention",
        detail: unreadable
          ? `${plural(input.ideas.length, "idée")} en attente, date de capture illisible.`
          : `${plural(input.ideas.length, "idée")} non traitée${input.ideas.length > 1 ? "s" : ""} depuis plus de 48h.`,
      };
    }

    return {
      state: "pulse",
      label: "Idées en attente",
      detail: `${plural(input.ideas.length, "idée")} capturée${input.ideas.length > 1 ? "s" : ""} — direction pas encore générée.`,
    };
  }

  return {
    state: "watch",
    label: "En attente",
    detail: "Aucun event capturé. Démarre avec une première idée.",
  };
}
