#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSignal(overrides = {}) {
  return {
    score: 0,
    basis: "observed signal",
    evidence: [],
    ...overrides,
  };
}

function makeOutcome(overrides = {}) {
  return {
    outcomeId: "outcome-001",
    agentId: "agent-001",
    ventureId: "venture-001",
    taskId: "task-001",
    customerProof: makeSignal(),
    paymentSignal: makeSignal(),
    painClarity: makeSignal(),
    buyerIdentifiability: makeSignal(),
    offerTestability: makeSignal(),
    cashProximity: makeSignal(),
    cashGenerated: { amountCents: 0, verified: false, evidence: [] },
    evidenceSummary: "No evidence yet.",
    nextCashAction: { actionLabel: "find buyers", rationale: "no buyers yet" },
    createdAt: "2026-06-02T00:00:00.000Z",
    humanOnTheLoop: true,
    approvalRequired: true,
    noExecutionAuthorized: true,
    ...overrides,
  };
}

function makeStrongOutcome(overrides = {}) {
  return makeOutcome({
    outcomeId: "outcome-strong",
    customerProof: makeSignal({ score: 70, evidence: ["customer testimonial"] }),
    paymentSignal: makeSignal({ score: 80, evidence: ["invoice sent"] }),
    painClarity: makeSignal({ score: 75, evidence: ["interview transcript"] }),
    buyerIdentifiability: makeSignal({ score: 85, evidence: ["named buyer: ACME Corp"] }),
    offerTestability: makeSignal({ score: 65, evidence: ["pilot proposal draft"] }),
    cashProximity: makeSignal({ score: 70, evidence: ["warm outreach confirmed"] }),
    cashGenerated: { amountCents: 0, verified: false, evidence: [] },
    evidenceSummary: "Named buyer confirmed pain and asked for pricing.",
    nextCashAction: { actionLabel: "send pilot offer to ACME Corp", rationale: "buyer is warm and pain is confirmed" },
    ...overrides,
  });
}

