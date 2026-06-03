/**
 * Skill Dispatcher -- PR5 Green Lane Executor
 *
 * Dispatches approved green-zone skill executions. Two strategies:
 *
 *   1. WEBHOOK BRIDGE (primary for external tools)
 *      Forwards the skill request to a webhook URL (n8n, Make, Zapier, etc.).
 *      The external workflow handles the actual tool execution.
 *      Oria stays the governance + measurement layer -- n8n stays the hands.
 *      This is the recommended production pattern: zero custom executor code,
 *      connect to any tool via the webhook bridge.
 *
 *   2. BUILT-IN HANDLERS (for skills that run in-process)
 *      content.generate -> LLM call (Anthropic/OpenAI via model-router)
 *      More handlers added here as skills mature.
 *
 * Architecture principle:
 *   Oria = brain (governance, approval, measurement)
 *   n8n/Make = hands (actual tool execution)
 *   The dispatcher is the bridge between the two.
 *
 * Safety:
 *   - Only called after evaluateLiveExecution() returns ALLOW.
 *   - Never calls external tools without a prior Sentinelle gate.
 *   - Timeout enforced on all HTTP dispatches (10s default).
 *   - Errors surface as thrown exceptions -- caller records "failed" outcome.
 */

import { serverEnv } from "@/lib/server-env";
import { logger } from "@/lib/logger";

export type SkillDispatchInput = {
  agentId: string;
  skillId: string;
  input: Record<string, unknown>;
  workspaceId: string;
  /** Optional n8n/Make/Zapier webhook URL to forward the request to. */
  webhookUrl?: string;
};

export type SkillDispatchResult = {
  /** Reference ID for the ledger (dispatcher-generated or returned by webhook). */
  actionRef: string;
  /** The skill output payload. */
  result: Record<string, unknown>;
  /** Which strategy was used. */
  strategy: "webhook" | "builtin" | "dry-run";
};

const DEFAULT_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Public dispatcher
// ---------------------------------------------------------------------------

/**
 * Dispatch a skill execution after Sentinelle has returned ALLOW.
 * Selects strategy automatically:
 *   1. webhookUrl provided -> webhook bridge
 *   2. Built-in handler exists for skillId -> run in-process
 *   3. No handler -> dry-run (logs, records, returns preview)
 */
export async function dispatchSkillExecution(
  input: SkillDispatchInput,
): Promise<SkillDispatchResult> {
  const actionRef = `action_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Strategy 1: Webhook bridge
  if (input.webhookUrl) {
    return dispatchViaWebhook(input, actionRef);
  }

  // Strategy 2: Built-in handler
  const builtin = BUILTIN_HANDLERS[input.skillId];
  if (builtin) {
    return builtin(input, actionRef);
  }

  // Strategy 3: Dry-run (no handler configured yet)
  logger.warn("skill.dispatcher.no-handler", {
    agentId: input.agentId,
    skillId: input.skillId,
    note: "No webhook URL and no built-in handler. Returning dry-run preview.",
  });

  return {
    actionRef,
    strategy: "dry-run",
    result: {
      preview: true,
      message: `Skill ${input.skillId} executed in dry-run mode. Wire a webhookUrl or add a built-in handler to execute live.`,
      agentId: input.agentId,
      skillId: input.skillId,
      input: input.input,
    },
  };
}

// ---------------------------------------------------------------------------
// Strategy 1: Webhook bridge
// ---------------------------------------------------------------------------

async function dispatchViaWebhook(
  input: SkillDispatchInput,
  actionRef: string,
): Promise<SkillDispatchResult> {
  const payload = {
    actionRef,
    agentId: input.agentId,
    skillId: input.skillId,
    workspaceId: input.workspaceId,
    input: input.input,
    dispatchedAt: new Date().toISOString(),
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(input.webhookUrl!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Webhook returned ${response.status}: ${response.statusText}`);
    }

    const result = await response.json().catch(() => ({}));

    logger.info("skill.dispatcher.webhook.success", {
      agentId: input.agentId,
      skillId: input.skillId,
      actionRef,
      webhookStatus: response.status,
    });

    return {
      actionRef: (result as Record<string, unknown>)["actionRef"] as string ?? actionRef,
      strategy: "webhook",
      result: result as Record<string, unknown>,
    };
  } catch (err) {
    logger.error("skill.dispatcher.webhook.failed", {
      agentId: input.agentId,
      skillId: input.skillId,
      actionRef,
      reason: err instanceof Error ? err.message : "unknown",
    });
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Strategy 2: Built-in handlers
// ---------------------------------------------------------------------------

type BuiltinHandler = (
  input: SkillDispatchInput,
  actionRef: string,
) => Promise<SkillDispatchResult>;

/**
 * content.generate -- Built-in LLM content generator.
 *
 * Calls the configured AI provider (Anthropic preferred, OpenAI fallback)
 * to generate marketing content. Output is stored as an internal draft.
 * No external publication occurs here -- publishing is a separate yellow-zone
 * action requiring CEO approval.
 */
async function handleContentGenerate(
  input: SkillDispatchInput,
  actionRef: string,
): Promise<SkillDispatchResult> {
  const topic = String(input.input["topic"] ?? "content");
  const format = String(input.input["format"] ?? "post");
  const tone = String(input.input["tone"] ?? "professional");

  const prompt = buildContentPrompt(topic, format, tone);

  const apiKey = serverEnv.anthropicApiKey ?? serverEnv.openAiApiKey;
  const provider = serverEnv.anthropicApiKey ? "anthropic" : "openai";

  if (!apiKey) {
    logger.warn("skill.dispatcher.content.generate.no-api-key", {
      agentId: input.agentId, actionRef,
    });
    // Return a mock draft in dev
    return {
      actionRef,
      strategy: "builtin",
      result: {
        provider: "mock",
        draft: `[MOCK DRAFT] Topic: ${topic} | Format: ${format} | Tone: ${tone}`,
        internalOnly: true,
        requiresReview: true,
      },
    };
  }

  let generatedText: string;

  if (provider === "anthropic") {
    generatedText = await callAnthropic(apiKey, prompt);
  } else {
    generatedText = await callOpenAI(apiKey, prompt);
  }

  logger.info("skill.dispatcher.content.generate.success", {
    agentId: input.agentId, actionRef, provider, chars: generatedText.length,
  });

  return {
    actionRef,
    strategy: "builtin",
    result: {
      provider,
      draft: generatedText,
      topic,
      format,
      tone,
      internalOnly: true,
      requiresReview: true,
      generatedAt: new Date().toISOString(),
    },
  };
}

function buildContentPrompt(topic: string, format: string, tone: string): string {
  return [
    `You are a professional marketing content writer.`,
    `Generate a ${format} about: ${topic}`,
    `Tone: ${tone}`,
    `Requirements:`,
    `- Be concise and compelling`,
    `- Do not include any legal claims, financial promises, or guarantees`,
    `- Output only the content, no meta-commentary`,
    `- Max 280 words for post, 500 for email, 150 for brief`,
  ].join("\n");
}

async function callAnthropic(apiKey: string, prompt: string): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error ${response.status}`);
  }

  const data = await response.json() as { content?: Array<{ text?: string }> };
  return data.content?.[0]?.text ?? "";
}

async function callOpenAI(apiKey: string, prompt: string): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error ${response.status}`);
  }

  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? "";
}

const BUILTIN_HANDLERS: Record<string, BuiltinHandler> = {
  "content.generate": handleContentGenerate,
};
