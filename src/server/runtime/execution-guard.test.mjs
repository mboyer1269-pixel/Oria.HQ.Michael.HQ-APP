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

const {
  assertExecutionAllowed,
  buildDryRunExecutionPlan,
  canPrepareExecution,
  classifyExecutionRisk,
  ExecutionGuardError,
} = await jiti.import(guardPath);

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
  // board.consult (level 1) + joris (level 2) -> effective level 1 -> green -> ALLOW
  const decision = canPrepareExecution(
    baseInput({
      requestedMode: "live",
    }),
  );

  assert.equal(decision.allowed, true);
  assert.equal(decision.mode, "live");
  assert.equal(decision.dryRun, false);
  assert.equal(decision.zone, "green");
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

test("PR3: green zone live execution is ALLOWED for joris + board.consult", () => {
  const result = evaluateLiveExecution({
    skillId: "board.consult",
    agentId: "joris",
    requestedMode: "live",
    autonomyLevel: 2,
  });

  assert.equal(result.outcome, "ALLOW");
  assert.equal(result.zone, "green");
  assert.equal(result.requiresLedger, true);
  assert.equal(result.requiresSentinel, true);
  assert.equal(result.requiresHumanApproval, false);
});

test("PR3: canPrepareExecution live + green zone returns allowed:true mode:live dryRun:false", () => {
  const decision = canPrepareExecution({
    skillId: "board.consult",
    agentId: "joris",
    requestedMode: "live",
    autonomyLevel: 2,
  });

  assert.equal(decision.allowed, true);
  assert.equal(decision.mode, "live");
  assert.equal(decision.dryRun, false);
  assert.equal(decision.zone, "green");
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
});

test("PR3: red zone (level 0) is BLOCKED", () => {
  const result = evaluateLiveExecution({
    skillId: "board.consult",
    agentId: "joris",
    requestedMode: "live",
    autonomyLevel: 0,
  });

  assert.equal(result.outcome, "BLOCK");
  assert.equal(result.zone, "red");
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
});

test("PR3: effective level is min(agent, skill, requested)", () => {
  // joris autonomyLevel=2, board.consult autonomyLevel=1 -> effective=1 -> green
  const result = evaluateLiveExecution({
    skillId: "board.consult",
    agentId: "joris",
    requestedMode: "live",
    autonomyLevel: 5,   // requested is high, but effective = min(2,1,5) = 1 -> green
  });

  assert.equal(result.outcome, "ALLOW");
  assert.equal(result.zone, "green");
});
