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

const guardPath = path.join(projectRoot, "src/server/runtime/execution-guard.ts");
const licensePath = path.join(projectRoot, "src/server/agents/agent-execution-license.ts");

const {
  assertExecutionAllowed,
  buildDryRunExecutionPlan,
  canPrepareExecution,
  classifyExecutionRisk,
  ExecutionGuardError,
} = await jiti.import(guardPath);

const { agentLicenseRegistry } = await jiti.import(licensePath);
const { skillsCatalog } = await jiti.import("@/features/skills/seed");

function baseInput(overrides = {}) {
  return {
    skillId: "board.consult",
    agentId: "joris",
    requestedMode: "dry-run",
    autonomyLevel: 1,
    ...overrides,
  };
}

test("read-only dry-run level 1 is accepted", () => {
  const decision = canPrepareExecution(baseInput());

  assert.equal(decision.allowed, true);
  assert.equal(decision.mode, "dry-run");
  assert.equal(decision.dryRun, true);
  assert.equal(decision.executionTier, "green");
  assert.match(decision.reason, /read-only|internal draft/i);
});

test("read-only dry-run level 3 is accepted", () => {
  const decision = canPrepareExecution(
    baseInput({
      skillId: "cash.snapshot",
      agentId: "finops",
      autonomyLevel: 3,
    }),
  );

  assert.equal(decision.allowed, true);
  assert.equal(decision.mode, "dry-run");
  assert.equal(decision.dryRun, true);
});

test("autonomy level 4 is rejected", () => {
  const decision = canPrepareExecution(
    baseInput({
      autonomyLevel: 4,
    }),
  );

  assert.equal(decision.allowed, false);
  assert.equal(decision.code, "AUTONOMY_LEVEL_TOO_HIGH");
});

test("live mode green zone is ALLOWED (PR3 replaces LIVE_MODE_NOT_SUPPORTED)", () => {
  // brief.generate is a green policy action for Joris and a runtime skill assigned to Joris.
  const decision = canPrepareExecution(
    baseInput({
      skillId: "brief.generate",
      actionId: "brief.generate",
      requestedMode: "live",
      autonomyLevel: 2,
    }),
  );

  assert.equal(decision.allowed, true);
  assert.equal(decision.mode, "live");
  assert.equal(decision.dryRun, false);
  assert.equal(decision.zone, "green");
  assert.equal(decision.executionTier, "green");
  assert.equal(decision.reasonCode, "allowed_by_policy");
  assert.equal(decision.requiresLedger, true);
  assert.equal(decision.requiresSentinel, true);
});

test("unknown skill is rejected", () => {
  const decision = canPrepareExecution(
    baseInput({
      skillId: "does.not.exist",
    }),
  );

  assert.equal(decision.allowed, false);
  assert.equal(decision.code, "UNSUPPORTED_SKILL");
});

test("effectful skill is rejected without trusted approval", () => {
  const decision = canPrepareExecution(
    baseInput({
      skillId: "calendar.book",
    }),
  );

  assert.equal(decision.allowed, false);
  assert.equal(decision.code, "EFFECTFUL_SKILL_REQUIRES_APPROVAL");
  assert.equal(decision.executionTier, "yellow");
});

test("approvalConfirmed from the client is rejected", () => {
  const decision = canPrepareExecution(
    baseInput({
      approvalConfirmed: true,
    }),
  );

  assert.equal(decision.allowed, false);
  assert.equal(decision.code, "APPROVAL_SOURCE_NOT_TRUSTED");
});

test("dry-run returns a plan and no real effect surface", () => {
  const plan = buildDryRunExecutionPlan(baseInput());

  assert.equal(plan.allowed, true);
  assert.equal(plan.dryRun, true);
  assert.equal(plan.mode, "dry-run");
  assert.equal(plan.skill.id, "board.consult");
  assert.equal(plan.risk, "read-only");
  assert.deepEqual(plan.requiredLedgerEventsIfLive, ["decision"]);
  assert.ok(plan.steps.length >= 2);
  assert.ok(plan.steps.every((step) => Array.isArray(step.ledgerEventsIfLive)));
  assert.ok(!("write" in plan));
  assert.ok(!("calendar" in plan));
  assert.ok(!("ledger" in plan));
});

test("assertExecutionAllowed throws a controlled error when rejected", () => {
  assert.throws(
    () =>
      assertExecutionAllowed(
        baseInput({
          skillId: "calendar.book",
        }),
      ),
    (error) =>
      error instanceof ExecutionGuardError &&
      error.code === "EFFECTFUL_SKILL_REQUIRES_APPROVAL" &&
      error.decision.allowed === false,
  );
});

