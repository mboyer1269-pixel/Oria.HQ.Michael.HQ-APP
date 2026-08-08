// src/server/michael-hq/telemetry-extract.ts
//
// Read telemetry from stored intent payloads for UI surfaces.

import type { EstimatedCost, TelemetryEnvelope } from "./telemetry.ts";

export function extractEstimatedCostFromIntentData(
  data: Record<string, unknown> | undefined,
): EstimatedCost | null {
  if (!data || typeof data !== "object") return null;
  const direct = data.estimated_cost;
  if (direct && typeof direct === "object" && "totalUsd" in direct) {
    return direct as EstimatedCost;
  }
  const envelope = data.michael_hq_telemetry;
  if (envelope && typeof envelope === "object" && "estimated_cost" in envelope) {
    return (envelope as TelemetryEnvelope).estimated_cost;
  }
  return null;
}

export function formatEstimatedCostUsd(cost: EstimatedCost): string {
  return `$${cost.totalUsd.toFixed(4)}`;
}
