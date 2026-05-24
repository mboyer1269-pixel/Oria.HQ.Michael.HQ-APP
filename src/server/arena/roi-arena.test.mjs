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
  },
});

const arenaPath = path.join(projectRoot, "src/server/arena/roi-arena.ts");
const { evaluateCandidate, rankCandidates, estimateCandidateValue } = await jiti.import(arenaPath);

function missionCandidate(overrides = {}) {
  return {
    id: "cand-1",
    kind: "mission",
    title: "Test Mission",
    workspaceId: "ws-1",
    skillId: "board.consult",
    agentId: "joris",
    autonomyLevel: 1,
    riskLevel: "low",
    assumedRevenueInfluencedCents: 50_000,
    estimatedCostCents: 5_000,
    ...overrides,
  };
}

// Test 1: mission with positive net value above threshold → promising
test("mission with positive net value above threshold is promising", () => {
  const verdict = evaluateCandidate(missionCandidate());
  assert.equal(verdict.decision, "promising");
  assert.ok(verdict.score >= 70, `expected score >= 70, got ${verdict.score}`);
  assert.ok(verdict.netValueCents > 0);
  assert.equal(verdict.executable, true);
  assert.equal(verdict.kind, "mission");
});

// Test 2: cost > revenue → reject
test("candidate where cost exceeds revenue is rejected", () => {
  const verdict = evaluateCandidate(
    missionCandidate({
      assumedRevenueInfluencedCents: 1_000,
      estimatedCostCents: 2_000,
    }),
  );
  assert.equal(verdict.decision, "reject");
  assert.ok(verdict.netValueCents < 0);
});

// Test 3: effectful skill → guard denies, executable=false, not-evaluable
test("effectful skill causes guard to deny — verdict is not-evaluable and executable is false", () => {
  const verdict = evaluateCandidate(
    missionCandidate({
      skillId: "calendar.book",
      agentId: "joris",
    }),
  );
  assert.equal(verdict.decision, "not-evaluable");
  assert.equal(verdict.executable, false);
  assert.ok(typeof verdict.guardReason === "string", "guardReason must be a string");
  assert.ok(verdict.guardReason.length > 0);
});

// Test 4: unknown skill / guard blocked → no crash, not-evaluable
test("unknown skill does not crash and returns not-evaluable", () => {
  let verdict;
  assert.doesNotThrow(() => {
    verdict = evaluateCandidate(missionCandidate({ skillId: "does.not.exist" }));
  });
  assert.equal(verdict.decision, "not-evaluable");
  assert.equal(verdict.executable, false);
});

// Test 5: purity — verdict has no write/ledger/calendar/action surface
test("verdict contains no write, ledger, calendar, or real action surface", () => {
  const verdict = evaluateCandidate(missionCandidate());
  assert.ok(!("write" in verdict), "verdict must not contain 'write'");
  assert.ok(!("ledger" in verdict), "verdict must not contain 'ledger'");
  assert.ok(!("calendar" in verdict), "verdict must not contain 'calendar'");
  assert.ok(!("action" in verdict), "verdict must not contain 'action'");
  assert.ok(!("execute" in verdict), "verdict must not contain 'execute'");
  assert.ok(!("persist" in verdict), "verdict must not contain 'persist'");
});

// Test 6: determinism — same input → same score and verdict
test("same input always produces the same score and verdict", () => {
  const input = missionCandidate();
  const v1 = evaluateCandidate(input);
  const v2 = evaluateCandidate(input);
  assert.equal(v1.score, v2.score);
  assert.equal(v1.decision, v2.decision);
  assert.equal(v1.netValueCents, v2.netValueCents);
  assert.equal(v1.roiMultiple, v2.roiMultiple);
  assert.equal(v1.executable, v2.executable);
});

// Test 7: rankCandidates sorts by score descending, not-evaluable at bottom
test("rankCandidates sorts verdicts by score descending with not-evaluable last", () => {
  const candidates = [
    // roi=5, riskLevel=low, autonomy=1 → score=80
    missionCandidate({ id: "a", assumedRevenueInfluencedCents: 5_000, estimatedCostCents: 1_000 }),
    // roi≈1.5, riskLevel=high → score=45 (marginal)
    missionCandidate({
      id: "b",
      assumedRevenueInfluencedCents: 3_000,
      estimatedCostCents: 2_000,
      riskLevel: "high",
    }),
    // unknown skill → not-evaluable, score=0
    missionCandidate({ id: "c", skillId: "does.not.exist" }),
    // roi=50, riskLevel=low, autonomy=1 → score=80
    missionCandidate({
      id: "d",
      assumedRevenueInfluencedCents: 50_000,
      estimatedCostCents: 1_000,
    }),
  ];
  const ranked = rankCandidates(candidates);

  // not-evaluable must always be last
  assert.equal(
    ranked[ranked.length - 1].decision,
    "not-evaluable",
    "last verdict must be not-evaluable",
  );

  // evaluable verdicts must be sorted by score descending
  const evaluable = ranked.filter((v) => v.decision !== "not-evaluable");
  for (let i = 0; i < evaluable.length - 1; i++) {
    assert.ok(
      evaluable[i].score >= evaluable[i + 1].score,
      `scores must be non-increasing: [${i}]=${evaluable[i].score} vs [${i + 1}]=${evaluable[i + 1].score}`,
    );
  }
});

