#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

// ---------------------------------------------------------------------------
// Fixtures — pre-built score objects (not running the engines, just shapes)
// ---------------------------------------------------------------------------

function makeVentureScore(overrides = {}) {
  return {
    ventureId: "venture-001",
    totalCashScore: 50,
    cashScoreBand: "promising",
    cashScoreReasons: ["Total cash score: 50/100 (continue_candidate)."],
    penalties: [],
    survivalStatus: "continue_candidate",
    shouldContinue: true,
    shouldPivot: false,
    isKillCandidate: false,
    shouldRequestCeoDecision: false,
    strongestSignal: "paymentSignal",
    weakestSignal: "customerProof",
    nextScoreFocus: "Convert payment signals into closed cash.",
    humanOnTheLoop: true,
    approvalRequired: true,
    noExecutionAuthorized: true,
    ...overrides,
  };
}

function makeCashReadyVenture(overrides = {}) {
  return makeVentureScore({
    ventureId: "venture-cash",
    totalCashScore: 88,
    cashScoreBand: "cash_ready",
    survivalStatus: "cash_ready",
    shouldContinue: true,
    shouldRequestCeoDecision: true,
    ...overrides,
  });
}

function makeKillCandidateVenture(overrides = {}) {
  return makeVentureScore({
    ventureId: "venture-kill",
    totalCashScore: 8,
    cashScoreBand: "blocked",
    survivalStatus: "kill_candidate",
    shouldContinue: false,
    isKillCandidate: true,
    shouldRequestCeoDecision: true,
    ...overrides,
  });
}

function makePivotVenture(overrides = {}) {
  return makeVentureScore({
    ventureId: "venture-pivot",
    totalCashScore: 22,
    cashScoreBand: "weak",
    survivalStatus: "pivot_candidate",
    shouldContinue: false,
    shouldPivot: true,
    shouldRequestCeoDecision: true,
    ...overrides,
  });
}

function makeInsufficientEvidenceVenture(overrides = {}) {
  return makeVentureScore({
    ventureId: "venture-empty",
    totalCashScore: 0,
    cashScoreBand: "blocked",
    survivalStatus: "insufficient_evidence",
    shouldContinue: false,
    ...overrides,
  });
}

const DIMENSION_SCORES_DEFAULT = {
  revenueImpact: 50,
  economicInitiative: 40,
  executionEfficiency: 60,
  productionQuality: 40,
  credibility: 60,
  usefulInnovation: 50,
  skillGrowth: 50,
};

function makeAgentScore(overrides = {}) {
  return {
    agentId: "agent-001",
    totalOperatorScore: 50,
    operatorScoreBand: "capable",
    dimensionScores: { ...DIMENSION_SCORES_DEFAULT },
    talentSignal: 45,
    scoreReasons: ["Total operator score: 50/100 (capable_operator)."],
    penalties: [],
    operatorStatus: "capable_operator",
    shouldAssignMoreWork: false,
    shouldRequireStrongerEvidence: false,
    shouldPairWithAgent: false,
    shouldFlagForReview: false,
    strongestDimension: "executionEfficiency",
    weakestDimension: "economicInitiative",
    nextOperatorFocus: "Pursue payment signals.",
    humanOnTheLoop: true,
    approvalRequired: true,
    noExecutionAuthorized: true,
    ...overrides,
  };
}

function makeHighPerformerAgent(overrides = {}) {
  return makeAgentScore({
    agentId: "agent-high",
    totalOperatorScore: 78,
    operatorScoreBand: "high_performer",
    operatorStatus: "high_performer",
    shouldAssignMoreWork: true,
    ...overrides,
  });
}

function makeEliteAgent(overrides = {}) {
  return makeAgentScore({
    agentId: "agent-elite",
    totalOperatorScore: 92,
    operatorScoreBand: "elite_operator",
    operatorStatus: "elite_operator",
    shouldAssignMoreWork: true,
    ...overrides,
  });
}

function makeDevelopingAgent(overrides = {}) {
  return makeAgentScore({
    agentId: "agent-dev",
    totalOperatorScore: 30,
    operatorScoreBand: "developing",
    operatorStatus: "developing_operator",
    shouldAssignMoreWork: false,
    shouldPairWithAgent: true,
    shouldRequireStrongerEvidence: true,
    ...overrides,
  });
}

