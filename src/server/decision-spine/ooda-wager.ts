// src/server/decision-spine/ooda-wager.ts
//
// PR-A — OodaWager type foundation (pure, deterministic).
//
// A wager makes a decision legible as an explicit bet: what we believe
// (falsifiable hypothesis), what we stake (bounded max loss), how we know we
// were wrong (kill criteria), and what actually happened (settlement with
// evidence). It complements NextBestAction — the spine answers "what next?",
// the wager answers "what did that decision risk, and did it pay?".
//
// OODA framing: observe → orient → decide → act. This module is the DECIDE
// substrate only: types + pure guards. No engine, no UI, no Sentinelle packet —
// those are later PRs (Sentinelle REQUIRE_APPROVAL packet, UI wager review).
//
// Hard boundaries (same doctrine as next-best-action.ts):
//   * PURE: no filesystem, no network, no Date.now()/argless new Date().
//     Every timestamp is injected by the caller.
//   * SUGGESTION-ONLY: nothing here executes, persists, or mutates anything.
//   * NO POLICY VALUES: concrete limits (how much may be staked, how many
//     wagers may run concurrently) belong to the "Personal Operating Lines"
//     ADR, authored by the CEO. Until such a line exists, callers pass
//     `line: null` (or a zeroTrustLine()) and every wager routes to a CEO
//     click. Ambiguity closes the gate, never opens it.
//   * COMPOSITION RULE (same as autonomy-tier.ts): this gate only downgrades.
//     "within_line" is NOT permission to act — Sentinelle and the autonomy
//     gates still stand between a wager and any live effect.
//
// FAIL-SAFE DOCTRINE:
//   No operating line          → requires_ceo_click (never silently allowed)
//   Irreversible wager         → requires_ceo_click at best; blocked when the
//                                line does not even allow proposing it
//   No kill criteria           → blocked (a bet you cannot lose is not a wager)
//   Malformed confidence/stake → blocked (garbage never advances)
//   Unknown status transition  → refused

// ---------------------------------------------------------------------------
// OODA loop
// ---------------------------------------------------------------------------

export type OodaStage = "observe" | "orient" | "decide" | "act";

/** Canonical loop order. Wagers are a DECIDE artifact. */
export const OODA_STAGE_ORDER: readonly OodaStage[] = [
  "observe",
  "orient",
  "decide",
  "act",
];

/**
 * True only for a strict forward step in the loop (observe→orient→decide→act).
 * Restarting the loop (act→observe) is a NEW loop iteration, not a transition
 * of the same pass — callers model that as a fresh cycle.
 */
export function isForwardOodaTransition(from: OodaStage, to: OodaStage): boolean {
  const fromIdx = OODA_STAGE_ORDER.indexOf(from);
  const toIdx = OODA_STAGE_ORDER.indexOf(to);
  if (fromIdx === -1 || toIdx === -1) return false;
  return toIdx === fromIdx + 1;
}

// ---------------------------------------------------------------------------
// Wager (the DECIDE artifact)
// ---------------------------------------------------------------------------

export type WagerStakeKind = "money" | "time" | "reputation" | "opportunity";

/** What is put at risk. `amount` is the bounded MAX LOSS, never "roughly". */
export type WagerStake = {
  kind: WagerStakeKind;
  /** Max loss if the wager fails, in `unit`. Finite and >= 0. */
  amount: number;
  /** "CAD", "hours", "sends", ... — must match the governing line's unit. */
  unit: string;
};

export type WagerReversibility = "reversible" | "recoverable" | "irreversible";

/** Measurable falsification condition. A wager without one is not a wager. */
export type WagerKillCriterion = {
  /** The metric watched, e.g. "loi96 replies received". */
  metric: string;
  /** The losing condition, e.g. "= 0". */
  threshold: string;
  /** ISO date by which the criterion MUST be evaluated. */
  reviewBy: string;
};

export type WagerStatus =
  | "draft"
  | "proposed"
  | "approved"
  | "rejected"
  | "active"
  | "settled"
  | "void";

export type WagerOutcome = "won" | "lost" | "void";

export type WagerSettlement = {
  outcome: WagerOutcome;
  /** Injected ISO timestamp — never read from a clock here. */
  settledAt: string;
  /** What actually happened, citing facts. Required: no silent settlements. */
  evidence: string;
};

