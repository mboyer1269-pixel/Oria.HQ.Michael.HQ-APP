import assert from "node:assert/strict";
import { test } from "node:test";

const {
  chargeWalletForApprovedIntent,
  getWalletSnapshot,
  resetWallet,
} = await import("./wallet.ts");

const { BILLING_MODEL, REVENUE_SHARE_PERCENT } = await import("./billing-policy.ts");

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
  assert.throws(() =>
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
  );
});
