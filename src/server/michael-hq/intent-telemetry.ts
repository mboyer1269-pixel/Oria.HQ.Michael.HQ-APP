// src/server/michael-hq/intent-telemetry.ts
//
// Bridges Michael HQ telemetry into execution intent payloads before PENDING insert.

import type { AgentExecutionIntentPayload } from "@/features/agents/execution-intent";
import {
  attachTelemetryToPayloadData,
  buildTelemetryEnvelope,
  estimateTokensFromText,
  type ExternalApiCallEstimate,
  type TelemetryEnvelope,
  type TokenUsageEstimate,
} from "./telemetry.ts";

export type IntentTelemetryInput = {
  payload: AgentExecutionIntentPayload;
  /** When the orchestrator already measured tokens (post-inference). */
  tokenUsage?: TokenUsageEstimate;
  /** External API calls incurred while building the proposal. */
  externalCalls?: readonly ExternalApiCallEstimate[];
  /** Fallback text for pre-insert estimation when usage is not yet known. */
  estimationHint?: string;
  modelId?: string;
};

export type IntentWithTelemetry = {
  payload: AgentExecutionIntentPayload;
  telemetry: TelemetryEnvelope;
};

/**
 * Compute telemetry and merge `estimated_cost` into the intent payload `data`
 * object before persistence. Pure aside from timestamp in envelope.
 */
export function applyTelemetryToIntent(input: IntentTelemetryInput): IntentWithTelemetry {
  const modelId = input.tokenUsage?.modelId ?? input.modelId ?? "claude-sonnet-4-6";

  const tokenUsage: TokenUsageEstimate =
    input.tokenUsage ??
    ({
      modelId,
      inputTokens: estimateTokensFromText(
        [
          input.payload.actionType,
          input.payload.skillId,
          input.payload.client,
          input.estimationHint ?? "",
          JSON.stringify(input.payload.data ?? {}),
        ].join("\n"),
      ),
      outputTokens: Math.max(64, estimateTokensFromText(input.estimationHint ?? input.payload.actionType)),
    } satisfies TokenUsageEstimate);

  const telemetry = buildTelemetryEnvelope({
    tokenUsage,
    externalCalls: input.externalCalls,
  });

  const payload: AgentExecutionIntentPayload = {
    ...input.payload,
    data: attachTelemetryToPayloadData(
      (input.payload.data ?? {}) as Record<string, unknown>,
      telemetry,
    ),
  };

  return { payload, telemetry };
}
