#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("Agent Profile Contract tests", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mod = await jiti.import(
    path.join(__dirname, "agent-profile-contract.ts")
  );

  const { AgentRole, AgentStatus, AgentType, ApprovalGate } = mod;

  await t.test("enums export the expected values", () => {
    assert.equal(AgentRole.OPERATOR, "operator");
    assert.equal(AgentRole.DIRECTOR, "director");
    assert.equal(AgentRole.BOOSTER, "booster");
    assert.equal(AgentRole.ANALYST, "analyst");

    assert.equal(AgentStatus.ACTIVE, "active");
    assert.equal(AgentStatus.INACTIVE, "inactive");
    assert.equal(AgentStatus.SUSPENDED, "suspended");
    assert.equal(AgentStatus.RETIRED, "retired");

    assert.equal(AgentType.HUMAN, "human");
    assert.equal(AgentType.AI, "ai");
    assert.equal(AgentType.HYBRID, "hybrid");

    assert.equal(ApprovalGate.MONEY, "money");
    assert.equal(ApprovalGate.PUBLISHING, "publishing");
    assert.equal(ApprovalGate.OUTREACH, "outreach");
    assert.equal(ApprovalGate.DEPLOYMENT, "deployment");
    assert.equal(ApprovalGate.AUTH_RLS, "auth_rls");
    assert.equal(ApprovalGate.LIVE_RUNTIME, "live_runtime");
    assert.equal(ApprovalGate.SECRETS, "secrets");
    assert.equal(ApprovalGate.IRREVERSIBLE, "irreversible");
  });

  await t.test("a valid AgentProfile object can be constructed at runtime", () => {
    const sampleSkill = { name: "analysis", level: 80 };
    const sampleBooster = { boosterId: "boost-123", type: "model" };

    const profile = {
      id: "agent-001",
      role: AgentRole.OPERATOR,
      status: AgentStatus.ACTIVE,
      type: AgentType.AI,
      businessObjective: "increase revenue",
      profitTarget: 5000,
      autonomyLevel: 75,
      promotionLevel: 2,
      originalOryaCandidate: false,
      approvalGates: [ApprovalGate.MONEY, ApprovalGate.DEPLOYMENT],
      skills: [sampleSkill],
      boosters: [sampleBooster],
      allowedActions: ["read", "write"],
      forbiddenActions: ["delete"],
      budget: 10000,
      reportingCadence: "daily",
    };

    assert.equal(profile.id, "agent-001");
    assert.equal(profile.role, "operator");
    assert.equal(profile.status, "active");
    assert.equal(profile.type, "ai");
    assert.ok(profile.autonomyLevel >= 0 && profile.autonomyLevel <= 100);
    assert.ok(profile.profitTarget >= 0);
    assert.equal(profile.approvalGates.length, 2);
    assert.equal(profile.skills.length, 1);
    assert.equal(profile.boosters.length, 1);
  });

  await t.test("approval gates match the No Passive Agent Rule categories", () => {
    // Per docs/08_AGENTIC_HOLDING_OPERATING_MODEL.md, human approval
    // is required for: money, publishing, outreach, deployment, auth/RLS,
    // runtime live, secrets, and external irreversible actions.
    const requiredGates = [
      "money", "publishing", "outreach", "deployment",
      "auth_rls", "live_runtime", "secrets", "irreversible",
    ];
    const actualGates = Object.values(ApprovalGate);
    for (const gate of requiredGates) {
      assert.ok(actualGates.includes(gate), `Missing approval gate: ${gate}`);
    }
  });
});
