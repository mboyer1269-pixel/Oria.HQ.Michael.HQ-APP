import assert from "node:assert/strict";
import { test } from "node:test";

const { engineeringPackagePayloadSchema } = await import(
  "../agents/tools/engineering-package-deliver.ts"
);

test("engineering package payload schema accepts telemetry-enriched data", () => {
  const parsed = engineeringPackagePayloadSchema.safeParse({
    agentId: "engineering",
    skillId: "infrastructure.generate",
    client: "Acme",
    email: "ceo@acme.test",
    actionType: "infrastructure.code_package",
    missionId: "mission_1",
    data: {
      intentId: "intent_abc",
      packageId: "pkg_abc",
      title: "API stack",
      brief: "Portable docker compose",
      modeId: "hq",
      files: [{ path: "Dockerfile", content: "FROM node:22" }],
      estimated_cost: {
        currency: "USD",
        totalUsd: 0.0123,
        totalCents: 1,
        inputTokens: 100,
        outputTokens: 200,
        llmCostUsd: 0.0123,
        externalApiCostUsd: 0,
        modelId: "claude-sonnet-4-6",
        breakdown: { llm: { inputUsd: 0.01, outputUsd: 0.0023 }, external: [] },
      },
    },
  });
  assert.equal(parsed.success, true);
});
