#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
  },
});

const {
  chargeWalletForApprovedIntent,
  getWalletSnapshot,
  resetWallet,
} = await jiti.import(path.join(__dirname, "wallet.ts"));

const { BILLING_MODEL, REVENUE_SHARE_PERCENT } = await jiti.import(
  path.join(__dirname, "billing-policy.ts"),
);

test("billing doctrine forbids revenue share", () => {
  assert.equal(REVENUE_SHARE_PERCENT, 0);
  assert.equal(BILLING_MODEL, "usage_only_no_revenue_share");
});

test("wallet charges usage cents after approval", () => {
  resetWallet("ws_test_finance");
  const entry = chargeWalletForApprovedIntent({
    workspaceId: "ws_test_finance",
    userId: "user_1",
    intentId: "intent_1",
    agentId: "validation",
    skillId: "market.demand_check",
    estimatedCost: {
      currency: "USD",
      totalUsd: 0.42,
      totalCents: 42,
      inputTokens: 1000,
      outputTokens: 500,
      llmCostUsd: 0.42,
      externalApiCostUsd: 0,
      modelId: "claude-sonnet-4-6",
      breakdown: { llm: { inputUsd: 0.3, outputUsd: 0.12 }, external: [] },
    },
    stripeSync: "skipped",
  });

  assert.equal(entry.amountCents, 42);
  assert.equal(entry.billingModel, "usage_only_no_revenue_share");
  assert.equal(entry.reason, "approved_intent_usage");

  const snap = getWalletSnapshot("ws_test_finance");
  assert.equal(snap.chargedCents, 42);
  assert.equal(snap.revenueSharePercent, 0);
});

test("direct wallet charge rejects negative amounts", () => {
  assert.throws(
    () =>
      chargeWalletForApprovedIntent({
        workspaceId: "ws_neg",
        userId: "u",
        intentId: "i",
        agentId: "a",
        skillId: "s",
        estimatedCost: {
          currency: "USD",
          totalUsd: -1,
          totalCents: -100,
          inputTokens: 0,
          outputTokens: 0,
          llmCostUsd: 0,
          externalApiCostUsd: 0,
          modelId: "x",
          breakdown: { llm: { inputUsd: 0, outputUsd: 0 }, external: [] },
        },
      }),
    /non-negative/i,
  );
});

test("wallet charge is idempotent per intentId", () => {
  resetWallet("ws_idem");
  const cost = {
    currency: "USD",
    totalUsd: 0.1,
    totalCents: 10,
    inputTokens: 100,
    outputTokens: 50,
    llmCostUsd: 0.1,
    externalApiCostUsd: 0,
    modelId: "claude-sonnet-4-6",
    breakdown: { llm: { inputUsd: 0.08, outputUsd: 0.02 }, external: [] },
  };
  const first = chargeWalletForApprovedIntent({
    workspaceId: "ws_idem",
    userId: "u",
    intentId: "intent_same",
    agentId: "validation",
    skillId: "market.demand_check",
    estimatedCost: cost,
  });
  const second = chargeWalletForApprovedIntent({
    workspaceId: "ws_idem",
    userId: "u",
    intentId: "intent_same",
    agentId: "validation",
    skillId: "market.demand_check",
    estimatedCost: cost,
  });
  assert.equal(first.id, second.id);
  assert.equal(getWalletSnapshot("ws_idem").chargedCents, 10);
});
