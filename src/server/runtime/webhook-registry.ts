// src/server/runtime/webhook-registry.ts
//
// The outbound webhook half of the execution-corridor contract
// (agentId + skillId + actionId + licence + webhook). The licence half lives in
// server/agents/agent-execution-license.ts; execution-corridor-contract.ts joins
// the two.
//
// A binding declares the destination environment variable that the dispatcher
// itself reads, so registry and dispatcher resolve one name. The dispatcher is
// the n8n_webhook_trigger MCP tool.
//
// Readiness covers every value the dispatcher requires before it will send:
// destination URL, static transfer secret, and — for a signed binding — the HMAC
// signing secret. A binding missing any of them cannot dispatch, so it is not
// reported as configured.

/** Environment variable holding the single n8n destination URL. */
export const N8N_DESTINATION_ENV_KEY = "N8N_WEBHOOK_URL";
/** Static header secret (`x-webhook-secret`) the receiver verifies. */
export const N8N_STATIC_SECRET_ENV_KEY = "N8N_SECRET";
/** HMAC signing secret for the request body (`x-orya-signature`). */
export const AGENT_WEBHOOK_SIGNING_SECRET_ENV_KEY = "AGENT_WEBHOOK_SIGNING_SECRET";

const N8N_TOOL_NAME = "n8n_webhook_trigger";
const N8N_ALLOWED_HOSTNAMES = Object.freeze([
  "hooks.n8n.cloud",
  "n8n.michaelhq.com",
  "localhost",
  "127.0.0.1",
]);

export type ApprovedWebhookBinding = {
  agentId: string;
  skillId: string;
  /**
   * The policy action evaluated against the agent's execution licence. A skill
   * is a capability; an action is what the licence zones. They are equal for
   * every binding today, and the corridor contract checks that rather than
   * assuming it.
   */
  actionId: string;
  /** MCP tool that performs the dispatch for this binding. */
  toolName: string;
  /** Environment variable holding the destination URL the dispatcher reads. */
  destinationEnvKey: string;
  allowedHostnames: readonly string[];
  requiresSignature: boolean;
  timeoutMs: number;
};

/**
 * Agent+skill pairs the DEPLOYED n8n workflow accepts.
 *
 * The workflow's routing node rejects anything else with `validation_error`, so
 * a corridor Oria authorizes but the receiver refuses cannot complete. Verified
 * against docs/n8n/oria-execution-rail.workflow.json by
 * execution-corridor-contract.test.mjs.
 */
export const N8N_RECEIVER_ACCEPTED_ROUTES: readonly string[] = Object.freeze([
  "hermes/task.create",
]);

/** True when the deployed receiver accepts this agent+skill pair. */
export function isReceiverAcceptedRoute(agentId: string, skillId: string): boolean {
  return N8N_RECEIVER_ACCEPTED_ROUTES.includes(`${agentId}/${skillId}`);
}

// Authorization allowlist for outbound agent->skill webhooks. Frozen: a caller
// holding the array must not be able to widen what is authorized.
const APPROVED_WEBHOOK_BINDINGS: readonly ApprovedWebhookBinding[] = Object.freeze([
  Object.freeze({
    agentId: "hermes",
    skillId: "task.create",
    actionId: "task.create",
    toolName: N8N_TOOL_NAME,
    destinationEnvKey: N8N_DESTINATION_ENV_KEY,
    allowedHostnames: N8N_ALLOWED_HOSTNAMES,
    requiresSignature: true,
    timeoutMs: 10_000,
  }),
  Object.freeze({
    agentId: "marketing",
    skillId: "content.generate",
    actionId: "content.generate",
    toolName: N8N_TOOL_NAME,
    destinationEnvKey: N8N_DESTINATION_ENV_KEY,
    allowedHostnames: N8N_ALLOWED_HOSTNAMES,
    requiresSignature: true,
    timeoutMs: 10_000,
  }),
  Object.freeze({
    agentId: "inventor",
    skillId: "concept.generate",
    actionId: "concept.generate",
    toolName: N8N_TOOL_NAME,
    destinationEnvKey: N8N_DESTINATION_ENV_KEY,
    allowedHostnames: N8N_ALLOWED_HOSTNAMES,
    requiresSignature: true,
    timeoutMs: 10_000,
  }),
]) as readonly ApprovedWebhookBinding[];

export type ResolvedWebhook = {
  url: string;
  binding: ApprovedWebhookBinding;
};

/** Every declared binding, in registry order. */
export function listApprovedWebhookBindings(): readonly ApprovedWebhookBinding[] {
  return APPROVED_WEBHOOK_BINDINGS;
}

/**
 * Returns the approved binding for an agent+skill pair, or null. The single
 * lookup rule: every caller needing this match uses this function.
 */
export function findApprovedWebhookBinding(
  agentId: string,
  skillId: string,
): ApprovedWebhookBinding | null {
  return (
    APPROVED_WEBHOOK_BINDINGS.find((b) => b.agentId === agentId && b.skillId === skillId) ?? null
  );
}

/**
 * Why a declared binding has no usable dispatch configuration right now. Each
 * value corresponds to a condition the dispatcher itself refuses on.
 */
export type WebhookConfigurationState =
  | "configured"
  | "destination_env_missing"
  | "destination_url_invalid"
  | "destination_hostname_not_allowed"
  | "destination_localhost_in_production"
  | "static_secret_missing"
  | "signing_secret_missing";

/**
 * Resolves the configuration state of a binding without exposing any secret or
 * URL: the result is rendered in the cockpit.
 *
 * `env` supplies the configuration values under test. The deployment mode is
 * read from process.env instead, so a caller passing a partial object cannot
 * remove the production localhost guard.
 */
export function resolveWebhookConfigurationState(
  binding: Pick<
    ApprovedWebhookBinding,
    "destinationEnvKey" | "allowedHostnames" | "requiresSignature"
  >,
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
    process.env.NODE_ENV === "production" &&
    (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
  ) {
    return "destination_localhost_in_production";
  }

  // The dispatcher refuses before sending when either secret is absent, so a
  // corridor without them is not dispatchable regardless of its URL.
  if (!env[N8N_STATIC_SECRET_ENV_KEY]) return "static_secret_missing";
  if (binding.requiresSignature && !env[AGENT_WEBHOOK_SIGNING_SECRET_ENV_KEY]) {
    return "signing_secret_missing";
  }

  return "configured";
}

/**
 * Resolves an approved webhook destination for a given agent and skill, or null
 * when the binding is undeclared or its configuration is incomplete.
 */
export function resolveApprovedWebhook(agentId: string, skillId: string): ResolvedWebhook | null {
  const binding = findApprovedWebhookBinding(agentId, skillId);
  if (!binding) return null;

  if (resolveWebhookConfigurationState(binding) !== "configured") return null;

  // Safe: "configured" implies the variable is present and parses.
  return { url: process.env[binding.destinationEnvKey] as string, binding };
}
