// /hq/workflows page model tests — the demonstration fallback AND the real
// assembler that projects runs from ledger entries and lights up KPIs.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../../..");

test("Workflows page model", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const { buildWorkflowsPageModel, assembleRealWorkflowsModel, selectWorkflowsModel } =
    await jiti.import(path.join(__dirname, "workflows-page-data.ts"));

  let seq = 0;
  const entry = (over) => ({
    id: `e-${(seq += 1)}`,
    userId: "u1",
    actionType: "generic",
    summary: over.summary ?? "entrée",
    autonomyLevel: 1,
    requiresConfirmation: false,
    payload: {},
    metadata: {},
    storageMode: "supabase",
    ...over,
  });

  await t.test("demo fallback: multi-agent board with mixed states", () => {
    const model = buildWorkflowsPageModel();
    assert.equal(model.source, "demo");
    assert.equal(model.isDemonstration, true);
    assert.ok(model.note.length > 0);
    assert.ok(model.board.totals.agentsEngaged >= 3);
    const statuses = new Set(model.board.swimlanes.flatMap((s) => s.lanes.map((l) => l.status)));
    assert.ok(statuses.has("running") && statuses.has("completed") && statuses.has("blocked"));
  });

  await t.test("demo KPI report reads observations through bindings", () => {
    const model = buildWorkflowsPageModel();
    const routing = model.kpiReport.rows.find((r) => r.kpiId === "joris-routing-accuracy");
    assert.equal(routing.status, "met");
  });

  await t.test("real assembler projects ledger entries into a ledger-sourced board", () => {
    const entries = [
      entry({ missionId: "m1", agentId: "hermes", eventType: "decision", summary: "Router", createdAt: "2026-06-12T10:00:00.000Z" }),
      entry({ missionId: "m1", agentId: "hermes", eventType: "action", summary: "Préparer", createdAt: "2026-06-12T10:05:00.000Z" }),
      entry({ missionId: "m1", agentId: "hermes", eventType: "result", summary: "Livré", createdAt: "2026-06-12T10:09:00.000Z" }),
    ];
    const model = assembleRealWorkflowsModel(entries, new Map([["m1", { title: "Mission 1", status: "active" }]]));
    assert.equal(model.source, "ledger");
    assert.equal(model.isDemonstration, false);
    assert.equal(model.board.totals.runs, 1);
    assert.equal(model.board.totals.completed, 1);
    // The completed run feeds relay-mission-completion.
    const completion = model.kpiReport.rows.find((r) => r.kpiId === "relay-mission-completion");
    assert.equal(completion.actual, 100);
    assert.equal(completion.status, "met");
  });

  await t.test("selectWorkflowsModel falls back to demo when no real runs", () => {
    const model = selectWorkflowsModel([], new Map());
    assert.equal(model.source, "demo");
  });

  await t.test("selectWorkflowsModel prefers ledger when activity exists", () => {
    const entries = [
      entry({ missionId: "m9", agentId: "joris", eventType: "decision", summary: "x", createdAt: "2026-06-12T10:00:00.000Z" }),
    ];
    const model = selectWorkflowsModel(entries, new Map());
    assert.equal(model.source, "ledger");
    assert.ok(model.board.totals.runs >= 1);
  });
});
