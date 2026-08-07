#!/usr/bin/env node

// src/server/runtime/execution-corridor-contract.test.mjs
//
// The corridor contract joins agentId, skillId, actionId, the execution
// licence, the webhook binding, and the deployed receiver's accepted routes.
// These tests assert the join reports what all three ends actually agree on.
//
// Structural rather than textual: the receiver's accepted set is read out of the
// shipped workflow definition and compared to the declared constant, so the two
// cannot drift; the guard verdict is re-derived from evaluateLiveExecution
// itself, so the contract cannot disagree with the gate the routes call.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

// Pinned so the production localhost guard cannot turn every corridor into
// not_configured and make the failures below read as policy findings.
process.env.NODE_ENV = "test";

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
} = await jiti.import("@/server/runtime/execution-corridor-contract");

const { listExecutionCorridors, getExecutionCorridor } = await jiti.import(
  "@/server/runtime/execution-corridors",
);

const { evaluateLiveExecution } = await jiti.import("@/server/runtime/execution-guard");

const {
  N8N_RECEIVER_ACCEPTED_ROUTES,
  isReceiverAcceptedRoute,
  listApprovedWebhookBindings,
} = await jiti.import("@/server/runtime/webhook-registry");

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

function deps({ outcome = "ALLOW", configuration = "configured", receiver = true } = {}) {
  return {
    evaluate: () => ({ outcome, reason: `reason:${outcome}`, reasonCode: "code" }),
    licenceOf: () => ({ label: "L", suspended: false, zone: "green", hardBlocked: false }),
    receiverAccepts: () => receiver,
    webhookConfigurationOf: () => configuration,
  };
}

/** Full dispatch configuration for a signed n8n binding. */
const CONFIGURED_ENV = {
  N8N_WEBHOOK_URL: "https://hooks.n8n.cloud/webhook/x",
  N8N_SECRET: "static",
  AGENT_WEBHOOK_SIGNING_SECRET: "signing",
};

