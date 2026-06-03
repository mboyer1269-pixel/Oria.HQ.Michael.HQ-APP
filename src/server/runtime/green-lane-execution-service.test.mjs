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
  },
});

const servicePath = path.join(projectRoot, "src/server/runtime/green-lane-execution-service.ts");
const { executeGreenLaneAction } = await jiti.import(servicePath);

function createMockDeps() {
  return {
    recordDecision: mock.fn(async () => ({ id: "decision-1" })),
    recordPendingDispatch: mock.fn(async () => ({ id: "action-1" })),
    dispatch: mock.fn(async () => ({ actionRef: "ref-123", result: "ok" })),
    recordResult: mock.fn(async () => ({ id: "result-1" })),
    createOutcome: mock.fn(async () => ({ id: "outcome-1" })),
  };
}

const defaultParams = {
  agentId: "test-agent",
  skillId: "test.skill",
  requiresLedger: true,
};

test("executeGreenLaneAction calls dispatch and records success if pre-dispatch succeeds", async () => {
  const deps = createMockDeps();
  const res = await executeGreenLaneAction(defaultParams, deps);

  assert.equal(res.ok, true);
  assert.equal(deps.recordDecision.mock.calls.length, 1);
  assert.equal(deps.recordPendingDispatch.mock.calls.length, 1);
  assert.equal(deps.dispatch.mock.calls.length, 1);
  assert.equal(deps.recordResult.mock.calls.length, 1);
  assert.equal(deps.recordResult.mock.calls[0].arguments[0], "success");
  assert.equal(deps.createOutcome.mock.calls.length, 1);
  assert.equal(deps.createOutcome.mock.calls[0].arguments[0], "pending");
});

test("executeGreenLaneAction BLOCKS dispatch if recordDecision throws", async () => {
  const deps = createMockDeps();
  deps.recordDecision.mock.mockImplementation(async () => {
    throw new Error("DB Error");
  });

  const res = await executeGreenLaneAction(defaultParams, deps);

  assert.equal(res.ok, false);
  assert.equal(res.status, 500);
  assert.equal(deps.recordDecision.mock.calls.length, 1);
  assert.equal(deps.dispatch.mock.calls.length, 0, "Dispatch should NEVER be called if decision fails");
  assert.equal(deps.createOutcome.mock.calls.length, 0);
});

test("executeGreenLaneAction BLOCKS dispatch if recordPendingDispatch throws", async () => {
  const deps = createMockDeps();
  deps.recordPendingDispatch.mock.mockImplementation(async () => {
    throw new Error("DB Error");
  });

  const res = await executeGreenLaneAction(defaultParams, deps);

  assert.equal(res.ok, false);
  assert.equal(res.status, 500);
  assert.equal(deps.recordPendingDispatch.mock.calls.length, 1);
  assert.equal(deps.dispatch.mock.calls.length, 0, "Dispatch should NEVER be called if pending_dispatch fails");
  assert.equal(deps.createOutcome.mock.calls.length, 0);
});

test("executeGreenLaneAction records failure in ledger and outcome if dispatch throws", async () => {
  const deps = createMockDeps();
  deps.dispatch.mock.mockImplementation(async () => {
    throw new Error("Webhook Error");
  });

  const res = await executeGreenLaneAction(defaultParams, deps);

  assert.equal(res.ok, false);
  assert.equal(res.status, 500);
  assert.equal(deps.dispatch.mock.calls.length, 1);
  assert.equal(deps.recordResult.mock.calls.length, 1);
  assert.equal(deps.recordResult.mock.calls[0].arguments[0], "failed");
  assert.equal(deps.recordResult.mock.calls[0].arguments[1], "DISPATCH_FAILED");
  
  assert.equal(deps.createOutcome.mock.calls.length, 1);
  assert.equal(deps.createOutcome.mock.calls[0].arguments[0], "failed");
});

test("executeGreenLaneAction behaves correctly if requiresLedger is false", async () => {
  const deps = createMockDeps();
  const res = await executeGreenLaneAction({ ...defaultParams, requiresLedger: false }, deps);

  assert.equal(res.ok, true);
  assert.equal(deps.recordDecision.mock.calls.length, 0);
  assert.equal(deps.recordPendingDispatch.mock.calls.length, 0);
  assert.equal(deps.recordResult.mock.calls.length, 0);
  
  assert.equal(deps.dispatch.mock.calls.length, 1);
  assert.equal(deps.createOutcome.mock.calls.length, 1);
  assert.equal(deps.createOutcome.mock.calls[0].arguments[0], "pending");
});
