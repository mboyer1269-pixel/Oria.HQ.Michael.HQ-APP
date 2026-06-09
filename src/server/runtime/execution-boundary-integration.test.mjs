#!/usr/bin/env node

// ---------------------------------------------------------------------------
// execution-boundary-integration.test.mjs
//
// Composed regression for the core agentic safety invariant:
//   - No approval  -> no dispatch
//   - No ledger pre-record -> no dispatch
//   - PreparedAction -> proposal only, never execution authorization
//
// The real production seam is src/app/api/agents/[agentId]/execute/route.ts.
// That route calls the REAL evaluateLiveExecution() and reaches the REAL
// executeGreenLaneAction() ONLY when the verdict is ALLOW (BLOCK -> 403,
// REQUIRE_APPROVAL -> 202, neither dispatches). The route handler cannot be
// imported directly here (it is bound to Supabase/auth/request context), so
// this test composes the SAME two real exported functions through a thin gate
// that mirrors the route exactly. The gate contains NO safety logic of its own:
//   - the ALLOW/REQUIRE_APPROVAL/BLOCK verdict comes from the real guard;
//   - the ledger-before-dispatch sequence comes from the real service.
// Only the service side effects (recordDecision/recordPendingDispatch/dispatch/
// recordResult/createOutcome) are injected spies, so nothing is persisted,
// dispatched, or sent.
// ---------------------------------------------------------------------------

import assert from "node:assert/strict";
import path from "node:path";
import test, { mock } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
  },
});

const guardPath = path.join(projectRoot, "src/server/runtime/execution-guard.ts");
const servicePath = path.join(projectRoot, "src/server/runtime/green-lane-execution-service.ts");

const { evaluateLiveExecution } = await jiti.import(guardPath);
const { executeGreenLaneAction } = await jiti.import(servicePath);

// Realistic guard inputs, copied from execution-guard.test.mjs so they resolve
// against the live agent/skill/licence registry exactly as production does.
const ALLOW_INPUT = { agentId: "joris", skillId: "brief.generate", actionId: "brief.generate", autonomyLevel: 2 };
const REQUIRE_APPROVAL_INPUT = { agentId: "joris", skillId: "mission.plan", actionId: "mission.confirm", autonomyLevel: 2 };
const BLOCK_INPUT = { agentId: "joris", skillId: "billing.modify", autonomyLevel: 1 };

// Thin gate that mirrors src/app/api/agents/[agentId]/execute/route.ts: only an
// ALLOW verdict from the real guard reaches the real green-lane service.
async function runExecutionBoundary(guardInput, deps) {
  const sentinelle = evaluateLiveExecution({ ...guardInput, requestedMode: "live" });

  if (sentinelle.outcome !== "ALLOW") {
    return { dispatched: false, sentinelle };
  }

  const exec = await executeGreenLaneAction(
    { agentId: guardInput.agentId, skillId: guardInput.skillId, requiresLedger: sentinelle.requiresLedger },
    deps,
  );
  return { dispatched: true, sentinelle, exec };
}

// Injected service spies. Each records its name into a shared order array so we
// can assert ledger-before-dispatch ordering.
function createServiceSpies(callOrder, overrides = {}) {
  return {
    recordDecision: mock.fn(async () => { callOrder.push("recordDecision"); return { id: "decision-1" }; }),
    recordPendingDispatch: mock.fn(async () => { callOrder.push("recordPendingDispatch"); return { id: "action-1" }; }),
    dispatch: mock.fn(async () => { callOrder.push("dispatch"); return { actionRef: "ref-123", result: "ok" }; }),
    recordResult: mock.fn(async () => { callOrder.push("recordResult"); return { id: "result-1" }; }),
    createOutcome: mock.fn(async () => { callOrder.push("createOutcome"); return { id: "outcome-1" }; }),
    ...overrides,
  };
}

test("guard REQUIRE_APPROVAL prevents dispatch", async () => {
  // The real guard must classify this as yellow / approval-required.
  const verdict = evaluateLiveExecution({ ...REQUIRE_APPROVAL_INPUT, requestedMode: "live" });
  assert.equal(verdict.outcome, "REQUIRE_APPROVAL");
  assert.equal(verdict.requiresHumanApproval, true);

  const callOrder = [];
  const deps = createServiceSpies(callOrder);
  const res = await runExecutionBoundary(REQUIRE_APPROVAL_INPUT, deps);

  assert.equal(res.dispatched, false);
  assert.equal(res.sentinelle.outcome, "REQUIRE_APPROVAL");
  assert.equal(res.exec, undefined, "no executed result is produced when approval is required");
  assert.equal(deps.dispatch.mock.calls.length, 0, "dispatch must never run without approval");
  assert.equal(deps.recordPendingDispatch.mock.calls.length, 0);
  assert.equal(deps.recordDecision.mock.calls.length, 0);
  assert.deepEqual(callOrder, []);
});

test("guard BLOCK prevents dispatch", async () => {
  // billing.modify is a hard-blocked action -> red zone BLOCK.
  const verdict = evaluateLiveExecution({ ...BLOCK_INPUT, requestedMode: "live" });
  assert.equal(verdict.outcome, "BLOCK");

  const callOrder = [];
  const deps = createServiceSpies(callOrder);
  const res = await runExecutionBoundary(BLOCK_INPUT, deps);

  assert.equal(res.dispatched, false);
  assert.equal(res.sentinelle.outcome, "BLOCK");
  assert.equal(res.exec, undefined, "no executed/success result is produced for a blocked verdict");
  assert.equal(deps.dispatch.mock.calls.length, 0, "dispatch must never run for a blocked verdict");
  assert.deepEqual(callOrder, []);
});