test("Corridor contract — status is a join of three ends", async (t) => {
  await t.test("a BLOCK verdict wins over everything downstream", () => {
    for (const configuration of ["configured", "destination_env_missing"]) {
      for (const receiver of [true, false]) {
        const corridor = resolveExecutionCorridor(
          BINDING,
          deps({ outcome: "BLOCK", configuration, receiver }),
        );
        assert.equal(corridor.status, "blocked");
      }
    }
  });

  await t.test("a receiver that rejects the route is never eligible", () => {
    const corridor = resolveExecutionCorridor(BINDING, deps({ receiver: false }));
    assert.equal(corridor.status, "receiver_rejects");
    assert.equal(corridor.receiverAccepts, false);
  });

  await t.test("an accepted route with incomplete configuration is not_configured", () => {
    const corridor = resolveExecutionCorridor(
      BINDING,
      deps({ configuration: "signing_secret_missing" }),
    );
    assert.equal(corridor.status, "not_configured");
  });

  await t.test("eligible requires all three ends to agree", () => {
    const corridor = resolveExecutionCorridor(BINDING, deps());
    assert.equal(corridor.status, "eligible");
    assert.equal(corridor.receiverAccepts, true);
    assert.equal(corridor.webhook.configuration, "configured");
    assert.notEqual(corridor.guard.outcome, "BLOCK");
  });

  await t.test("REQUIRE_APPROVAL is not a refusal: the rail exists to collect it", () => {
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

  await t.test("the corridor carries no URL and no secret", () => {
    const corridor = resolveExecutionCorridor(BINDING, deps());
    const serialized = JSON.stringify(corridor);
    assert.ok(!serialized.includes("http"), "a corridor is rendered in the cockpit");
    assert.ok(!/secret["']?\s*:\s*["'][^"']/i.test(serialized));
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

test("Receiver acceptance — read out of the shipped workflow, not restated", async (t) => {
  await t.test("the declared route set matches the workflow's own routing rule", async () => {
    // Structural: the workflow's routing node names the pair it accepts. If the
    // workflow is widened or narrowed, the constant must move with it — a stale
    // constant would let the board advertise a route the receiver rejects.
    const workflow = JSON.parse(
      await readFile(path.join(projectRoot, "docs/n8n/oria-execution-rail.workflow.json"), "utf8"),
    );

    const code = (workflow.nodes ?? [])
      .map((node) => node.parameters?.jsCode ?? node.parameters?.code ?? "")
      .join("\n");
    assert.ok(code.length > 0, "no code node found in the workflow — update this detector");

    const guardLine = code
      .split("\n")
      .find((line) => /body\.agentId\s*!==|body\.skillId\s*!==/.test(line));
    assert.ok(
      guardLine,
      "the workflow no longer guards on agentId/skillId — re-derive the accepted route set",
    );

    const accepted = [...guardLine.matchAll(/!==\s*'([^']+)'/g)].map((m) => m[1]);
    assert.equal(accepted.length, 2, `expected one agent and one skill, got: ${accepted.join(", ")}`);

    const route = `${accepted[0]}/${accepted[1]}`;
    assert.deepEqual(
      [...N8N_RECEIVER_ACCEPTED_ROUTES],
      [route],
      `the workflow accepts ${route}; the declared route set disagrees`,
    );
    assert.equal(isReceiverAcceptedRoute(accepted[0], accepted[1]), true);
  });

  await t.test("routes the receiver never named are rejected", () => {
    assert.equal(isReceiverAcceptedRoute("marketing", "content.generate"), false);
    assert.equal(isReceiverAcceptedRoute("inventor", "concept.generate"), false);
  });
});

test("Corridor contract — bound to the real registries", async (t) => {
  await t.test("no corridor is presented as live today", () => {
    // The honest end state of both ends together: the one route the receiver
    // accepts is the one the Sentinelle blocks, and the routes the Sentinelle
    // accepts are the ones the receiver rejects. Nothing completes end to end.
    const corridors = listExecutionCorridors(CONFIGURED_ENV);
    assert.equal(
      eligibleCorridors(corridors).length,
      0,
      "a corridor became eligible. If both ends now accept the same route, that is a " +
        "real change — update this assertion with the change that produced it:\n" +
        corridors.map((c) => `  ${c.id}: ${c.status}`).join("\n"),
    );
  });

  await t.test("hermes/task.create is blocked by policy, and says why", () => {
    const corridor = getExecutionCorridor("hermes", "task.create", CONFIGURED_ENV);
    assert.ok(corridor, "the binding must still be declared");
    assert.equal(corridor.status, "blocked");
    assert.equal(corridor.guard.outcome, "BLOCK");
    assert.match(corridor.guard.reason, /task\.create/);
    assert.equal(corridor.receiverAccepts, true, "the receiver DOES accept this route");
    assert.equal(corridor.licence.zone, "green", "the licence still green-lists the action");
    assert.equal(
      corridor.webhook.configuration,
      "configured",
      "the destination is fine — the block is a policy fact, not a config gap",
    );
  });

  await t.test("the Sentinelle-accepted routes are the ones the receiver rejects", () => {
    for (const [agentId, skillId] of [
      ["marketing", "content.generate"],
      ["inventor", "concept.generate"],
    ]) {
      const corridor = getExecutionCorridor(agentId, skillId, CONFIGURED_ENV);
      assert.ok(corridor);
      assert.notEqual(corridor.guard.outcome, "BLOCK", `${corridor.id}: Oria accepts it`);
      assert.equal(corridor.receiverAccepts, false, `${corridor.id}: the receiver does not`);
      assert.equal(corridor.status, "receiver_rejects");
    }
  });

  await t.test("the contract never disagrees with the guard the routes call", () => {
    for (const corridor of listExecutionCorridors(CONFIGURED_ENV)) {
      const direct = evaluateLiveExecution({
        agentId: corridor.agentId,
        skillId: corridor.skillId,
        actionId: corridor.actionId,
        autonomyLevel: corridor.evaluatedAtAutonomyLevel,
        requestedMode: "live",
      });
      assert.equal(corridor.guard.outcome, direct.outcome, `${corridor.id}`);
      assert.equal(corridor.guard.reason, direct.reason);
    }
  });

  await t.test("readiness covers every value the dispatcher requires", () => {
    // Behavioural: drop one required value at a time and assert the corridor
    // stops reading as configured. A readiness check that only sees the URL
    // would pass three of these four.
    const receiverAccepted = { agentId: "hermes", skillId: "task.create" };

    const full = getExecutionCorridor(receiverAccepted.agentId, receiverAccepted.skillId, CONFIGURED_ENV);
    assert.equal(full.webhook.configuration, "configured");

    const cases = [
      ["N8N_WEBHOOK_URL", "destination_env_missing"],
      ["N8N_SECRET", "static_secret_missing"],
      ["AGENT_WEBHOOK_SIGNING_SECRET", "signing_secret_missing"],
    ];
    for (const [dropped, expected] of cases) {
      const env = { ...CONFIGURED_ENV };
      delete env[dropped];
      const corridor = getExecutionCorridor(
        receiverAccepted.agentId,
        receiverAccepted.skillId,
        env,
      );
      assert.equal(
        corridor.webhook.configuration,
        expected,
        `dropping ${dropped} must make the corridor unready`,
      );
    }
  });

  await t.test("an undeclared pair has no corridor at all", () => {
    assert.equal(getExecutionCorridor("hermes", "not.a.skill", CONFIGURED_ENV), null);
  });

  await t.test("every declared corridor requires CEO approval", () => {
    const corridors = listExecutionCorridors(CONFIGURED_ENV);
    assert.ok(corridors.length > 0);
    for (const corridor of corridors) {
      assert.equal(corridor.requiresCeoApproval, true, `${corridor.id}`);
    }
  });
});

test("Webhook registry — the allowlist cannot be widened at runtime", async (t) => {
  await t.test("the binding array is frozen", () => {
    // readonly is a compile-time constraint only; the .mjs suites reach this
    // module through jiti, where nothing stops a push().
    const bindings = listApprovedWebhookBindings();
    assert.equal(Object.isFrozen(bindings), true, "the registry array must be frozen");
    assert.throws(
      () => {
        bindings.push({ agentId: "attacker", skillId: "any" });
      },
      /object is not extensible|Cannot add property/i,
      "a caller was able to append to the authorization allowlist",
    );
  });

  await t.test("the accepted-route set is frozen", () => {
    assert.equal(Object.isFrozen(N8N_RECEIVER_ACCEPTED_ROUTES), true);
  });
});