// Test 8: missing ROI data → not-evaluable
test("missing ROI data returns not-evaluable", () => {
  const noRevenue = evaluateCandidate(
    missionCandidate({ assumedRevenueInfluencedCents: undefined }),
  );
  assert.equal(noRevenue.decision, "not-evaluable");
  assert.equal(noRevenue.netValueCents, null);

  const noCost = evaluateCandidate(missionCandidate({ estimatedCostCents: undefined }));
  assert.equal(noCost.decision, "not-evaluable");
  assert.equal(noCost.netValueCents, null);
});

// Test 9: high risk penalized vs low risk
test("high risk mission has lower score than equivalent low risk mission", () => {
  const base = {
    assumedRevenueInfluencedCents: 50_000,
    estimatedCostCents: 5_000,
    autonomyLevel: 1,
  };
  const lowRisk = evaluateCandidate(missionCandidate({ ...base, riskLevel: "low" }));
  const medRisk = evaluateCandidate(missionCandidate({ ...base, riskLevel: "medium" }));
  const highRisk = evaluateCandidate(missionCandidate({ ...base, riskLevel: "high" }));

  assert.ok(lowRisk.score > highRisk.score, `low(${lowRisk.score}) must beat high(${highRisk.score})`);
  assert.ok(lowRisk.score > medRisk.score, `low(${lowRisk.score}) must beat medium(${medRisk.score})`);
  assert.ok(medRisk.score > highRisk.score, `medium(${medRisk.score}) must beat high(${highRisk.score})`);
});

// Test 10: autonomy levels 1-3 remain evaluable if guard OK; higher autonomy reduces score
test("autonomy levels 1-3 are evaluable and higher autonomy reduces score", () => {
  const base = {
    skillId: "board.consult",
    agentId: "joris",
    assumedRevenueInfluencedCents: 50_000,
    estimatedCostCents: 5_000,
    riskLevel: "low",
  };
  const a1 = evaluateCandidate(missionCandidate({ ...base, autonomyLevel: 1 }));
  const a2 = evaluateCandidate(missionCandidate({ ...base, autonomyLevel: 2 }));
  const a3 = evaluateCandidate(missionCandidate({ ...base, autonomyLevel: 3 }));

  // All three should be evaluable (guard accepts 1-3)
  assert.notEqual(a1.decision, "not-evaluable", "autonomy 1 must be evaluable");
  assert.notEqual(a2.decision, "not-evaluable", "autonomy 2 must be evaluable");
  assert.notEqual(a3.decision, "not-evaluable", "autonomy 3 must be evaluable");

  // Score must be non-increasing as autonomy increases
  assert.ok(a1.score >= a2.score, `autonomy 1 score(${a1.score}) must be >= autonomy 2 score(${a2.score})`);
  assert.ok(a2.score >= a3.score, `autonomy 2 score(${a2.score}) must be >= autonomy 3 score(${a3.score})`);
  assert.ok(a1.score > a3.score, `autonomy 1 score(${a1.score}) must be strictly higher than autonomy 3 score(${a3.score})`);
});

// Bonus: estimateCandidateValue returns null for missing fields
test("estimateCandidateValue returns null when revenue or cost is absent", () => {
  const r1 = estimateCandidateValue({ assumedRevenueInfluencedCents: 1000 });
  assert.equal(r1.netValueCents, null);
  assert.equal(r1.roiMultiple, null);

  const r2 = estimateCandidateValue({ estimatedCostCents: 500 });
  assert.equal(r2.netValueCents, null);

  const r3 = estimateCandidateValue({
    assumedRevenueInfluencedCents: 2000,
    estimatedCostCents: 500,
  });
  assert.equal(r3.netValueCents, 1500);
  assert.equal(r3.roiMultiple, 4);
});
