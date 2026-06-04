// src/server/ai/anthropic-json-client.ts
//
// Minimal server-side client for Anthropic Messages API.
// Sends a system + user prompt, expects JSON back, and returns a typed result.
//
// Design:
//   - Uses raw fetch — no SDK dependency required.
//   - Never throws toward the caller: all failures surface as ok:false.
//   - Never logs the API key.
//   - Accepts an optional fetchFn parameter so tests can inject a mock without
//     network access. In production the caller omits it; globalThis.fetch is used.
//   - JSON extraction tolerates optional markdown fences in the response.
//
// Hard limits:
//   - No execution, no persistence, no side effects.
//   - If ANTHROPIC_API_KEY is absent → ok:false, no throw.

import "server-only";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_API_VERSION = "2023-06-01";

export const ANTHROPIC_JSON_DEFAULT_MODEL = "claude-haiku-4-5-20251001";
export const ANTHROPIC_JSON_DEFAULT_MAX_TOKENS = 2048;
export const ANTHROPIC_JSON_DEFAULT_TEMPERATURE = 0.1;
export const ANTHROPIC_JSON_DEFAULT_TIMEOUT_MS = 20_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AnthropicJsonInput = {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  modelId?: string;
};

export type AnthropicJsonSuccess = {
  ok: true;
  json: unknown;
  rawText: string;
  modelId: string;
  tokenUsage?: { input: number; output: number };
};

export type AnthropicJsonErrorCode =
  | "no_api_key"
  | "provider_error"
  | "timeout"
  | "invalid_json"
  | "unexpected_error";

export type AnthropicJsonFailure = {
  ok: false;
  errorCode: AnthropicJsonErrorCode;
  fallbackReason: string;
  modelId?: string;
};

export type AnthropicJsonResult = AnthropicJsonSuccess | AnthropicJsonFailure;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// Strips markdown fences if the model wrapped its JSON (which it sometimes does
// even when instructed not to). Returns the raw text unchanged if no fences.
function extractJson(text: string): string {
  const fencedJson = text.match(/```json\s*([\s\S]*?)```/);
  if (fencedJson) return fencedJson[1].trim();
  const fencedBare = text.match(/```\s*([\s\S]*?)```/);
  if (fencedBare) return fencedBare[1].trim();
  return text.trim();
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function generateJsonWithAnthropic(
  input: AnthropicJsonInput,
  fetchFn: typeof fetch = globalThis.fetch,
): Promise<AnthropicJsonResult> {
  // Read at call time (not import time) so the module stays testable: tests can
  // set/unset process.env.ANTHROPIC_API_KEY before calling without module-cache tricks.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      errorCode: "no_api_key",
      fallbackReason: "ANTHROPIC_API_KEY is not configured",
    };
  }

  const modelId = input.modelId ?? ANTHROPIC_JSON_DEFAULT_MODEL;
  const maxTokens = input.maxTokens ?? ANTHROPIC_JSON_DEFAULT_MAX_TOKENS;
  const timeoutMs = input.timeoutMs ?? ANTHROPIC_JSON_DEFAULT_TIMEOUT_MS;
  const temperature = input.temperature ?? ANTHROPIC_JSON_DEFAULT_TEMPERATURE;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchFn(ANTHROPIC_MESSAGES_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_API_VERSION,
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: maxTokens,
        temperature,
        system: input.systemPrompt,
        messages: [{ role: "user", content: input.userPrompt }],
      }),
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        ok: false,
        errorCode: "provider_error",
        fallbackReason: `Anthropic API returned HTTP ${response.status}`,
        modelId,
      };
    }

    const data = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    const rawText = data?.content?.[0]?.text ?? "";

    if (!rawText) {
      return {
        ok: false,
        errorCode: "invalid_json",
        fallbackReason: "Anthropic response contained no text content",
        modelId,
      };
    }

    const extracted = extractJson(rawText);

    let json: unknown;
    try {
      json = JSON.parse(extracted);
    } catch {
      return {
        ok: false,
        errorCode: "invalid_json",
        fallbackReason: "Anthropic response was not valid JSON",
        modelId,
      };
    }

    const tokenUsage =
      data.usage?.input_tokens !== undefined && data.usage?.output_tokens !== undefined
        ? { input: data.usage.input_tokens, output: data.usage.output_tokens }
        : undefined;

    return { ok: true, json, rawText, modelId, tokenUsage };
  } catch (err) {
    clearTimeout(timeoutId);

    if (err instanceof Error && err.name === "AbortError") {
      return {
        ok: false,
        errorCode: "timeout",
        fallbackReason: `Anthropic request timed out after ${timeoutMs}ms`,
        modelId,
      };
    }

    return {
      ok: false,
      errorCode: "unexpected_error",
      fallbackReason: "Unexpected error contacting Anthropic",
      modelId,
    };
  }
}
