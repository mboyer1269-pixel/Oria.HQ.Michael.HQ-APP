// MCP tool: n8n_webhook_trigger
//
// The single outbound network chokepoint between Oria and the n8n execution
// layer. Oria stays the brain (governance, approval, ledger); n8n stays the
// hands (the real tool action). This tool is invoked ONLY from the CEO manual
// approval path -- never from the automatic green-lane evaluation.
//
// Hardening:
//   - Authorization: agent+skill must be an approved binding (webhook-registry).
//   - Destination: process.env.N8N_WEBHOOK_URL, hostname-allowlisted per binding.
//   - Auth: HMAC-SHA256 signature (x-orya-signature/-timestamp via
//     AGENT_WEBHOOK_SIGNING_SECRET) PLUS a static x-webhook-secret (N8N_SECRET).
//   - Internal rate limit (isAllowed) so a bug cannot bomb n8n.
//   - Timeout via AbortController.

import crypto from "node:crypto";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { isAllowed } from "@/lib/rate-limit";
import { findApprovedWebhookBinding } from "@/server/runtime/webhook-registry";
import type { McpTool, McpToolContext, McpToolResult } from "./types";

export const N8N_WEBHOOK_TRIGGER_TOOL_NAME = "n8n_webhook_trigger";

// Internal rate limit: max dispatches per rolling window, per workspace+agent.
export const N8N_DISPATCH_RATE_LIMIT = 30;
export const N8N_DISPATCH_RATE_WINDOW_MS = 60_000;

/**
 * Strict payload Hermès (Relay) produces and stores in an execution intent.
 * The CEO approves the intent; only then is this payload dispatched to n8n.
 */
export const n8nWebhookPayloadSchema = z
  .object({
    agentId: z.string().min(1),
    skillId: z.string().min(1),
    client: z.string().min(1),
    email: z.string().email(),
    actionType: z.string().min(1),
    missionId: z.string().min(1),
    ventureId: z.string().min(1).optional(),
    data: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export type N8nWebhookPayload = z.infer<typeof n8nWebhookPayloadSchema>;

async function triggerN8nWebhook(rawInput: unknown, ctx: McpToolContext): Promise<McpToolResult> {
  const parsed = n8nWebhookPayloadSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: "Invalid n8n_webhook_trigger payload." };
  }
  const input = parsed.data;

  const deps = ctx.deps ?? {};
  const fetchImpl = deps.fetchImpl ?? fetch;
  const isAllowedImpl = deps.isAllowed ?? isAllowed;
  const now = deps.now ?? (() => Date.now());

  // 1. Authorization -- agent+skill must be an approved binding.
  const binding = findApprovedWebhookBinding(input.agentId, input.skillId);
  if (!binding) {
    return { ok: false, error: `No approved webhook binding for ${input.agentId}/${input.skillId}.` };
  }

  // 2. Destination + static secret (required to secure the transfer).
  const rawUrl = process.env.N8N_WEBHOOK_URL;
  if (!rawUrl) return { ok: false, error: "N8N_WEBHOOK_URL is not configured." };

  const staticSecret = process.env.N8N_SECRET;
  if (!staticSecret) return { ok: false, error: "N8N_SECRET is not configured." };

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return { ok: false, error: "N8N_WEBHOOK_URL is not a valid URL." };
  }
  if (!binding.allowedHostnames.includes(parsedUrl.hostname)) {
    return { ok: false, error: `N8N_WEBHOOK_URL hostname ${parsedUrl.hostname} is not allowed.` };
  }
  if (
    process.env.NODE_ENV === "production" &&
    (parsedUrl.hostname === "localhost" || parsedUrl.hostname === "127.0.0.1")
  ) {
    return { ok: false, error: "localhost n8n endpoint is not allowed in production." };
  }

  // 3. Internal rate limit -- prevents a bug from bombing n8n.
  const rlKey = `n8n:${ctx.workspaceId}:${input.agentId}`;
  const allowed = await isAllowedImpl(rlKey, N8N_DISPATCH_RATE_LIMIT, N8N_DISPATCH_RATE_WINDOW_MS);
  if (!allowed) {
    logger.warn("mcp.n8n_webhook_trigger.rate_limited", {
      workspaceId: ctx.workspaceId,
      agentId: input.agentId,
    });
    return { ok: false, rateLimited: true, error: "n8n dispatch rate limit exceeded." };
  }

  // 4. Build payload + headers.
  const actionRef = `n8n_${now()}_${Math.random().toString(36).slice(2, 8)}`;
  const body = JSON.stringify({
    actionRef,
    agentId: input.agentId,
    skillId: input.skillId,
    workspaceId: ctx.workspaceId,
    client: input.client,
    email: input.email,
    actionType: input.actionType,
    missionId: input.missionId,
    ...(input.ventureId ? { ventureId: input.ventureId } : {}),
    data: input.data,
    dispatchedAt: new Date(now()).toISOString(),
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-webhook-secret": staticSecret,
  };

  if (binding.requiresSignature) {
    const signingSecret = process.env.AGENT_WEBHOOK_SIGNING_SECRET;
    if (!signingSecret) {
      return { ok: false, error: "Missing AGENT_WEBHOOK_SIGNING_SECRET for signed webhook." };
    }
    const timestamp = String(now());
    const signature = crypto
      .createHmac("sha256", signingSecret)
      .update(`${timestamp}.${body}`)
      .digest("hex");
    headers["x-orya-action-ref"] = actionRef;
    headers["x-orya-timestamp"] = timestamp;
    headers["x-orya-signature"] = signature;
  }

  // 5. Dispatch with timeout.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), binding.timeoutMs);
  try {
    const response = await fetchImpl(parsedUrl.toString(), {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });
    if (!response.ok) {
      return { ok: false, actionRef, error: `Webhook returned ${response.status}.` };
    }
    const output = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    logger.info("mcp.n8n_webhook_trigger.success", {
      workspaceId: ctx.workspaceId,
      agentId: input.agentId,
      actionRef,
    });
    return { ok: true, actionRef, output };
  } catch (err) {
    logger.error("mcp.n8n_webhook_trigger.failed", {
      workspaceId: ctx.workspaceId,
      agentId: input.agentId,
      actionRef,
      reason: err instanceof Error ? err.message : "unknown",
    });
    return { ok: false, actionRef, error: err instanceof Error ? err.message : "n8n dispatch failed." };
  } finally {
    clearTimeout(timer);
  }
}

export const n8nWebhookTriggerTool: McpTool = {
  name: N8N_WEBHOOK_TRIGGER_TOOL_NAME,
  description:
    "Forward an approved, CEO-authorized agent action to the n8n execution webhook. " +
    "Single outbound chokepoint: HMAC-signed + static-secret header, hostname-allowlisted, " +
    "rate-limited, timed out.",
  inputSchema: n8nWebhookPayloadSchema,
  handler: triggerN8nWebhook,
};
