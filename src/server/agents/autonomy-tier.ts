// src/server/agents/autonomy-tier.ts
//
// Autonomy Tier — General execution gate (PR-B)
//
// canExecuteAutonomously() is the FIRST gate in the two-gate composition model.
// It answers one question and one only: does THIS AGENT, given its licence and
// the requested autonomy level, have the right to act on this class of action?
//
// It knows nothing about corridors (outbound, payments, publishing).
// It knows nothing about batch content, suppression lists, or consent bases.
// Those are questions for the corridor gates (canExecuteOutboundAction, etc.).
//
// COMPOSITION RULE (graved here, enforced by the orchestration layer):
//   An action executes if and only if BOTH gates say yes.
//   General gate first → if blocked, corridor is NEVER consulted.
//   Corridor gate ONLY downgrades or blocks — it NEVER promotes.
//   If general says "supervised", corridor cannot say "full_autonomous".
//
// NON-COMPOSABILITY SCOPE BOUNDARY:
//   This function evaluates a SINGLE action in isolation.
//   It cannot see a sequence of actions. An agent chaining multiple green
//   actions to produce a cumulative red effect is NOT caught here.
//   Sequence-level composability (cumulative effect guard) lives in the
//   AutonomySequenceGuard — PR-C. The optional `sequenceContext` parameter
//   provides a hook for that layer but does NOT make this function composable
//   by itself: callers must supply the aggregate context.
//   This scope boundary is intentional and must not be erased by adding
//   sequence logic here without removing this comment.
//
// FAIL-SAFE DOCTRINE:
//   Unknown agent   → blocked (no licence = no permission)
//   Unknown action  → blocked (unlisted ≠ green; unknown = never green)
//   Missing level   → blocked (ambiguity closes the gate, not opens it)
//   Suspended lic.  → blocked (revocation must bite immediately)
//
// See: docs/REVENUE_EXECUTION_LANE.md §Green/Yellow/Red model
// See: agent-execution-license.ts for the licence registry
// See: core/types.ts for AutonomyLevel and ExecutionZone definitions

import type { AutonomyLevel, ExecutionZone } from "../../core/types.ts";
import { getExecutionZonePolicy } from "../../core/types.ts";
import {
  getAgentLicense,
  type AgentExecutionLicense,
} from "./agent-execution-license.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The canonical tier returned by the general gate.
 *
 *   full_autonomous — agent may execute live without human approval.
 *                     Sentinel observes. Ledger mandatory.
 *
 *   supervised      — agent has prepared the action. Human approves
 *                     before dispatch. Sentinel gates.
 *
 *   blocked         — action is unconditionally refused.
 *                     Corridor gate is NEVER consulted.
 */
export type AutonomyTier = "full_autonomous" | "supervised" | "blocked";

/**
 * Stable machine-readable reason for autonomy gate decisions.
 * This complements blockReason, which remains human-readable.
 */
export type AutonomyDecisionReason =
  | "agent_suspended"
  | "requested_level_blocked"
  | "action_policy_blocked"
  | "action_policy_requires_approval"
  | "unknown_action_policy"
  | "unauthorized_action"
  | "allowed_by_policy";

/**
 * Gate identifiers for the clearedBy trace.
 * "general" = this file's gate cleared.
 * "corridor" = a domain-specific gate (outbound, payments…) cleared.
 * The orchestration layer appends "corridor" after the corridor gate passes.
 */
export type AutonomyGate = "general" | "corridor";

/**
 * Optional sequence context for composability awareness.
 * Supplied by the AutonomySequenceGuard (PR-C) — not this module.
 * If absent, the gate evaluates the action in isolation only.
 *
 * @see NON-COMPOSABILITY SCOPE BOUNDARY in file header
 */
export type AutonomySequenceContext = {
  /**
   * Number of actions this agent has dispatched in the current time window.
   * Used to detect burst patterns that individually clear the gate but
   * cumulatively exceed safe operational bounds.
   */
  actionsInWindow: number;
  /**
   * Highest AutonomyLevel of any action in the current sequence.
   * If this reaches 5, the gate blocks — a green chain cannot produce a
   * level-5 cumulative effect without tripping the composability guard.
   */
  cumulativeEffectLevel: AutonomyLevel;
};

/**
 * Full decision record from the general gate.
 *
 * `clearedBy` traces which gates have positively attested this decision.
 * Starts as ["general"] when this gate passes.
 * The orchestration layer appends "corridor" after the corridor gate clears.
 * An empty array means blocked — no gate cleared.
 */
