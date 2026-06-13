// Agent run-health tests — the single derivation of operational health from
// runs: success, errors, pending, stuck, average duration, last run, failure
// rate. Stale detection shares the board's threshold (no second source).

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../../..");

test("Agent run health", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: { "@": path.join(projectRoot, "src") },
  });

  const { deriveWorkflowStepDefs } = await jiti.import(path.join(__dirname, "workflow-run.ts"));
  const { reduceWorkflowRuns } = await jiti.import(path.join(__dirname, "workflow-run-events.ts"));
  const { DEFAULT_STALE_AFTER_MS } = await jiti.import(
    path.join(__dirname, "workflow-live-board.ts"),
  );
  const { buildRunHealthReport, GLOBAL_AGENT_ID } = await jiti.import(
    path.join(__dirname, "agent-run-health.ts"),
  );

  const wf = {
    id: "wf-a",
    title: "Workflow A",
    trigger: "Commande CEO",
    businessReason: "x",
    inputs: ["i1"],
    outputs: ["o1"],
    validation: "Revue",
    nextAction: "Suite",
    skillIds: [],
  };
  const steps = deriveWorkflowStepDefs(wf);
  const start = (runId, agentId, atMs) => ({
    type: "run.started",
    runId,
    workflowId: wf.id,
    agentId,
    title: `${agentId} run`,
    trigger: wf.trigger,
    steps,
    atMs,
  });

  await t.test("counts success, failure, and computes failure rate over concluded runs", () => {
    const runs = reduceWorkflowRuns([
      start("r1", "joris", 1000),
      { type: "run.completed", runId: "r1", atMs: 1500 },
      start("r2", "joris", 1000),
      { type: "run.failed", runId: "r2", atMs: 1800 },
      start("r3", "joris", 1000),
      { type: "run.completed", runId: "r3", atMs: 1200 },
    ]);
    const report = buildRunHealthReport(runs);
    const joris = report.byAgent.find((h) => h.agentId === "joris");
    assert.equal(joris.total, 3);
    assert.equal(joris.success, 2);
    assert.equal(joris.failed, 1);
    // 1 failed of 3 concluded -> 33%
    assert.equal(joris.failureRatePct, 33);
  });

  await t.test("average duration only spans runs with a known start+end", () => {
    const runs = reduceWorkflowRuns([
      start("r1", "joris", 1000),
      { type: "run.completed", runId: "r1", atMs: 1400 }, // 400ms
      start("r2", "joris", 2000),
      { type: "run.completed", runId: "r2", atMs: 2600 }, // 600ms
    ]);
    const report = buildRunHealthReport(runs);
    assert.equal(report.global.avgDurationMs, 500);
  });

  await t.test("stuck = non-terminal idle past threshold; pending = in-flight, fresh", () => {
    const runs = reduceWorkflowRuns([
      start("stale", "joris", 1000),
      { type: "step.started", runId: "stale", stepIndex: 0, atMs: 1000 },
      start("fresh", "joris", 5_000_000),
    ]);
    const nowMs = 1000 + DEFAULT_STALE_AFTER_MS + 1;
    const report = buildRunHealthReport(runs, { nowMs });
    const joris = report.byAgent.find((h) => h.agentId === "joris");
    assert.equal(joris.stuck, 1);
    assert.equal(joris.pending, 1);
    assert.equal(report.global.stuck, 1);
  });

  await t.test("without a clock, nothing is stuck (everything in-flight is pending)", () => {
    const runs = reduceWorkflowRuns([start("r1", "joris", 1000)]);
    const report = buildRunHealthReport(runs);
    assert.equal(report.global.stuck, 0);
    assert.equal(report.global.pending, 1);
  });

  await t.test("lastRunAtMs tracks the most recent activity", () => {
    const runs = reduceWorkflowRuns([
      start("r1", "joris", 1000),
      { type: "run.completed", runId: "r1", atMs: 1500 },
      start("r2", "hermes", 9000),
    ]);
    const report = buildRunHealthReport(runs);
    assert.equal(report.global.lastRunAtMs, 9000);
  });

  await t.test("per-agent rows are ordered problems-first (stuck, then failed)", () => {
    const runs = reduceWorkflowRuns([
      start("ok", "calm", 1000),
      { type: "run.completed", runId: "ok", atMs: 1100 },
      start("bad", "broken", 1000),
      { type: "run.failed", runId: "bad", atMs: 1100 },
      start("hang", "stuckagent", 1000),
      { type: "step.started", runId: "hang", stepIndex: 0, atMs: 1000 },
    ]);
    const nowMs = 1000 + DEFAULT_STALE_AFTER_MS + 1;
    const report = buildRunHealthReport(runs, { nowMs });
    assert.equal(report.byAgent[0].agentId, "stuckagent"); // stuck first
    assert.equal(report.byAgent[1].agentId, "broken"); // then failed
    assert.equal(report.byAgent[2].agentId, "calm");
  });

  await t.test("empty run list yields a well-formed zeroed report", () => {
    const report = buildRunHealthReport([]);
    assert.deepEqual(report.byAgent, []);
    assert.equal(report.global.agentId, GLOBAL_AGENT_ID);
    assert.equal(report.global.total, 0);
    assert.equal(report.global.failureRatePct, 0);
    assert.equal(report.global.avgDurationMs, null);
    assert.equal(report.global.lastRunAtMs, null);
  });
});
