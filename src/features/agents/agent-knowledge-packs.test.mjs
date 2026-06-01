#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("Agent knowledge pack blueprints", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const knowledgePacks = await jiti.import(path.join(__dirname, "agent-knowledge-packs.ts"));
  const { agentRegistry } = await jiti.import(path.join(__dirname, "seed.ts"));
  const { skillsCatalog } = await jiti.import(path.join(projectRoot, "src", "features", "skills", "seed.ts"));

  const { buildAgentKnowledgePackCatalog } = knowledgePacks;

  await t.test("builds one execution-safe blueprint for every registered agent", () => {
    const catalog = buildAgentKnowledgePackCatalog({
      agents: agentRegistry,
      skills: skillsCatalog,
    });

    assert.equal(catalog.summary.totalPacks, agentRegistry.length);
    assert.equal(catalog.summary.noExecutionAuthorized, true);
    assert.equal(catalog.summary.modelProviderLockIn, false);

    for (const pack of catalog.packs) {
      assert.equal(pack.humanOnTheLoop, true);
      assert.equal(pack.noExecutionAuthorized, true);
      assert.equal(pack.modelProviderLockIn, false);
      assert.ok(pack.trustedSources.includes("agent_registry"));
      assert.ok(pack.trustedSources.includes("skills_catalog"));
      assert.ok(pack.requiredContext.length > 0);
      assert.ok(pack.successMetrics.length > 0);
      assert.ok(pack.guardrails.length > 0);
    }
  });

  await t.test("Joris pack keeps orchestration context and approval guardrails visible", () => {
    const catalog = buildAgentKnowledgePackCatalog({
      agents: agentRegistry,
      skills: skillsCatalog,
    });
    const joris = catalog.packs.find((pack) => pack.agentId === "joris");

    assert.ok(joris, "Joris pack should exist");
    assert.equal(joris.role, "orchestrator");
    assert.ok(joris.operatingContexts.includes("global"));
    assert.ok(joris.allowedSkillIds.includes("mission.plan"));
    assert.ok(joris.allowedSkillIds.includes("brief.generate"));
    assert.ok(joris.requiredContext.some((item) => item.source === "skill" && item.label === "Mission Dry-Run Plan"));
    assert.ok(joris.guardrails.some((guardrail) => /approbation|approval/i.test(guardrail)));
  });

  await t.test("role metrics are profit-oriented without inventing revenue claims", () => {
    const catalog = buildAgentKnowledgePackCatalog({
      agents: agentRegistry,
      skills: skillsCatalog,
    });

    const scout = catalog.packs.find((pack) => pack.role === "scout");
    const money = catalog.packs.find((pack) => pack.role === "money");

    assert.ok(scout?.successMetrics.includes("qualified_opportunities_found"));
    assert.ok(scout?.successMetrics.includes("time_to_first_dollar_signal"));
    assert.ok(money?.successMetrics.includes("runway_accuracy"));
    assert.ok(money?.successMetrics.includes("ai_cost_visibility"));
  });

  await t.test("missing skills are surfaced and excluded from required skill context", () => {
    const catalog = buildAgentKnowledgePackCatalog({
      agents: [
        {
          id: "test-agent",
          name: "Test Agent",
          role: "operator",
          tagline: "Test",
          description: "Test",
          status: "standby",
          autonomyLevel: 2,
          skillIds: ["missing.skill"],
          constraints: [],
          ventures: ["hq"],
          monthlyRevenuePotential: 0,
          reviewCadence: "Weekly",
        },
      ],
      skills: skillsCatalog,
    });

    assert.deepEqual(catalog.packs[0].missingSkillIds, ["missing.skill"]);
    assert.equal(catalog.packs[0].allowedSkillIds.length, 0);
    assert.equal(catalog.packs[0].requiredContext.some((item) => item.source === "skill"), false);
  });
});
