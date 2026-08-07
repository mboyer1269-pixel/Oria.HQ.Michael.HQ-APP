#!/usr/bin/env node

// src/features/hq/command-tower/dispatch-corridor-source.test.mjs
//
// The bridge between what the system can dispatch and what the cockpit says it
// can dispatch. The board used to be a hardcoded sentence — "n8n ·
// hermes/task.create · governed_live · Seul corridor actif" — for a corridor
// the Sentinelle rejected on every request. These tests pin that the board is a
// projection of the contract, and that every declared corridor reaches it.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..", "..");

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
  },
});

const { mapExecutionCorridorsToBoard, loadRailCorridors } = await jiti.import(
  path.join(__dirname, "dispatch-corridor-source.ts"),
);
const { listExecutionCorridors } = await jiti.import(
  path.join(projectRoot, "src/server/runtime/execution-corridors.ts"),
);
const { buildCommandTowerModel } = await jiti.import(
  path.join(__dirname, "command-tower-model.ts"),
);

function corridor(overrides) {
  return {
    id: "a/b",
    agentId: "a",
    skillId: "b",
    actionId: "b",
    status: "eligible",
    guard: { outcome: "ALLOW", reason: "eligible", reasonCode: "allowed_by_policy" },
    licence: { label: "L", suspended: false, zone: "green", hardBlocked: false },
    webhook: {
      toolName: "n8n_webhook_trigger",
      destinationEnvKey: "N8N_WEBHOOK_URL",
      allowedHostnames: ["hooks.n8n.cloud"],
      requiresSignature: true,
      timeoutMs: 10_000,
      configuration: "configured",
    },
    requiresCeoApproval: true,
    evaluatedAtAutonomyLevel: 2,
    ...overrides,
  };
}

test("Dispatch board — the mapping never invents a status", async (t) => {
  await t.test("a blocked corridor shows the guard's own sentence", () => {
    const [entry] = mapExecutionCorridorsToBoard([
      corridor({
        status: "blocked",
        guard: {
          outcome: "BLOCK",
          reason: "Skill task.create is not available to agent hermes.",
          reasonCode: "unauthorized_action",
        },
      }),
    ]);
    assert.equal(entry.mode, "blocked");
    assert.equal(entry.action, null);
    assert.match(entry.note, /Skill task\.create is not available to agent hermes\./);
  });

  await t.test("an unconfigured destination names the variable to set", () => {
    const [entry] = mapExecutionCorridorsToBoard([
      corridor({
        status: "not_configured",
        webhook: { ...corridor().webhook, configuration: "destination_env_missing" },
      }),
    ]);
    assert.equal(entry.mode, "not_configured");
    assert.equal(entry.action, null);
    assert.match(entry.note, /N8N_WEBHOOK_URL/);
  });

  await t.test("'seul corridor' is counted, never asserted", () => {
    const one = mapExecutionCorridorsToBoard([corridor()]);
    assert.match(one[0].note, /Seul corridor éligible/);

    const two = mapExecutionCorridorsToBoard([corridor(), corridor({ id: "c/d" })]);
    for (const entry of two) {
      assert.match(entry.note, /2 corridors éligibles/);
      assert.ok(!/Seul corridor/.test(entry.note));
    }
  });

  await t.test("a live corridor still says the intent is only a proposal", () => {
    const [entry] = mapExecutionCorridorsToBoard([corridor()]);
    assert.equal(entry.mode, "governed_live");
    assert.match(entry.action.label, /requires approval/);
    assert.match(entry.note, /proposition tant que le CEO n'approuve pas/);
    assert.equal(entry.requiresApproval, true);
  });
});

test("Dispatch board — every declared corridor reaches the cockpit", async (t) => {
  await t.test("no corridor is dropped between the contract and the board", () => {
    // A corridor that exists but is not displayed is the same failure as one
    // displayed but not existing: the operator cannot see what the system has.
    const contract = listExecutionCorridors({ N8N_WEBHOOK_URL: "https://hooks.n8n.cloud/webhook/x" });
    const board = mapExecutionCorridorsToBoard(contract);

    assert.equal(board.length, contract.length);
    for (const entry of contract) {
      assert.ok(
        board.some((card) => card.id.endsWith(entry.id)),
        `${entry.id} is declared in the contract but absent from the dispatch board`,
      );
    }
  });

  await t.test("the tower renders the real corridors, including the blocked one", () => {
    const model = buildCommandTowerModel({
      pendingIntents: [],
      nextAction: null,
      evidence: null,
      railCorridors: loadRailCorridors(),
    });

    const rail = model.dispatchBoard.corridors.filter((c) => c.id.startsWith("n8n_rail:"));
    assert.ok(rail.length > 0, "the board must show the rail corridors");
    assert.ok(
      rail.some((c) => c.id === "n8n_rail:hermes/task.create"),
      "hermes/task.create must remain visible — hiding a blocked corridor is not honesty",
    );
    for (const card of rail) {
      assert.equal(card.requiresApproval, true);
      assert.ok(card.note.trim().length > 0, `${card.id} must explain its state`);
    }
  });

  await t.test("hermes/task.create is never shown as live", () => {
    // With a fully configured destination — so the only thing that could make
    // it live is a policy change, which is a decision, not a wiring fix.
    const board = mapExecutionCorridorsToBoard(
      listExecutionCorridors({ N8N_WEBHOOK_URL: "https://hooks.n8n.cloud/webhook/x" }),
    );
    const card = board.find((entry) => entry.id === "n8n_rail:hermes/task.create");
    assert.ok(card);
    assert.equal(card.mode, "blocked");
    assert.equal(card.action, null);
  });
});
