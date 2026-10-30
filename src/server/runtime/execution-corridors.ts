// src/server/runtime/execution-corridors.ts
//
// Binds the corridor contract to the real registries: the approved webhook
// bindings, the agent execution licences, the Sentinelle gate, the deployed
// receiver's accepted routes, and an explicit configuration snapshot.
//
// Every consumer reads corridors from here rather than restating a status.

import { serverEnv } from "@/lib/server-env";

import { evaluateLiveExecution } from "@/server/runtime/execution-guard";
import { getAgentLicense } from "@/server/agents/agent-execution-license";
import {
  findApprovedWebhookBinding,
  isReceiverAcceptedRoute,
  listApprovedWebhookBindings,
  resolveWebhookConfigurationState,
} from "@/server/runtime/webhook-registry";
import {
  resolveExecutionCorridor,
  type CorridorBindingInput,
  type CorridorLicenceFacts,
  type ExecutionCorridor,
  type ResolveCorridorDeps,
} from "@/server/runtime/execution-corridor-contract";

export type {
  CorridorStatus,
  ExecutionCorridor,
} from "@/server/runtime/execution-corridor-contract";

const webhookSnapshot = Object.freeze({
  N8N_WEBHOOK_URL: serverEnv.n8nWebhookUrl,
  N8N_SECRET: serverEnv.n8nSecret,
  AGENT_WEBHOOK_SIGNING_SECRET: serverEnv.agentWebhookSigningSecret,
});

/**
 * Licence facts read for the ACTION, not the skill — which is why the binding
 * carries actionId separately. A licence zoning `spec.draft.create` says nothing
 * about a skill named `spec.draft`.
 */
function licenceFacts(agentId: string, actionId: string): CorridorLicenceFacts | null {
  const licence = getAgentLicense(agentId);
  if (!licence) return null;
  return {
    label: licence.label,
    suspended: licence.suspended === true,
    zone: licence.greenActions.includes(actionId)
      ? "green"
      : licence.yellowActions.includes(actionId)
        ? "yellow"
        : null,
    hardBlocked: licence.hardBlocks.includes(actionId),
  };
}

function depsFor(binding: CorridorBindingInput, env: Readonly<Record<string, string | undefined>>): ResolveCorridorDeps {
  return {
    evaluate: (input) => {
      const decision = evaluateLiveExecution({
        agentId: input.agentId,
        skillId: input.skillId,
        actionId: input.actionId,
        autonomyLevel: input.autonomyLevel,
        requestedMode: "live",
      });
      return {
        outcome: decision.outcome,
        reason: decision.reason,
        reasonCode: decision.reasonCode,
      };
    },
    licenceOf: (agentId) => licenceFacts(agentId, binding.actionId),
    receiverAccepts: isReceiverAcceptedRoute,
    webhookConfigurationOf: (candidate) => resolveWebhookConfigurationState(candidate, env),
  };
}

/**
 * Every declared corridor with its current status.
 *
 * Configuration defaults to the validated server snapshot. Explicit snapshots
 * support diagnostics without silently following later ambient destination changes.
 */
export function listExecutionCorridors(
  env: Readonly<Record<string, string | undefined>> = webhookSnapshot,
): ExecutionCorridor[] {
  return listApprovedWebhookBindings().map((binding) =>
    resolveExecutionCorridor(binding, depsFor(binding, env)),
  );
}

/** A single corridor by agent + skill, or null when no binding is declared. */
export function getExecutionCorridor(
  agentId: string,
  skillId: string,
  env: Readonly<Record<string, string | undefined>> = webhookSnapshot,
): ExecutionCorridor | null {
  const binding = findApprovedWebhookBinding(agentId, skillId);
  if (!binding) return null;
  return resolveExecutionCorridor(binding, depsFor(binding, env));
}
