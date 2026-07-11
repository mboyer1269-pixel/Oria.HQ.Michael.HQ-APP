// src/server/joris/joris-reply-generator.ts
//
// Real LLM invocation for Joris's conversational replies (general chat and board
// consult). Wraps the shared structured-JSON provider with the Joris system
// prompt so the conversational path is genuinely model-backed when configured.
//
// Design:
//   - Uses generateStructuredJson (Anthropic -> OpenAI, key-gated, never throws).
//   - Accepts optional routed model hints so display routing and live dispatch
//     stay coherent when API keys exist.
//   - Returns ok:false when no provider is configured or the reply is malformed,
//     so the caller falls back to a deterministic, non-deceptive summary.
//   - fetchFn is injectable so tests run without network access or real API keys.
//   - No persistence, no side effects beyond the LLM call.

import "server-only";

import { z } from "zod";
import {
  generateStructuredJson,
  type LlmProvider,
} from "@/server/ai/llm-json-provider";
import {
  ECONOMY_MODEL_ID,
  PREMIUM_MODEL_ID,
} from "@/server/ai/model-config";
import { buildJorisSystemPrompt } from "@/server/joris/joris-prompt";

export type JorisReplyInput = {
  message: string;
  /** Optional verified-memory context block prepended to the user prompt. */
  memoryContext?: string | null;
  /** Routed model id from chooseModel (display + preferred live model). */
  routedModelId?: string;
  /** Inject fetch for tests — avoids network access and real API keys. */
  fetchFn?: typeof fetch;
};

export type JorisReplyResult =
  | { ok: true; text: string; modelId: string }
  | { ok: false; reason: string };

const replySchema = z.object({ reply: z.string().trim().min(1) });

/**
 * Map router model ids onto the live Anthropic/OpenAI clients.
 * Gemini / OpenRouter ids stay "auto" until those clients are mandated.
 */
export function resolveJorisLiveProvider(routedModelId?: string): {
  providerPreference: LlmProvider | "auto";
  modelId?: string;
} {
  if (!routedModelId) {
    return { providerPreference: "auto" };
  }

  const id = routedModelId.toLowerCase();
  if (id.includes("claude") || routedModelId === PREMIUM_MODEL_ID) {
    return {
      providerPreference: "anthropic",
      // Prefer the routed id when it looks like an Anthropic model; otherwise
      // let the Anthropic client use its default Haiku.
      modelId: id.includes("claude") ? routedModelId : undefined,
    };
  }
  if (id.includes("gpt") || id.includes("o1") || id.includes("o3") || routedModelId === ECONOMY_MODEL_ID) {
    return {
      providerPreference: "openai",
      modelId: id.includes("gpt") || id.startsWith("o") ? routedModelId : ECONOMY_MODEL_ID,
    };
  }

  return { providerPreference: "auto" };
}

function buildUserPrompt(input: JorisReplyInput): string {
  const context = input.memoryContext ? `Contexte vérifié :\n${input.memoryContext}\n\n` : "";
  return `${context}Message du CEO :
${input.message}

Réponds en tant que Joris. Retourne UNIQUEMENT du JSON valide, sans markdown, au format :
{ "reply": "<ta réponse>" }`;
}

/**
 * Generates Joris's conversational reply via a real LLM when a provider is
 * configured. Returns ok:false (never throws) when no API key is available or
 * the response is malformed, so the caller can fall back explicitly.
 */
export async function generateJorisReply(input: JorisReplyInput): Promise<JorisReplyResult> {
  const live = resolveJorisLiveProvider(input.routedModelId);
  const result = await generateStructuredJson({
    providerPreference: live.providerPreference,
    modelId: live.modelId,
    systemPrompt: buildJorisSystemPrompt(),
    userPrompt: buildUserPrompt(input),
    maxTokens: 1024,
    temperature: 0.4,
    timeoutMs: 20_000,
    fetchFns: input.fetchFn ? { anthropic: input.fetchFn, openai: input.fetchFn } : undefined,
  });

  if (!result.ok) {
    return { ok: false, reason: result.fallbackReason };
  }

  const parsed = replySchema.safeParse(result.json);
  if (!parsed.success) {
    return { ok: false, reason: "LLM reply did not match the expected { reply } shape" };
  }

  return { ok: true, text: parsed.data.reply, modelId: result.modelId };
}
