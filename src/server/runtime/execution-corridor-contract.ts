// src/server/runtime/execution-corridor-contract.ts
//
// THE single execution-corridor contract: one object joining agentId, skillId,
// actionId, the agent's execution licence, and the outbound webhook binding.
//
// Why this module exists
// ----------------------
// Those five facts used to live in four places that never had to agree:
// the webhook registry declared hermes/task.create, the licence listed
// task.create as a green action, the skills catalog had no such skill, and the
// cockpit announced the corridor as "the only active one". Nothing checked
// them against each other, so a corridor that the Sentinelle blocks on every
// request was displayed as live for months.
//
// The reachability verdict here is NOT recomputed. It is delegated to the same
// evaluateLiveExecution() the API routes call, because a second implementation
// of the gate is a second thing that can be wrong. This module joins facts and
// classifies the verdict; it never decides one.
//
// Pure: registries, the guard and the environment all arrive as parameters.
// execution-corridors.ts binds the real ones.

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
  /** Never carries the URL itself — the cockpit renders this. */
  configuration: string;
};

/**
 * What an operator can conclude about a corridor right now.
 *
 *   eligible        — the Sentinelle would accept an intent AND the destination
 *                     is configured. Still requires CEO approval to dispatch.
 *   not_configured  — the gate would accept it, but no usable destination.
 *   blocked         — the Sentinelle refuses it. Nothing to configure.
 */
export type CorridorStatus = "eligible" | "not_configured" | "blocked";

export type ExecutionCorridor = {
  /** Stable id: `${agentId}/${skillId}`. */
  id: string;
  agentId: string;
  skillId: string;
  actionId: string;
  status: CorridorStatus;
  /** Verbatim from the guard — never paraphrased, never softened. */
  guard: CorridorGuardVerdict;
  licence: CorridorLicenceFacts | null;
  webhook: CorridorWebhookFacts;
  /**
   * Approval is not a corridor property that can be turned off. The literal
   * type is the guarantee: no corridor can be declared self-dispatching.
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
  /** The REAL Sentinelle gate. Never a reimplementation of it. */
  evaluate: (input: {
    agentId: string;
    skillId: string;
    actionId: string;
    autonomyLevel: number;
  }) => CorridorGuardVerdict;
  /** Licence facts for an agent, or null when the agent has no licence. */
  licenceOf: (agentId: string) => CorridorLicenceFacts | null;
  /** Destination configuration state for a binding. */
  webhookConfigurationOf: (binding: CorridorBindingInput) => string;
};

/**
 * The level a corridor is evaluated at. 2 is the green-zone ceiling and the
 * default the intent route uses, so the contract reports what an operator
 * would actually get from the default request — not a best case.
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

  const configuration = deps.webhookConfigurationOf(binding);

  const status: CorridorStatus =
    guard.outcome === "BLOCK"
      ? "blocked"
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

/** Corridors an intent can currently be queued on. */
export function eligibleCorridors(
  corridors: readonly ExecutionCorridor[],
): ExecutionCorridor[] {
  return corridors.filter((corridor) => corridor.status === "eligible");
}

/**
 * Corridors the Sentinelle refuses. These are declared in the registry and
 * unreachable in practice — the exact class of drift this contract exists to
 * surface rather than hide.
 */
export function blockedCorridors(
  corridors: readonly ExecutionCorridor[],
): ExecutionCorridor[] {
  return corridors.filter((corridor) => corridor.status === "blocked");
}