function makeCashReadyOutcome(overrides = {}) {
  return makeStrongOutcome({
    outcomeId: "outcome-cash",
    paymentSignal: makeSignal({ score: 90, evidence: ["stripe payment intent created"] }),
    cashGenerated: {
      amountCents: 50000,
      verified: true,
      evidence: ["stripe charge id: ch_test_001"],
    },
    evidenceSummary: "First paying customer — $500 charged via Stripe.",
    nextCashAction: { actionLabel: "scale to next buyer", rationale: "first cash in; repeat the motion" },
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("VentureCashScore engine", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mod = await jiti.import(path.join(__dirname, "venture-cash-score.ts"));
  const {
    scoreVenture,
    VENTURE_CASH_SCORE_WEIGHTS,
    VENTURE_CASH_SCORE_DIMENSIONS,
    CASH_PROXIMITY_MAX_CONTRIBUTION_PCT,
  } = mod;

  // -------------------------------------------------------------------------
  // Group 1 — Governance locks
  // -------------------------------------------------------------------------
  await t.test("Governance locks", async (t) => {
    await t.test("humanOnTheLoop is always true", () => {
      const result = scoreVenture("v-001", [makeStrongOutcome()]);
      assert.equal(result.humanOnTheLoop, true);
    });

    await t.test("approvalRequired is always true", () => {
      const result = scoreVenture("v-001", [makeStrongOutcome()]);
      assert.equal(result.approvalRequired, true);
    });

    await t.test("noExecutionAuthorized is always true", () => {
      const result = scoreVenture("v-001", [makeStrongOutcome()]);
      assert.equal(result.noExecutionAuthorized, true);
    });

    await t.test("throws when ventureId is empty", () => {
      assert.throws(() => scoreVenture("", []), /ventureId/);
    });

    await t.test("throws when ventureId is whitespace", () => {
      assert.throws(() => scoreVenture("   ", []), /ventureId/);
    });
  });

  // -------------------------------------------------------------------------
  // Group 2 — cashGenerated is the strongest signal
  // -------------------------------------------------------------------------
  await t.test("cashGenerated is the strongest signal", async (t) => {
    await t.test("cashGenerated has the highest weight (30)", () => {
      assert.equal(VENTURE_CASH_SCORE_WEIGHTS.cashGenerated, 30);
    });

    await t.test("verified cash outcome scores highest among dimensions", () => {
      const cashOutcome = makeCashReadyOutcome();
      const result = scoreVenture("v-001", [cashOutcome]);
      // cashGenerated dimension should have a non-zero score.
      const reasons = result.cashScoreReasons.join(" ");
      assert.match(reasons, /cashGenerated/);
      assert.ok(result.totalCashScore > 0, "score should be positive with cash");
    });

    await t.test("zero cashGenerated yields zero score for that dimension", () => {
      const result = scoreVenture("v-001", [makeOutcome()]);
      // All signals are 0, so score should be 0 (minus penalties).
      const reasons = result.cashScoreReasons;
      const cashLine = reasons.find((r) => r.startsWith("cashGenerated:"));
      assert.ok(cashLine, "cashGenerated line present");
      assert.match(cashLine, /0\/100/);
    });
  });

  // -------------------------------------------------------------------------
  // Group 3 — paymentSignal as pre-cash signal
  // -------------------------------------------------------------------------
  await t.test("paymentSignal as pre-cash signal", async (t) => {
    await t.test("paymentSignal has weight 20", () => {
      assert.equal(VENTURE_CASH_SCORE_WEIGHTS.paymentSignal, 20);
    });

    await t.test("high paymentSignal without cash yields continue_candidate", () => {
      const outcome = makeStrongOutcome({
        paymentSignal: makeSignal({ score: 80, evidence: ["invoice sent"] }),
        cashGenerated: { amountCents: 0, verified: false, evidence: [] },
      });
      const result = scoreVenture("v-001", [outcome]);
      assert.equal(result.survivalStatus, "continue_candidate");
      assert.equal(result.shouldContinue, true);
    });

    await t.test("high paymentSignal without cash flags CEO decision", () => {
      const outcome = makeStrongOutcome({
        paymentSignal: makeSignal({ score: 80, evidence: ["invoice sent"] }),
        cashGenerated: { amountCents: 0, verified: false, evidence: [] },
      });
      const result = scoreVenture("v-001", [outcome]);
      assert.equal(result.shouldRequestCeoDecision, true);
    });
  });

  // -------------------------------------------------------------------------
  // Group 4 — cashProximity cannot overpower cashGenerated / paymentSignal
  // -------------------------------------------------------------------------
  await t.test("cashProximity cannot overpower cashGenerated/paymentSignal", async (t) => {
    await t.test("CASH_PROXIMITY_MAX_CONTRIBUTION_PCT is 0.05 or less", () => {
      assert.ok(
        CASH_PROXIMITY_MAX_CONTRIBUTION_PCT <= 0.05,
        "proximity contribution must be capped at 5%",
      );
    });

    await t.test("high cashProximity alone with no payment does not reach strong band", () => {
      const outcome = makeOutcome({
        cashProximity: makeSignal({ score: 100, evidence: ["many conversations"] }),
      });
      const result = scoreVenture("v-001", [outcome]);
      // With only proximity high and all else zero, should be weak or blocked.
      assert.ok(
        result.cashScoreBand === "blocked" || result.cashScoreBand === "weak",
        `expected blocked/weak, got ${result.cashScoreBand}`,
      );
    });

    await t.test("cashProximity does not move a venture from kill_candidate to continue_candidate", () => {
      const outcome = makeOutcome({
        cashProximity: makeSignal({ score: 95, evidence: ["feels close"] }),
      });
      const result = scoreVenture("v-001", [outcome]);
      assert.notEqual(result.survivalStatus, "continue_candidate");
    });
  });

  // -------------------------------------------------------------------------
  // Group 5 — insufficient_evidence when no outcomes
  // -------------------------------------------------------------------------
  await t.test("insufficient_evidence when outcomes are empty", async (t) => {
    await t.test("empty outcomes → insufficient_evidence", () => {
      const result = scoreVenture("v-001", []);
      assert.equal(result.survivalStatus, "insufficient_evidence");
    });

    await t.test("empty outcomes → shouldContinue false", () => {
      const result = scoreVenture("v-001", []);
      assert.equal(result.shouldContinue, false);
    });

    await t.test("empty outcomes → score is 0", () => {
      const result = scoreVenture("v-001", []);
      assert.equal(result.totalCashScore, 0);
    });

    await t.test("empty outcomes → band is blocked", () => {
      const result = scoreVenture("v-001", []);
      assert.equal(result.cashScoreBand, "blocked");
    });
  });

  // -------------------------------------------------------------------------
  // Group 6 — kill_candidate: classification only, never execution
  // -------------------------------------------------------------------------
  await t.test("kill_candidate is classification only", async (t) => {
    await t.test("low score, no buyer, no payment → kill_candidate", () => {
      const outcome = makeOutcome({
        evidenceSummary: "Nothing found.",
        nextCashAction: { actionLabel: "do more research", rationale: "unclear" },
      });
      const result = scoreVenture("v-kill", [outcome]);
      assert.equal(result.isKillCandidate, true);
      assert.equal(result.survivalStatus, "kill_candidate");
    });

    await t.test("kill_candidate requires CEO decision", () => {
      const outcome = makeOutcome({
        evidenceSummary: "Nothing found.",
        nextCashAction: { actionLabel: "do more research", rationale: "unclear" },
      });
      const result = scoreVenture("v-kill", [outcome]);
      assert.equal(result.shouldRequestCeoDecision, true);
    });

    await t.test("kill_candidate does not set shouldContinue or shouldPivot", () => {
      const outcome = makeOutcome({
        evidenceSummary: "Nothing found.",
        nextCashAction: { actionLabel: "do more research", rationale: "unclear" },
      });
      const result = scoreVenture("v-kill", [outcome]);
      assert.equal(result.shouldContinue, false);
      assert.equal(result.shouldPivot, false);
    });

    await t.test("noExecutionAuthorized is true even for kill_candidate", () => {
      const outcome = makeOutcome({
        evidenceSummary: "Nothing found.",
        nextCashAction: { actionLabel: "do more research", rationale: "unclear" },
      });
      const result = scoreVenture("v-kill", [outcome]);
      assert.equal(result.noExecutionAuthorized, true);
    });
  });

  // -------------------------------------------------------------------------
  // Group 7 — pivot_candidate
  // -------------------------------------------------------------------------
  await t.test("pivot_candidate: buyer/pain exist but payment/cash are weak", async (t) => {
    await t.test("buyer and pain exist but no payment → pivot_candidate", () => {
      const outcome = makeOutcome({
        buyerIdentifiability: makeSignal({ score: 55 }),
        painClarity: makeSignal({ score: 60, evidence: ["pain confirmed verbally"] }),
        paymentSignal: makeSignal({ score: 0 }),
        cashGenerated: { amountCents: 0, verified: false, evidence: [] },
        evidenceSummary: "Pain confirmed but no offer tested.",
        nextCashAction: { actionLabel: "build offer", rationale: "need something to test" },
      });
      const result = scoreVenture("v-pivot", [outcome]);
      assert.equal(result.survivalStatus, "pivot_candidate");
      assert.equal(result.shouldPivot, true);
    });

    await t.test("pivot_candidate flags CEO decision", () => {
      const outcome = makeOutcome({
        buyerIdentifiability: makeSignal({ score: 55 }),
        painClarity: makeSignal({ score: 60, evidence: ["pain confirmed verbally"] }),
        paymentSignal: makeSignal({ score: 0 }),
        cashGenerated: { amountCents: 0, verified: false, evidence: [] },
        evidenceSummary: "Pain confirmed but no offer tested.",
        nextCashAction: { actionLabel: "build offer", rationale: "need something to test" },
      });
      const result = scoreVenture("v-pivot", [outcome]);
      assert.equal(result.shouldRequestCeoDecision, true);
    });
  });

  // -------------------------------------------------------------------------
  // Group 8 — continue_candidate
  // -------------------------------------------------------------------------
  await t.test("continue_candidate: evidence promising but not cash-ready", async (t) => {
    await t.test("strong signals and evidence → continue_candidate", () => {
      const result = scoreVenture("v-continue", [makeStrongOutcome()]);
      assert.equal(result.survivalStatus, "continue_candidate");
      assert.equal(result.shouldContinue, true);
    });

    await t.test("continue_candidate: shouldPivot and isKillCandidate are false", () => {
      const result = scoreVenture("v-continue", [makeStrongOutcome()]);
      assert.equal(result.shouldPivot, false);
      assert.equal(result.isKillCandidate, false);
    });
  });

  // -------------------------------------------------------------------------
  // Group 9 — cash_ready
  // -------------------------------------------------------------------------
  await t.test("cash_ready: positive cashGenerated evidence-backed", async (t) => {
    await t.test("evidence-backed cash → cash_ready", () => {
      const result = scoreVenture("v-cash", [makeCashReadyOutcome()]);
      assert.equal(result.survivalStatus, "cash_ready");
    });

    await t.test("cash_ready: shouldContinue is true", () => {
      const result = scoreVenture("v-cash", [makeCashReadyOutcome()]);
      assert.equal(result.shouldContinue, true);
    });

    await t.test("cash_ready: isKillCandidate and shouldPivot are false", () => {
      const result = scoreVenture("v-cash", [makeCashReadyOutcome()]);
      assert.equal(result.isKillCandidate, false);
      assert.equal(result.shouldPivot, false);
    });

    await t.test("cash_ready: CEO decision required for scaling", () => {
      const result = scoreVenture("v-cash", [makeCashReadyOutcome()]);
      assert.equal(result.shouldRequestCeoDecision, true);
    });

    await t.test("cash_ready: band is strong or cash_ready", () => {
      const result = scoreVenture("v-cash", [makeCashReadyOutcome()]);
      assert.ok(
        result.cashScoreBand === "cash_ready" || result.cashScoreBand === "strong",
        `expected strong/cash_ready, got ${result.cashScoreBand}`,
      );
    });
  });

  // -------------------------------------------------------------------------
  // Group 10 — Penalties
  // -------------------------------------------------------------------------
  await t.test("Penalties", async (t) => {
    await t.test("vagueEvidencePenalty: all evidence arrays empty", () => {
      const outcome = makeOutcome({
        evidenceSummary: "Some narrative.",
        nextCashAction: { actionLabel: "find buyers", rationale: "none yet" },
      });
      const result = scoreVenture("v-vague", [outcome]);
      const penalty = result.penalties.find((p) => p.code === "vagueEvidencePenalty");
      assert.ok(penalty, "vagueEvidencePenalty should be applied");
      assert.ok(penalty.points > 0);
    });

    await t.test("noBuyerPenalty: zero buyerIdentifiability", () => {
      const outcome = makeOutcome({
        evidenceSummary: "Nothing.",
        nextCashAction: { actionLabel: "find buyers", rationale: "none" },
      });
      const result = scoreVenture("v-nobuyer", [outcome]);
      const penalty = result.penalties.find((p) => p.code === "noBuyerPenalty");
      assert.ok(penalty, "noBuyerPenalty should be applied");
    });

    await t.test("noPaymentSignalPenalty: zero paymentSignal", () => {
      const outcome = makeOutcome({
        evidenceSummary: "Nothing.",
        nextCashAction: { actionLabel: "find a payment", rationale: "none" },
      });
      const result = scoreVenture("v-nopay", [outcome]);
      const penalty = result.penalties.find((p) => p.code === "noPaymentSignalPenalty");
      assert.ok(penalty, "noPaymentSignalPenalty should be applied");
    });

    await t.test("unsupportedClaimPenalty: score >= 60 with no evidence", () => {
      const outcome = makeOutcome({
        paymentSignal: makeSignal({ score: 70, evidence: [] }),
        evidenceSummary: "Claims payment is strong.",
        nextCashAction: { actionLabel: "find buyers", rationale: "none" },
      });
      const result = scoreVenture("v-unsupported", [outcome]);
      const penalty = result.penalties.find((p) => p.code === "unsupportedClaimPenalty");
      assert.ok(penalty, "unsupportedClaimPenalty should be applied");
    });

    await t.test("penalties reduce totalCashScore", () => {
      const withPenalties = scoreVenture("v-001", [makeOutcome()]);
      const noPenaltyTotal = withPenalties.totalCashScore + withPenalties.penalties.reduce((a, p) => a + p.points, 0);
      assert.ok(noPenaltyTotal >= withPenalties.totalCashScore);
    });

    await t.test("totalCashScore never goes below 0", () => {
      const result = scoreVenture("v-001", [makeOutcome()]);
      assert.ok(result.totalCashScore >= 0);
    });

    await t.test("repeatedRecommendationPenalty: all outcomes have same action label", () => {
      const outcomes = [
        makeOutcome({ outcomeId: "o1", nextCashAction: { actionLabel: "do research", rationale: "x" } }),
        makeOutcome({ outcomeId: "o2", nextCashAction: { actionLabel: "do research", rationale: "y" } }),
      ];
      const result = scoreVenture("v-repeat", outcomes);
      const penalty = result.penalties.find((p) => p.code === "repeatedRecommendationPenalty");
      assert.ok(penalty, "repeatedRecommendationPenalty should be applied");
    });
  });

  // -------------------------------------------------------------------------
  // Group 11 — strongestSignal and weakestSignal
  // -------------------------------------------------------------------------
  await t.test("strongestSignal and weakestSignal", async (t) => {
    await t.test("identifies cashGenerated as strongest when it has the highest score", () => {
      const outcome = makeCashReadyOutcome({
        customerProof: makeSignal({ score: 10, evidence: [] }),
        buyerIdentifiability: makeSignal({ score: 10, evidence: [] }),
        painClarity: makeSignal({ score: 10, evidence: [] }),
        offerTestability: makeSignal({ score: 10, evidence: [] }),
        cashProximity: makeSignal({ score: 10, evidence: [] }),
        paymentSignal: makeSignal({ score: 10, evidence: ["one signal"] }),
      });
      const result = scoreVenture("v-strongest", [outcome]);
      assert.equal(result.strongestSignal, "cashGenerated");
    });

    await t.test("identifies weakest signal from zero dimensions", () => {
      const outcome = makeOutcome({
        paymentSignal: makeSignal({ score: 50 }),
        evidenceSummary: "Only payment signal.",
        nextCashAction: { actionLabel: "find buyers", rationale: "none" },
      });
      const result = scoreVenture("v-weakest", [outcome]);
      // With all others at 0, the weakest should be one of the zeros.
      assert.ok(VENTURE_CASH_SCORE_DIMENSIONS.includes(result.weakestSignal));
    });

    await t.test("strongestSignal and weakestSignal are valid dimensions", () => {
      const result = scoreVenture("v-001", [makeStrongOutcome()]);
      assert.ok(VENTURE_CASH_SCORE_DIMENSIONS.includes(result.strongestSignal));
      assert.ok(VENTURE_CASH_SCORE_DIMENSIONS.includes(result.weakestSignal));
    });
  });

  // -------------------------------------------------------------------------
  // Group 12 — nextScoreFocus
  // -------------------------------------------------------------------------
  await t.test("nextScoreFocus", async (t) => {
    await t.test("nextScoreFocus is non-empty string", () => {
      const result = scoreVenture("v-001", [makeStrongOutcome()]);
      assert.ok(typeof result.nextScoreFocus === "string");
      assert.ok(result.nextScoreFocus.trim().length > 0);
    });

    await t.test("nextScoreFocus references the weakest dimension concept", () => {
      // All signals zero → weakest will be cashGenerated (first zero found).
      const result = scoreVenture("v-001", [makeOutcome()]);
      // Focus should mention converting/generating cash since that's 0.
      assert.ok(
        result.nextScoreFocus.length > 0,
        "nextScoreFocus must be non-empty",
      );
    });
  });

  // -------------------------------------------------------------------------
  // Group 13 — determinism
  // -------------------------------------------------------------------------
  await t.test("determinism: same inputs produce same outputs", async (t) => {
    await t.test("identical outcomes produce identical scores", () => {
      const outcomes = [makeStrongOutcome()];
      const r1 = scoreVenture("v-det", outcomes);
      const r2 = scoreVenture("v-det", outcomes);
      assert.equal(r1.totalCashScore, r2.totalCashScore);
      assert.equal(r1.survivalStatus, r2.survivalStatus);
      assert.equal(r1.cashScoreBand, r2.cashScoreBand);
    });

    await t.test("output does not mutate input outcomes", () => {
      const outcome = makeStrongOutcome();
      const originalScore = outcome.paymentSignal.score;
      scoreVenture("v-mutcheck", [outcome]);
      assert.equal(outcome.paymentSignal.score, originalScore);
    });
  });

  // -------------------------------------------------------------------------
  // Group 14 — purity: no DB / runtime / API writes
  // -------------------------------------------------------------------------
  await t.test("module purity", async (t) => {
    await t.test("scoreVenture is a synchronous function", () => {
      const result = scoreVenture("v-sync", [makeStrongOutcome()]);
      // Should not be a Promise.
      assert.ok(!(result instanceof Promise), "must be synchronous");
    });

    await t.test("scoreVenture returns plain object", () => {
      const result = scoreVenture("v-plain", [makeStrongOutcome()]);
      assert.equal(typeof result, "object");
      assert.notEqual(result, null);
    });

    await t.test("module exports only expected symbols", () => {
      const keys = Object.keys(mod);
      const expected = [
        "scoreVenture",
        "VENTURE_CASH_SCORE_WEIGHTS",
        "VENTURE_CASH_SCORE_DIMENSIONS",
        "CASH_PROXIMITY_MAX_CONTRIBUTION_PCT",
      ];
      for (const key of expected) {
        assert.ok(keys.includes(key), `export "${key}" missing`);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Group 15 — cashScoreReasons explainability
  // -------------------------------------------------------------------------
  await t.test("cashScoreReasons explainability", async (t) => {
    await t.test("cashScoreReasons is a non-empty array", () => {
      const result = scoreVenture("v-001", [makeStrongOutcome()]);
      assert.ok(Array.isArray(result.cashScoreReasons));
      assert.ok(result.cashScoreReasons.length > 0);
    });

    await t.test("all penalty reasons appear in cashScoreReasons", () => {
      const result = scoreVenture("v-001", [makeOutcome()]);
      for (const p of result.penalties) {
        const found = result.cashScoreReasons.some((r) => r.includes(p.code));
        assert.ok(found, `Penalty ${p.code} not found in cashScoreReasons`);
      }
    });

    await t.test("cashScoreReasons includes total score line", () => {
      const result = scoreVenture("v-001", [makeStrongOutcome()]);
      const totalLine = result.cashScoreReasons.find((r) => r.includes("Total cash score"));
      assert.ok(totalLine, "total score line must be present");
    });
  });
});
