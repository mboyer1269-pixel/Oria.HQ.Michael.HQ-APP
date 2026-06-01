#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

function cloneCard(card, overrides = {}) {
  return {
    ...card,
    ...overrides,
    score: Object.prototype.hasOwnProperty.call(overrides, "score") ? overrides.score : card.score,
    validationPlan: Object.prototype.hasOwnProperty.call(overrides, "validationPlan")
      ? overrides.validationPlan
      : card.validationPlan,
  };
}

test("Venture agent build plan helper", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const planMod = await jiti.import(path.join(__dirname, "venture-agent-build-plans.ts"));
  const { ventureSeedCards } = await jiti.import(path.join(__dirname, "seed.ts"));

  const {
    buildVentureAgentBuildPlan,
    summarizeVentureAgentBuildPlans,
    shouldRecommendAgentBuild,
  } = planMod;

  await t.test("recommends an agent blueprint for high-fit scored ventures", () => {
    const card = cloneCard(ventureSeedCards[1], {
      id: "venture-agent-plan-go",
      status: "scored",
    });
    const plan = buildVentureAgentBuildPlan(card);

    assert.equal(shouldRecommendAgentBuild(card), true);
    assert.equal(plan.recommended, true);
    assert.equal(plan.ventureId, card.id);
    assert.equal(plan.buildMode, "blueprint_only");
    assert.equal(plan.humanOnTheLoop, true);
    assert.equal(plan.noExecutionAuthorized, true);
    assert.ok(plan.skillsToBuild.includes("validation experiment design"));
    assert.ok(plan.knowledgeToLoad.includes("CEO score and recommendation bands"));
  });

  await t.test("does not recommend building agents for terminal ventures", () => {
    const card = cloneCard(ventureSeedCards[1], {
      id: "venture-agent-plan-archived",
      status: "archived",
    });
    const plan = buildVentureAgentBuildPlan(card);

    assert.equal(shouldRecommendAgentBuild(card), false);
    assert.equal(plan.recommended, false);
    assert.match(plan.recommendationReason, /terminal/i);
  });

  await t.test("keeps risky capabilities blocked by default", () => {
    const plan = buildVentureAgentBuildPlan(ventureSeedCards[2]);

    assert.deepEqual(plan.blockedCapabilities, [
      "externalComms",
      "spending",
      "publishing",
      "dataMutation",
      "legalCommitment",
    ]);
    assert.ok(!plan.autonomyDomains.includes("externalComms"));
    assert.ok(!plan.autonomyDomains.includes("spending"));
    assert.ok(!plan.autonomyDomains.includes("publishing"));
  });

  await t.test("summarizes and ranks recommended plans first", () => {
    const recommended = cloneCard(ventureSeedCards[1], {
      id: "venture-agent-plan-recommended",
      status: "scored",
    });
    const terminal = cloneCard(ventureSeedCards[0], {
      id: "venture-agent-plan-terminal",
      status: "killed",
    });
    const summary = summarizeVentureAgentBuildPlans([terminal, recommended]);

    assert.equal(summary.totalCount, 2);
    assert.equal(summary.recommendedCount, 1);
    assert.equal(summary.plans[0].ventureId, recommended.id);
    assert.equal(summary.plans[0].recommended, true);
    assert.equal(summary.plans[1].recommended, false);
  });
});
