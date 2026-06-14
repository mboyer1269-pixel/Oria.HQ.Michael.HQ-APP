// Run timeline tests — temporal ordering, duration-proportional bar widths,
// in-flight runs extending to the window edge, and stuck/error flagging.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../../..");

test("Run timeline", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: { "@": path.join(projectRoot, "src") },
  });

  const { deriveWorkflowStepDefs } = await jiti.import(path.join(__dirname, "workflow-run.ts"));
  const { reduceWorkflowRuns } = await jiti.import(path.join(__dirname, "workflow-run-events.ts"));
  const { buildWorkflowLiveBoard, DEFAULT_STALE_AFTER_MS } = await jiti.import(
    path.join(__dirname, "workflow-live-board.ts"),
  );
  const { buildRunTimeline, buildRunTimelineFromBoard } = await jiti.import(
    path.join(__dirname, "workflow-run-timeline.ts"),
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
    title: `${runId} title`,
    trigger: wf.trigger,
    steps,
    atMs,
  });
  const names = { joris: "Joris", hermes: "Relay" };
  const lanesOf = (events, options) =>
    buildWorkflowLiveBoard(reduceWorkflowRuns(events), names, options).swimlanes.flatMap(
      (s) => s.lanes,
    );

  await t.test("orders bars by start time across agents", () => {
    const lanes = lanesOf([
      start("late", "joris", 5000),
      { type: "run.completed", runId: "late", atMs: 6000 },
      start("early", "hermes", 1000),
      { type: "run.completed", runId: "early", atMs: 2000 },
    ]);
    const timeline = buildRunTimeline(lanes);
    assert.deepEqual(timeline.bars.map((b) => b.runId), ["early", "late"]);
    assert.equal(timeline.windowStartMs, 1000);
    assert.equal(timeline.windowEndMs, 6000);
  });

  await t.test("bar width is proportional to duration within the window", () => {
    // window = [0, 1000]; r1 lasts 250ms (25%), r2 lasts 500ms (50%).
    const lanes = lanesOf([
      start("r1", "joris", 0),
      { type: "run.completed", runId: "r1", atMs: 250 },
      start("r2", "hermes", 500),
      { type: "run.completed", runId: "r2", atMs: 1000 },
    ]);
    const timeline = buildRunTimeline(lanes);
    const r1 = timeline.bars.find((b) => b.runId === "r1");
    const r2 = timeline.bars.find((b) => b.runId === "r2");
    assert.equal(timeline.windowMs, 1000);
    assert.equal(r1.widthPct, 25);
    assert.equal(r2.offsetPct, 50);
    assert.equal(r2.widthPct, 50);
  });

  await t.test("an in-flight run extends to the window edge", () => {
    const lanes = lanesOf([
      start("done", "joris", 0),
      { type: "run.completed", runId: "done", atMs: 1000 },
      start("live", "hermes", 200),
    ]);
    const timeline = buildRunTimeline(lanes);
    const live = timeline.bars.find((b) => b.runId === "live");
    // window end is 1000; live started at 200 -> extends ~80% wide.
    assert.equal(live.durationMs, null);
    assert.ok(live.widthPct >= 79 && live.widthPct <= 81);
  });

  await t.test("stuck runs are flagged on the timeline", () => {
    const lanes = lanesOf(
      [
        start("hang", "joris", 1000),
        { type: "step.started", runId: "hang", stepIndex: 0, atMs: 1000 },
      ],
      { nowMs: 1000 + DEFAULT_STALE_AFTER_MS + 1 },
    );
    const timeline = buildRunTimeline(lanes);
    assert.equal(timeline.bars[0].isStale, true);
  });

  await t.test("empty board yields an empty, well-formed timeline", () => {
    const board = buildWorkflowLiveBoard([], names);
    const timeline = buildRunTimelineFromBoard(board);
    assert.deepEqual(timeline.bars, []);
    assert.equal(timeline.windowStartMs, null);
    assert.equal(timeline.windowMs, 0);
  });
});
