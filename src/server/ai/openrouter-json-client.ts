// src/server/ai/openrouter-json-client.ts
//
// Minimal server-side client for OpenRouter Chat Completions.
// OpenRouter is OpenAI-compatible, but it has its own API key and model slugs.
// This client keeps that gateway explicit so Joris can use a free-first route
// without pretending that OpenRouter is the same provider as OpenAI.

import "server-only";

import { selectFreeModel } from "@/server/ai/cost-ladder";
import { loadFreeModelCatalog } from "@/server/ai/free-model-catalog";

const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_FREE_ROUTER_MODEL = "openrouter/free";

export const OPENROUTER_JSON_DEFAULT_MAX_TOKENS = 2048;
export const OPENROUTER_JSON_DEFAULT_TEMPERATURE = 0.1;
export const OPENROUTER_JSON_DEFAULT_TIMEOUT_MS = 20_000;

export type OpenRouterJsonInput = {
  systemPrompt: string;
  userPrompt: string;
  modelId?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
};

export type OpenRouterJsonSuccess = {
  ok: true;
  json: unknown;
  rawText: string;
  modelId: string;
  tokenUsage?: { input: number; output: number };
};

export type OpenRouterJsonErrorCode =
  | "no_api_key"
  | "provider_error"
  | "timeout"
  | "invalid_json"
  | "unexpected_error";

export type OpenRouterJsonFailure = {
  ok: false;
  errorCode: OpenRouterJsonErrorCode;
  fallbackReason: string;
  modelId?: string;
};

export type OpenRouterJsonResult = OpenRouterJsonSuccess | OpenRouterJsonFailure;

export function resolveDefaultOpenRouterJsonModelId(): string {
  const configured = process.env.OPENROUTER_JSON_MODEL_ID?.trim();
  if (configured) return configured;

  return selectFreeModel(loadFreeModelCatalog())?.id ?? OPENROUTER_FREE_ROUTER_MODEL;
}

function extractJson(text: string): string {
  const fencedJson = text.match(/```json\s*([\s\S]*?)```/);
  if (fencedJson) return fencedJson[1].trim();
  const fencedBare = text.match(/```\s*([\s\S]*?)```/);
  if (fencedBare) return fencedBare[1].trim();
  return text.trim();
}

export async function generateJsonWithOpenRouter(
  input: OpenRouterJsonInput,
  fetchFn: typeof fetch = globalThis.fetch,
): Promise<OpenRouterJsonResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      errorCode: "no_api_key",
      fallbackReason: "OPENROUTER_API_KEY is not configured",
    };
  }

  const modelId = input.modelId ?? resolveDefaultOpenRouterJsonModelId();
  const maxTokens = input.maxTokens ?? OPENROUTER_JSON_DEFAULT_MAX_TOKENS;
  const timeoutMs = input.timeoutMs ?? OPENROUTER_JSON_DEFAULT_TIMEOUT_MS;
  const temperature = input.temperature ?? OPENROUTER_JSON_DEFAULT_TEMPERATURE;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchFn(OPENROUTER_CHAT_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${apiKey}`,
        "X-OpenRouter-Title": "Oria HQ",
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
        fallbackReason: `OpenRouter API returned HTTP ${response.status}`,
        modelId,
      };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const rawText = data?.choices?.[0]?.message?.content ?? "";

    if (!rawText) {
      return {
        ok: false,
        errorCode: "invalid_json",
        fallbackReason: "OpenRouter response contained no text content",
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
        fallbackReason: "OpenRouter response was not valid JSON",
        modelId,
      };
    }

    const tokenUsage =
      data.usage?.prompt_tokens !== undefined && data.usage?.completion_tokens !== undefined
        ? { input: data.usage.prompt_tokens, output: data.usage.completion_tokens }
        : undefined;

    return { ok: true, json, rawText, modelId, tokenUsage };
  } catch (err) {
    clearTimeout(timeoutId);

    if (err instanceof Error && err.name === "AbortError") {
      return {
        ok: false,
        errorCode: "timeout",
        fallbackReason: `OpenRouter request timed out after ${timeoutMs}ms`,
        modelId,
      };
    }

    return {
      ok: false,
      errorCode: "unexpected_error",
      fallbackReason: "Unexpected error contacting OpenRouter",
      modelId,
    };
  }
}
