#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("Observed agent outcome evaluation pipeline", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const observed = await jiti.import(path.join(__dirname, "observed-agent-outcome.ts"));
  const knowledge = await jiti.import(path.join(__dirname, "agent-knowledge-packs.ts"));
  const autonomy = await jiti.import(path.join(__dirname, "agent-autonomy-cockpit.ts"));
  const policy = await jiti.import(path.join(__dirname, "autonomy-policy.ts"));
  const { agentRegistry } = await jiti.import(path.join(__dirname, "seed.ts"));
  const { skillsCatalog } = await jiti.import(
    path.join(projectRoot, "src", "features", "skills", "seed.ts"),
  );

  function buildContext() {
    return {
      knowledgeCatalog: knowledge.buildAgentKnowledgePackCatalog({
        agents: agentRegistry,
        skills: skillsCatalog,
      }),
      autonomyCockpit: autonomy.buildAgentAutonomyCockpit({
        agents: agentRegistry,
        skills: skillsCatalog,
        policy: policy.getDefaultAgentAutonomyPolicy(),
      }),
    };
  }

  // A known agent id present in the catalog, used by the realistic fixture.
  const knownAgentId = buildContext().knowledgeCatalog.packs[0].agentId;

  // Realistic fixture: an agent that produced a market research summary.
  function completedMarketResearchOutcome() {
    return {
      id: "outcome-market-research-001",
      agentId: knownAgentId,
      missionId: "mission-market-scan-q3",
      source: "manual_review",
      objective: "Produce a market research summary for the Q3 expansion shortlist.",
      expectedOutcome:
        "A concise summary covering 3 candidate segments with sizing and a recommendation.",
      actualOutcome:
        "Delivered a 1-page summary covering 3 segments with TAM estimates and a ranked recommendation.",
      status: "completed",
      riskLevel: "low",
      artifacts: ["doc://market-research/q3-summary"],
      evidence: ["Reviewed by CEO on the weekly sync; matched the requested structure."],
      createdAt: "2026-05-20T09:00:00.000Z",
      completedAt: "2026-05-20T11:30:00.000Z",
      notes: "Read-only observation; no execution performed.",
      metrics: {
        realizedProfitCents: 50000,
        ceoMinutesSaved: 180,
        guardrailViolations: 0,
        usefulOutputs: 8,
        reviewedOutputs: 10,
      },
    };
  }

  await t.test("valid completed observed outcome passes validation", () => {
    const result = observed.validateObservedAgentOutcome(completedMarketResearchOutcome());
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
  });

  await t.test("missing source fails", () => {
    const outcome = { ...completedMarketResearchOutcome(), source: "  " };
    const result = observed.validateObservedAgentOutcome(outcome);
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes("missing_source"));
  });

  await t.test("missing objective fails", () => {
    const outcome = { ...completedMarketResearchOutcome(), objective: "" };
    const result = observed.validateObservedAgentOutcome(outcome);
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes("missing_objective"));
  });

  await t.test("missing expectedOutcome fails", () => {
    const outcome = { ...completedMarketResearchOutcome(), expectedOutcome: "  " };
    const result = observed.validateObservedAgentOutcome(outcome);
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes("missing_expected_outcome"));
  });

  await t.test("missing actualOutcome fails when status is completed", () => {
    const outcome = { ...completedMarketResearchOutcome(), actualOutcome: "" };
    const result = observed.validateObservedAgentOutcome(outcome);
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes("missing_actual_outcome"));
  });

  await t.test("missing evidence fails when status is completed", () => {
    const outcome = { ...completedMarketResearchOutcome(), evidence: [] };
    const result = observed.validateObservedAgentOutcome(outcome);
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes("missing_evidence"));
  });

  await t.test("draft outcome may use empty actualOutcome and evidence", () => {
    const outcome = {
      ...completedMarketResearchOutcome(),
      status: "draft",
      actualOutcome: "",
      evidence: [],
      metrics: undefined,
    };
    const result = observed.validateObservedAgentOutcome(outcome);
    assert.equal(result.valid, true, JSON.stringify(result.errors));
  });

  await t.test("invalid riskLevel fails", () => {
    const outcome = { ...completedMarketResearchOutcome(), riskLevel: "extreme" };
    const result = observed.validateObservedAgentOutcome(outcome);
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes("invalid_risk_level"));
  });

  await t.test("invalid status fails", () => {
    const outcome = { ...completedMarketResearchOutcome(), status: "running" };
    const result = observed.validateObservedAgentOutcome(outcome);
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes("invalid_status"));
  });

  await t.test("missing or unparseable createdAt fails", () => {
    const missing = observed.validateObservedAgentOutcome({
      ...completedMarketResearchOutcome(),
      createdAt: "",
    });
    assert.ok(missing.errors.includes("missing_created_at"));

    const unparseable = observed.validateObservedAgentOutcome({
      ...completedMarketResearchOutcome(),
      createdAt: "not-a-date",
    });
    assert.ok(unparseable.errors.includes("invalid_created_at"));
  });

  await t.test("adapter output is deterministic", () => {
    const outcome = completedMarketResearchOutcome();
    const first = observed.toQualityEvaluationInput(outcome);
    const second = observed.toQualityEvaluationInput(outcome);
    assert.deepEqual(first, second);
    assert.equal(first.observation.realizedProfitCents, 50000);
    assert.equal(first.observation.agentId, knownAgentId);
    assert.equal(first.context.status, "completed");
    assert.equal(first.context.source, "manual_review");
  });

  await t.test("adapter does not mutate input", () => {
    const outcome = completedMarketResearchOutcome();
    const snapshot = structuredClone(outcome);
    const result = observed.toQualityEvaluationInput(outcome);
    assert.deepEqual(outcome, snapshot);
    // Returned arrays must be copies, not references into the input.
    assert.notEqual(result.context.artifacts, outcome.artifacts);
    assert.notEqual(result.context.evidence, outcome.evidence);
  });

  await t.test("adapter defaults missing metrics to zero", () => {
    const outcome = { ...completedMarketResearchOutcome(), metrics: undefined };
    const result = observed.toQualityEvaluationInput(outcome);
    assert.equal(result.observation.realizedProfitCents, 0);
    assert.equal(result.observation.reviewedOutputs, 0);
  });

  await t.test("local evaluation pipeline returns a structured result", () => {
    const result = observed.evaluateObservedAgentOutcome(
      completedMarketResearchOutcome(),
      buildContext(),
    );

    assert.equal(result.status, "evaluated");
    assert.equal(result.outcomeId, "outcome-market-research-001");
    assert.equal(result.agentId, knownAgentId);
    assert.equal(result.validation.valid, true);
    assert.equal(result.noExecutionAuthorized, true);
    assert.equal(result.humanOnTheLoop, true);

    assert.ok(result.scorecard, "a matching scorecard should be returned");
    assert.equal(result.scorecard.agentId, knownAgentId);
    assert.equal(result.scorecard.evidenceMode, "observed");
    assert.equal(result.scorecard.realizedProfitCents, 50000);
    assert.equal(result.scorecard.guardrailViolations, 0);
    assert.ok(result.scorecard.overallQualityScore >= 0);
    assert.ok(result.scorecard.overallQualityScore <= 100);
    assert.equal(result.scorecard.noExecutionAuthorized, true);
  });

  await t.test("invalid outcome short-circuits before evaluation", () => {
    const result = observed.evaluateObservedAgentOutcome(
      { ...completedMarketResearchOutcome(), objective: "" },
      buildContext(),
    );
    assert.equal(result.status, "invalid");
    assert.equal(result.scorecard, null);
    assert.equal(result.evaluation, null);
    assert.equal(result.observation, null);
    assert.ok(result.validation.errors.includes("missing_objective"));
  });

  await t.test("unknown agent returns agent_not_in_catalog", () => {
    const result = observed.evaluateObservedAgentOutcome(
      { ...completedMarketResearchOutcome(), agentId: "agent-that-does-not-exist" },
      buildContext(),
    );
    assert.equal(result.status, "agent_not_in_catalog");
    assert.equal(result.scorecard, null);
    assert.ok(result.evaluation, "evaluation model is still produced");
  });

  await t.test("pipeline is deterministic across runs", () => {
    const a = observed.evaluateObservedAgentOutcome(
      completedMarketResearchOutcome(),
      buildContext(),
    );
    const b = observed.evaluateObservedAgentOutcome(
      completedMarketResearchOutcome(),
      buildContext(),
    );
    assert.deepEqual(a, b);
  });

  await t.test("module imports no runtime, DB, or Supabase dependency", () => {
    const source = readFileSync(
      path.join(__dirname, "observed-agent-outcome.ts"),
      "utf8",
    );
    // Only import lines matter for static dependency guarantees.
    const importLines = source
      .split("\n")
      .filter((line) => /^\s*import\b/.test(line));
    const importBlob = importLines.join("\n").toLowerCase();

    for (const forbidden of ["supabase", "runtime", "execution", "ledger", "/api/", "fetch("]) {
      assert.ok(
        !importBlob.includes(forbidden),
        `unexpected dependency on "${forbidden}" in imports`,
      );
    }
    // No network or filesystem access anywhere in the module.
    assert.ok(!/\bfetch\s*\(/.test(source), "module must not call fetch");
    assert.ok(!/node:fs\b/.test(source), "module must not touch the filesystem");
  });
});
