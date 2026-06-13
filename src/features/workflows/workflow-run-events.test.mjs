// Workflow run engine contract tests — step derivation, the event-sourced
// reducer, run lifecycle, progress math, and the in-memory store. Grounds the
// canonical steps against the real charter seed so a run line always reflects
// a workflow that actually exists.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../../..");

test("Workflow run engine", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const {
    deriveWorkflowStepDefs,
    workflowStepCount,
    runProgressPct,
    runProgressRatio,
    currentStepIndex,
    isRunTerminal,
    WORKFLOW_STEP_ORDER,
  } = await jiti.import(path.join(__dirname, "workflow-run.ts"));
  const { reduceWorkflowRuns, createWorkflowRunStore, applyWorkflowRunEvent, EMPTY_WORKFLOW_RUNS_STATE } =
    await jiti.import(path.join(__dirname, "workflow-run-events.ts"));
  const { charterRegistry } = await jiti.import(
    path.join(projectRoot, "src/features/agents/charter-seed.ts"),
  );

  const fixtureWorkflow = {
    id: "fixture-wf",
    title: "Fixture workflow",
    trigger: "Commande CEO",
    businessReason: "Tester le moteur",
    inputs: ["Intrant A", "Intrant B"],
    outputs: ["Livrable"],
    validation: "Revue CEO",
    nextAction: "Mission fermée",
    skillIds: [],
  };

  const startEvent = (atMs = 1000) => ({
    type: "run.started",
    runId: "run-1",
    workflowId: fixtureWorkflow.id,
    agentId: "joris",
    title: fixtureWorkflow.title,
    trigger: fixtureWorkflow.trigger,
    steps: deriveWorkflowStepDefs(fixtureWorkflow),
    atMs,
  });

  await t.test("derives exactly the canonical steps from the real definition", () => {
    const steps = deriveWorkflowStepDefs(fixtureWorkflow);
    assert.equal(steps.length, workflowStepCount());
    assert.deepEqual(
      steps.map((s) => s.key),
      [...WORKFLOW_STEP_ORDER],
    );
    // Details are pulled from the def, never invented.
    assert.equal(steps[0].detail, "Commande CEO");
    assert.equal(steps[1].detail, "Intrant A · Intrant B");
    assert.equal(steps[2].detail, "Livrable");
    assert.equal(steps[3].detail, "Revue CEO");
    assert.equal(steps[4].detail, "Mission fermée");
  });

  await t.test("a fresh run is running with all steps pending and 0% progress", () => {
    const [run] = reduceWorkflowRuns([startEvent()]);
    assert.equal(run.status, "running");
    assert.equal(run.steps.length, 5);
    assert.ok(run.steps.every((s) => s.status === "pending"));
    assert.equal(runProgressPct(run), 0);
    assert.equal(currentStepIndex(run), 0);
  });

  await t.test("steps progress and resolve as events arrive", () => {
    const [run] = reduceWorkflowRuns([
      startEvent(1000),
      { type: "step.started", runId: "run-1", stepIndex: 0, atMs: 1100 },
      { type: "step.completed", runId: "run-1", stepIndex: 0, atMs: 1200 },
      { type: "step.started", runId: "run-1", stepIndex: 1, atMs: 1300 },
    ]);
    assert.equal(run.steps[0].status, "done");
    assert.equal(run.steps[0].startedAtMs, 1100);
    assert.equal(run.steps[0].endedAtMs, 1200);
    assert.equal(run.steps[1].status, "active");
    assert.equal(currentStepIndex(run), 1);
    assert.equal(runProgressPct(run), 20); // 1 of 5 resolved
    assert.equal(run.updatedAtMs, 1300);
  });

  await t.test("a completed run is terminal at 100% with an outcome link", () => {
    const events = [startEvent(1000)];
    for (let i = 0; i < 5; i += 1) {
      events.push({ type: "step.started", runId: "run-1", stepIndex: i, atMs: 1000 + i * 10 });
      events.push({ type: "step.completed", runId: "run-1", stepIndex: i, atMs: 1005 + i * 10 });
    }
    events.push({ type: "run.completed", runId: "run-1", atMs: 2000, observedOutcomeId: "obs-9" });
    const [run] = reduceWorkflowRuns(events);
    assert.equal(run.status, "completed");
    assert.ok(isRunTerminal(run.status));
    assert.equal(runProgressRatio(run), 1);
    assert.equal(currentStepIndex(run), -1);
    assert.equal(run.observedOutcomeId, "obs-9");
    assert.equal(run.endedAtMs, 2000);
  });

  await t.test("a failed step + run.failed marks the run failed", () => {
    const [run] = reduceWorkflowRuns([
      startEvent(1000),
      { type: "step.started", runId: "run-1", stepIndex: 0, atMs: 1100 },
      { type: "step.failed", runId: "run-1", stepIndex: 0, atMs: 1200, note: "intrant manquant" },
      { type: "run.failed", runId: "run-1", atMs: 1300 },
    ]);
    assert.equal(run.steps[0].status, "failed");
    assert.equal(run.steps[0].note, "intrant manquant");
    assert.equal(run.status, "failed");
  });

  await t.test("blocked then unblocked returns to running", () => {
    const blocked = reduceWorkflowRuns([
      startEvent(1000),
      { type: "run.blocked", runId: "run-1", atMs: 1100, note: "attente décision CEO" },
    ])[0];
    assert.equal(blocked.status, "blocked");
    const unblocked = reduceWorkflowRuns([
      startEvent(1000),
      { type: "run.blocked", runId: "run-1", atMs: 1100 },
      { type: "run.unblocked", runId: "run-1", atMs: 1200 },
    ])[0];
    assert.equal(unblocked.status, "running");
  });

  await t.test("events for an unknown run are ignored, never throw", () => {
    const state = applyWorkflowRunEvent(EMPTY_WORKFLOW_RUNS_STATE, {
      type: "step.started",
      runId: "ghost",
      stepIndex: 0,
      atMs: 1,
    });
    assert.equal(state, EMPTY_WORKFLOW_RUNS_STATE);
  });

  await t.test("duplicate run.started is idempotent", () => {
    const runs = reduceWorkflowRuns([startEvent(1000), startEvent(5000)]);
    assert.equal(runs.length, 1);
    assert.equal(runs[0].startedAtMs, 1000);
  });

  await t.test("store keeps insertion order across multiple agents", () => {
    const store = createWorkflowRunStore();
    store.append(startEvent(1000));
    store.append({
      type: "run.started",
      runId: "run-2",
      workflowId: "wf-2",
      agentId: "hermes",
      title: "Second",
      trigger: "Cadence",
      steps: deriveWorkflowStepDefs(fixtureWorkflow),
      atMs: 1500,
    });
    const snapshot = store.snapshot();
    assert.deepEqual(
      snapshot.map((r) => r.id),
      ["run-1", "run-2"],
    );
    assert.deepEqual(
      snapshot.map((r) => r.agentId),
      ["joris", "hermes"],
    );
  });

  await t.test("every real charter workflow derives a grounded 5-step line", () => {
    let checked = 0;
    for (const charter of charterRegistry) {
      for (const wf of charter.workflows) {
        const steps = deriveWorkflowStepDefs(wf);
        assert.equal(steps.length, 5, `workflow ${wf.id} must derive 5 steps`);
        assert.ok(steps[0].detail.length > 0, `workflow ${wf.id} trigger detail must be non-empty`);
        checked += 1;
      }
    }
    assert.ok(checked >= 20, `expected the full charter set, only saw ${checked} workflows`);
  });
});