export type AutonomyDecision = {
  tier: AutonomyTier;
  agentId: string;
  actionId: string;
  reasonCode: AutonomyDecisionReason;
  zone: ExecutionZone;
  requiresLedger: boolean;
  requiresSentinel: boolean;
  /** Which gates positively cleared this decision. Empty = blocked. */
  clearedBy: AutonomyGate[];
  /** Human-readable reason. Always present on blocked; present on supervised. */
  blockReason?: string;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function blocked(
  agentId: string,
  actionId: string,
  reasonCode: AutonomyDecisionReason,
  reason: string,
): AutonomyDecision {
  return {
    tier: "blocked",
    agentId,
    actionId,
    reasonCode,
    zone: "red",
    requiresLedger: false,
    requiresSentinel: false,
    clearedBy: [],
    blockReason: reason,
  };
}

function fromZonePolicy(
  agentId: string,
  actionId: string,
  zone: ExecutionZone,
  tier: AutonomyTier,
  reasonCode: AutonomyDecisionReason,
  reason?: string,
): AutonomyDecision {
  const policy = getExecutionZonePolicy(
    zone === "green" ? 1 : zone === "yellow" ? 3 : 0,
  );
  return {
    tier,
    agentId,
    actionId,
    reasonCode,
    zone,
    requiresLedger: policy.requiresLedger,
    requiresSentinel: policy.requiresSentinel,
    clearedBy: ["general"],
    ...(reason ? { blockReason: reason } : {}),
  };
}

// ---------------------------------------------------------------------------
// Public gate
// ---------------------------------------------------------------------------

/**
 * General execution gate — first gate in the two-gate composition model.
 *
 * @param agentId        Agent requesting execution.
 * @param actionId       The specific action being evaluated.
 * @param requestedLevel The autonomy level being requested (0–5).
 *                       If undefined, the gate returns blocked (fail-safe).
 * @param sequenceContext Optional composability context from AutonomySequenceGuard.
 *                        If absent, action is evaluated in isolation.
 *                        See NON-COMPOSABILITY SCOPE BOUNDARY in file header.
 *
 * @returns AutonomyDecision — never throws.
 *
 * INVARIANTS:
 *   1. No licence for agentId         → blocked
 *   2. Licence suspended/revoked      → blocked
 *   3. actionId in hardBlocks         → blocked
 *   4. requestedLevel undefined       → blocked (ambiguity = fail-safe)
 *   5. requestedLevel 0 or 5          → blocked (red boundary)
 *   6. actionId unknown (unlisted)    → blocked (unknown ≠ green)
 *   7. sequenceContext.cumulativeEffectLevel === 5 → blocked
 *   8. actionId in greenActions AND requestedLevel ≤ 2 → full_autonomous
 *   9. actionId in yellowActions      → supervised (never full_autonomous)
 *   10. requestedLevel > licence's safe ceiling for action → supervised
 */
export function canExecuteAutonomously(
  agentId: string,
  actionId: string,
  requestedLevel?: AutonomyLevel,
  sequenceContext?: AutonomySequenceContext,
): AutonomyDecision {
  // INVARIANT 1 — No licence
  const license: AgentExecutionLicense | undefined = getAgentLicense(agentId);
  if (!license) {
    return blocked(agentId, actionId, "unauthorized_action",
      `No execution licence registered for agent '${agentId}' — blocked by policy`);
  }

  // INVARIANT 2 — Suspended/revoked licence
  if (license.suspended === true) {
    return blocked(agentId, actionId, "agent_suspended",
      `Execution licence for agent '${agentId}' is suspended — blocked until reinstated`);
  }

  // INVARIANT 3 — Hard block (unconditional, checked before any zone logic)
  if (license.hardBlocks.includes(actionId)) {
    return blocked(agentId, actionId, "action_policy_blocked",
      `Action '${actionId}' is hard-blocked for agent '${agentId}' — no override possible`);
  }

  // INVARIANT 4 — Missing autonomy level (ambiguity closes the gate)
  if (requestedLevel === undefined) {
    return blocked(agentId, actionId, "requested_level_blocked",
      `Requested autonomy level is undefined — fail-safe: blocked (unknown level is never green)`);
  }

  // INVARIANT 5 — Red autonomy boundary. Must run before yellow routing:
  // level 5 is never "supervised"; it is blocked.
  if (requestedLevel === 0 || requestedLevel === 5) {
    return blocked(agentId, actionId, "requested_level_blocked",
      `Requested level ${requestedLevel} maps to red zone — blocked unconditionally`);
  }

  // INVARIANT 6 — Unknown action (not explicitly listed in green or yellow)
  const isExplicitlyGreen  = license.greenActions.includes(actionId);
  const isExplicitlyYellow = license.yellowActions.includes(actionId);
  const isKnown = isExplicitlyGreen || isExplicitlyYellow;

  if (!isKnown) {
    return blocked(agentId, actionId, "unknown_action_policy",
      `Action '${actionId}' is not listed in any zone for agent '${agentId}' — unknown actions are never green`);
  }

  // INVARIANT 7 — Composability guard (sequence cumulative effect)
  if (sequenceContext && sequenceContext.cumulativeEffectLevel >= 5) {
    return blocked(agentId, actionId, "action_policy_blocked",
      `Sequence cumulativeEffectLevel reached 5 — the action chain has hit a red threshold. ` +
      `canExecuteAutonomously() evaluates actions in isolation; this block comes from the ` +
      `AutonomySequenceGuard (PR-C) via sequenceContext. Composability is NOT guaranteed ` +
      `by this function alone.`);
  }

  // INVARIANT 9 — Yellow zone (approval required, corridor cannot promote to green)
  if (isExplicitlyYellow) {
    return fromZonePolicy(agentId, actionId, "yellow", "supervised", "action_policy_requires_approval",
      `Action '${actionId}' is in the yellow zone for agent '${agentId}' — human approval required`);
  }

  // INVARIANT 8 — Green zone, level check
  // requestedLevel must be ≤ 2 (green zone ceiling) to stay full_autonomous.
  // Level 3–4 in a green-listed action → supervised (downgrade, not block).
  if (requestedLevel <= 2) {
    // INVARIANT 8 — full_autonomous
    return fromZonePolicy(agentId, actionId, "green", "full_autonomous", "allowed_by_policy");
  }

  // Level 3 or 4 in a green-listed action → downgrade to supervised
  // (high autonomy level requested for a green action = escalate to yellow treatment)
  return fromZonePolicy(agentId, actionId, "yellow", "supervised", "action_policy_requires_approval",
    `Requested level ${requestedLevel} exceeds the green zone ceiling (2) ` +
    `for action '${actionId}' — downgraded to supervised`);
}
