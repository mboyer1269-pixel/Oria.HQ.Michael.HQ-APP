// src/server/runtime/execution-corridor-contract.ts
//
// The execution-corridor contract: one object joining agentId, skillId,
// actionId, the agent's execution licence, and the outbound webhook binding.
//
// A corridor is eligible only when all three ends agree:
//   1. the Sentinelle would accept an intent on it,
//   2. the deployed receiver accepts that agent+skill route,
//   3. every value the dispatcher requires is configured.
//
// Any one of them missing makes the corridor unusable, and each produces a
// distinct status so an operator can tell a policy refusal from a receiver
// refusal from a configuration gap.
//
// The Sentinelle verdict is delegated to the same evaluateLiveExecution() the
// API routes call rather than recomputed here.
//
// Pure: registries, the guard, the receiver route set and the environment all
// arrive as parameters. execution-corridors.ts binds the real ones.

import type { WebhookConfigurationState } from "@/server/runtime/webhook-registry";

export type CorridorGuardOutcome = "ALLOW" | "REQUIRE_APPROVAL" | "BLOCK";

/** The subset of a SentinelleDecision this contract reads. */
export type CorridorGuardVerdict = {
  outcome: CorridorGuardOutcome;
  reason: string;
  reasonCode: string;
};

/** The subset of an AgentExecutionLicense this contract reads. */
export type CorridorLicenceFacts = {
  label: string;
  suspended: boolean;
  zone: "green" | "yellow" | null;
  hardBlocked: boolean;
};

export type CorridorWebhookFacts = {
  toolName: string;
  destinationEnvKey: string;
  allowedHostnames: readonly string[];
  requiresSignature: boolean;
  timeoutMs: number;
  /** Never carries the URL or any secret — the cockpit renders this. */
  configuration: WebhookConfigurationState;
};

/**
 * What an operator can conclude about a corridor right now.
 *
 *   eligible         — all three ends agree. An intent can be queued; dispatch
 *                      still requires CEO approval.
 *   blocked          — the Sentinelle refuses it. Nothing to configure.
 *   receiver_rejects — Oria would allow it, but the deployed receiver rejects
 *                      the route, so an approved intent fails downstream.
 *   not_configured   — both ends would accept it; dispatch configuration is
 *                      incomplete.
 */
export type CorridorStatus = "eligible" | "blocked" | "receiver_rejects" | "not_configured";

export type ExecutionCorridor = {
  /** Stable id: `${agentId}/${skillId}`. */
  id: string;
  agentId: string;
  skillId: string;
  actionId: string;
  status: CorridorStatus;
  /** Verbatim from the guard. */
  guard: CorridorGuardVerdict;
  /** Whether the deployed receiver accepts this agent+skill route. */
  receiverAccepts: boolean;
  licence: CorridorLicenceFacts | null;
  webhook: CorridorWebhookFacts;
  /**
   * Approval is not a corridor property that can be turned off. The literal
   * type forbids declaring a corridor self-dispatching.
   */
  requiresCeoApproval: true;
  /** The autonomy level the status was computed at. */
  evaluatedAtAutonomyLevel: number;
};

/** Binding shape the resolver needs — structurally satisfied by ApprovedWebhookBinding. */
export type CorridorBindingInput = {
  agentId: string;
  skillId: string;
  actionId: string;
  toolName: string;
  destinationEnvKey: string;
  allowedHostnames: readonly string[];
  requiresSignature: boolean;
  timeoutMs: number;
};

export type ResolveCorridorDeps = {
  /** The Sentinelle gate the API routes call. */
  evaluate: (input: {
    agentId: string;
    skillId: string;
    actionId: string;
    autonomyLevel: number;
  }) => CorridorGuardVerdict;
  /** Licence facts for an agent, or null when the agent has no licence. */
  licenceOf: (agentId: string) => CorridorLicenceFacts | null;
  /** Whether the deployed receiver accepts this agent+skill route. */
  receiverAccepts: (agentId: string, skillId: string) => boolean;
  /** Dispatch configuration state for a binding. */
  webhookConfigurationOf: (binding: CorridorBindingInput) => WebhookConfigurationState;
};

/**
 * The level a corridor is evaluated at. 2 is the green-zone ceiling and the
 * default the intent route uses, so the contract reports what a default request
 * would actually get rather than a best case.
 */
export const CORRIDOR_EVALUATION_AUTONOMY_LEVEL = 2;

export function resolveExecutionCorridor(
  binding: CorridorBindingInput,
  deps: ResolveCorridorDeps,
): ExecutionCorridor {
  const guard = deps.evaluate({
    agentId: binding.agentId,
    skillId: binding.skillId,
    actionId: binding.actionId,
    autonomyLevel: CORRIDOR_EVALUATION_AUTONOMY_LEVEL,
  });

  const receiverAccepts = deps.receiverAccepts(binding.agentId, binding.skillId);
  const configuration = deps.webhookConfigurationOf(binding);

  // Order matters: report the end that refuses FIRST in the chain, so an
  // operator fixes the blocking condition rather than a downstream symptom.
  const status: CorridorStatus =
    guard.outcome === "BLOCK"
      ? "blocked"
      : !receiverAccepts
        ? "receiver_rejects"
        : configuration === "configured"
          ? "eligible"
          : "not_configured";

  return {
    id: `${binding.agentId}/${binding.skillId}`,
    agentId: binding.agentId,
    skillId: binding.skillId,
    actionId: binding.actionId,
    status,
    guard,
    receiverAccepts,
    licence: deps.licenceOf(binding.agentId),
    webhook: {
      toolName: binding.toolName,
      destinationEnvKey: binding.destinationEnvKey,
      allowedHostnames: binding.allowedHostnames,
      requiresSignature: binding.requiresSignature,
      timeoutMs: binding.timeoutMs,
      configuration,
    },
    requiresCeoApproval: true,
    evaluatedAtAutonomyLevel: CORRIDOR_EVALUATION_AUTONOMY_LEVEL,
  };
}

export function resolveExecutionCorridors(
  bindings: readonly CorridorBindingInput[],
  deps: ResolveCorridorDeps,
): ExecutionCorridor[] {
  return bindings.map((binding) => resolveExecutionCorridor(binding, deps));
}

/** Corridors an intent can currently be queued on and completed end to end. */
export function eligibleCorridors(
  corridors: readonly ExecutionCorridor[],
): ExecutionCorridor[] {
  return corridors.filter((corridor) => corridor.status === "eligible");
}

/** Corridors the Sentinelle refuses. */
export function blockedCorridors(
  corridors: readonly ExecutionCorridor[],
): ExecutionCorridor[] {
  return corridors.filter((corridor) => corridor.status === "blocked");
}