test("classification matches the skill surface", () => {
  assert.equal(classifyExecutionRisk(undefined), "unknown");
  assert.equal(classifyExecutionRisk({ sideEffects: "none", canWriteDB: false, canTriggerExternal: false }), "read-only");
  assert.equal(classifyExecutionRisk({ sideEffects: "internal-draft", canWriteDB: false, canTriggerExternal: false }), "internal-draft");
  assert.equal(classifyExecutionRisk({ sideEffects: "reversible-write", canWriteDB: true, canTriggerExternal: false }), "effectful");
  assert.equal(classifyExecutionRisk({ sideEffects: "irreversible-external", canWriteDB: false, canTriggerExternal: true }), "external");
});

test("clientApprovalConfirmed from the client is rejected", () => {
  const decision = canPrepareExecution(
    baseInput({
      clientApprovalConfirmed: true,
    }),
  );

  assert.equal(decision.allowed, false);
  assert.equal(decision.code, "APPROVAL_SOURCE_NOT_TRUSTED");
});

test("autonomy level 0 is rejected", () => {
  const decision = canPrepareExecution(
    baseInput({
      autonomyLevel: 0,
    }),
  );

  assert.equal(decision.allowed, false);
  assert.equal(decision.code, "AUTONOMY_LEVEL_TOO_HIGH");
});

test("mission assigned to a different agent is rejected", () => {
  const decision = canPrepareExecution(
    baseInput({
      mission: {
        id: "mission-1",
        workspaceId: "workspace-1",
        title: "Cross-agent mission",
        status: "draft",
        autonomyLevel: 1,
        riskLevel: "low",
        assignedAgentId: "finops",
      },
    }),
  );

  assert.equal(decision.allowed, false);
  assert.equal(decision.code, "UNSUPPORTED_SKILL");
});

// ---------------------------------------------------------------------------
// PR3 -- Zone-based live execution tests
// ---------------------------------------------------------------------------

const {
  evaluateLiveExecution,
} = await jiti.import(guardPath);

test("PR3: green policy action live execution is ALLOWED for joris + brief.generate", () => {
  const result = evaluateLiveExecution({
    skillId: "brief.generate",
    actionId: "brief.generate",
    agentId: "joris",
    requestedMode: "live",
    autonomyLevel: 2,
  });

  assert.equal(result.outcome, "ALLOW");
  assert.equal(result.zone, "green");
  assert.equal(result.executionTier, "green");
  assert.equal(result.reasonCode, "allowed_by_policy");
  assert.equal(result.requiresLedger, true);
  assert.equal(result.requiresSentinel, true);
  assert.equal(result.requiresHumanApproval, false);
});

test("PR3: canPrepareExecution live + green zone returns allowed:true mode:live dryRun:false", () => {
  const decision = canPrepareExecution({
    skillId: "brief.generate",
    actionId: "brief.generate",
    agentId: "joris",
    requestedMode: "live",
    autonomyLevel: 2,
  });

  assert.equal(decision.allowed, true);
  assert.equal(decision.mode, "live");
  assert.equal(decision.dryRun, false);
  assert.equal(decision.zone, "green");
  assert.equal(decision.executionTier, "green");
  assert.equal(decision.reasonCode, "allowed_by_policy");
  assert.equal(decision.requiresLedger, true);
  assert.equal(decision.requiresSentinel, true);
});

test("PR3: hard-blocked action is BLOCKED regardless of zone", () => {
  const result = evaluateLiveExecution({
    skillId: "billing.modify",
    agentId: "joris",
    requestedMode: "live",
    autonomyLevel: 1,
  });

  assert.equal(result.outcome, "BLOCK");
  assert.equal(result.zone, "red");
  assert.equal(result.executionTier, "red");
  assert.equal(result.reasonCode, "action_policy_blocked");
});

