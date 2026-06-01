#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("Agent quality evaluation scorecards", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const quality = await jiti.import(path.join(__dirname, "agent-quality-evaluation.ts"));
  const knowledge = await jiti.import(path.join(__dirname, "agent-knowledge-packs.ts"));
  const autonomy = await jiti.import(path.join(__dirname, "agent-autonomy-cockpit.ts"));
  const policy = await jiti.import(path.join(__dirname, "autonomy-policy.ts"));
  const { agentRegistry } = await jiti.import(path.join(__dirname, "seed.ts"));
  const { skillsCatalog } = await jiti.import(path.join(projectRoot, "src", "features", "skills", "seed.ts"));

  function buildInputs() {
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

  await t.test("builds one safe scorecard per knowledge pack", () => {
    const model = quality.buildAgentQualityEvaluation(buildInputs());

    assert.equal(model.summary.totalScorecards, agentRegistry.length);
    assert.equal(model.summary.noExecutionAuthorized, true);
    assert.equal(model.summary.evidenceMode, "blueprint_baseline");

    for (const scorecard of model.scorecards) {
      assert.equal(scorecard.humanOnTheLoop, true);
      assert.equal(scorecard.noExecutionAuthorized, true);
      assert.equal(scorecard.evidenceMode, "blueprint_baseline");
      assert.ok(scorecard.overallQualityScore >= 0);
      assert.ok(scorecard.overallQualityScore <= 100);
      assert.ok(scorecard.dimensions.profitSignal.score >= 0);
      assert.ok(scorecard.dimensions.ceoLoadReduction.score >= 0);
      assert.ok(scorecard.dimensions.guardrailCompliance.score >= 0);
    }
  });

  await t.test("does not claim realized profit without observations", () => {
    const model = quality.buildAgentQualityEvaluation(buildInputs());
    const joris = model.scorecards.find((scorecard) => scorecard.agentId === "joris");

    assert.ok(joris, "Joris scorecard should exist");
    assert.equal(joris.realizedProfitCents, null);
    assert.equal(joris.ceoMinutesSaved, null);
    assert.equal(joris.guardrailViolations, null);
    assert.equal(joris.evidenceMode, "blueprint_baseline");
    assert.ok(joris.evidenceGaps.includes("real_profit_observations"));
    assert.ok(joris.evidenceGaps.includes("ceo_time_saved_observations"));
  });

  await t.test("uses observations to measure real profit, CEO load, and guardrails", () => {
    const model = quality.buildAgentQualityEvaluation({
      ...buildInputs(),
      observations: [
        {
          agentId: "joris",
          realizedProfitCents: 50000,
          ceoMinutesSaved: 180,
          guardrailViolations: 0,
          usefulOutputs: 8,
          reviewedOutputs: 10,
        },
      ],
    });

    const joris = model.scorecards.find((scorecard) => scorecard.agentId === "joris");

    assert.ok(joris, "Joris scorecard should exist");
    assert.equal(joris.evidenceMode, "observed");
    assert.equal(joris.realizedProfitCents, 50000);
    assert.equal(joris.ceoMinutesSaved, 180);
    assert.equal(joris.guardrailViolations, 0);
    assert.ok(joris.dimensions.profitSignal.score > 0);
    assert.ok(joris.dimensions.ceoLoadReduction.score > 0);
    assert.equal(joris.dimensions.guardrailCompliance.score, 100);
  });

  await t.test("penalizes missing skills and guardrail violations", () => {
    const base = buildInputs();
    const model = quality.buildAgentQualityEvaluation({
      knowledgeCatalog: {
        ...base.knowledgeCatalog,
        packs: [
          {
            ...base.knowledgeCatalog.packs[0],
            missingSkillIds: ["missing.skill"],
          },
        ],
      },
      autonomyCockpit: {
        ...base.autonomyCockpit,
        agents: [
          {
            ...base.autonomyCockpit.agents[0],
            missingSkillIds: ["missing.skill"],
          },
        ],
      },
      observations: [
        {
          agentId: base.knowledgeCatalog.packs[0].agentId,
          realizedProfitCents: 0,
          ceoMinutesSaved: 0,
          guardrailViolations: 2,
          usefulOutputs: 1,
          reviewedOutputs: 5,
        },
      ],
    });

    const scorecard = model.scorecards[0];

    assert.ok(scorecard.dimensions.knowledgeReadiness.score < 100);
    assert.ok(scorecard.dimensions.guardrailCompliance.score < 100);
    assert.ok(scorecard.evidenceGaps.includes("missing_skill_context"));
  });
});