export type OodaWager = {
  /** Stable id `wager:${slug}` — deterministic, never random or time-based. */
  id: string;
  /** Falsifiable claim, e.g. "10 relances loi96 → ≥1 booked call in 14d". */
  hypothesis: string;
  stake: WagerStake;
  /** Estimated probability of winning, in [0, 1]. */
  confidence: number;
  /** What winning yields, human-readable. Payoff is not modeled numerically. */
  upside: string;
  reversibility: WagerReversibility;
  killCriteria: readonly WagerKillCriterion[];
  status: WagerStatus;
  /** Injected ISO timestamp. */
  createdAt: string;
  settlement: WagerSettlement | null;
  /** Optional provenance link to the NextBestAction id that spawned it. */
  sourceActionId?: string;
};

const WAGER_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/** Builds the stable id `wager:${slug}`. Throws on a non-deterministic slug. */
export function makeWagerId(slug: string): string {
  if (!WAGER_SLUG_PATTERN.test(slug)) {
    throw new TypeError(
      `Invalid wager slug "${slug}" — expected lowercase [a-z0-9-], starting alphanumeric.`,
    );
  }
  return `wager:${slug}`;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

const WAGER_TRANSITIONS: Readonly<Record<WagerStatus, readonly WagerStatus[]>> = {
  draft: ["proposed", "void"],
  proposed: ["approved", "rejected", "void"],
  approved: ["active", "void"],
  rejected: [],
  active: ["settled", "void"],
  settled: [],
  void: [],
};

/** Pure transition guard. Unknown statuses never transition (fail-safe). */
export function canTransitionWager(from: WagerStatus, to: WagerStatus): boolean {
  const allowed = WAGER_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

export type WagerSettleResult =
  | { ok: true; wager: OodaWager }
  | { ok: false; reason: "illegal_transition" | "missing_evidence" };

/**
 * Pure settlement: returns a NEW wager, never mutates. Only an `active` wager
 * settles, and only with non-empty evidence.
 */
export function settleWager(
  wager: OodaWager,
  settlement: WagerSettlement,
): WagerSettleResult {
  if (!canTransitionWager(wager.status, "settled")) {
    return { ok: false, reason: "illegal_transition" };
  }
  if (settlement.evidence.trim().length === 0) {
    return { ok: false, reason: "missing_evidence" };
  }
  return {
    ok: true,
    wager: { ...wager, status: "settled", settlement },
  };
}

// ---------------------------------------------------------------------------
// Personal Operating Lines (shape only — values come from the CEO's ADR)
// ---------------------------------------------------------------------------

/**
 * One CEO-authored limit inside which wagers of a given stake kind may flow
 * without a per-wager click. This module ships the SHAPE and a zero-trust
 * factory only; concrete lines are defined by the Personal Operating Lines
 * ADR and supplied by callers.
 */
export type PersonalOperatingLine = {
  /** Stable id `line:${slug}`. */
  id: string;
  /** The single stake kind this line governs — no blending across kinds. */
  stakeKind: WagerStakeKind;
  /** Unit the limits are expressed in; must match the wager's stake unit. */
  unit: string;
  /** Max amount one wager may stake under this line. */
  maxStakePerWager: number;
  /** Max wagers simultaneously `active` under this line. */
  maxConcurrentActive: number;
  /**
   * Whether irreversible wagers may even be proposed under this line. This
   * layer still routes EVERY irreversible wager to a CEO click regardless.
   */
  allowIrreversible: boolean;
};

/** The only line this foundation ships: everything routes to the CEO. */
export function zeroTrustLine(
  stakeKind: WagerStakeKind,
  unit: string,
): PersonalOperatingLine {
  return {
    id: "line:zero-trust",
    stakeKind,
    unit,
    maxStakePerWager: 0,
    maxConcurrentActive: 0,
    allowIrreversible: false,
  };
}

// ---------------------------------------------------------------------------
// Gate (pure evaluation of a wager against a line)
// ---------------------------------------------------------------------------

export type WagerGateOutcome = "within_line" | "requires_ceo_click" | "blocked";

export type WagerGateReason =
  | "invalid_confidence"
  | "invalid_stake"
  | "no_kill_criteria"
  | "irreversible_blocked_by_line"
  | "irreversible_requires_ceo"
  | "no_operating_line"
  | "stake_kind_mismatch"
  | "stake_unit_mismatch"
  | "stake_over_line"
  | "concurrency_over_line"
  | "within_line";

export type WagerGateDecision = {
  outcome: WagerGateOutcome;
  reason: WagerGateReason;
  /** One human-readable line for the ledger / review UI. */
  detail: string;
};

export type WagerGateContext = {
  /** Wagers currently `active` under the SAME line (caller-supplied). */
  activeWagerCount: number;
};

/**
 * Pure, ordered gate. Fail-safe first, then line limits, then within_line.
 * "within_line" is NOT permission to act — Sentinelle and the autonomy gates
 * still stand between any wager and a live effect.
 */
export function evaluateWagerAgainstLine(
  wager: OodaWager,
  line: PersonalOperatingLine | null,
  ctx: WagerGateContext,
): WagerGateDecision {
  if (!Number.isFinite(wager.confidence) || wager.confidence < 0 || wager.confidence > 1) {
    return {
      outcome: "blocked",
      reason: "invalid_confidence",
      detail: `Confidence ${String(wager.confidence)} is outside [0, 1]; a malformed wager never advances.`,
    };
  }
  if (!Number.isFinite(wager.stake.amount) || wager.stake.amount < 0) {
    return {
      outcome: "blocked",
      reason: "invalid_stake",
      detail: `Stake amount ${String(wager.stake.amount)} is not a finite max loss.`,
    };
  }
  if (wager.killCriteria.length === 0) {
    return {
      outcome: "blocked",
      reason: "no_kill_criteria",
      detail: "No falsification condition: a bet you cannot lose is not a wager.",
    };
  }
  if (wager.reversibility === "irreversible") {
    if (!line || !line.allowIrreversible) {
      return {
        outcome: "blocked",
        reason: "irreversible_blocked_by_line",
        detail: "Irreversible wager with no line that allows proposing it.",
      };
    }
    return {
      outcome: "requires_ceo_click",
      reason: "irreversible_requires_ceo",
      detail: "Irreversible wagers always route to a CEO click; no line overrides this.",
    };
  }
  if (!line) {
    return {
      outcome: "requires_ceo_click",
      reason: "no_operating_line",
      detail: "No Personal Operating Line supplied; ambiguity routes to the CEO.",
    };
  }
  if (line.stakeKind !== wager.stake.kind) {
    return {
      outcome: "requires_ceo_click",
      reason: "stake_kind_mismatch",
      detail: `Line governs "${line.stakeKind}" but the wager stakes "${wager.stake.kind}".`,
    };
  }
  if (line.unit !== wager.stake.unit) {
    return {
      outcome: "requires_ceo_click",
      reason: "stake_unit_mismatch",
      detail: `Line unit "${line.unit}" does not match stake unit "${wager.stake.unit}".`,
    };
  }
  if (wager.stake.amount > line.maxStakePerWager) {
    return {
      outcome: "requires_ceo_click",
      reason: "stake_over_line",
      detail: `Stake ${wager.stake.amount} ${wager.stake.unit} exceeds the line's ${line.maxStakePerWager} ${line.unit} per wager.`,
    };
  }
  if (ctx.activeWagerCount >= line.maxConcurrentActive) {
    return {
      outcome: "requires_ceo_click",
      reason: "concurrency_over_line",
      detail: `${ctx.activeWagerCount} active wagers meet or exceed the line's cap of ${line.maxConcurrentActive}.`,
    };
  }
  return {
    outcome: "within_line",
    reason: "within_line",
    detail: "Within the operating line. Sentinelle and autonomy gates still apply before any act.",
  };
}

// ---------------------------------------------------------------------------
// Provenance (in-memory record — NOT an EventRecord, never persisted here)
// ---------------------------------------------------------------------------

export type WagerEventType =
  | "wager.proposed"
  | "wager.approved"
  | "wager.rejected"
  | "wager.activated"
  | "wager.settled"
  | "wager.voided";

export type WagerEvent = {
  wagerId: string;
  type: WagerEventType;
  /** Injected ISO timestamp. */
  at: string;
  detail: string;
};

/** Pure constructor mirroring buildDecisionEvent — provenance only. */
export function buildWagerEvent(
  wagerId: string,
  type: WagerEventType,
  at: string,
  detail: string,
): WagerEvent {
  return { wagerId, type, at, detail };
}
