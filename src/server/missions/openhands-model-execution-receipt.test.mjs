#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("OpenHands model execution receipt tests", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const { buildModelExecutionReceipt, modelExecutionReceiptsEqual } = await jiti.import(
    path.join(__dirname, "openhands-model-execution-receipt.ts"),
  );

  const decision = {
    eligible: true,
    modelId: "codex/gpt-codex",
    providerId: "openai-codex",
    runtimeAdapterId: "openai-codex-cli",
    sentinelle: { defaultZone: "yellow", requiresApprovalForToolUse: true },
    sentinelleRequired: true,
    ledgerRequired: true,
    pinned: false,
    reason: "first eligible candidate",
    skipped: [],
  };

  await t.test("with no observation yet: requested fields are filled, executed/usage/observed stay null", () => {
    const result = buildModelExecutionReceipt(decision, "launch-1", 0.42);
    assert.equal(result.status, "ok");
    const { receipt } = result;
    assert.equal(receipt.requestedModelId, "codex/gpt-codex");
    assert.equal(receipt.requestedProviderId, "openai-codex");
    assert.equal(receipt.requestedRuntimeAdapterId, "openai-codex-cli");
    assert.equal(receipt.executedModelId, null);
    assert.equal(receipt.executedProviderId, null);
    assert.equal(receipt.modelMatchesRequest, null);
    assert.deepEqual(receipt.usage, { promptTokens: null, completionTokens: null, iterations: null });
    assert.deepEqual(receipt.cost, { estimatedUsd: 0.42, observedUsd: null });
    assert.equal(receipt.observedAtIso, null);
  });

  await t.test("executedModelId is read ONLY from observed — never defaulted from the requested model", () => {
    const observedDifferentModel = {
      launchId: "launch-1",
      executedModelId: "some-other-model-the-runtime-actually-ran",
      executedProviderId: "openai-codex",
      observedAtIso: "2026-10-02T12:00:00.000Z",
    };
    const result = buildModelExecutionReceipt(decision, "launch-1", 0.42, observedDifferentModel);
    assert.equal(result.status, "ok");
    assert.equal(result.receipt.executedModelId, "some-other-model-the-runtime-actually-ran");
    assert.notEqual(result.receipt.executedModelId, result.receipt.requestedModelId);
    assert.equal(result.receipt.modelMatchesRequest, false);
  });

  await t.test("executed model matching the requested model is reported true only once observed", () => {
    const observedSameModel = {
      launchId: "launch-1",
      executedModelId: "codex/gpt-codex",
      executedProviderId: "openai-codex",
      observedAtIso: "2026-10-02T12:00:00.000Z",
    };
    const result = buildModelExecutionReceipt(decision, "launch-1", 0.42, observedSameModel);
    assert.equal(result.receipt.modelMatchesRequest, true);
  });

  await t.test("usage absent is unknown (null), never zero — even when other usage fields are present", () => {
    const observed = {
      launchId: "launch-1",
      executedModelId: "codex/gpt-codex",
      executedProviderId: "openai-codex",
      usage: { promptTokens: 1200 },
      observedAtIso: "2026-10-02T12:00:00.000Z",
    };
    const result = buildModelExecutionReceipt(decision, "launch-1", 0.42, observed);
    assert.equal(result.receipt.usage.promptTokens, 1200);
    assert.equal(result.receipt.usage.completionTokens, null);
    assert.equal(result.receipt.usage.iterations, null);
  });

  await t.test("estimated and observed cost are independent — neither backfills the other", () => {
    const noObservedCost = buildModelExecutionReceipt(decision, "launch-1", 0.42, {
      launchId: "launch-1",
      executedModelId: "codex/gpt-codex",
      executedProviderId: "openai-codex",
      observedAtIso: "2026-10-02T12:00:00.000Z",
    });
    assert.deepEqual(noObservedCost.receipt.cost, { estimatedUsd: 0.42, observedUsd: null });

    const withObservedCost = buildModelExecutionReceipt(decision, "launch-1", 0.42, {
      launchId: "launch-1",
      executedModelId: "codex/gpt-codex",
      executedProviderId: "openai-codex",
      observedCostUsd: 0.37,
      observedAtIso: "2026-10-02T12:00:00.000Z",
    });
    assert.deepEqual(withObservedCost.receipt.cost, { estimatedUsd: 0.42, observedUsd: 0.37 });

    const noEstimate = buildModelExecutionReceipt(decision, "launch-1", null);
    assert.deepEqual(noEstimate.receipt.cost, { estimatedUsd: null, observedUsd: null });
  });

  await t.test("a mismatched launchId on the observation is rejected, not silently attached", () => {
    const result = buildModelExecutionReceipt(decision, "launch-1", 0.42, {
      launchId: "launch-2",
      executedModelId: "codex/gpt-codex",
      executedProviderId: "openai-codex",
      observedAtIso: "2026-10-02T12:00:00.000Z",
    });
    assert.deepEqual(result, { status: "launch_id_mismatch" });
  });

  await t.test("replaying the exact same build call is a no-op: deep-equal receipts, not a mutation", () => {
    const observed = {
      launchId: "launch-1",
      executedModelId: "codex/gpt-codex",
      executedProviderId: "openai-codex",
      usage: { promptTokens: 1200, completionTokens: 340, iterations: 4 },
      observedCostUsd: 0.37,
      observedAtIso: "2026-10-02T12:00:00.000Z",
    };
    const first = buildModelExecutionReceipt(decision, "launch-1", 0.42, observed);
    const second = buildModelExecutionReceipt(decision, "launch-1", 0.42, observed);
    assert.equal(first.status, "ok");
    assert.equal(second.status, "ok");
    assert.ok(modelExecutionReceiptsEqual(first.receipt, second.receipt));
  });

  await t.test("a changed observation under the same launchId produces a DIFFERENT receipt (a conflict for the caller to catch)", () => {
    const first = buildModelExecutionReceipt(decision, "launch-1", 0.42, {
      launchId: "launch-1",
      executedModelId: "codex/gpt-codex",
      executedProviderId: "openai-codex",
      observedCostUsd: 0.37,
      observedAtIso: "2026-10-02T12:00:00.000Z",
    });
    const second = buildModelExecutionReceipt(decision, "launch-1", 0.42, {
      launchId: "launch-1",
      executedModelId: "codex/gpt-codex",
      executedProviderId: "openai-codex",
      observedCostUsd: 0.99,
      observedAtIso: "2026-10-02T12:05:00.000Z",
    });
    assert.equal(modelExecutionReceiptsEqual(first.receipt, second.receipt), false);
  });
});
