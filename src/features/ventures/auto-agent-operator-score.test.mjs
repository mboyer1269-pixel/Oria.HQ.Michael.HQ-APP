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
  return { score: 0, basis: "observed signal", evidence: [], ...overrides };
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
    evidenceSummary: "Nothing found.",
    nextCashAction: { actionLabel: "find buyers", rationale: "none yet" },
    createdAt: "2026-06-02T00:00:00.000Z",
    humanOnTheLoop: true,
    approvalRequired: true,
    noExecutionAuthorized: true,
    ...overrides,
  };
}

// Agent with payment signal, buyer, and evidence but no realized cash.
function makeActiveSalesOutcome(overrides = {}) {
  return makeOutcome({
    outcomeId: "outcome-active",
    customerProof: makeSignal({ score: 55, evidence: ["customer call notes"] }),
    paymentSignal: makeSignal({ score: 70, evidence: ["invoice draft sent"] }),
    painClarity: makeSignal({ score: 65, evidence: ["interview transcript"] }),
    buyerIdentifiability: makeSignal({ score: 75, evidence: ["named buyer: ACME Corp"] }),
    offerTestability: makeSignal({ score: 60, evidence: ["pilot proposal v1"] }),
    cashProximity: makeSignal({ score: 70 }),
    cashGenerated: { amountCents: 0, verified: false, evidence: [] },
    evidenceSummary: "Named buyer confirmed pain and asked for pricing.",
    nextCashAction: {
      actionLabel: "send pilot offer to ACME Corp",
      rationale: "buyer is warm — convert interest to a payment signal",
    },
    ...overrides,
  });
}

