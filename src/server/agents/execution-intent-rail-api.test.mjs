#!/usr/bin/env node

// src/server/agents/execution-intent-rail-api.test.mjs
//
// The whole n8n rail, through the REAL route handlers:
//
//   POST /api/agents/:agentId/execution-intents   (create — Sentinelle, storage)
//   GET  /api/agents/:agentId/execution-intents   (list pending)
//   POST /api/agents/execution-intents/:id/approve (approve — ledger, dispatch)
//
// What makes this test worth having is what it does NOT stub. The Sentinelle
// verdict comes from the real evaluateLiveExecution, reached through the real
// route; the intent is stored in the real repository; the ledger entries are
// written by the real recorder; the dispatch goes through the real MCP tool.
// No verdict is injected anywhere.
//
// Injected: the owner session (documented test hook), and `fetch`. Nothing
// leaves the process, and every secret here is a local placeholder.
//
// SCOPE: this exercises the ORIA side of the rail — what the API does when the
// Sentinelle accepts a request. It is deliberately not evidence that a corridor
// completes end to end: the deployed n8n receiver accepts a different route than
// the Sentinelle does, so no corridor is `eligible` in the contract today. The
// suite asserts that too, so a passing rail here can never be mistaken for a
// live corridor in the cockpit.
//
// The corridor under test is DERIVED from the contract, not named here.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

// Local-fallback everywhere: no Supabase client, no network, no real identity.
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.MICHAEL_HQ_OWNER_ID;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

// Pinned: a production-like NODE_ENV makes the loopback destination below
// resolve to destination_localhost_in_production, which would empty the
// dispatchable set and report a test-environment condition as a policy finding.
process.env.NODE_ENV = "test";

// Placeholder credentials for the signing path. Never real, never sent: fetch
// is replaced before any dispatch runs.
process.env.N8N_WEBHOOK_URL = "http://127.0.0.1:5678/webhook/rail-api-test";
process.env.N8N_SECRET = "test-static-secret";
process.env.AGENT_WEBHOOK_SIGNING_SECRET = "test-signing-secret";

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
  },
});

const createRoute = await jiti.import(
  path.join(projectRoot, "src/app/api/agents/[agentId]/execution-intents/route.ts"),
);
const approveRoute = await jiti.import(
  path.join(projectRoot, "src/app/api/agents/execution-intents/[intentId]/approve/route.ts"),
);
// Specifier form matters: jiti caches by resolved id, so importing a module by
// absolute path yields a different instance from the one the routes reach via
// "@/...". Any module holding state the routes mutate — the intent store, the
// local ledger — must be imported in the same form the routes use.
const { listExecutionCorridors } = await jiti.import("@/server/runtime/execution-corridors");
const { evaluateLiveExecution } = await jiti.import("@/server/runtime/execution-guard");
const { __clearAgentExecutionIntentsForTests, listPendingAgentExecutionIntents } =
  await jiti.import("@/server/agents/execution-intent-repository");
// The ledger reader is imported by PATH, not by "@/...", because ledger-events
// reaches its repository through a relative specifier — that resolves to the
// path form, which is a different instance from the alias form. Same trap as
// above, opposite answer. The suite asserts the store actually grew, so an
// instance mismatch fails loudly instead of reading a silent empty list.
const { listLocalActionLedgerEntries } = await jiti.import(
  path.join(projectRoot, "src/server/actions/action-ledger-repository.ts"),
);

// Documented owner-session test hook (src/server/auth/owner.ts). Present means
// "authorized"; the route's own gate still runs first on every request.
globalThis.__ownerApiSessionTestResult = null;

const WORKSPACE_ID = "michael-hq";

// ---------------------------------------------------------------------------
// Corridor selection — derived, never named
// ---------------------------------------------------------------------------

const corridors = listExecutionCorridors(process.env);
const blocked = corridors.filter((corridor) => corridor.status === "blocked");

// The Oria side is dispatchable when the Sentinelle does not refuse and every
// value the dispatcher needs is present. That is a strictly weaker condition
// than the contract's `eligible`, which also requires the deployed receiver to
// accept the route — and none currently does.
const oriaDispatchable = corridors.filter(
  (corridor) =>
    corridor.guard.outcome !== "BLOCK" && corridor.webhook.configuration === "configured",
);

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

function installFetchSpy(response) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return (
      response ?? { ok: true, status: 200, json: async () => ({ ok: true, status: "ok" }) }
    );
  };
  return {
    calls,
    restore() {
      globalThis.fetch = original;
    },
  };
}