test("ALLOW records pending ledger before dispatch", async () => {
  const verdict = evaluateLiveExecution({ ...ALLOW_INPUT, requestedMode: "live" });
  assert.equal(verdict.outcome, "ALLOW");
  assert.equal(verdict.requiresLedger, true);

  const callOrder = [];
  const deps = createServiceSpies(callOrder);
  const res = await runExecutionBoundary(ALLOW_INPUT, deps);

  assert.equal(res.dispatched, true);
  assert.equal(res.exec.ok, true);
  assert.equal(deps.dispatch.mock.calls.length, 1);

  const decisionIdx = callOrder.indexOf("recordDecision");
  const pendingIdx = callOrder.indexOf("recordPendingDispatch");
  const dispatchIdx = callOrder.indexOf("dispatch");
  assert.ok(pendingIdx >= 0, "recordPendingDispatch must run on the ALLOW path");
  assert.ok(dispatchIdx >= 0, "dispatch must run on the ALLOW path");
  assert.ok(decisionIdx < dispatchIdx, "decision ledger must be recorded before dispatch");
  assert.ok(pendingIdx < dispatchIdx, "pending-dispatch ledger must be recorded BEFORE dispatch");
});

test("ledger pending failure blocks dispatch", async () => {
  const callOrder = [];
  // Same ALLOW path, but the pending-dispatch ledger write fails.
  const deps = createServiceSpies(callOrder, {
    recordPendingDispatch: mock.fn(async () => {
      callOrder.push("recordPendingDispatch");
      throw new Error("DB Error");
    }),
  });

  const res = await runExecutionBoundary(ALLOW_INPUT, deps);

  assert.equal(res.dispatched, true, "the ALLOW path is entered before the ledger gate");
  assert.equal(res.exec.ok, false);
  assert.equal(res.exec.status, 500);
  assert.equal(res.exec.error, "Ledger pre-dispatch failed. Execution blocked.");
  assert.equal(deps.recordPendingDispatch.mock.calls.length, 1);
  assert.equal(deps.dispatch.mock.calls.length, 0, "dispatch must never run if the pending ledger write fails");
  assert.equal(callOrder.includes("dispatch"), false);
});

test("PreparedAction is proposal-only and cannot authorize execution", async () => {
  const preparedActionPath = path.join(projectRoot, "src/features/ventures/prepared-action.ts");
  const preparedActionMod = await jiti.import(preparedActionPath);
  const { buildPreparedAction, isPreparedActionProposalOnly, validatePreparedAction } = preparedActionMod;
  const { buildCashActionPacket } = await jiti.import(
    path.join(projectRoot, "src/features/ventures/cash-action-packet.ts"),
  );
  const { buildHermesOutreachPlanFromCashActionPacket } = await jiti.import(
    path.join(projectRoot, "src/features/ventures/hermes-outreach-plan.ts"),
  );

  const packet = buildCashActionPacket({
    packetId: "packet-001",
    ventureId: "venture-001",
    agentId: "agent-001",
    targetBuyer: "Heads of RevOps at 20-100 person B2B SaaS companies",
    buyerType: "smb",
    painHypothesis: "They reconcile pipeline by hand every Friday and lose 3 hours to it.",
    offer: "A done-for-you weekly pipeline reconciliation, delivered every Friday.",
    pricePointCents: 49_000,
    callToAction: "Reply 'pilot' to start a paid 2-week pilot this Friday.",
    outreachDraft: "Hi {name}, saw your team reconciles pipeline manually - want a Friday report?",
    expectedCashSignal: "email_reply",
    requiredEvidence: ["email_reply"],
    expectedCashImpactCents: 49_000,
    expectedCostCents: 7_000,
    createdAt: "2026-06-02T00:00:00.000Z",
  });
  const hermesPlan = buildHermesOutreachPlanFromCashActionPacket(packet);
  const action = buildPreparedAction({
    preparedActionId: "packet-001_prepared",
    ventureId: packet.ventureId,
    cashActionPacketId: packet.packetId,
    packet,
    council: {
      readiness: "ready_for_ceo",
      verdictDecision: "needs_ceo_decision",
      recommendedManualAction: "CEO manually adapts and sends the outreach draft.",
    },
    hermesPlan,
    priority: "high",
    priorityScore: 42,
    status: "ready_for_ceo_review",
    createdAt: "2026-06-02T00:00:00.000Z",
  });

  // The builder locks the three governance flags to literal true.
  assert.equal(action.requiresCeoApproval, true);
  assert.equal(action.requiresManualSend, true);
  assert.equal(action.noExecutionAuthorized, true);
  assert.equal(isPreparedActionProposalOnly(action), true);
  assert.equal(validatePreparedAction(action).valid, true);

  // Flipping any governance lock breaks the proposal-only guarantee.
  assert.equal(isPreparedActionProposalOnly({ ...action, noExecutionAuthorized: false }), false);
  assert.equal(isPreparedActionProposalOnly({ ...action, requiresManualSend: false }), false);
  assert.equal(isPreparedActionProposalOnly({ ...action, requiresCeoApproval: false }), false);

  // The prepared-action module exposes no execution / dispatch / send path.
  for (const forbidden of ["dispatch", "execute", "executePreparedAction", "send", "sendNow", "authorizeExecution"]) {
    assert.equal(forbidden in preparedActionMod, false, `prepared-action must not export "${forbidden}"`);
  }

  // A PreparedAction is proposal data, not an ALLOW verdict: it never reaches
  // the dispatcher. There is no boundary call made with it.
  const callOrder = [];
  const deps = createServiceSpies(callOrder);
  assert.equal(deps.dispatch.mock.calls.length, 0);
  assert.deepEqual(callOrder, []);
});
