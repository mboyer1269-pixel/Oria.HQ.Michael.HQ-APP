// src/server/ai/llm-json-provider.ts
//
// Provider abstraction over Anthropic and OpenAI JSON clients.
//
// Exposes a single entry point — generateStructuredJson — that handles
// provider preference, ordered fallback, and failure chain recording.
//
// Design:
//   - "auto" tries Anthropic first, then OpenAI (respects key availability).
//   - "anthropic" / "openai" use that provider exclusively.
//   - On failure, the next provider in the fallback order is tried.
//   - failureChain records each failure reason for observability.
//   - Never throws toward the caller.
//   - Individual fetchFns per provider so tests can inject mocks independently.
//
// No side effects, no persistence, no execution.

import "server-only";

import { generateJsonWithAnthropic } from "./anthropic-json-client";
import { generateJsonWithOpenAI } from "./openai-json-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LlmProvider = "anthropic" | "openai";

export type LlmJsonProviderInput = {
  providerPreference: LlmProvider | "auto";
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  // Per-provider fetch overrides for test injection.
  fetchFns?: {
    anthropic?: typeof fetch;
    openai?: typeof fetch;
  };
};

export type LlmJsonProviderSuccess = {
  ok: true;
  json: unknown;
  rawText: string;
  modelId: string;
  providerUsed: LlmProvider;
  fallbackUsed: boolean;
  failureChain: string[];
  tokenUsage?: { input: number; output: number };
};

export type LlmJsonProviderErrorCode =
  | "no_provider_available"
  | "all_providers_failed";

export type LlmJsonProviderFailure = {
  ok: false;
  errorCode: LlmJsonProviderErrorCode;
  fallbackReason: string;
  failureChain: string[];
  providerUsed?: LlmProvider;
};

export type LlmJsonProviderResult = LlmJsonProviderSuccess | LlmJsonProviderFailure;

// ---------------------------------------------------------------------------
// Provider order resolution
// ---------------------------------------------------------------------------

// "auto" = Anthropic first (lower cost per token, preferred), then OpenAI.
function resolveOrder(preference: LlmProvider | "auto"): LlmProvider[] {
  if (preference === "anthropic") return ["anthropic"];
  if (preference === "openai") return ["openai"];
  return ["anthropic", "openai"];
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function generateStructuredJson(
  input: LlmJsonProviderInput,
): Promise<LlmJsonProviderResult> {
  const order = resolveOrder(input.providerPreference);
  const failureChain: string[] = [];
  let attemptCount = 0;

  for (const provider of order) {
    attemptCount++;
    const isFirstAttempt = attemptCount === 1;

    let result:
      | Awaited<ReturnType<typeof generateJsonWithAnthropic>>
      | Awaited<ReturnType<typeof generateJsonWithOpenAI>>;

    try {
      if (provider === "anthropic") {
        result = await generateJsonWithAnthropic(
          {
            systemPrompt: input.systemPrompt,
            userPrompt: input.userPrompt,
            maxTokens: input.maxTokens,
            temperature: input.temperature,
            timeoutMs: input.timeoutMs,
          },
          input.fetchFns?.anthropic,
        );
      } else {
        result = await generateJsonWithOpenAI(
          {
            systemPrompt: input.systemPrompt,
            userPrompt: input.userPrompt,
            maxTokens: input.maxTokens,
            temperature: input.temperature,
            timeoutMs: input.timeoutMs,
          },
          input.fetchFns?.openai,
        );
      }
    } catch {
      const reason = `${provider}: unexpected exception`;
      failureChain.push(reason);
      continue;
    }

    if (result.ok) {
      return {
        ok: true,
        json: result.json,
        rawText: result.rawText,
        modelId: result.modelId,
        providerUsed: provider,
        fallbackUsed: !isFirstAttempt,
        failureChain,
        tokenUsage: result.tokenUsage,
      };
    }

    failureChain.push(`${provider}: ${result.fallbackReason}`);
  }

  return {
    ok: false,
    errorCode: order.length === 0 ? "no_provider_available" : "all_providers_failed",
    fallbackReason:
      failureChain.length > 0
        ? failureChain[failureChain.length - 1]
        : "No providers configured",
    failureChain,
  };
}
