import assert from "node:assert/strict";
import { test } from "node:test";

const { buildEstimatedCost, estimateTokensFromText } = await import(
  "../telemetry.ts"
);
const { applyTelemetryToIntent } = await import("../intent-telemetry.ts");
const { extractEstimatedCostFromIntentData } = await import("../telemetry-extract.ts");

test("buildEstimatedCost computes token-based USD", () => {
  const cost = buildEstimatedCost({
    tokenUsage: { modelId: "claude-sonnet-4-6", inputTokens: 1_000_000, outputTokens: 100_000 },
    externalCalls: [{ service: "github", operation: "api", units: 2, usdPerUnit: 0.001 }],
  });
  assert.ok(cost.totalUsd > 0);
  assert.equal(cost.inputTokens, 1_000_000);
  assert.equal(cost.externalApiCostUsd, 0.002);
});

test("applyTelemetryToIntent injects estimated_cost into payload.data", () => {
  const { payload, telemetry } = applyTelemetryToIntent({
    payload: {
      agentId: "engineering",
      skillId: "infrastructure.generate",
      client: "Acme",
      email: "ceo@acme.test",
      actionType: "infrastructure.code_package",
      missionId: "mission_1",
      data: { packageId: "pkg_1" },
    },
    tokenUsage: { modelId: "claude-sonnet-4-6", inputTokens: 500, outputTokens: 1200 },
  });
  assert.equal(telemetry.estimated_cost.totalUsd, payload.data.estimated_cost.totalUsd);
  const extracted = extractEstimatedCostFromIntentData(payload.data as Record<string, unknown>);
  assert.ok(extracted);
  assert.equal(extracted.totalCents, telemetry.estimated_cost.totalCents);
});

test("estimateTokensFromText is deterministic", () => {
  assert.equal(estimateTokensFromText("abcd"), 1);
  assert.ok(estimateTokensFromText("a".repeat(400)) >= 100);
});
