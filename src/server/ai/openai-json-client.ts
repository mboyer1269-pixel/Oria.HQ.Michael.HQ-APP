// src/server/ai/openai-json-client.ts
//
// Minimal server-side client for OpenAI Chat Completions API.
// Mirrors the shape of anthropic-json-client.ts so the provider layer
// can treat both clients uniformly.
//
// Design:
//   - Raw fetch — no SDK dependency.
//   - Reads OPENAI_API_KEY at call time (not import time) — test-friendly.
//   - Never throws toward the caller: all failures surface as ok:false.
//   - Never logs the API key.
//   - Accepts an optional fetchFn for test injection.
//   - Uses response_format json_object for deterministic JSON output.
//   - JSON extraction tolerates optional markdown fences.
//
// Hard limits:
//   - No execution, no persistence, no side effects.
//   - OPENAI_API_KEY absent → ok:false, no throw.

import "server-only";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";

export const OPENAI_JSON_DEFAULT_MODEL = "gpt-4o-mini";
export const OPENAI_JSON_DEFAULT_MAX_TOKENS = 2048;
export const OPENAI_JSON_DEFAULT_TEMPERATURE = 0.1;
export const OPENAI_JSON_DEFAULT_TIMEOUT_MS = 20_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OpenAiJsonInput = {
  systemPrompt: string;
  userPrompt: string;
  modelId?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
};

export type OpenAiJsonSuccess = {
  ok: true;
  json: unknown;
  rawText: string;
  modelId: string;
};

export type OpenAiJsonErrorCode =
  | "no_api_key"
  | "provider_error"
  | "timeout"
  | "invalid_json"
  | "unexpected_error";

export type OpenAiJsonFailure = {
  ok: false;
  errorCode: OpenAiJsonErrorCode;
  fallbackReason: string;
  modelId?: string;
};

export type OpenAiJsonResult = OpenAiJsonSuccess | OpenAiJsonFailure;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

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

export async function generateJsonWithOpenAI(
  input: OpenAiJsonInput,
  fetchFn: typeof fetch = globalThis.fetch,
): Promise<OpenAiJsonResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      errorCode: "no_api_key",
      fallbackReason: "OPENAI_API_KEY is not configured",
    };
  }

  const modelId = input.modelId ?? OPENAI_JSON_DEFAULT_MODEL;
  const maxTokens = input.maxTokens ?? OPENAI_JSON_DEFAULT_MAX_TOKENS;
  const timeoutMs = input.timeoutMs ?? OPENAI_JSON_DEFAULT_TIMEOUT_MS;
  const temperature = input.temperature ?? OPENAI_JSON_DEFAULT_TEMPERATURE;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchFn(OPENAI_CHAT_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: maxTokens,
        temperature,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: input.systemPrompt },
          { role: "user", content: input.userPrompt },
        ],
      }),
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        ok: false,
        errorCode: "provider_error",
        fallbackReason: `OpenAI API returned HTTP ${response.status}`,
        modelId,
      };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const rawText = data?.choices?.[0]?.message?.content ?? "";

    if (!rawText) {
      return {
        ok: false,
        errorCode: "invalid_json",
        fallbackReason: "OpenAI response contained no text content",
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
        fallbackReason: "OpenAI response was not valid JSON",
        modelId,
      };
    }

    return { ok: true, json, rawText, modelId };
  } catch (err) {
    clearTimeout(timeoutId);

    if (err instanceof Error && err.name === "AbortError") {
      return {
        ok: false,
        errorCode: "timeout",
        fallbackReason: `OpenAI request timed out after ${timeoutMs}ms`,
        modelId,
      };
    }

    return {
      ok: false,
      errorCode: "unexpected_error",
      fallbackReason: "Unexpected error contacting OpenAI",
      modelId,
    };
  }
}
