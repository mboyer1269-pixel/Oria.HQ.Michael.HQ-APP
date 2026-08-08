// src/server/michael-hq/telemetry-extract.ts
//
// Read telemetry from stored intent payloads for UI surfaces.

import type { EstimatedCost, TelemetryEnvelope } from "./telemetry.ts";

function asEstimatedCost(value: unknown): EstimatedCost | null {
  if (!value || typeof value !== "object") return null;
  const cost = value as Record<string, unknown>;
  const totalUsd = cost.totalUsd;
  const totalCents = cost.totalCents;
  if (typeof totalUsd !== "number" || !Number.isFinite(totalUsd)) return null;
  if (typeof totalCents !== "number" || !Number.isFinite(totalCents) || totalCents < 0) {
    return null;
  }
  if (typeof cost.modelId !== "string" || cost.modelId.length === 0) return null;
  return value as EstimatedCost;
}

export function extractEstimatedCostFromIntentData(
  data: Record<string, unknown> | undefined,
): EstimatedCost | null {
  if (!data || typeof data !== "object") return null;
  const direct = asEstimatedCost(data.estimated_cost);
  if (direct) return direct;
  const envelope = data.michael_hq_telemetry;
  if (envelope && typeof envelope === "object" && "estimated_cost" in envelope) {
    return asEstimatedCost((envelope as TelemetryEnvelope).estimated_cost);
  }
  return null;
}

export function formatEstimatedCostUsd(cost: EstimatedCost): string {
  return `$${cost.totalUsd.toFixed(4)}`;
}
