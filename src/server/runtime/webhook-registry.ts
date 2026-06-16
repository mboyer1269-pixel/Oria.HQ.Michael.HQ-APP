export type ApprovedWebhookBinding = {
  agentId: string;
  skillId: string;
  envKey: string;
  allowedHostnames: string[];
  requiresSignature: boolean;
  timeoutMs: number;
};

// Hardcoded registry of allowed agent->skill outbound webhooks.
const APPROVED_WEBHOOK_BINDINGS: ApprovedWebhookBinding[] = [
  {
    agentId: "hermes",
    skillId: "task.create",
    envKey: "AGENT_HERMES_WEBHOOK_URL",
    allowedHostnames: ["hooks.n8n.cloud", "n8n.michaelhq.com", "localhost", "127.0.0.1"],
    requiresSignature: true,
    timeoutMs: 10_000,
  },
  {
    agentId: "marketing",
    skillId: "content.generate",
    envKey: "AGENT_MARKETING_WEBHOOK_URL",
    allowedHostnames: ["hooks.n8n.cloud", "n8n.michaelhq.com", "localhost", "127.0.0.1"],
    requiresSignature: true,
    timeoutMs: 10_000,
  },
  {
    agentId: "inventor",
    skillId: "concept.generate",
    envKey: "AGENT_INVENTOR_WEBHOOK_URL",
    allowedHostnames: ["hooks.n8n.cloud", "n8n.michaelhq.com", "localhost", "127.0.0.1"],
    requiresSignature: true,
    timeoutMs: 10_000,
  },
];

export type ResolvedWebhook = {
  url: string;
  binding: ApprovedWebhookBinding;
};

/**
 * Returns the approved binding for an agent+skill pair, or null. Used as the
 * authorization allowlist by the n8n_webhook_trigger MCP tool, which resolves
 * the destination from N8N_WEBHOOK_URL rather than a per-agent env key.
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
 * Resolves an approved webhook destination for a given agent and skill.
 * Ensures the URL is present in the environment and its hostname is allowed.
 */
export function resolveApprovedWebhook(agentId: string, skillId: string): ResolvedWebhook | null {
  const binding = APPROVED_WEBHOOK_BINDINGS.find(
    (b) => b.agentId === agentId && b.skillId === skillId
  );

  if (!binding) return null;

  // Since serverEnv is not typed with dynamic keys, we fall back to process.env
  // to dynamically lookup the URL based on the envKey.
  const rawUrl = process.env[binding.envKey];

  if (!rawUrl) return null;

  try {
    const parsed = new URL(rawUrl);
    if (!binding.allowedHostnames.includes(parsed.hostname)) {
      return null;
    }

    if (
      process.env.NODE_ENV === "production" &&
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
    ) {
      return null;
    }
    return {
      url: rawUrl,
      binding,
    };
  } catch {
    // Invalid URL format
    return null;
  }
}
