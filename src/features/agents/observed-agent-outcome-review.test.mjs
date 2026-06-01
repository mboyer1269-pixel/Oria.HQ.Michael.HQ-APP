#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("Observed agent outcome review recommendations", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const review = await jiti.import(path.join(__dirname, "observed-agent-outcome-review.ts"));
  const build = review.buildObservedAgentOutcomeReviewRecommendation;

  // Synthetic evaluation builders: the review reads only a handful of fields,
  // so plain objects keep the unit tests precise and decoupled from scoring.
  function makeScorecard(overrides = {}) {
    return {
      agentId: "joris",
      agentName: "Joris",
      role: "operator",
      status: "active",
      overallQualityScore: 85,
      readiness: "ready_to_measure",
      evidenceMode: "observed",
      dimensions: {},
      realizedProfitCents: 50000,
      ceoMinutesSaved: 180,
      guardrailViolations: 0,
      usefulOutputs: 8,
      reviewedOutputs: 10,
      evidenceGaps: [],
      humanOnTheLoop: true,
      noExecutionAuthorized: true,
      ...overrides,
    };
  }

  function makeEvaluation(overrides = {}) {
    const { scorecard, ...rest } = overrides;
    return {
      status: "evaluated",
      outcomeId: "outcome-1",
      agentId: "joris",
      outcomeStatus: "completed",
      riskLevel: "low",
      validation: { valid: true, errors: [] },
      observation: {
        agentId: "joris",
        realizedProfitCents: 50000,
        ceoMinutesSaved: 180,
        guardrailViolations: 0,
        usefulOutputs: 8,
        reviewedOutputs: 10,
      },
      scorecard: scorecard === undefined ? makeScorecard() : scorecard,
      evaluation: null,
      humanOnTheLoop: true,
      noExecutionAuthorized: true,
      ...rest,
    };
  }

  await t.test("strong outcome recommends eligible_for_controlled_expansion", () => {
    const result = build(makeEvaluation());
    assert.equal(result.decision, "eligible_for_controlled_expansion");
    assert.equal(result.nextAction, "prepare_controlled_expansion_proposal");
    assert.deepEqual(result.riskFlags, []);
    assert.equal(result.humanOnTheLoop, true);
    assert.equal(result.noExecutionAuthorized, true);
    assert.ok(Array.isArray(result.rationale) && result.rationale.length > 0);
  });

  await t.test("invalid evaluation requires more observations and flags it", () => {
    const result = build(makeEvaluation({ status: "invalid", scorecard: null }));
    assert.ok(
      ["require_more_observations", "block_autonomy_increase"].includes(result.decision),
    );
    assert.equal(result.decision, "require_more_observations");
    assert.ok(result.riskFlags.includes("invalid_observation"));
    assert.notEqual(result.decision, "eligible_for_controlled_expansion");
  });

  await t.test("unknown agent blocks autonomy increase", () => {
    const result = build(makeEvaluation({ status: "agent_not_in_catalog", scorecard: null }));
    assert.equal(result.decision, "block_autonomy_increase");
    assert.equal(result.nextAction, "hold_autonomy_and_escalate");
    assert.ok(result.riskFlags.includes("agent_not_in_catalog"));
  });

  await t.test("missing scorecard requires more observations", () => {
    const result = build(makeEvaluation({ status: "evaluated", scorecard: null }));
    assert.equal(result.decision, "require_more_observations");
    assert.ok(result.riskFlags.includes("missing_scorecard"));
  });

  await t.test("guardrail violations block or reduce autonomy", () => {
    const one = build(makeEvaluation({ scorecard: makeScorecard({ guardrailViolations: 1 }) }));
    assert.equal(one.decision, "block_autonomy_increase");
    assert.ok(one.riskFlags.includes("high_guardrail_violations"));
    assert.notEqual(one.decision, "eligible_for_controlled_expansion");

    const many = build(makeEvaluation({ scorecard: makeScorecard({ guardrailViolations: 3 }) }));
    assert.equal(many.decision, "reduce_autonomy_recommendation");
    assert.equal(many.nextAction, "reduce_autonomy_and_escalate");
    assert.ok(many.riskFlags.includes("high_guardrail_violations"));
  });

  await t.test("low quality score recommends improving the knowledge pack", () => {
    const result = build(
      makeEvaluation({ scorecard: makeScorecard({ overallQualityScore: 30 }) }),
    );
    assert.equal(result.decision, "improve_knowledge_pack");
    assert.equal(result.nextAction, "schedule_knowledge_pack_review");
    assert.ok(result.riskFlags.includes("low_quality_score"));
  });

  await t.test("too few reviewed outputs requires more observations", () => {
    const result = build(
      makeEvaluation({ scorecard: makeScorecard({ reviewedOutputs: 2 }) }),
    );
    assert.equal(result.decision, "require_more_observations");
    assert.ok(result.riskFlags.includes("insufficient_reviewed_outputs"));
  });

  await t.test("high or critical risk prevents controlled expansion", () => {
    for (const riskLevel of ["high", "critical"]) {
      const result = build(makeEvaluation({ riskLevel }));
      assert.notEqual(result.decision, "eligible_for_controlled_expansion");
      assert.equal(result.decision, "block_autonomy_increase");
      assert.ok(result.riskFlags.includes("high_or_critical_risk"));
    }
  });

  await t.test("failed outcome produces a failed_outcome risk flag", () => {
    const result = build(makeEvaluation({ outcomeStatus: "failed" }));
    assert.ok(result.riskFlags.includes("failed_outcome"));
    assert.notEqual(result.decision, "eligible_for_controlled_expansion");
  });

  await t.test("no realized value flags missing value", () => {
    const result = build(
      makeEvaluation({ scorecard: makeScorecard({ realizedProfitCents: 0 }) }),
    );
    assert.ok(result.riskFlags.includes("no_realized_value"));
    assert.equal(result.decision, "require_more_observations");
  });

  await t.test("recommendation is deterministic", () => {
    const evaluation = makeEvaluation({ scorecard: makeScorecard({ guardrailViolations: 1 }) });
    const a = build(evaluation);
    const b = build(evaluation);
    assert.deepEqual(a, b);
  });

  await t.test("does not mutate input", () => {
    const evaluation = makeEvaluation();
    const snapshot = structuredClone(evaluation);
    build(evaluation);
    assert.deepEqual(evaluation, snapshot);
  });

  await t.test("module imports no runtime, DB, Supabase, API, network, or filesystem dependency", () => {
    const source = readFileSync(
      path.join(__dirname, "observed-agent-outcome-review.ts"),
      "utf8",
    );
    const importLines = source
      .split("\n")
      .filter((line) => /^\s*import\b/.test(line));
    const importBlob = importLines.join("\n").toLowerCase();

    for (const forbidden of [
      "supabase",
      "runtime",
      "execution",
      "ledger",
      "/api/",
      "node:fs",
      "node:net",
      "node:http",
    ]) {
      assert.ok(
        !importBlob.includes(forbidden),
        `unexpected dependency on "${forbidden}" in imports`,
      );
    }
    assert.ok(!/\bfetch\s*\(/.test(source), "module must not call fetch");
    assert.ok(!/node:fs\b/.test(source), "module must not touch the filesystem");
  });
});
