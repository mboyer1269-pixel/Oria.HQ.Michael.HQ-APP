// Real ledger → runs projection tests. Builds synthetic ledger entries and a
// mission lookup, then asserts the projected runs reflect what was actually
// recorded — concluded only when a result exists, in flight otherwise.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../../..");

test("Ledger run projection", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const { projectRunsFromLedger } = await jiti.import(
    path.join(__dirname, "workflow-run-projection.ts"),
  );
  const { reduceWorkflowRuns } = await jiti.import(path.join(__dirname, "workflow-run-events.ts"));
  const { buildWorkflowLiveBoard } = await jiti.import(
    path.join(__dirname, "workflow-live-board.ts"),
  );

  let seq = 0;
  const entry = (over) => ({
    id: `e-${(seq += 1)}`,
    userId: "u1",
    actionType: over.eventType ?? "generic",
    summary: over.summary ?? "entrée",
    autonomyLevel: 1,
    requiresConfirmation: false,
    payload: {},
    metadata: {},
    storageMode: "supabase",
    ...over,
  });

  const lookup = (pairs) => new Map(pairs);

  await t.test("a decision→action→result mission becomes a completed run", () => {
    const entries = [
      entry({ missionId: "m1", agentId: "joris", eventType: "decision", summary: "Router la mission", createdAt: "2026-06-12T10:00:00.000Z" }),
      entry({ missionId: "m1", agentId: "hermes", eventType: "action", summary: "Préparer le livrable", createdAt: "2026-06-12T10:05:00.000Z" }),
      entry({ missionId: "m1", agentId: "hermes", eventType: "result", summary: "Livrable validé", createdAt: "2026-06-12T10:09:00.000Z" }),
    ];
    const runs = reduceWorkflowRuns(projectRunsFromLedger(entries, lookup([["m1", { title: "Mission 1", status: "active" }]])));
    assert.equal(runs.length, 1);
    const run = runs[0];
    assert.equal(run.status, "completed");
    assert.equal(run.title, "Mission 1");
    assert.equal(run.agentId, "joris"); // from the decision entry
    assert.equal(run.steps.length, 3);
    assert.ok(run.steps.every((s) => s.status === "done"));
    assert.equal(run.steps[0].detail, "Router la mission");
    assert.equal(run.steps[2].detail, "Livrable validé");
  });

  await t.test("decision+action without a result is still running, result step active", () => {
    const entries = [
      entry({ missionId: "m2", agentId: "orion", eventType: "decision", summary: "Scanner le marché", createdAt: "2026-06-12T11:00:00.000Z" }),
      entry({ missionId: "m2", agentId: "orion", eventType: "action", summary: "Collecte des signaux", createdAt: "2026-06-12T11:02:00.000Z" }),
    ];
    const [run] = reduceWorkflowRuns(projectRunsFromLedger(entries, lookup([["m2", { title: "Scan", status: "active" }]])));
    assert.equal(run.status, "running");
    assert.equal(run.steps[0].status, "done");
    assert.equal(run.steps[1].status, "done");
    assert.equal(run.steps[2].status, "active"); // result not recorded yet → in flight
    assert.equal(run.steps[2].detail, "—");
  });

  await t.test("a cancelled mission becomes a failed run", () => {
    const entries = [
      entry({ missionId: "m3", agentId: "sentinel", eventType: "decision", summary: "Gate", createdAt: "2026-06-12T12:00:00.000Z" }),
    ];
    const [run] = reduceWorkflowRuns(projectRunsFromLedger(entries, lookup([["m3", { title: "Gate", status: "cancelled" }]])));
    assert.equal(run.status, "failed");
  });

  await t.test("orphan entries (no mission) are ignored", () => {
    const entries = [entry({ agentId: "joris", eventType: "action", summary: "sans mission", createdAt: "2026-06-12T12:00:00.000Z" })];
    assert.deepEqual(projectRunsFromLedger(entries, lookup([])), []);
  });

  await t.test("missions are ordered by earliest activity and feed a real board", () => {
    const entries = [
      entry({ missionId: "late", agentId: "hermes", eventType: "decision", summary: "B", createdAt: "2026-06-12T14:00:00.000Z" }),
      entry({ missionId: "early", agentId: "joris", eventType: "decision", summary: "A", createdAt: "2026-06-12T09:00:00.000Z" }),
    ];
    const runs = reduceWorkflowRuns(
      projectRunsFromLedger(entries, lookup([["early", { title: "Early", status: "active" }], ["late", { title: "Late", status: "active" }]])),
    );
    assert.deepEqual(runs.map((r) => r.workflowId), ["early", "late"]);
    const board = buildWorkflowLiveBoard(runs, { joris: "Joris", hermes: "Relay" });
    assert.equal(board.totals.runs, 2);
    assert.equal(board.totals.agentsEngaged, 2);
  });

  await t.test("no entries yields no runs", () => {
    assert.deepEqual(projectRunsFromLedger([], lookup([])), []);
  });
});
