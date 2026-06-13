// Workflow live board projection tests — swimlanes per agent, run lanes with
// step points, deterministic ordering, board totals, staleness detection, and
// proportional step widths.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../../..");

test("Workflow live board", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: { "@": path.join(projectRoot, "src") },
  });

  const { deriveWorkflowStepDefs } = await jiti.import(path.join(__dirname, "workflow-run.ts"));
  const { reduceWorkflowRuns } = await jiti.import(path.join(__dirname, "workflow-run-events.ts"));
  const { buildWorkflowLiveBoard, computeStepWidths, isRunStale, DEFAULT_STALE_AFTER_MS } =
    await jiti.import(path.join(__dirname, "workflow-live-board.ts"));

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

  const names = { joris: "Joris", hermes: "Relay" };

  await t.test("groups runs into agent swimlanes with names resolved", () => {
    const runs = reduceWorkflowRuns([start("r1", "joris", 1000), start("r2", "hermes", 1100)]);
    const board = buildWorkflowLiveBoard(runs, names);
    assert.equal(board.swimlanes.length, 2);
    assert.deepEqual(board.swimlanes.map((s) => s.agentId), ["joris", "hermes"]);
    assert.equal(board.swimlanes[0].agentName, "Joris");
    assert.equal(board.swimlanes[1].agentName, "Relay");
  });

  await t.test("step points carry status and computed durations", () => {
    const runs = reduceWorkflowRuns([
      start("r1", "joris", 1000),
      { type: "step.started", runId: "r1", stepIndex: 0, atMs: 1000 },
      { type: "step.completed", runId: "r1", stepIndex: 0, atMs: 1500 },
    ]);
    const board = buildWorkflowLiveBoard(runs, names);
    const lane = board.swimlanes[0].lanes[0];
    assert.equal(lane.steps[0].durationMs, 500);
    assert.equal(lane.steps[1].durationMs, null);
    assert.equal(lane.progressPct, 20);
  });

  await t.test("within a swimlane, live runs sort above concluded ones", () => {
    const runs = reduceWorkflowRuns([
      start("done-run", "joris", 1000),
      { type: "run.completed", runId: "done-run", atMs: 1100 },
      start("live-run", "joris", 900),
    ]);
    const board = buildWorkflowLiveBoard(runs, names);
    assert.deepEqual(board.swimlanes[0].lanes.map((l) => l.runId), ["live-run", "done-run"]);
  });

  await t.test("totals summarise the whole board", () => {
    const runs = reduceWorkflowRuns([
      start("r1", "joris", 1000),
      { type: "step.started", runId: "r1", stepIndex: 0, atMs: 1000 },
      { type: "step.completed", runId: "r1", stepIndex: 0, atMs: 1100 },
      start("r2", "hermes", 1200),
      { type: "run.completed", runId: "r2", atMs: 1300 },
      start("r3", "hermes", 1400),
      { type: "run.blocked", runId: "r3", atMs: 1500 },
    ]);
    const board = buildWorkflowLiveBoard(runs, names);
    assert.equal(board.totals.runs, 3);
    assert.equal(board.totals.active, 2);
    assert.equal(board.totals.completed, 1);
    assert.equal(board.totals.blocked, 1);
    assert.equal(board.totals.avgProgressPct, 10);
  });

  await t.test("staleness: a non-terminal run idle past the threshold is flagged", () => {
    // r1 last updated at 1500 (step completed); r2 just started at a late time.
    const runs = reduceWorkflowRuns([
      start("r1", "joris", 1000),
      { type: "step.started", runId: "r1", stepIndex: 0, atMs: 1000 },
      { type: "step.completed", runId: "r1", stepIndex: 0, atMs: 1500 },
      start("r2", "hermes", 1_000_000),
    ]);
    const nowMs = 1500 + DEFAULT_STALE_AFTER_MS + 1; // r1 idle just past threshold
    const board = buildWorkflowLiveBoard(runs, names, { nowMs });
    const r1 = board.swimlanes.find((s) => s.agentId === "joris").lanes[0];
    assert.equal(r1.isStale, true);
    assert.ok(r1.idleMs > DEFAULT_STALE_AFTER_MS);
    assert.equal(board.totals.stale, 1);
    assert.equal(board.swimlanes.find((s) => s.agentId === "joris").staleRunCount, 1);
  });

  await t.test("staleness is off when no clock is supplied (deterministic default)", () => {
    const runs = reduceWorkflowRuns([start("r1", "joris", 1000)]);
    const board = buildWorkflowLiveBoard(runs, names);
    assert.equal(board.swimlanes[0].lanes[0].isStale, false);
    assert.equal(board.swimlanes[0].lanes[0].idleMs, null);
    assert.equal(board.totals.stale, 0);
  });

  await t.test("a completed run is never stale", () => {
    const runs = reduceWorkflowRuns([
      start("r1", "joris", 1000),
      { type: "run.completed", runId: "r1", atMs: 1100 },
    ]);
    assert.equal(isRunStale(runs[0], 9_999_999_999, 1000), false);
  });

  await t.test("computeStepWidths is proportional to duration and sums to 100", () => {
    const widths = computeStepWidths([100, 300]);
    assert.equal(widths.length, 2);
    assert.ok(widths[1] > widths[0], "longer step should be wider");
    assert.equal(Math.round(widths[0] + widths[1]), 100);
  });

  await t.test("computeStepWidths falls back to equal widths with no durations", () => {
    const widths = computeStepWidths([null, null, null]);
    assert.equal(Math.round(widths.reduce((a, b) => a + b, 0)), 100);
    assert.ok(Math.abs(widths[0] - widths[1]) < 0.5);
  });

  await t.test("empty run list yields an empty, well-formed board", () => {
    const board = buildWorkflowLiveBoard([], names);
    assert.deepEqual(board.swimlanes, []);
    assert.equal(board.totals.runs, 0);
    assert.equal(board.totals.stale, 0);
  });
});
