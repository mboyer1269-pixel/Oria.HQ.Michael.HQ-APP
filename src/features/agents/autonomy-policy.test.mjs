#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("HQ agent autonomy policy", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mod = await jiti.import(path.join(__dirname, "autonomy-policy.ts"));

  const {
    evaluateAgentCapabilityRequest,
    evaluateSkillAutonomy,
    getDefaultAgentAutonomyPolicy,
    summarizeAgentAutonomyPolicy,
  } = mod;

  await t.test("default policy is model agnostic and keeps provider choice flexible", () => {
    const policy = getDefaultAgentAutonomyPolicy();

    assert.equal(policy.modelProviderPolicy.selectionMode, "approved_provider_pool");
    assert.equal(policy.modelProviderPolicy.providerLockIn, false);
    assert.equal(policy.modelProviderPolicy.approvalRequiredForNewProvider, true);
    assert.equal(policy.modelProviderPolicy.gatedBy, "capability_risk");
  });

  await t.test("safe internal capabilities can run with high autonomy", () => {
    const policy = getDefaultAgentAutonomyPolicy();
    const safeCapabilities = [
      "reasoning",
      "knowledgeCuration",
      "research",
      "analysis",
      "planning",
      "drafting",
      "agentBlueprinting",
      "performanceReview",
    ];

    for (const capability of safeCapabilities) {
      const result = evaluateAgentCapabilityRequest(policy, { capability });
      assert.equal(result.decision, "allowed_autonomous", `${capability} should be autonomous`);
      assert.equal(result.requiresHumanApproval, false, `${capability} should not require approval`);
      assert.ok(result.maxAutonomyLevel >= 4, `${capability} should support 80% autonomy`);
      assert.equal(result.modelProviderLockIn, false);
    }
  });

  await t.test("risky capabilities cannot bypass approval or hard blocks", () => {
    const policy = getDefaultAgentAutonomyPolicy();
    const approvalRequired = ["externalCommunication", "publishing", "reversibleDataWrite"];
    const blocked = ["spending", "legalCommitment", "runtimeExecution", "secretsAccess"];

    for (const capability of approvalRequired) {
      const result = evaluateAgentCapabilityRequest(policy, { capability });
      assert.equal(result.decision, "requires_approval", `${capability} should require approval`);
      assert.equal(result.requiresHumanApproval, true);
      assert.equal(result.noExecutionAuthorized, true);
    }

    for (const capability of blocked) {
      const result = evaluateAgentCapabilityRequest(policy, { capability });
      assert.equal(result.decision, "blocked", `${capability} should be blocked`);
      assert.equal(result.requiresHumanApproval, true);
      assert.equal(result.noExecutionAuthorized, true);
    }
  });

  await t.test("capability decisions do not change when the approved model provider changes", () => {
    const policy = getDefaultAgentAutonomyPolicy();

    const openaiResult = evaluateAgentCapabilityRequest(policy, {
      capability: "analysis",
      modelProviderId: "openai",
    });
    const alternateResult = evaluateAgentCapabilityRequest(policy, {
      capability: "analysis",
      modelProviderId: "approved-future-model",
    });

    assert.equal(openaiResult.decision, alternateResult.decision);
    assert.equal(openaiResult.maxAutonomyLevel, alternateResult.maxAutonomyLevel);
    assert.equal(alternateResult.modelProviderLockIn, false);
  });

  await t.test("skill side effects drive autonomy more than model identity", () => {
    const policy = getDefaultAgentAutonomyPolicy();

    const safeSkill = {
      id: "market-research",
      label: "Market research",
      sideEffects: "none",
      canWriteDB: false,
      canTriggerExternal: false,
      requiresHumanApproval: false,
      autonomyLevel: 5,
    };
    const outreachSkill = {
      id: "send-outreach",
      label: "Send outreach",
      sideEffects: "irreversible-external",
      canWriteDB: false,
      canTriggerExternal: true,
      requiresHumanApproval: false,
      autonomyLevel: 5,
    };

    const safeResult = evaluateSkillAutonomy(policy, safeSkill);
    const outreachResult = evaluateSkillAutonomy(policy, outreachSkill);

    assert.equal(safeResult.decision, "allowed_autonomous");
    assert.equal(outreachResult.decision, "requires_approval");
    assert.equal(outreachResult.requiresHumanApproval, true);
    assert.match(outreachResult.reason, /external/i);
  });

  await t.test("summary exposes the operating shape of an 80 percent autonomous HQ", () => {
    const summary = summarizeAgentAutonomyPolicy(getDefaultAgentAutonomyPolicy());

    assert.equal(summary.modelProviderLockIn, false);
    assert.ok(summary.autonomousCapabilities >= 8);
    assert.ok(summary.approvalRequiredCapabilities >= 3);
    assert.ok(summary.blockedCapabilities >= 4);
    assert.ok(summary.maxSafeAutonomyLevel >= 4);
  });
});
