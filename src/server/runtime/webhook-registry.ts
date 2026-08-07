// src/server/runtime/webhook-registry.ts
//
// The outbound webhook half of the single execution-corridor contract
// (agentId + skillId + actionId + licence + webhook). This module owns the
// agent→skill→webhook binding and the destination resolution; the licence half
// lives in server/agents/agent-execution-license.ts and the two are joined by
// execution-corridor-contract.ts.
//
// One destination, one truth. The binding used to carry a per-agent env key
// (AGENT_HERMES_WEBHOOK_URL) that NOTHING read: the only dispatcher
// (n8n_webhook_trigger) resolves its destination from N8N_WEBHOOK_URL. A
// registry that names a different variable than the code reading it cannot be
// audited, so the binding now declares the variable the dispatcher actually
// reads, and resolveApprovedWebhook resolves that same one.

export type ApprovedWebhookBinding = {
  agentId: string;
  skillId: string;
  /**
   * The policy action evaluated against the agent's execution licence. Distinct
   * from skillId on purpose: a skill is a capability, an action is what the
   * licence zones. They are equal for every binding today, and the corridor
   * contract checks that rather than assuming it.
   */
  actionId: string;
  /** MCP tool that performs the dispatch for this binding. */
  toolName: string;
  /**
   * Environment variable holding the destination URL — the SAME one the
   * dispatcher reads. Not per-agent: there is a single n8n endpoint today.
   */
  destinationEnvKey: string;
  allowedHostnames: string[];
  requiresSignature: boolean;
  timeoutMs: number;
};

const N8N_TOOL_NAME = "n8n_webhook_trigger";
const N8N_DESTINATION_ENV_KEY = "N8N_WEBHOOK_URL";
const N8N_ALLOWED_HOSTNAMES = ["hooks.n8n.cloud", "n8n.michaelhq.com", "localhost", "127.0.0.1"];

// Hardcoded registry of allowed agent->skill outbound webhooks.
const APPROVED_WEBHOOK_BINDINGS: ApprovedWebhookBinding[] = [
  {
    agentId: "hermes",
    skillId: "task.create",
    actionId: "task.create",
    toolName: N8N_TOOL_NAME,
    destinationEnvKey: N8N_DESTINATION_ENV_KEY,
    allowedHostnames: N8N_ALLOWED_HOSTNAMES,
    requiresSignature: true,
    timeoutMs: 10_000,
  },
  {
    agentId: "marketing",
    skillId: "content.generate",
    actionId: "content.generate",
    toolName: N8N_TOOL_NAME,
    destinationEnvKey: N8N_DESTINATION_ENV_KEY,
    allowedHostnames: N8N_ALLOWED_HOSTNAMES,
    requiresSignature: true,
    timeoutMs: 10_000,
  },
  {
    agentId: "inventor",
    skillId: "concept.generate",
    actionId: "concept.generate",
    toolName: N8N_TOOL_NAME,
    destinationEnvKey: N8N_DESTINATION_ENV_KEY,
    allowedHostnames: N8N_ALLOWED_HOSTNAMES,
    requiresSignature: true,
    timeoutMs: 10_000,
  },
];

export type ResolvedWebhook = {
  url: string;
  binding: ApprovedWebhookBinding;
};

/** Every declared binding, in registry order. Read-only. */
export function listApprovedWebhookBindings(): readonly ApprovedWebhookBinding[] {
  return APPROVED_WEBHOOK_BINDINGS;
}

/**
 * Returns the approved binding for an agent+skill pair, or null. Used as the
 * authorization allowlist by the n8n_webhook_trigger MCP tool.
 */
export function findApprovedWebhookBinding(
  agentId: string,
  skillId: string,
): ApprovedWebhookBinding | null {
  return (
    APPROVED_WEBHOOK_BINDINGS.find((b) => b.agentId === agentId && b.skillId === skillId) ?? null
  );
}

/** Why a declared binding has no usable destination right now. */
export type WebhookConfigurationState =
  | "configured"
  | "destination_env_missing"
  | "destination_url_invalid"
  | "destination_hostname_not_allowed"
  | "destination_localhost_in_production";

/**
 * Resolves the configuration state of a binding's destination WITHOUT exposing
 * the URL. The corridor contract renders this in the cockpit, so it must never
 * carry the endpoint itself.
 */
export function resolveWebhookConfigurationState(
  binding: { destinationEnvKey: string; allowedHostnames: readonly string[] },
  env: NodeJS.ProcessEnv = process.env,
): WebhookConfigurationState {
  const rawUrl = env[binding.destinationEnvKey];
  if (!rawUrl) return "destination_env_missing";

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return "destination_url_invalid";
  }

  if (!binding.allowedHostnames.includes(parsed.hostname)) {
    return "destination_hostname_not_allowed";
  }
  if (
    env.NODE_ENV === "production" &&
    (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
  ) {
    return "destination_localhost_in_production";
  }
  return "configured";
}

/**
 * Resolves an approved webhook destination for a given agent and skill.
 * Ensures the URL is present in the environment and its hostname is allowed.
 */
export function resolveApprovedWebhook(agentId: string, skillId: string): ResolvedWebhook | null {
  const binding = findApprovedWebhookBinding(agentId, skillId);
  if (!binding) return null;

  if (resolveWebhookConfigurationState(binding) !== "configured") return null;

  // Safe: "configured" means the variable is present and parses.
  return { url: process.env[binding.destinationEnvKey] as string, binding };
}