test("PR3: canPrepareExecution hard-blocked returns HARD_BLOCKED_ACTION", () => {
  const decision = canPrepareExecution({
    skillId: "billing.modify",
    agentId: "joris",
    requestedMode: "live",
    autonomyLevel: 1,
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.code, "HARD_BLOCKED_ACTION");
  assert.equal(decision.executionTier, "red");
  assert.equal(decision.reasonCode, "action_policy_blocked");
});

test("PR3: red zone (level 0) is BLOCKED", () => {
  const result = evaluateLiveExecution({
    skillId: "brief.generate",
    actionId: "brief.generate",
    agentId: "joris",
    requestedMode: "live",
    autonomyLevel: 0,
  });

  assert.equal(result.outcome, "BLOCK");
  assert.equal(result.zone, "red");
  assert.equal(result.executionTier, "red");
  assert.equal(result.reasonCode, "requested_level_blocked");
});

test("PR3: clientApprovalConfirmed is rejected even in live mode", () => {
  const decision = canPrepareExecution({
    skillId: "board.consult",
    agentId: "joris",
    requestedMode: "live",
    autonomyLevel: 2,
    clientApprovalConfirmed: true,
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.code, "APPROVAL_SOURCE_NOT_TRUSTED");
});

test("PR3: unknown agent is BLOCKED in live mode", () => {
  const result = evaluateLiveExecution({
    skillId: "board.consult",
    agentId: "unknown-agent-xyz",
    requestedMode: "live",
    autonomyLevel: 2,
  });

  assert.equal(result.outcome, "BLOCK");
  assert.equal(result.zone, "red");
  assert.equal(result.executionTier, "red");
  assert.equal(result.reasonCode, "unauthorized_action");
});

test("PR3: requested red boundary level 5 is BLOCKED before runtime min routing", () => {
  const result = evaluateLiveExecution({
    skillId: "brief.generate",
    actionId: "brief.generate",
    agentId: "joris",
    requestedMode: "live",
    autonomyLevel: 5,
  });

  assert.equal(result.outcome, "BLOCK");
  assert.equal(result.zone, "red");
  assert.equal(result.executionTier, "red");
  assert.equal(result.reasonCode, "requested_level_blocked");
});

test("PR3: suspended agent licence is BLOCKED before runtime min routing", () => {
  const jorisLicense = agentLicenseRegistry.find((license) => license.agentId === "joris");
  assert.ok(jorisLicense);

  const previousSuspended = jorisLicense.suspended;
  jorisLicense.suspended = true;

  try {
    const result = evaluateLiveExecution({
      skillId: "brief.generate",
      actionId: "brief.generate",
      agentId: "joris",
      requestedMode: "live",
      autonomyLevel: 2,
    });

    assert.equal(result.outcome, "BLOCK");
    assert.equal(result.zone, "red");
    assert.equal(result.executionTier, "red");
    assert.equal(result.reasonCode, "agent_suspended");
  } finally {
    if (previousSuspended === undefined) {
      delete jorisLicense.suspended;
    } else {
      jorisLicense.suspended = previousSuspended;
    }
  }
});

test("PR3: unknown policy action is BLOCKED before runtime min routing", () => {
  const result = evaluateLiveExecution({
    skillId: "brief.generate",
    actionId: "unknown.policy.action",
    agentId: "joris",
    requestedMode: "live",
    autonomyLevel: 2,
  });

  assert.equal(result.outcome, "BLOCK");
  assert.equal(result.zone, "red");
  assert.equal(result.executionTier, "red");
  assert.equal(result.reasonCode, "unknown_action_policy");
});

test("PR3: yellow policy action requires approval before runtime min routing", () => {
  const result = evaluateLiveExecution({
    skillId: "mission.plan",
    actionId: "mission.confirm",
    agentId: "joris",
    requestedMode: "live",
    autonomyLevel: 2,
  });

  assert.equal(result.outcome, "REQUIRE_APPROVAL");
  assert.equal(result.zone, "yellow");
  assert.equal(result.executionTier, "yellow");
  assert.equal(result.reasonCode, "action_policy_requires_approval");
  assert.equal(result.requiresHumanApproval, true);
});

test("PR4: unauthorized runtime skill exposes unauthorized_action reason", () => {
  const result = evaluateLiveExecution({
    skillId: "does.not.exist",
    actionId: "brief.generate",
    agentId: "joris",
    requestedMode: "live",
    autonomyLevel: 2,
  });

  assert.equal(result.outcome, "BLOCK");
  assert.equal(result.zone, "red");
  assert.equal(result.executionTier, "red");
  assert.equal(result.reasonCode, "unauthorized_action");
});

test("PR4: runtime min rejection exposes runtime_min_not_met reason", () => {
  const skill = skillsCatalog.find((entry) => entry.id === "brief.generate");
  assert.ok(skill);

  const previousAutonomyLevel = skill.autonomyLevel;
  skill.autonomyLevel = 0;

  try {
    const result = evaluateLiveExecution({
      skillId: "brief.generate",
      actionId: "brief.generate",
      agentId: "joris",
      requestedMode: "live",
      autonomyLevel: 2,
    });

    assert.equal(result.outcome, "BLOCK");
    assert.equal(result.zone, "red");
    assert.equal(result.executionTier, "red");
    assert.equal(result.reasonCode, "runtime_min_not_met");
  } finally {
    skill.autonomyLevel = previousAutonomyLevel;
  }
});
