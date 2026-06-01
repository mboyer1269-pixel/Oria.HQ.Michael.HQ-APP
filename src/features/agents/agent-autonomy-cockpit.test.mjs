#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("Agent autonomy cockpit view model", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const cockpit = await jiti.import(path.join(__dirname, "agent-autonomy-cockpit.ts"));
  const autonomyPolicy = await jiti.import(path.join(__dirname, "autonomy-policy.ts"));
  const { agentRegistry } = await jiti.import(path.join(__dirname, "seed.ts"));
  const { skillsCatalog } = await jiti.import(path.join(projectRoot, "src", "features", "skills", "seed.ts"));

  const { buildAgentAutonomyCockpit } = cockpit;
  const { getDefaultAgentAutonomyPolicy } = autonomyPolicy;

  await t.test("summarizes model-flexible HQ autonomy policy", () => {
    const model = buildAgentAutonomyCockpit({
      agents: agentRegistry,
      skills: skillsCatalog,
      policy: getDefaultAgentAutonomyPolicy(),
    });

    assert.equal(model.summary.modelProviderLockIn, false);
    assert.equal(model.summary.providerModeLabel, "Approved provider pool");
    assert.ok(model.summary.autonomousCapabilities >= 8);
    assert.ok(model.summary.blockedCapabilities >= 4);
    assert.ok(model.blockedCapabilities.some((capability) => capability.label === "Spending"));
    assert.ok(model.blockedCapabilities.some((capability) => capability.label === "Runtime execution"));
  });

  await t.test("evaluates each agent skill by side-effect risk", () => {
    const model = buildAgentAutonomyCockpit({
      agents: agentRegistry,
      skills: skillsCatalog,
      policy: getDefaultAgentAutonomyPolicy(),
    });

    const joris = model.agents.find((agent) => agent.id === "joris");
    assert.ok(joris, "Joris row should exist");
    assert.ok(joris.autonomousSkills.some((skill) => skill.label === "Mission Dry-Run Plan"));
    assert.ok(joris.autonomousSkills.some((skill) => skill.label === "CEO Brief"));
    assert.ok(joris.approvalRequiredSkills.some((skill) => skill.label === "Calendar Book"));
    assert.equal(joris.modelProviderLockIn, false);
    assert.equal(joris.noExecutionAuthorized, true);
  });

  await t.test("keeps missing skills visible instead of treating them as autonomous", () => {
    const model = buildAgentAutonomyCockpit({
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
          reviewCadence: "Test",
        },
      ],
      skills: skillsCatalog,
      policy: getDefaultAgentAutonomyPolicy(),
    });

    assert.deepEqual(model.agents[0].missingSkillIds, ["missing.skill"]);
    assert.equal(model.agents[0].autonomousSkills.length, 0);
    assert.equal(model.agents[0].approvalRequiredSkills.length, 0);
  });
});
