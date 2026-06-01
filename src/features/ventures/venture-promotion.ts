// src/features/ventures/venture-promotion.ts
//
// Pure helpers for CEO-controlled venture advancement (PR151), layered on the
// existing lifecycle contract (PR145). "Advancement" means moving a venture
// FORWARD one legal step (candidate → scored → … → operating → autonomous/
// scaling). It deliberately excludes paused / killed / archived: those are
// reached through the dedicated archive/kill actions (PR150), never through
// "advance".
//
// Dependency-free except for the pure lifecycle guard — safe to import from both
// client and server.

import { canPromoteVenture } from "./lifecycle";
import type { VentureDecision, VentureLifecycleStatus } from "./types";

/** Forward statuses a venture may be advanced INTO (ordered along the ladder). */
export const ADVANCEMENT_TARGET_STATUSES: readonly VentureLifecycleStatus[] = [
  "candidate",
  "scored",
  "shortlisted",
  "approved_for_validation",
  "validating",
  "operating",
  "autonomous",
  "scaling",
];

const ADVANCEMENT_TARGET_SET: ReadonlySet<VentureLifecycleStatus> = new Set(
  ADVANCEMENT_TARGET_STATUSES,
);

export const VENTURE_STATUS_LABELS: Record<VentureLifecycleStatus, string> = {
  discovered: "Découverte",
  candidate: "Candidat",
  scored: "Scoré",
  shortlisted: "Shortlisté",
  approved_for_validation: "Validation approuvée",
  validating: "En validation",
  operating: "En opération",
  autonomous: "Autonome",
  scaling: "Scaling",
  paused: "En pause",
  killed: "Tuée",
  archived: "Archivée",
};

/**
 * True when `target` is a legal FORWARD advancement from `current`. Wraps the
 * lifecycle guard and additionally restricts to advancement targets (so a
 * "promote" can never quietly become a pause/kill/archive).
 */
export function isAdvancementTarget(
  current: VentureLifecycleStatus,
  target: VentureLifecycleStatus,
): boolean {
  return (
    target !== current &&
    ADVANCEMENT_TARGET_SET.has(target) &&
    canPromoteVenture(current, target)
  );
}

/** The legal forward advancement targets from a given status (possibly empty). */
export function getPromotableTargets(
  current: VentureLifecycleStatus,
): VentureLifecycleStatus[] {
  return ADVANCEMENT_TARGET_STATUSES.filter((target) => isAdvancementTarget(current, target));
}

/**
 * The audit decision type to record for an advancement. Scaling is a `scale`
 * decision; reaching full autonomy is an `increase_autonomy` decision; every
 * other forward step is a plain `promote`.
 */
export function advancementDecisionType(
  target: VentureLifecycleStatus,
): Extract<VentureDecision["type"], "promote" | "scale" | "increase_autonomy"> {
  if (target === "scaling") return "scale";
  if (target === "autonomous") return "increase_autonomy";
  return "promote";
}
