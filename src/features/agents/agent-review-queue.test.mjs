#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("Agent review queue builder", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const queue = await jiti.import(path.join(__dirname, "agent-review-queue.ts"));
  const build = queue.buildAgentReviewQueue;

  const CREATED_AT = "2026-06-01T12:00:00.000Z";

  function makeEvaluation(overrides = {}) {
    return {
      status: "evaluated",
      outcomeId: "outcome-001",
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
      scorecard: null,
      evaluation: null,
      humanOnTheLoop: true,
      noExecutionAuthorized: true,
      ...overrides,
    };
  }

  function makeRecommendation(overrides = {}) {
    return {
      agentId: "joris",
      outcomeId: "outcome-001",
      evaluationStatus: "evaluated",
      decision: "eligible_for_controlled_expansion",
      riskFlags: [],
      nextAction: "prepare_controlled_expansion_proposal",
      rationale: ["Strong quality, clean guardrails, sufficient reviewed outputs."],
      humanOnTheLoop: true,
      noExecutionAuthorized: true,
      ...overrides,
    };
  }

  function makePair(evalOverrides = {}, recOverrides = {}) {
    return {
      evaluation: makeEvaluation(evalOverrides),
      recommendation: makeRecommendation(recOverrides),
    };
  }

  await t.test("builds a queue item from a valid evaluation and recommendation", () => {
    const result = build({ items: [makePair()], createdAt: CREATED_AT });

    assert.equal(result.totalItems, 1);
    assert.equal(result.humanOnTheLoop, true);
    assert.equal(result.noExecutionAuthorized, true);

    const item = result.items[0];
    assert.equal(item.agentId, "joris");
    assert.equal(item.outcomeId, "outcome-001");
    assert.equal(item.approvalRequired, true);
    assert.equal(item.humanOnTheLoop, true);
    assert.equal(item.noExecutionAuthorized, true);
    assert.equal(item.createdAt, CREATED_AT);
    assert.ok(typeof item.executiveSummary === "string" && item.executiveSummary.length > 0);
    assert.ok(typeof item.queueItemId === "string" && item.queueItemId.length > 0);
  });

  await t.test("critical risks sort first", () => {
    const result = build({
      items: [
        makePair({}, { decision: "continue_monitoring", riskFlags: [] }),
        makePair(
          { agentId: "advisor", outcomeId: "outcome-002" },
          {
            agentId: "advisor",
            outcomeId: "outcome-002",
            decision: "reduce_autonomy_recommendation",
            riskFlags: ["high_guardrail_violations"],
            nextAction: "reduce_autonomy_and_escalate",
          },
        ),
        makePair(
          { agentId: "scout", outcomeId: "outcome-003" },
          {
            agentId: "scout",
            outcomeId: "outcome-003",
            decision: "require_more_observations",
            riskFlags: ["insufficient_reviewed_outputs"],
            nextAction: "collect_more_observations",
          },
        ),
      ],
      createdAt: CREATED_AT,
    });

    assert.equal(result.items[0].priority, "critical");
    assert.equal(result.items[0].agentId, "advisor");
    assert.ok(result.items[result.items.length - 1].priority === "low");
  });

  await t.test("guardrail violations and reduce autonomy become critical", () => {
    const result = build({
      items: [
        makePair(
          {},
          {
            decision: "reduce_autonomy_recommendation",
            riskFlags: ["high_guardrail_violations"],
            nextAction: "reduce_autonomy_and_escalate",
          },
        ),
      ],
      createdAt: CREATED_AT,
    });

    const item = result.items[0];
    assert.equal(item.priority, "critical");
    assert.equal(result.criticalItems, 1);
    assert.ok(item.riskFlags.includes("high_guardrail_violations"));
  });

  await t.test("invalid observation becomes high priority", () => {
    const result = build({
      items: [
        makePair(
          { status: "invalid" },
          {
            decision: "require_more_observations",
            riskFlags: ["invalid_observation"],
            nextAction: "collect_more_observations",
          },
        ),
      ],
      createdAt: CREATED_AT,
    });

    assert.equal(result.items[0].priority, "high");
    assert.equal(result.highItems, 1);
    assert.ok(result.items[0].riskFlags.includes("invalid_observation"));
  });

  await t.test("require_more_observations becomes medium priority", () => {
    const result = build({
      items: [
        makePair(
          {},
          {
            decision: "require_more_observations",
            riskFlags: ["insufficient_reviewed_outputs"],
            nextAction: "collect_more_observations",
          },
        ),
      ],
      createdAt: CREATED_AT,
    });

    assert.equal(result.items[0].priority, "medium");
    assert.equal(result.mediumItems, 1);
    assert.equal(result.items[0].status, "awaiting_observations");
  });

  await t.test("continue_monitoring becomes low priority", () => {
    const result = build({
      items: [
        makePair(
          {},
          {
            decision: "continue_monitoring",
            riskFlags: [],
            nextAction: "keep_monitoring",
          },
        ),
      ],
      createdAt: CREATED_AT,
    });

    assert.equal(result.items[0].priority, "low");
    assert.equal(result.lowItems, 1);
  });

  await t.test("eligible_for_controlled_expansion still requires approval", () => {
    const result = build({ items: [makePair()], createdAt: CREATED_AT });

    const item = result.items[0];
    assert.equal(item.decision, "eligible_for_controlled_expansion");
    assert.equal(item.approvalRequired, true);
    assert.equal(item.humanOnTheLoop, true);
    assert.equal(item.noExecutionAuthorized, true);
    assert.equal(item.nextAction, "prepare_controlled_expansion_proposal");
  });

  await t.test("output is deterministic", () => {
    const input = { items: [makePair()], createdAt: CREATED_AT };
    const a = build(input);
    const b = build(input);
    assert.deepEqual(a, b);
  });

  await t.test("function does not mutate input", () => {
    const input = { items: [makePair()], createdAt: CREATED_AT };
    const snapshot = structuredClone(input);
    build(input);
    assert.deepEqual(input, snapshot);
    // riskFlags and rationale arrays in items must be copies
    const item = build(input).items[0];
    assert.notEqual(item.riskFlags, input.items[0].recommendation.riskFlags);
    assert.notEqual(item.rationale, input.items[0].recommendation.rationale);
  });

  await t.test("summary counts match items", () => {
    const result = build({
      items: [
        makePair({}, { decision: "reduce_autonomy_recommendation", riskFlags: ["high_guardrail_violations"], nextAction: "reduce_autonomy_and_escalate" }),
        makePair({ agentId: "advisor", outcomeId: "o2" }, { agentId: "advisor", outcomeId: "o2", decision: "require_more_observations", riskFlags: ["invalid_observation"], nextAction: "collect_more_observations" }),
        makePair({ agentId: "scout", outcomeId: "o3" }, { agentId: "scout", outcomeId: "o3", decision: "require_more_observations", riskFlags: ["insufficient_reviewed_outputs"], nextAction: "collect_more_observations" }),
        makePair({ agentId: "oracle", outcomeId: "o4" }, { agentId: "oracle", outcomeId: "o4", decision: "continue_monitoring", riskFlags: [], nextAction: "keep_monitoring" }),
      ],
      createdAt: CREATED_AT,
    });

    assert.equal(result.totalItems, 4);
    assert.equal(result.criticalItems, 1);
    assert.equal(result.highItems, 1);
    assert.equal(result.mediumItems, 1);
    assert.equal(result.lowItems, 1);
    assert.equal(result.criticalItems + result.highItems + result.mediumItems + result.lowItems, result.totalItems);
  });

  await t.test("empty input produces empty queue", () => {
    const result = build({ items: [], createdAt: CREATED_AT });
    assert.equal(result.totalItems, 0);
    assert.deepEqual(result.items, []);
    assert.equal(result.humanOnTheLoop, true);
    assert.equal(result.noExecutionAuthorized, true);
  });

  await t.test("module imports no DB, Supabase, API, runtime, network, or filesystem dependency", () => {
    const source = readFileSync(
      path.join(__dirname, "agent-review-queue.ts"),
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
