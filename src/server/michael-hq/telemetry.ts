// src/server/michael-hq/telemetry.ts
//
// Michael HQ telemetry — algorithmic cost estimation for execution intents.
// Intercepts proposals before PENDING insert and attaches transparent pricing
// (LLM tokens + external API calls) for CEO approval in the Execution Theatre.

import { PREMIUM_MODEL_ID } from "@/server/ai/model-config";

export type TelemetryCurrency = "USD";

/** Per-million-token list prices (USD) — transparent, auditable, no hidden markup. */
export const MODEL_USD_PER_MILLION_TOKENS: Record<
  string,
  { input: number; output: number }
> = {
  [PREMIUM_MODEL_ID]: { input: 3.0, output: 15.0 },
  "claude-3-5-sonnet-20241022": { input: 3.0, output: 15.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10.0 },
  "gemini-flash": { input: 0.1, output: 0.4 },
};

export const DEFAULT_MODEL_PRICING = MODEL_USD_PER_MILLION_TOKENS[PREMIUM_MODEL_ID]!;

export type ExternalApiCallEstimate = {
  service: string;
  operation: string;
  units: number;
  usdPerUnit: number;
};

export type TokenUsageEstimate = {
  inputTokens: number;
  outputTokens: number;
  modelId: string;
};

export type EstimatedCost = {
  currency: TelemetryCurrency;
  totalUsd: number;
  totalCents: number;
  inputTokens: number;
  outputTokens: number;
  llmCostUsd: number;
  externalApiCostUsd: number;
  modelId: string;
  breakdown: {
    llm: { inputUsd: number; outputUsd: number };
    external: ExternalApiCallEstimate[];
  };
};

export type TelemetryEnvelope = {
  estimated_cost: EstimatedCost;
  capturedAt: string;
  source: "michael_hq_telemetry";
};

export function resolveModelPricing(modelId: string): { input: number; output: number } {
  return MODEL_USD_PER_MILLION_TOKENS[modelId] ?? DEFAULT_MODEL_PRICING;
}

export function estimateLlmInferenceCost(usage: TokenUsageEstimate): {
  inputUsd: number;
  outputUsd: number;
  totalUsd: number;
} {
  const pricing = resolveModelPricing(usage.modelId);
  const inputUsd = (usage.inputTokens / 1_000_000) * pricing.input;
  const outputUsd = (usage.outputTokens / 1_000_000) * pricing.output;
  return { inputUsd, outputUsd, totalUsd: inputUsd + outputUsd };
}

export function estimateExternalApiCost(calls: readonly ExternalApiCallEstimate[]): number {
  return calls.reduce((sum, call) => sum + call.units * call.usdPerUnit, 0);
}

export function buildEstimatedCost(input: {
  tokenUsage: TokenUsageEstimate;
  externalCalls?: readonly ExternalApiCallEstimate[];
}): EstimatedCost {
  const llm = estimateLlmInferenceCost(input.tokenUsage);
  const external = [...(input.externalCalls ?? [])];
  const externalApiCostUsd = estimateExternalApiCost(external);
  const totalUsd = llm.totalUsd + externalApiCostUsd;

  return {
    currency: "USD",
    totalUsd,
    totalCents: Math.round(totalUsd * 100),
    inputTokens: input.tokenUsage.inputTokens,
    outputTokens: input.tokenUsage.outputTokens,
    llmCostUsd: llm.totalUsd,
    externalApiCostUsd,
    modelId: input.tokenUsage.modelId,
    breakdown: {
      llm: { inputUsd: llm.inputUsd, outputUsd: llm.outputUsd },
      external,
    },
  };
}

export function buildTelemetryEnvelope(input: {
  tokenUsage: TokenUsageEstimate;
  externalCalls?: readonly ExternalApiCallEstimate[];
  capturedAt?: string;
}): TelemetryEnvelope {
  return {
    estimated_cost: buildEstimatedCost(input),
    capturedAt: input.capturedAt ?? new Date().toISOString(),
    source: "michael_hq_telemetry",
  };
}

/** Rough token estimate from text when provider usage is unavailable pre-call. */
export function estimateTokensFromText(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function attachTelemetryToPayloadData(
  data: Record<string, unknown>,
  envelope: TelemetryEnvelope,
): Record<string, unknown> {
  return {
    ...data,
    estimated_cost: envelope.estimated_cost,
    michael_hq_telemetry: envelope,
  };
}