function makeUnderperformingAgent(overrides = {}) {
  return makeAgentScore({
    agentId: "agent-under",
    totalOperatorScore: 12,
    operatorScoreBand: "underperforming",
    operatorStatus: "underperforming_operator",
    shouldAssignMoreWork: false,
    shouldRequireStrongerEvidence: true,
    shouldFlagForReview: true,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("ExecutiveSelectionIndex", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mod = await jiti.import(
    path.join(__dirname, "executive-selection-index.ts"),
  );
  const {
    selectVentureAllocation,
    selectAgentAllocation,
    buildExecutiveSelectionIndex,
    VENTURE_PRIORITY_RANK,
    AGENT_TRUST_RANK,
  } = mod;

  // -------------------------------------------------------------------------
  // Group 1 — Governance locks on single-decision functions
  // -------------------------------------------------------------------------
  await t.test("Governance locks — selectVentureAllocation", async (t) => {
    await t.test("humanOnTheLoop is true", () => {
      assert.equal(selectVentureAllocation(makeVentureScore()).humanOnTheLoop, true);
    });
    await t.test("approvalRequired is true", () => {
      assert.equal(selectVentureAllocation(makeVentureScore()).approvalRequired, true);
    });
    await t.test("noExecutionAuthorized is true", () => {
      assert.equal(selectVentureAllocation(makeVentureScore()).noExecutionAuthorized, true);
    });
  });

  await t.test("Governance locks — selectAgentAllocation", async (t) => {
    await t.test("humanOnTheLoop is true", () => {
      assert.equal(selectAgentAllocation(makeAgentScore()).humanOnTheLoop, true);
    });
    await t.test("approvalRequired is true", () => {
      assert.equal(selectAgentAllocation(makeAgentScore()).approvalRequired, true);
    });
    await t.test("noExecutionAuthorized is true", () => {
      assert.equal(selectAgentAllocation(makeAgentScore()).noExecutionAuthorized, true);
    });
  });

  await t.test("Governance locks — buildExecutiveSelectionIndex", async (t) => {
    await t.test("humanOnTheLoop is true on index", () => {
      const idx = buildExecutiveSelectionIndex([makeVentureScore()], [makeAgentScore()]);
      assert.equal(idx.humanOnTheLoop, true);
    });
    await t.test("approvalRequired is true on index", () => {
      const idx = buildExecutiveSelectionIndex([makeVentureScore()], [makeAgentScore()]);
      assert.equal(idx.approvalRequired, true);
    });
    await t.test("noExecutionAuthorized is true on index", () => {
      const idx = buildExecutiveSelectionIndex([makeVentureScore()], [makeAgentScore()]);
      assert.equal(idx.noExecutionAuthorized, true);
    });
  });

  // -------------------------------------------------------------------------
  // Group 2 — Venture allocation rules
  // -------------------------------------------------------------------------
  await t.test("Venture allocation rules", async (t) => {
    await t.test("cash_ready → deserves_more_compute", () => {
      const d = selectVentureAllocation(makeCashReadyVenture());
      assert.equal(d.allocation, "deserves_more_compute");
    });

    await t.test("continue_candidate → maintain_allocation", () => {
      const d = selectVentureAllocation(makeVentureScore());
      assert.equal(d.allocation, "maintain_allocation");
    });

    await t.test("pivot_candidate → needs_ceo_review", () => {
      const d = selectVentureAllocation(makePivotVenture());
      assert.equal(d.allocation, "needs_ceo_review");
    });

    await t.test("kill_candidate → kill_candidate allocation", () => {
      const d = selectVentureAllocation(makeKillCandidateVenture());
      assert.equal(d.allocation, "kill_candidate");
    });

    await t.test("insufficient_evidence → should_be_paused", () => {
      const d = selectVentureAllocation(makeInsufficientEvidenceVenture());
      assert.equal(d.allocation, "should_be_paused");
    });
  });

  // -------------------------------------------------------------------------
  // Group 3 — Venture priority levels
  // -------------------------------------------------------------------------
  await t.test("Venture priority levels", async (t) => {
    await t.test("cash_ready → critical priority", () => {
      assert.equal(selectVentureAllocation(makeCashReadyVenture()).priority, "critical");
    });

    await t.test("continue_candidate score >= 60 → high priority", () => {
      const d = selectVentureAllocation(makeVentureScore({ totalCashScore: 65 }));
      assert.equal(d.priority, "high");
    });

    await t.test("continue_candidate score < 60 → standard priority", () => {
      const d = selectVentureAllocation(makeVentureScore({ totalCashScore: 45 }));
      assert.equal(d.priority, "standard");
    });

    await t.test("pivot_candidate → low priority", () => {
      assert.equal(selectVentureAllocation(makePivotVenture()).priority, "low");
    });

    await t.test("kill_candidate → paused priority", () => {
      assert.equal(selectVentureAllocation(makeKillCandidateVenture()).priority, "paused");
    });

    await t.test("insufficient_evidence → paused priority", () => {
      assert.equal(selectVentureAllocation(makeInsufficientEvidenceVenture()).priority, "paused");
    });
  });

  // -------------------------------------------------------------------------
  // Group 4 — CEO decision required
  // -------------------------------------------------------------------------
  await t.test("ceoDecisionRequired", async (t) => {
    await t.test("kill_candidate always requires CEO decision", () => {
      assert.equal(selectVentureAllocation(makeKillCandidateVenture()).ceoDecisionRequired, true);
    });

    await t.test("pivot_candidate (needs_ceo_review) requires CEO decision", () => {
      assert.equal(selectVentureAllocation(makePivotVenture()).ceoDecisionRequired, true);
    });

    await t.test("cash_ready with shouldRequestCeoDecision requires CEO decision", () => {
      assert.equal(selectVentureAllocation(makeCashReadyVenture()).ceoDecisionRequired, true);
    });

    await t.test("continue_candidate with no CEO flag does not require CEO decision", () => {
      const d = selectVentureAllocation(
        makeVentureScore({ shouldRequestCeoDecision: false }),
      );
      assert.equal(d.ceoDecisionRequired, false);
    });

    await t.test("continue_candidate with upstream CEO flag propagates it", () => {
      const d = selectVentureAllocation(
        makeVentureScore({ shouldRequestCeoDecision: true }),
      );
      assert.equal(d.ceoDecisionRequired, true);
    });
  });

  // -------------------------------------------------------------------------
  // Group 5 — Agent allocation rules
  // -------------------------------------------------------------------------
  await t.test("Agent allocation rules", async (t) => {
    await t.test("shouldFlagForReview → flag_for_review (highest priority)", () => {
      const d = selectAgentAllocation(makeUnderperformingAgent());
      assert.equal(d.allocation, "flag_for_review");
    });

    await t.test("shouldPairWithAgent (and not flagged) → should_be_paired", () => {
      const d = selectAgentAllocation(makeDevelopingAgent());
      assert.equal(d.allocation, "should_be_paired");
    });

    await t.test("shouldAssignMoreWork (and not flagged/paired) → deserves_more_work", () => {
      const d = selectAgentAllocation(makeHighPerformerAgent());
      assert.equal(d.allocation, "deserves_more_work");
    });

    await t.test("shouldRequireStrongerEvidence only → needs_stronger_evidence", () => {
      const d = selectAgentAllocation(
        makeAgentScore({
          shouldRequireStrongerEvidence: true,
          shouldAssignMoreWork: false,
          shouldPairWithAgent: false,
          shouldFlagForReview: false,
        }),
      );
      assert.equal(d.allocation, "needs_stronger_evidence");
    });

    await t.test("no flags set → maintain_allocation", () => {
      const d = selectAgentAllocation(makeAgentScore());
      assert.equal(d.allocation, "maintain_allocation");
    });

    await t.test("shouldFlagForReview takes priority over shouldAssignMoreWork", () => {
      // Edge case: agent scores >= 60 but also 2+ zero-evidence outcomes
      const d = selectAgentAllocation(
        makeAgentScore({
          shouldAssignMoreWork: true,
          shouldFlagForReview: true,
        }),
      );
      assert.equal(d.allocation, "flag_for_review");
    });
  });

  // -------------------------------------------------------------------------
  // Group 6 — Agent trust levels
  // -------------------------------------------------------------------------
  await t.test("Agent trust levels", async (t) => {
    await t.test("elite_operator → high trust", () => {
      assert.equal(selectAgentAllocation(makeEliteAgent()).trustLevel, "high");
    });

    await t.test("high_performer → high trust", () => {
      assert.equal(selectAgentAllocation(makeHighPerformerAgent()).trustLevel, "high");
    });

    await t.test("capable_operator → standard trust", () => {
      assert.equal(selectAgentAllocation(makeAgentScore()).trustLevel, "standard");
    });

    await t.test("developing_operator → watch trust", () => {
      assert.equal(selectAgentAllocation(makeDevelopingAgent()).trustLevel, "watch");
    });

    await t.test("insufficient_evidence → watch trust", () => {
      const d = selectAgentAllocation(
        makeAgentScore({ operatorStatus: "insufficient_evidence" }),
      );
      assert.equal(d.trustLevel, "watch");
    });

    await t.test("underperforming_operator → needs_review trust", () => {
      assert.equal(selectAgentAllocation(makeUnderperformingAgent()).trustLevel, "needs_review");
    });
  });

  // -------------------------------------------------------------------------
  // Group 7 — Priority rank constants (structural competition ordering)
  // -------------------------------------------------------------------------
  await t.test("Priority rank constants", async (t) => {
    await t.test("critical ranks above high", () => {
      assert.ok(VENTURE_PRIORITY_RANK.critical < VENTURE_PRIORITY_RANK.high);
    });

    await t.test("high ranks above standard", () => {
      assert.ok(VENTURE_PRIORITY_RANK.high < VENTURE_PRIORITY_RANK.standard);
    });

    await t.test("standard ranks above low", () => {
      assert.ok(VENTURE_PRIORITY_RANK.standard < VENTURE_PRIORITY_RANK.low);
    });

    await t.test("low ranks above paused", () => {
      assert.ok(VENTURE_PRIORITY_RANK.low < VENTURE_PRIORITY_RANK.paused);
    });

    await t.test("high trust ranks above standard", () => {
      assert.ok(AGENT_TRUST_RANK.high < AGENT_TRUST_RANK.standard);
    });

    await t.test("standard trust ranks above watch", () => {
      assert.ok(AGENT_TRUST_RANK.standard < AGENT_TRUST_RANK.watch);
    });

    await t.test("watch ranks above needs_review", () => {
      assert.ok(AGENT_TRUST_RANK.watch < AGENT_TRUST_RANK.needs_review);
    });
  });

  // -------------------------------------------------------------------------
  // Group 8 — buildExecutiveSelectionIndex
  // -------------------------------------------------------------------------
  await t.test("buildExecutiveSelectionIndex", async (t) => {
    await t.test("includes a decision for every venture", () => {
      const ventures = [makeCashReadyVenture(), makeVentureScore(), makeKillCandidateVenture()];
      const idx = buildExecutiveSelectionIndex(ventures, []);
      assert.equal(idx.ventures.length, 3);
    });

    await t.test("includes a decision for every agent", () => {
      const agents = [makeHighPerformerAgent(), makeDevelopingAgent()];
      const idx = buildExecutiveSelectionIndex([], agents);
      assert.equal(idx.agents.length, 2);
    });

    await t.test("empty inputs produce an empty but valid index", () => {
      const idx = buildExecutiveSelectionIndex([], []);
      assert.equal(idx.ventures.length, 0);
      assert.equal(idx.agents.length, 0);
      assert.equal(idx.topVentureIds.length, 0);
      assert.equal(idx.topAgentIds.length, 0);
      assert.ok(idx.indexSummary.length > 0);
      assert.equal(idx.humanOnTheLoop, true);
    });

    await t.test("single venture and single agent", () => {
      const idx = buildExecutiveSelectionIndex([makeVentureScore()], [makeAgentScore()]);
      assert.equal(idx.ventures.length, 1);
      assert.equal(idx.agents.length, 1);
    });
  });

  // -------------------------------------------------------------------------
  // Group 9 — topVentureIds sorting
  // -------------------------------------------------------------------------
  await t.test("topVentureIds sorting", async (t) => {
    await t.test("cash_ready (critical) comes before continue_candidate (standard)", () => {
      const ventures = [
        makeVentureScore({ ventureId: "v-continue" }),
        makeCashReadyVenture({ ventureId: "v-cash" }),
      ];
      const idx = buildExecutiveSelectionIndex(ventures, []);
      assert.equal(idx.topVentureIds[0], "v-cash");
    });

    await t.test("kill_candidate comes after continue_candidate", () => {
      const ventures = [
        makeKillCandidateVenture({ ventureId: "v-kill" }),
        makeVentureScore({ ventureId: "v-continue" }),
      ];
      const idx = buildExecutiveSelectionIndex(ventures, []);
      assert.equal(idx.topVentureIds[0], "v-continue");
      assert.equal(idx.topVentureIds[1], "v-kill");
    });

    await t.test("same priority: higher cash score ranked first", () => {
      const ventures = [
        makeVentureScore({ ventureId: "v-low",  totalCashScore: 45 }),
        makeVentureScore({ ventureId: "v-high", totalCashScore: 65 }),
      ];
      const idx = buildExecutiveSelectionIndex(ventures, []);
      assert.equal(idx.topVentureIds[0], "v-high");
    });

    await t.test("topVentureIds contains all ventureIds", () => {
      const ventures = [
        makeCashReadyVenture(),
        makeVentureScore(),
        makeKillCandidateVenture(),
        makePivotVenture(),
      ];
      const idx = buildExecutiveSelectionIndex(ventures, []);
      assert.equal(idx.topVentureIds.length, 4);
    });
  });

  // -------------------------------------------------------------------------
  // Group 10 — topAgentIds sorting
  // -------------------------------------------------------------------------
  await t.test("topAgentIds sorting", async (t) => {
    await t.test("high trust comes before standard trust", () => {
      const agents = [
        makeAgentScore({ agentId: "a-capable" }),
        makeHighPerformerAgent({ agentId: "a-high" }),
      ];
      const idx = buildExecutiveSelectionIndex([], agents);
      assert.equal(idx.topAgentIds[0], "a-high");
    });

    await t.test("underperforming comes last", () => {
      const agents = [
        makeUnderperformingAgent({ agentId: "a-under" }),
        makeAgentScore({ agentId: "a-capable" }),
      ];
      const idx = buildExecutiveSelectionIndex([], agents);
      assert.equal(idx.topAgentIds[0], "a-capable");
      assert.equal(idx.topAgentIds[1], "a-under");
    });

    await t.test("same trust level: higher operator score ranked first", () => {
      const agents = [
        makeHighPerformerAgent({ agentId: "a-low",  totalOperatorScore: 71 }),
        makeHighPerformerAgent({ agentId: "a-high", totalOperatorScore: 85 }),
      ];
      const idx = buildExecutiveSelectionIndex([], agents);
      assert.equal(idx.topAgentIds[0], "a-high");
    });
  });

  // -------------------------------------------------------------------------
  // Group 11 — indexSummary content
  // -------------------------------------------------------------------------
  await t.test("indexSummary content", async (t) => {
    await t.test("mentions venture and agent counts", () => {
      const idx = buildExecutiveSelectionIndex(
        [makeVentureScore(), makeCashReadyVenture()],
        [makeAgentScore()],
      );
      assert.match(idx.indexSummary, /2 venture/);
      assert.match(idx.indexSummary, /1 agent/);
    });

    await t.test("mentions cash-ready count when present", () => {
      const idx = buildExecutiveSelectionIndex([makeCashReadyVenture()], []);
      assert.match(idx.indexSummary, /cash-ready/i);
    });

    await t.test("mentions kill candidate count when present", () => {
      const idx = buildExecutiveSelectionIndex([makeKillCandidateVenture()], []);
      assert.match(idx.indexSummary, /kill candidate/i);
    });

    await t.test("mentions high-trust agent count when present", () => {
      const idx = buildExecutiveSelectionIndex([], [makeEliteAgent()]);
      assert.match(idx.indexSummary, /high-trust/i);
    });

    await t.test("mentions flagged agent count when present", () => {
      const idx = buildExecutiveSelectionIndex([], [makeUnderperformingAgent()]);
      assert.match(idx.indexSummary, /flagged/i);
    });

    await t.test("no cash-ready mention when none exist", () => {
      const idx = buildExecutiveSelectionIndex([makeVentureScore()], []);
      assert.doesNotMatch(idx.indexSummary, /cash-ready/i);
    });
  });

  // -------------------------------------------------------------------------
  // Group 12 — reasons are human-readable
  // -------------------------------------------------------------------------
  await t.test("reasons are human-readable", async (t) => {
    await t.test("venture decision has non-empty reasons array", () => {
      const d = selectVentureAllocation(makeVentureScore());
      assert.ok(Array.isArray(d.reasons) && d.reasons.length > 0);
    });

    await t.test("agent decision has non-empty reasons array", () => {
      const d = selectAgentAllocation(makeAgentScore());
      assert.ok(Array.isArray(d.reasons) && d.reasons.length > 0);
    });

    await t.test("kill_candidate reason mentions CEO", () => {
      const d = selectVentureAllocation(makeKillCandidateVenture());
      const hasCeoMention = d.reasons.some((r) => r.toLowerCase().includes("ceo"));
      assert.ok(hasCeoMention, "kill_candidate reason must mention CEO");
    });

    await t.test("flag_for_review reason mentions review", () => {
      const d = selectAgentAllocation(makeUnderperformingAgent());
      const hasReviewMention = d.reasons.some((r) => r.toLowerCase().includes("review"));
      assert.ok(hasReviewMention, "flag_for_review reason must mention review");
    });
  });

  // -------------------------------------------------------------------------
  // Group 13 — Determinism
  // -------------------------------------------------------------------------
  await t.test("Determinism", async (t) => {
    await t.test("same venture input produces same allocation", () => {
      const v = makeVentureScore();
      const d1 = selectVentureAllocation(v);
      const d2 = selectVentureAllocation(v);
      assert.equal(d1.allocation, d2.allocation);
      assert.equal(d1.priority, d2.priority);
    });

    await t.test("same agent input produces same allocation", () => {
      const a = makeAgentScore();
      const d1 = selectAgentAllocation(a);
      const d2 = selectAgentAllocation(a);
      assert.equal(d1.allocation, d2.allocation);
      assert.equal(d1.trustLevel, d2.trustLevel);
    });

    await t.test("same index inputs produce same topVentureIds order", () => {
      const ventures = [makeCashReadyVenture(), makeVentureScore(), makeKillCandidateVenture()];
      const idx1 = buildExecutiveSelectionIndex(ventures, []);
      const idx2 = buildExecutiveSelectionIndex(ventures, []);
      assert.deepEqual(idx1.topVentureIds, idx2.topVentureIds);
    });
  });

  // -------------------------------------------------------------------------
  // Group 14 — Module purity
  // -------------------------------------------------------------------------
  await t.test("Module purity", async (t) => {
    await t.test("selectVentureAllocation is synchronous", () => {
      const result = selectVentureAllocation(makeVentureScore());
      assert.ok(!(result instanceof Promise));
    });

    await t.test("selectAgentAllocation is synchronous", () => {
      const result = selectAgentAllocation(makeAgentScore());
      assert.ok(!(result instanceof Promise));
    });

    await t.test("buildExecutiveSelectionIndex is synchronous", () => {
      const result = buildExecutiveSelectionIndex([], []);
      assert.ok(!(result instanceof Promise));
    });

    await t.test("module exports all expected symbols", () => {
      const keys = Object.keys(mod);
      for (const sym of [
        "selectVentureAllocation",
        "selectAgentAllocation",
        "buildExecutiveSelectionIndex",
        "VENTURE_PRIORITY_RANK",
        "AGENT_TRUST_RANK",
      ]) {
        assert.ok(keys.includes(sym), `export "${sym}" missing`);
      }
    });

    await t.test("input objects are not mutated", () => {
      const v = makeVentureScore();
      const original = v.survivalStatus;
      selectVentureAllocation(v);
      assert.equal(v.survivalStatus, original);
    });
  });
});
