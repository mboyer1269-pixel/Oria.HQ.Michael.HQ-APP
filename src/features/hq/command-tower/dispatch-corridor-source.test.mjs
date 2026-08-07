#!/usr/bin/env node

// src/features/hq/command-tower/dispatch-corridor-source.test.mjs
//
// The bridge between what the system can dispatch and what the cockpit says it
// can dispatch. These tests assert the board is a projection of the contract:
// no corridor reads as live unless policy, receiver and configuration all
// agree, every declared corridor reaches the screen, and no control offers an
// action the app cannot perform.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..", "..");

process.env.NODE_ENV = "test";

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
  },
});

const { mapExecutionCorridorsToBoard, loadRailCorridors } = await jiti.import(
  "@/features/hq/command-tower/dispatch-corridor-source",
);
const { listExecutionCorridors } = await jiti.import("@/server/runtime/execution-corridors");
const { buildCommandTowerModel } = await jiti.import(
  "@/features/hq/command-tower/command-tower-model",
);

const read = (relPath) => readFile(path.join(projectRoot, relPath), "utf8");

const CONFIGURED_ENV = {
  N8N_WEBHOOK_URL: "https://hooks.n8n.cloud/webhook/x",
  N8N_SECRET: "static",
  AGENT_WEBHOOK_SIGNING_SECRET: "signing",
};

function corridor(overrides) {
  return {
    id: "a/b",
    agentId: "a",
    skillId: "b",
    actionId: "b",
    status: "eligible",
    guard: { outcome: "ALLOW", reason: "eligible", reasonCode: "allowed_by_policy" },
    receiverAccepts: true,
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
    assert.match(entry.note, /Skill task\.create is not available to agent hermes\./);
  });

  await t.test("a route the receiver rejects says so, and never reads as live", () => {
    const [entry] = mapExecutionCorridorsToBoard([
      corridor({ status: "receiver_rejects", receiverAccepts: false }),
    ]);
    assert.equal(entry.mode, "receiver_rejects");
    assert.notEqual(entry.mode, "governed_live");
    assert.match(entry.note, /récepteur n8n/);
    assert.match(entry.note, /validation_error/);
  });

  await t.test("every configuration state has a translation", () => {
    // An untranslated state would put a raw identifier in front of the operator.
    const states = [
      "destination_env_missing",
      "destination_url_invalid",
      "destination_hostname_not_allowed",
      "destination_localhost_in_production",
      "static_secret_missing",
      "signing_secret_missing",
    ];
    for (const configuration of states) {
      const [entry] = mapExecutionCorridorsToBoard([
        corridor({ status: "not_configured", webhook: { ...corridor().webhook, configuration } }),
      ]);
      assert.equal(entry.mode, "not_configured");
      assert.ok(
        !entry.note.includes(configuration),
        `${configuration} reaches the screen as a raw identifier`,
      );
      assert.ok(entry.note.trim().length > 0);
    }
  });

  await t.test("a missing secret is reported as a readiness gap, not as ready", () => {
    const [entry] = mapExecutionCorridorsToBoard([
      corridor({
        status: "not_configured",
        webhook: { ...corridor().webhook, configuration: "signing_secret_missing" },
      }),
    ]);
    assert.match(entry.note, /AGENT_WEBHOOK_SIGNING_SECRET/);
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
});

test("Dispatch board — no control promises what the app cannot do", async (t) => {
  await t.test("no corridor offers an action button", async () => {
    // /hq/agents lists and approves existing intents and is bound to a single
    // agent; it cannot prepare one. A button labelled "prepare an intent" that
    // navigates there does nothing the label claims.
    for (const status of ["eligible", "blocked", "receiver_rejects", "not_configured"]) {
      const [entry] = mapExecutionCorridorsToBoard([corridor({ status })]);
      assert.equal(entry.action, null, `${status} must not offer an action`);
    }

    const agentsPage = await read("src/app/hq/agents/page.tsx");
    assert.ok(
      !/ExecutionIntentCreate|createExecutionIntent|IntentComposer/.test(agentsPage),
      "an intent-creation surface now exists — the board may offer a CTA that points at it",
    );
  });

  await t.test("an eligible corridor names the surface that does prepare an intent", () => {
    const [entry] = mapExecutionCorridorsToBoard([corridor()]);
    assert.match(entry.note, /\/api\/agents\/:agentId\/execution-intents/);
    assert.match(entry.note, /proposition tant que le CEO n'approuve pas/);
    assert.equal(entry.requiresApproval, true);
  });
});

test("Dispatch board — every declared corridor reaches the cockpit", async (t) => {
  await t.test("no corridor is dropped between the contract and the board", () => {
    const contract = listExecutionCorridors(CONFIGURED_ENV);
    const board = mapExecutionCorridorsToBoard(contract);

    assert.equal(board.length, contract.length);
    for (const entry of contract) {
      assert.ok(
        board.some((card) => card.id.endsWith(entry.id)),
        `${entry.id} is declared in the contract but absent from the dispatch board`,
      );
    }
  });

  await t.test("the tower renders the real corridors, including the refused ones", () => {
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

  await t.test("no corridor is shown as live while the two ends disagree", () => {
    // With a fully configured destination, so the only thing that could make a
    // corridor live is both ends accepting the same route.
    const board = mapExecutionCorridorsToBoard(listExecutionCorridors(CONFIGURED_ENV));

    const live = board.filter((entry) => entry.mode === "governed_live");
    assert.deepEqual(
      live.map((entry) => entry.id),
      [],
      "a corridor is advertised as live. Verify BOTH ends accept the route before " +
        "updating this assertion:\n" +
        board.map((entry) => `  ${entry.id}: ${entry.mode}`).join("\n"),
    );

    const byId = Object.fromEntries(board.map((entry) => [entry.id, entry]));
    assert.equal(byId["n8n_rail:hermes/task.create"].mode, "blocked");
    assert.equal(byId["n8n_rail:marketing/content.generate"].mode, "receiver_rejects");
    assert.equal(byId["n8n_rail:inventor/concept.generate"].mode, "receiver_rejects");
  });
});