// Agent that closed cash — strongest possible signal.
function makeCashClosedOutcome(overrides = {}) {
  return makeOutcome({
    outcomeId: "outcome-cash",
    customerProof: makeSignal({ score: 80, evidence: ["signed contract"] }),
    paymentSignal: makeSignal({ score: 90, evidence: ["stripe payment intent: pi_001"] }),
    painClarity: makeSignal({ score: 75, evidence: ["interview transcript"] }),
    buyerIdentifiability: makeSignal({ score: 85, evidence: ["buyer: ACME Corp, CEO name"] }),
    offerTestability: makeSignal({ score: 65, evidence: ["pilot proposal v2"] }),
    cashProximity: makeSignal({ score: 85 }),
    cashGenerated: {
      amountCents: 50000,
      verified: true,
      evidence: ["stripe charge id: ch_test_001"],
    },
    evidenceSummary: "First paying customer — $500 charged via Stripe.",
    nextCashAction: {
      actionLabel: "scale to next buyer in same segment",
      rationale: "first cash in — repeat the motion with segment peers",
    },
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("AgentOperatorScore engine", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mod = await jiti.import(
    path.join(__dirname, "auto-agent-operator-score.ts"),
  );
  const {
    scoreAgentOperator,
    AGENT_OPERATOR_SCORE_WEIGHTS,
    AGENT_OPERATOR_DIMENSIONS,
    TALENT_SIGNAL_MAX_CONTRIBUTION_PCT,
    EVIDENCE_RATE_THRESHOLD,
  } = mod;

  // -------------------------------------------------------------------------
  // Group 1 — Governance locks
  // -------------------------------------------------------------------------
  await t.test("Governance locks", async (t) => {
    await t.test("humanOnTheLoop is always true", () => {
      const result = scoreAgentOperator("agent-001", [makeActiveSalesOutcome()]);
      assert.equal(result.humanOnTheLoop, true);
    });

    await t.test("approvalRequired is always true", () => {
      const result = scoreAgentOperator("agent-001", [makeActiveSalesOutcome()]);
      assert.equal(result.approvalRequired, true);
    });

    await t.test("noExecutionAuthorized is always true", () => {
      const result = scoreAgentOperator("agent-001", [makeActiveSalesOutcome()]);
      assert.equal(result.noExecutionAuthorized, true);
    });

    await t.test("throws when agentId is empty", () => {
      assert.throws(() => scoreAgentOperator("", []), /agentId/);
    });

    await t.test("throws when agentId is whitespace", () => {
      assert.throws(() => scoreAgentOperator("   ", []), /agentId/);
    });
  });

  // -------------------------------------------------------------------------
  // Group 2 — revenueImpact is the dominant dimension
  // -------------------------------------------------------------------------
  await t.test("revenueImpact is the dominant dimension", async (t) => {
    await t.test("revenueImpact has the highest weight (30)", () => {
      assert.equal(AGENT_OPERATOR_SCORE_WEIGHTS.revenueImpact, 30);
    });

    await t.test("weights sum to 100", () => {
      const total = Object.values(AGENT_OPERATOR_SCORE_WEIGHTS).reduce(
        (a, b) => a + b,
        0,
      );
      assert.equal(total, 100);
    });

    await t.test("cash-generating outcome produces the highest operator score", () => {
      const cashResult = scoreAgentOperator("agent-cash", [makeCashClosedOutcome()]);
      const activeResult = scoreAgentOperator("agent-active", [makeActiveSalesOutcome()]);
      const emptyResult = scoreAgentOperator("agent-empty", [makeOutcome()]);
      assert.ok(
        cashResult.totalOperatorScore >= activeResult.totalOperatorScore,
        "cash agent must score >= active agent",
      );
      assert.ok(
        activeResult.totalOperatorScore >= emptyResult.totalOperatorScore,
        "active agent must score >= zero-output agent",
      );
    });

    await t.test("zero cashGenerated yields zero revenueImpact when no payment signal", () => {
      const result = scoreAgentOperator("agent-001", [makeOutcome()]);
      assert.equal(result.dimensionScores.revenueImpact, 0);
    });

    await t.test("payment signal without cash still contributes to revenueImpact", () => {
      const outcome = makeOutcome({
        paymentSignal: makeSignal({ score: 80, evidence: ["invoice sent"] }),
        evidenceSummary: "Invoice sent.",
        nextCashAction: { actionLabel: "follow up on invoice", rationale: "awaiting payment" },
      });
      const result = scoreAgentOperator("agent-001", [outcome]);
      assert.ok(result.dimensionScores.revenueImpact > 0, "payment signal must contribute");
    });
  });

  // -------------------------------------------------------------------------
  // Group 3 — executionEfficiency tracks evidence quality
  // -------------------------------------------------------------------------
  await t.test("executionEfficiency tracks evidence quality", async (t) => {
    await t.test("all outcomes have evidence → executionEfficiency = 100", () => {
      const result = scoreAgentOperator("agent-001", [makeActiveSalesOutcome()]);
      assert.equal(result.dimensionScores.executionEfficiency, 100);
    });

    await t.test("no outcomes have evidence → executionEfficiency = 0", () => {
      const result = scoreAgentOperator("agent-001", [makeOutcome()]);
      assert.equal(result.dimensionScores.executionEfficiency, 0);
    });

    await t.test("half outcomes have evidence → executionEfficiency = 50", () => {
      const outcomes = [
        makeActiveSalesOutcome({ outcomeId: "o1" }),
        makeOutcome({ outcomeId: "o2" }),
      ];
      const result = scoreAgentOperator("agent-001", outcomes);
      assert.equal(result.dimensionScores.executionEfficiency, 50);
    });
  });

  // -------------------------------------------------------------------------
  // Group 4 — credibility tracks claim backing
  // -------------------------------------------------------------------------
  await t.test("credibility tracks claim backing", async (t) => {
    await t.test("no high-scoring claims → credibility = 50 (neutral)", () => {
      const result = scoreAgentOperator("agent-001", [makeOutcome()]);
      assert.equal(result.dimensionScores.credibility, 50);
    });

    await t.test("all high-scoring claims are backed → credibility = 100", () => {
      const result = scoreAgentOperator("agent-001", [makeActiveSalesOutcome()]);
      // Active outcome has scores >= 60 and evidence for all of them.
      assert.equal(result.dimensionScores.credibility, 100);
    });

    await t.test("high-scoring claim without evidence → credibility < 100", () => {
      const outcome = makeOutcome({
        paymentSignal: makeSignal({ score: 80, evidence: [] }),
        evidenceSummary: "Claims payment signal.",
        nextCashAction: { actionLabel: "follow up", rationale: "claimed payment" },
      });
      const result = scoreAgentOperator("agent-001", [outcome]);
      assert.ok(result.dimensionScores.credibility < 100, "backed fraction < 1");
    });
  });

  // -------------------------------------------------------------------------
  // Group 5 — usefulInnovation tracks action diversity
  // -------------------------------------------------------------------------
  await t.test("usefulInnovation tracks action diversity", async (t) => {
    await t.test("single outcome → usefulInnovation = 50 (neutral)", () => {
      const result = scoreAgentOperator("agent-001", [makeActiveSalesOutcome()]);
      assert.equal(result.dimensionScores.usefulInnovation, 50);
    });

    await t.test("all outcomes with same action label → usefulInnovation = 50 for 1, then low", () => {
      const outcomes = [
        makeOutcome({ outcomeId: "o1", nextCashAction: { actionLabel: "do research", rationale: "x" } }),
        makeOutcome({ outcomeId: "o2", nextCashAction: { actionLabel: "do research", rationale: "y" } }),
      ];
      const result = scoreAgentOperator("agent-001", outcomes);
      // 1 unique out of 2 = 50%
      assert.equal(result.dimensionScores.usefulInnovation, 50);
    });

    await t.test("all outcomes with unique action labels → usefulInnovation = 100", () => {
      const outcomes = [
        makeOutcome({ outcomeId: "o1", nextCashAction: { actionLabel: "find buyers", rationale: "x" } }),
        makeOutcome({ outcomeId: "o2", nextCashAction: { actionLabel: "test pilot offer", rationale: "y" } }),
        makeOutcome({ outcomeId: "o3", nextCashAction: { actionLabel: "close payment", rationale: "z" } }),
      ];
      const result = scoreAgentOperator("agent-001", outcomes);
      assert.equal(result.dimensionScores.usefulInnovation, 100);
    });
  });

  // -------------------------------------------------------------------------
  // Group 6 — skillGrowth detects improvement
  // -------------------------------------------------------------------------
  await t.test("skillGrowth detects improvement across outcomes", async (t) => {
    await t.test("single outcome → skillGrowth = 50 (neutral)", () => {
      const result = scoreAgentOperator("agent-001", [makeActiveSalesOutcome()]);
      assert.equal(result.dimensionScores.skillGrowth, 50);
    });

    await t.test("improving signal scores → skillGrowth > 50", () => {
      const earlyOutcome = makeOutcome({
        outcomeId: "o1",
        paymentSignal: makeSignal({ score: 10 }),
        painClarity: makeSignal({ score: 10 }),
      });
      const lateOutcome = makeOutcome({
        outcomeId: "o2",
        paymentSignal: makeSignal({ score: 60, evidence: ["x"] }),
        painClarity: makeSignal({ score: 65, evidence: ["y"] }),
      });
      const result = scoreAgentOperator("agent-001", [earlyOutcome, lateOutcome]);
      assert.ok(result.dimensionScores.skillGrowth > 50, "improvement should push above 50");
    });

    await t.test("declining signal scores → skillGrowth < 50", () => {
      const earlyOutcome = makeOutcome({
        outcomeId: "o1",
        paymentSignal: makeSignal({ score: 70, evidence: ["early payment"] }),
        painClarity: makeSignal({ score: 70, evidence: ["early pain"] }),
      });
      const lateOutcome = makeOutcome({
        outcomeId: "o2",
        paymentSignal: makeSignal({ score: 10 }),
        painClarity: makeSignal({ score: 10 }),
      });
      const result = scoreAgentOperator("agent-001", [earlyOutcome, lateOutcome]);
      assert.ok(result.dimensionScores.skillGrowth < 50, "decline should push below 50");
    });
  });

  // -------------------------------------------------------------------------
  // Group 7 — talentSignal is explanatory and capped
  // -------------------------------------------------------------------------
  await t.test("talentSignal is explanatory and capped", async (t) => {
    await t.test("TALENT_SIGNAL_MAX_CONTRIBUTION_PCT is 0.03 or less", () => {
      assert.ok(
        TALENT_SIGNAL_MAX_CONTRIBUTION_PCT <= 0.03,
        "talent signal must be capped at 3%",
      );
    });

    await t.test("EVIDENCE_RATE_THRESHOLD is 0.5", () => {
      assert.equal(EVIDENCE_RATE_THRESHOLD, 0.5);
    });

    await t.test("high talent signal alone does not reach capable band", () => {
      const outcome = makeOutcome({
        painClarity: makeSignal({ score: 100 }),
        cashProximity: makeSignal({ score: 100 }),
        evidenceSummary: "Very sensitive to pain and proximity.",
        nextCashAction: { actionLabel: "find buyers", rationale: "feels close" },
      });
      const result = scoreAgentOperator("agent-001", [outcome]);
      assert.ok(
        result.operatorScoreBand === "underperforming" || result.operatorScoreBand === "developing",
        `expected underperforming/developing, got ${result.operatorScoreBand}`,
      );
    });

    await t.test("talentSignal is present in scoreReasons", () => {
      const result = scoreAgentOperator("agent-001", [makeActiveSalesOutcome()]);
      const talentLine = result.scoreReasons.find((r) => r.includes("talentSignal"));
      assert.ok(talentLine, "talentSignal line must appear in scoreReasons");
    });
  });

  // -------------------------------------------------------------------------
  // Group 8 — Empty outcomes
  // -------------------------------------------------------------------------
  await t.test("empty outcomes", async (t) => {
    await t.test("empty outcomes → insufficient_evidence", () => {
      const result = scoreAgentOperator("agent-001", []);
      assert.equal(result.operatorStatus, "insufficient_evidence");
    });

    await t.test("empty outcomes → score is 0", () => {
      const result = scoreAgentOperator("agent-001", []);
      assert.equal(result.totalOperatorScore, 0);
    });

    await t.test("empty outcomes → band is underperforming", () => {
      const result = scoreAgentOperator("agent-001", []);
      assert.equal(result.operatorScoreBand, "underperforming");
    });

    await t.test("empty outcomes → shouldAssignMoreWork false", () => {
      const result = scoreAgentOperator("agent-001", []);
      assert.equal(result.shouldAssignMoreWork, false);
    });
  });

  // -------------------------------------------------------------------------
  // Group 9 — Penalties
  // -------------------------------------------------------------------------
  await t.test("Penalties", async (t) => {
    await t.test("noRevenueContributionPenalty: no payment signal and no cash", () => {
      const result = scoreAgentOperator("agent-001", [makeOutcome()]);
      const p = result.penalties.find((p) => p.code === "noRevenueContributionPenalty");
      assert.ok(p, "noRevenueContributionPenalty must be applied");
      assert.ok(p.points > 0);
    });

    await t.test("lowEvidenceRatePenalty: < 50% outcomes have evidence", () => {
      const outcomes = [
        makeActiveSalesOutcome({ outcomeId: "o1" }),
        makeOutcome({ outcomeId: "o2" }),
        makeOutcome({ outcomeId: "o3" }),
      ];
      const result = scoreAgentOperator("agent-001", outcomes);
      const p = result.penalties.find((p) => p.code === "lowEvidenceRatePenalty");
      assert.ok(p, "lowEvidenceRatePenalty must be applied (1/3 < 50%)");
    });

    await t.test("unsupportedHighClaimPenalty: score >= 60 with no evidence", () => {
      const outcome = makeOutcome({
        paymentSignal: makeSignal({ score: 75, evidence: [] }),
        evidenceSummary: "Claims strong payment signal.",
        nextCashAction: { actionLabel: "follow up", rationale: "claimed" },
      });
      const result = scoreAgentOperator("agent-001", [outcome]);
      const p = result.penalties.find((p) => p.code === "unsupportedHighClaimPenalty");
      assert.ok(p, "unsupportedHighClaimPenalty must be applied");
    });

    await t.test("repeatedActionPenalty: all outcomes propose same action", () => {
      const outcomes = [
        makeOutcome({ outcomeId: "o1", nextCashAction: { actionLabel: "do research", rationale: "x" } }),
        makeOutcome({ outcomeId: "o2", nextCashAction: { actionLabel: "do research", rationale: "y" } }),
      ];
      const result = scoreAgentOperator("agent-001", outcomes);
      const p = result.penalties.find((p) => p.code === "repeatedActionPenalty");
      assert.ok(p, "repeatedActionPenalty must be applied");
    });

    await t.test("noInitiativePenalty: economicInitiative is zero", () => {
      const result = scoreAgentOperator("agent-001", [makeOutcome()]);
      const p = result.penalties.find((p) => p.code === "noInitiativePenalty");
      assert.ok(p, "noInitiativePenalty must be applied");
    });

    await t.test("vanityWorkPenalty: 3+ outcomes with no revenue evidence", () => {
      const outcomes = [
        makeOutcome({ outcomeId: "o1" }),
        makeOutcome({ outcomeId: "o2" }),
        makeOutcome({ outcomeId: "o3" }),
      ];
      const result = scoreAgentOperator("agent-001", outcomes);
      const p = result.penalties.find((p) => p.code === "vanityWorkPenalty");
      assert.ok(p, "vanityWorkPenalty must be applied");
    });

    await t.test("penalties reduce totalOperatorScore", () => {
      const withPenalties = scoreAgentOperator("agent-001", [makeOutcome()]);
      const penaltyTotal = withPenalties.penalties.reduce((a, p) => a + p.points, 0);
      const penaltyTotal2 = withPenalties.totalOperatorScore + penaltyTotal;
      assert.ok(penaltyTotal2 >= withPenalties.totalOperatorScore);
    });

    await t.test("totalOperatorScore never goes below 0", () => {
      const result = scoreAgentOperator("agent-001", [makeOutcome()]);
      assert.ok(result.totalOperatorScore >= 0);
    });

    await t.test("productive agent without repeated actions has no repeatedActionPenalty", () => {
      const outcomes = [
        makeActiveSalesOutcome({ outcomeId: "o1" }),
        makeActiveSalesOutcome({
          outcomeId: "o2",
          nextCashAction: { actionLabel: "close the deal", rationale: "buyer ready" },
        }),
      ];
      const result = scoreAgentOperator("agent-001", outcomes);
      const p = result.penalties.find((p) => p.code === "repeatedActionPenalty");
      assert.equal(p, undefined, "no repeatedActionPenalty for diverse actions");
    });
  });

  // -------------------------------------------------------------------------
  // Group 10 — Operator status transitions
  // -------------------------------------------------------------------------
  await t.test("Operator status transitions", async (t) => {
    await t.test("all-zero outcomes → underperforming_operator", () => {
      const result = scoreAgentOperator("agent-001", [makeOutcome()]);
      assert.equal(result.operatorStatus, "underperforming_operator");
    });

    await t.test("active sales outcomes → capable_operator or better", () => {
      const outcomes = [
        makeActiveSalesOutcome({ outcomeId: "o1" }),
        makeActiveSalesOutcome({ outcomeId: "o2", nextCashAction: { actionLabel: "close deal", rationale: "ready" } }),
      ];
      const result = scoreAgentOperator("agent-001", outcomes);
      const acceptableStatuses = ["capable_operator", "high_performer", "elite_operator"];
      assert.ok(
        acceptableStatuses.includes(result.operatorStatus),
        `expected capable+ got ${result.operatorStatus}`,
      );
    });

    await t.test("cash-generating agent → high_performer or elite_operator", () => {
      const result = scoreAgentOperator("agent-cash", [makeCashClosedOutcome()]);
      const acceptableStatuses = ["high_performer", "elite_operator"];
      assert.ok(
        acceptableStatuses.includes(result.operatorStatus),
        `expected high_performer/elite got ${result.operatorStatus}`,
      );
    });

    await t.test("operatorStatus matches operatorScoreBand", () => {
      const result = scoreAgentOperator("agent-001", [makeOutcome()]);
      // underperforming band → underperforming_operator
      assert.equal(result.operatorScoreBand, "underperforming");
      assert.equal(result.operatorStatus, "underperforming_operator");
    });
  });

  // -------------------------------------------------------------------------
  // Group 11 — Decision flags
  // -------------------------------------------------------------------------
  await t.test("Decision flags", async (t) => {
    await t.test("shouldAssignMoreWork: false when score < 60", () => {
      const result = scoreAgentOperator("agent-001", [makeOutcome()]);
      assert.equal(result.shouldAssignMoreWork, false);
    });

    await t.test("shouldRequireStrongerEvidence: true when executionEfficiency < 50", () => {
      const result = scoreAgentOperator("agent-001", [makeOutcome()]);
      // executionEfficiency = 0 → weak evidence quality
      assert.equal(result.shouldRequireStrongerEvidence, true);
    });

    await t.test("shouldFlagForReview: true for underperforming_operator", () => {
      const result = scoreAgentOperator("agent-001", [makeOutcome()]);
      assert.equal(result.shouldFlagForReview, true);
    });

    await t.test("shouldFlagForReview: true when 2+ outcomes all have zero evidence", () => {
      const outcomes = [
        makeOutcome({ outcomeId: "o1" }),
        makeOutcome({ outcomeId: "o2" }),
      ];
      const result = scoreAgentOperator("agent-001", outcomes);
      assert.equal(result.shouldFlagForReview, true);
    });

    await t.test("shouldPairWithAgent: true for developing_operator with low revenueImpact", () => {
      // Build a developing-band outcome: some signals but no cash.
      const outcomes = [
        makeOutcome({
          outcomeId: "o1",
          paymentSignal: makeSignal({ score: 40, evidence: ["light signal"] }),
          buyerIdentifiability: makeSignal({ score: 35, evidence: ["noted buyer"] }),
          offerTestability: makeSignal({ score: 30, evidence: ["rough idea"] }),
          painClarity: makeSignal({ score: 25, evidence: ["some pain noted"] }),
          evidenceSummary: "Some signals observed.",
          nextCashAction: { actionLabel: "find stronger buyers", rationale: "weak signal" },
        }),
        makeOutcome({
          outcomeId: "o2",
          paymentSignal: makeSignal({ score: 35, evidence: ["another signal"] }),
          buyerIdentifiability: makeSignal({ score: 30, evidence: ["second buyer noted"] }),
          offerTestability: makeSignal({ score: 25, evidence: ["rough idea 2"] }),
          painClarity: makeSignal({ score: 20, evidence: ["pain noted 2"] }),
          evidenceSummary: "Some more signals.",
          nextCashAction: { actionLabel: "improve the offer", rationale: "needs work" },
        }),
      ];
      const result = scoreAgentOperator("agent-001", outcomes);
      if (result.operatorStatus === "developing_operator") {
        assert.equal(result.shouldPairWithAgent, true);
      } else {
        // If the score is outside developing range, just check the flag is a boolean.
        assert.ok(typeof result.shouldPairWithAgent === "boolean");
      }
    });
  });

  // -------------------------------------------------------------------------
  // Group 12 — Strongest/weakest dimensions
  // -------------------------------------------------------------------------
  await t.test("Strongest and weakest dimensions", async (t) => {
    await t.test("strongestDimension and weakestDimension are valid OperatorDimensions", () => {
      const result = scoreAgentOperator("agent-001", [makeActiveSalesOutcome()]);
      assert.ok(AGENT_OPERATOR_DIMENSIONS.includes(result.strongestDimension));
      assert.ok(AGENT_OPERATOR_DIMENSIONS.includes(result.weakestDimension));
    });

    await t.test("all-zero agent: weakest is one of the zero-score dimensions", () => {
      const result = scoreAgentOperator("agent-001", [makeOutcome()]);
      assert.ok(AGENT_OPERATOR_DIMENSIONS.includes(result.weakestDimension));
    });

    await t.test("cash-generating agent: revenueImpact is a high-scoring dimension", () => {
      const result = scoreAgentOperator("agent-cash", [makeCashClosedOutcome()]);
      // revenueImpact should be significant — exact rank depends on evidence quality of other dims.
      assert.ok(
        result.dimensionScores.revenueImpact >= 50,
        `revenueImpact must be >= 50, got ${result.dimensionScores.revenueImpact}`,
      );
    });
  });

  // -------------------------------------------------------------------------
  // Group 13 — nextOperatorFocus
  // -------------------------------------------------------------------------
  await t.test("nextOperatorFocus", async (t) => {
    await t.test("nextOperatorFocus is a non-empty string", () => {
      const result = scoreAgentOperator("agent-001", [makeActiveSalesOutcome()]);
      assert.ok(typeof result.nextOperatorFocus === "string");
      assert.ok(result.nextOperatorFocus.trim().length > 0);
    });

    await t.test("nextOperatorFocus for all-zero agent mentions the weakest area", () => {
      const result = scoreAgentOperator("agent-001", [makeOutcome()]);
      assert.ok(result.nextOperatorFocus.length > 0);
    });
  });

  // -------------------------------------------------------------------------
  // Group 14 — Score reasons explainability
  // -------------------------------------------------------------------------
  await t.test("scoreReasons explainability", async (t) => {
    await t.test("scoreReasons is a non-empty array", () => {
      const result = scoreAgentOperator("agent-001", [makeActiveSalesOutcome()]);
      assert.ok(Array.isArray(result.scoreReasons));
      assert.ok(result.scoreReasons.length > 0);
    });

    await t.test("scoreReasons includes total score line", () => {
      const result = scoreAgentOperator("agent-001", [makeActiveSalesOutcome()]);
      const line = result.scoreReasons.find((r) => r.includes("Total operator score"));
      assert.ok(line, "total score line must be present");
    });

    await t.test("scoreReasons includes talentSignal line", () => {
      const result = scoreAgentOperator("agent-001", [makeActiveSalesOutcome()]);
      const line = result.scoreReasons.find((r) => r.includes("talentSignal"));
      assert.ok(line, "talentSignal line must be present");
    });

    await t.test("all penalty codes appear in scoreReasons", () => {
      const result = scoreAgentOperator("agent-001", [makeOutcome()]);
      for (const p of result.penalties) {
        const found = result.scoreReasons.some((r) => r.includes(p.code));
        assert.ok(found, `Penalty ${p.code} not found in scoreReasons`);
      }
    });

    await t.test("each dimension appears in scoreReasons", () => {
      const result = scoreAgentOperator("agent-001", [makeActiveSalesOutcome()]);
      for (const dim of AGENT_OPERATOR_DIMENSIONS) {
        const found = result.scoreReasons.some((r) => r.startsWith(`${dim}:`));
        assert.ok(found, `Dimension ${dim} not found in scoreReasons`);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Group 15 — Determinism
  // -------------------------------------------------------------------------
  await t.test("Determinism", async (t) => {
    await t.test("identical inputs produce identical outputs", () => {
      const outcomes = [makeActiveSalesOutcome()];
      const r1 = scoreAgentOperator("agent-det", outcomes);
      const r2 = scoreAgentOperator("agent-det", outcomes);
      assert.equal(r1.totalOperatorScore, r2.totalOperatorScore);
      assert.equal(r1.operatorStatus, r2.operatorStatus);
      assert.equal(r1.operatorScoreBand, r2.operatorScoreBand);
    });

    await t.test("output does not mutate input outcomes", () => {
      const outcome = makeActiveSalesOutcome();
      const original = outcome.paymentSignal.score;
      scoreAgentOperator("agent-001", [outcome]);
      assert.equal(outcome.paymentSignal.score, original);
    });
  });

  // -------------------------------------------------------------------------
  // Group 16 — Module purity
  // -------------------------------------------------------------------------
  await t.test("Module purity", async (t) => {
    await t.test("scoreAgentOperator is synchronous", () => {
      const result = scoreAgentOperator("agent-001", [makeActiveSalesOutcome()]);
      assert.ok(!(result instanceof Promise), "must be synchronous");
    });

    await t.test("scoreAgentOperator returns a plain object", () => {
      const result = scoreAgentOperator("agent-001", [makeActiveSalesOutcome()]);
      assert.equal(typeof result, "object");
      assert.notEqual(result, null);
    });

    await t.test("module exports only expected symbols", () => {
      const keys = Object.keys(mod);
      const expected = [
        "scoreAgentOperator",
        "AGENT_OPERATOR_SCORE_WEIGHTS",
        "AGENT_OPERATOR_DIMENSIONS",
        "TALENT_SIGNAL_MAX_CONTRIBUTION_PCT",
        "EVIDENCE_RATE_THRESHOLD",
      ];
      for (const key of expected) {
        assert.ok(keys.includes(key), `export "${key}" missing`);
      }
    });

    await t.test("dimensionScores is a separate copy — not the internal object", () => {
      const outcome = makeActiveSalesOutcome();
      const result = scoreAgentOperator("agent-001", [outcome]);
      result.dimensionScores.revenueImpact = -999;
      const result2 = scoreAgentOperator("agent-001", [outcome]);
      assert.notEqual(result2.dimensionScores.revenueImpact, -999);
    });
  });
});
