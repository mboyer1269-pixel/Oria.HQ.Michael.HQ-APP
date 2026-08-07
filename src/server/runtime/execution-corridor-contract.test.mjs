#!/usr/bin/env node

// src/server/runtime/execution-corridor-contract.test.mjs
//
// The corridor contract joins five facts that never had to agree before:
// agentId, skillId, actionId, the execution licence, and the webhook binding.
// These tests pin what that join is for.
//
// The concrete defect that produced this module: the registry declared
// hermes/task.create, the licence listed task.create as a green action, the
// skills catalog had no such skill, and the cockpit announced the corridor as
// "the only active one". The Sentinelle rejected every request on it. Four
// sources, no cross-check, and the screen was the one that lied.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
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

const {
  resolveExecutionCorridor,
  resolveExecutionCorridors,
  eligibleCorridors,
  blockedCorridors,
  CORRIDOR_EVALUATION_AUTONOMY_LEVEL,
} = await jiti.import(path.join(__dirname, "execution-corridor-contract.ts"));

const { listExecutionCorridors, getExecutionCorridor } = await jiti.import(
  path.join(__dirname, "execution-corridors.ts"),
);

const { evaluateLiveExecution } = await jiti.import(path.join(__dirname, "execution-guard.ts"));

const BINDING = {
  agentId: "agent-x",
  skillId: "skill.x",
  actionId: "action.x",
  toolName: "tool_x",
  destinationEnvKey: "X_URL",
  allowedHostnames: ["example.test"],
  requiresSignature: true,
  timeoutMs: 1000,
};

function deps({ outcome = "ALLOW", configuration = "configured" } = {}) {
  return {
    evaluate: () => ({ outcome, reason: `reason:${outcome}`, reasonCode: "code" }),
    licenceOf: () => ({ label: "L", suspended: false, zone: "green", hardBlocked: false }),
    webhookConfigurationOf: () => configuration,
  };
}

test("Corridor contract — status is a join, never an opinion", async (t) => {
  await t.test("a BLOCK verdict makes the corridor blocked, configured or not", () => {
    for (const configuration of ["configured", "destination_env_missing"]) {
      const corridor = resolveExecutionCorridor(BINDING, deps({ outcome: "BLOCK", configuration }));
      assert.equal(corridor.status, "blocked");
    }
  });

  await t.test("an eligible verdict with no destination is not_configured, never eligible", () => {
    const corridor = resolveExecutionCorridor(
      BINDING,
      deps({ outcome: "ALLOW", configuration: "destination_env_missing" }),
    );
    assert.equal(corridor.status, "not_configured");
  });

  await t.test("REQUIRE_APPROVAL is eligible: the rail exists to collect that approval", () => {
    // The intent route accepts ALLOW and REQUIRE_APPROVAL alike — both mean
    // "may be queued for the CEO". Only BLOCK stops a corridor.
    const corridor = resolveExecutionCorridor(BINDING, deps({ outcome: "REQUIRE_APPROVAL" }));
    assert.equal(corridor.status, "eligible");
  });

  await t.test("the guard's sentence is carried verbatim", () => {
    const corridor = resolveExecutionCorridor(BINDING, deps({ outcome: "BLOCK" }));
    assert.equal(corridor.guard.reason, "reason:BLOCK");
  });

  await t.test("no corridor can be constructed self-dispatching", () => {
    const corridor = resolveExecutionCorridor(BINDING, deps());
    assert.equal(corridor.requiresCeoApproval, true);
    assert.equal(corridor.evaluatedAtAutonomyLevel, CORRIDOR_EVALUATION_AUTONOMY_LEVEL);
  });

  await t.test("the webhook facts never carry the destination URL", () => {
    const corridor = resolveExecutionCorridor(BINDING, deps());
    const serialized = JSON.stringify(corridor);
    assert.ok(!serialized.includes("http"), "a corridor is rendered in the cockpit");
    assert.equal(corridor.webhook.destinationEnvKey, "X_URL");
  });

  await t.test("eligible/blocked partitions are consistent", () => {
    const corridors = resolveExecutionCorridors(
      [BINDING, { ...BINDING, skillId: "skill.y" }],
      deps({ outcome: "BLOCK" }),
    );
    assert.equal(eligibleCorridors(corridors).length, 0);
    assert.equal(blockedCorridors(corridors).length, 2);
  });
});

test("Corridor contract — bound to the real registries", async (t) => {
  const env = { N8N_WEBHOOK_URL: "https://hooks.n8n.cloud/webhook/x" };

  await t.test("hermes/task.create is BLOCKED, and says why", () => {
    // The declared corridor the whole n8n rail was documented around. It is
    // blocked because `task.create` is not a skill in the catalog and is not
    // assigned to hermes — the licence green-listing it changes nothing.
    // This assertion exists so the corridor cannot quietly become live: making
    // it work is a decision about agent capability, not a wiring fix.
    const corridor = getExecutionCorridor("hermes", "task.create", env);
    assert.ok(corridor, "the binding must still be declared");
    assert.equal(corridor.status, "blocked");
    assert.equal(corridor.guard.outcome, "BLOCK");
    assert.match(corridor.guard.reason, /task\.create/);
    assert.equal(corridor.licence.zone, "green", "the licence still green-lists the action");
    assert.equal(
      corridor.webhook.configuration,
      "configured",
      "the destination is fine — the block is a policy fact, not a config gap",
    );
  });

  await t.test("the contract never disagrees with the guard the routes call", () => {
    // The contract must not be a second implementation of the gate. Every
    // corridor's verdict is re-derived here from evaluateLiveExecution itself.
    for (const corridor of listExecutionCorridors(env)) {
      const direct = evaluateLiveExecution({
        agentId: corridor.agentId,
        skillId: corridor.skillId,
        actionId: corridor.actionId,
        autonomyLevel: corridor.evaluatedAtAutonomyLevel,
        requestedMode: "live",
      });
      assert.equal(
        corridor.guard.outcome,
        direct.outcome,
        `${corridor.id}: the contract reports ${corridor.guard.outcome}, the guard says ${direct.outcome}`,
      );
      assert.equal(corridor.guard.reason, direct.reason);
    }
  });

  await t.test("an unconfigured destination downgrades every corridor", () => {
    for (const corridor of listExecutionCorridors({})) {
      assert.notEqual(
        corridor.status,
        "eligible",
        `${corridor.id} claims eligible with no destination configured`,
      );
    }
  });

  await t.test("an undeclared pair has no corridor at all", () => {
    assert.equal(getExecutionCorridor("hermes", "not.a.skill", env), null);
  });

  await t.test("every declared corridor requires CEO approval", () => {
    const corridors = listExecutionCorridors(env);
    assert.ok(corridors.length > 0);
    for (const corridor of corridors) {
      assert.equal(corridor.requiresCeoApproval, true, `${corridor.id}`);
    }
  });
});
