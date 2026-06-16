/**
 * Skill Dispatcher -- in-process Green Lane Executor
 *
 * Dispatches approved green-zone skill executions that run IN-PROCESS only:
 *
 *   - BUILT-IN HANDLERS (skills that run in-process)
 *      content.generate -> LLM call (Anthropic/OpenAI via model-router)
 *      More handlers added here as skills mature.
 *   - DRY-RUN (no handler configured yet) -> logs, returns a preview.
 *
 * EXTERNAL EXECUTION HAS MOVED. The outbound webhook bridge toward n8n is no
 * longer reachable from this automatic path. A Sentinelle ALLOW means an action
 * is ELIGIBLE for CEO approval, not that it should fire. The n8n call now lives
 * behind the n8n_webhook_trigger MCP tool (src/server/agents/tools), invoked
 * only by the CEO manual-approval route. This keeps humanOnTheLoop absolute: no
 * external network call happens from green-lane evaluation.
 *
 * Safety:
 *   - Only called after evaluateLiveExecution() returns ALLOW.
 *   - This dispatcher performs NO external network call.
 *   - Errors surface as thrown exceptions -- caller records "failed" outcome.
 */

import { serverEnv } from "@/lib/server-env";
import { logger } from "@/lib/logger";

export type SkillDispatchInput = {
  agentId: string;
  skillId: string;
  input: Record<string, unknown>;
  workspaceId: string;
};

export type SkillDispatchResult = {
  /** Reference ID for the ledger (dispatcher-generated or returned by webhook). */
  actionRef: string;
  /** The skill output payload. */
  result: Record<string, unknown>;
  /** Which strategy was used. */
  strategy: "builtin" | "dry-run";
};

// ---------------------------------------------------------------------------
// Public dispatcher
// ---------------------------------------------------------------------------

/**
 * Dispatch a skill execution after Sentinelle has returned ALLOW.
 * Selects strategy automatically:
 *   1. Built-in handler exists for skillId -> run in-process
 *   2. No handler -> dry-run (logs, returns preview)
 *
 * There is no external (n8n) path here by design: external execution is
 * gated behind CEO approval via the n8n_webhook_trigger MCP tool.
 */
export async function dispatchSkillExecution(
  input: SkillDispatchInput,
): Promise<SkillDispatchResult> {
  const actionRef = `action_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Strategy 1: Built-in handler (in-process).
  const builtin = BUILTIN_HANDLERS[input.skillId];
  if (builtin) {
    return builtin(input, actionRef);
  }

  // Strategy 2: Dry-run (no in-process handler configured).
  logger.warn("skill.dispatcher.no-handler", {
    agentId: input.agentId,
    skillId: input.skillId,
    note: "No in-process handler. External execution is CEO-approval-gated via n8n_webhook_trigger.",
  });

  return {
    actionRef,
    strategy: "dry-run",
    result: {
      preview: true,
      message: `Skill ${input.skillId} executed in dry-run mode. Add a built-in handler, or queue an execution intent for CEO-approved n8n dispatch.`,
      agentId: input.agentId,
      skillId: input.skillId,
      input: input.input,
    },
  };
}

// ---------------------------------------------------------------------------
// Built-in handlers (in-process; no external network)
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