async function postIntent(agentId, body) {
  const response = await createRoute.POST(
    new Request(`http://localhost/api/agents/${agentId}/execution-intents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ agentId }) },
  );
  return { status: response.status, body: await response.json() };
}

async function getIntents(agentId) {
  const response = await createRoute.GET(
    new Request(`http://localhost/api/agents/${agentId}/execution-intents`),
    { params: Promise.resolve({ agentId }) },
  );
  return { status: response.status, body: await response.json() };
}

async function approveIntent(intentId) {
  const response = await approveRoute.POST(
    new Request(`http://localhost/api/agents/execution-intents/${intentId}/approve`, {
      method: "POST",
    }),
    { params: Promise.resolve({ intentId }) },
  );
  return { status: response.status, body: await response.json() };
}

function payloadFor(corridor) {
  return {
    skillId: corridor.skillId,
    autonomyLevel: corridor.evaluatedAtAutonomyLevel,
    client: "Acme Corp",
    email: "buyer@acme.test",
    actionType: "rail.api.test",
    missionId: "mission-rail-api-001",
    data: { note: "no network — fetch is replaced" },
  };
}

// ---------------------------------------------------------------------------
// The Oria half of the rail, on a corridor the contract itself selects
// ---------------------------------------------------------------------------

test("Execution rail (API) — create → Sentinelle → storage → approve → dispatch", async (t) => {
  assert.ok(
    oriaDispatchable.length > 0,
    "The Sentinelle refuses every declared corridor, so the Oria rail cannot be exercised.\n" +
      corridors.map((c) => `  ${c.id}: ${c.status} — ${c.guard.reason}`).join("\n") +
      "\nThis is a real finding, not a test-setup problem: fix the corridor, not this test.",
  );

  const corridor = oriaDispatchable[0];

  await t.test(`the corridor under test (${corridor.id}) is chosen by the contract`, () => {
    // Guards the one substitution this test must never make silently: quietly
    // switching rails when the intended corridor stops working.
    assert.notEqual(corridor.guard.outcome, "BLOCK");
    assert.equal(corridor.requiresCeoApproval, true);
    assert.equal(corridor.webhook.configuration, "configured");
  });

  await t.test("a dispatchable Oria rail is NOT a live corridor", () => {
    // The distinction this whole suite depends on. The API accepts and
    // dispatches this route because the Sentinelle does; the deployed receiver
    // does not accept it, so the contract does not call it eligible and the
    // cockpit must not present it as live.
    assert.equal(
      corridor.status,
      "receiver_rejects",
      "The corridor the API rail runs on is now reported as " +
        `"${corridor.status}". If both ends genuinely accept the same route, that is a ` +
        "real change — update this assertion with the change that produced it.",
    );
    assert.equal(corridor.receiverAccepts, false);
    assert.equal(
      corridors.filter((c) => c.status === "eligible").length,
      0,
      "a corridor became eligible; verify both ends before treating the rail as live",
    );
  });

  await t.test("the ALLOW comes from the real guard, not from this test", async () => {
    // The prohibition that shapes this file: no injected verdict anywhere.
    const direct = evaluateLiveExecution({
      agentId: corridor.agentId,
      skillId: corridor.skillId,
      actionId: corridor.actionId,
      autonomyLevel: corridor.evaluatedAtAutonomyLevel,
      requestedMode: "live",
    });
    assert.notEqual(direct.outcome, "BLOCK");

    const source = await readFile(
      path.join(projectRoot, "src/app/api/agents/[agentId]/execution-intents/route.ts"),
      "utf8",
    );
    assert.match(
      source,
      /evaluateLiveExecution\(/,
      "the route must call the real Sentinelle — this suite asserts through it",
    );

    // Comments stripped: the header quotes the injected-verdict line it exists
    // to contrast with. What must never appear is that line as CODE here.
    const self = (await readFile(fileURLToPath(import.meta.url), "utf8"))
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    assert.ok(
      !/evaluate:\s*\(\)\s*=>/.test(self),
      "this suite must never inject a Sentinelle verdict",
    );
  });

  let intentId;

  await t.test("create: a pending intent is stored, nothing is dispatched", async () => {
    __clearAgentExecutionIntentsForTests();
    const fetchSpy = installFetchSpy();
    try {
      const created = await postIntent(corridor.agentId, payloadFor(corridor));

      assert.equal(created.status, 201);
      assert.equal(created.body.status, "pending");
      assert.equal(created.body.requiresHumanApproval, true);
      assert.notEqual(created.body.outcome, "BLOCK");
      assert.ok(created.body.intentId);
      intentId = created.body.intentId;

      assert.equal(fetchSpy.calls.length, 0, "preparation must not reach the network");

      const stored = await listPendingAgentExecutionIntents(WORKSPACE_ID);
      const found = stored.find((intent) => intent.intentId === intentId);
      assert.ok(found, "the intent must be readable from the repository");
      assert.equal(found.status, "pending");
      assert.equal(found.requiresCeoApproval, true);
      assert.equal(found.toolName, corridor.webhook.toolName);
    } finally {
      fetchSpy.restore();
    }
  });

  await t.test("list: the pending intent is visible to the CEO", async () => {
    const listed = await getIntents(corridor.agentId);
    assert.equal(listed.status, 200);
    assert.ok(listed.body.intents.some((intent) => intent.intentId === intentId));
  });

  await t.test("approve: one signed dispatch, ledger attempt before result", async () => {
    const ledgerBefore = listLocalActionLedgerEntries().length;
    const fetchSpy = installFetchSpy();
    try {
      const approved = await approveIntent(intentId);

      assert.equal(approved.status, 200);
      assert.equal(approved.body.status, "executed");
      assert.ok(approved.body.actionRef, "an executed intent carries its dispatch reference");

      assert.equal(fetchSpy.calls.length, 1, "exactly one outbound call");
      const [call] = fetchSpy.calls;
      assert.equal(call.url, process.env.N8N_WEBHOOK_URL);
      assert.equal(call.init.method, "POST");
      assert.equal(call.init.headers["x-webhook-secret"], process.env.N8N_SECRET);
      assert.ok(call.init.headers["x-orya-signature"], "the dispatch must be HMAC-signed");
      assert.ok(call.init.headers["x-orya-timestamp"]);
      assert.ok(!JSON.stringify(call.init.headers).includes(process.env.AGENT_WEBHOOK_SIGNING_SECRET));

      const written = listLocalActionLedgerEntries().slice(ledgerBefore);
      assert.ok(
        written.length > 0,
        "the local ledger did not grow — this reader is not the instance the route writes to",
      );
      const attemptAt = written.findIndex((entry) => entry.eventType === "action");
      const resultAt = written.findIndex((entry) => entry.eventType === "result");
      assert.ok(attemptAt >= 0, "the attempt must be recorded");
      assert.ok(resultAt >= 0, "the result must be recorded");
      assert.ok(attemptAt < resultAt, "the attempt is recorded BEFORE the dispatch result");
    } finally {
      fetchSpy.restore();
    }
  });

  await t.test("re-approve: the executed intent is no longer pending", async () => {
    const fetchSpy = installFetchSpy();
    try {
      const again = await approveIntent(intentId);
      assert.equal(again.status, 409);
      assert.equal(fetchSpy.calls.length, 0, "a second approval must not dispatch again");
    } finally {
      fetchSpy.restore();
      __clearAgentExecutionIntentsForTests();
    }
  });
});

// ---------------------------------------------------------------------------
// The declared-but-unreachable corridor
// ---------------------------------------------------------------------------

test("Execution rail (API) — a blocked corridor is refused at creation", async (t) => {
  await t.test("hermes/task.create is blocked, and the API says so", async () => {
    // Declared in the webhook registry and green-listed by the licence, but
    // `task.create` is not a skill in the catalog, so the Sentinelle refuses it.
    // Pinned at the API boundary: a cockpit claiming this corridor is active
    // fails here first.
    const target = blocked.find((corridor) => corridor.id === "hermes/task.create");
    assert.ok(
      target,
      "hermes/task.create is no longer blocked. If a task.create skill was declared " +
        "and assigned to hermes, that is an autonomy change — update this test with " +
        "the mandate that authorized it.",
    );

    __clearAgentExecutionIntentsForTests();
    const fetchSpy = installFetchSpy();
    try {
      const created = await postIntent(target.agentId, payloadFor(target));

      assert.equal(created.status, 403);
      assert.equal(created.body.outcome, "BLOCK");
      assert.match(created.body.reason, /task\.create/);

      assert.equal(fetchSpy.calls.length, 0, "a blocked corridor never reaches the network");
      const stored = await listPendingAgentExecutionIntents(WORKSPACE_ID);
      assert.equal(stored.length, 0, "a blocked request must not leave a queued intent behind");
    } finally {
      fetchSpy.restore();
      __clearAgentExecutionIntentsForTests();
    }
  });

  await t.test("approving an intent that does not exist is a 404, not a dispatch", async () => {
    const fetchSpy = installFetchSpy();
    try {
      const response = await approveIntent("intent-does-not-exist");
      assert.equal(response.status, 404);
      assert.equal(fetchSpy.calls.length, 0);
    } finally {
      fetchSpy.restore();
    }
  });
});
