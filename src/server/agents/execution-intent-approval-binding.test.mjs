#!/usr/bin/env node

// src/server/agents/execution-intent-approval-binding.test.mjs
//
// G2: CEO approval of an execution intent is bound to the exact payload the
// CEO reviewed. Through the REAL approve route (local-fallback repo, fetch
// replaced; nothing leaves the process):
//   (a) stale/wrong expectedPayloadHash -> 409 "changed", no dispatch
//   (a') missing expectedPayloadHash -> 400, no dispatch
//   (b) double approve -> exactly one dispatch
//   (c) workspace B intent cannot be approved from workspace A session
//   (d) forged approvedBy/workspaceId in body ignored; actor from session
//   (e) already-decided intent -> 409 "already_decided"
//   (f) payload modified after queuing, approved with old hash -> 409 "changed"
// Expiry is NOT covered: agent_execution_intents has no expiry column (0024).

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.MICHAEL_HQ_OWNER_ID;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
process.env.NODE_ENV = "test";
process.env.N8N_WEBHOOK_URL = "http://127.0.0.1:5678/webhook/binding-test";
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
const { listExecutionCorridors } = await jiti.import("@/server/runtime/execution-corridors");
const repo = await jiti.import("@/server/agents/execution-intent-repository");
const { stableStringify } = await jiti.import("@/server/ledger/hash-chain-canonicalizer");
const { listLocalActionLedgerEntries } = await jiti.import(
  path.join(projectRoot, "src/server/actions/action-ledger-repository.ts"),
);

globalThis.__ownerApiSessionTestResult = null;
const WORKSPACE_ID = "michael-hq";

// Independent re-statement of the canonical rule: sha256 over the key-sorted
// JSON of the stored payload.
const hashOf = (payload) => createHash("sha256").update(stableStringify(payload)).digest("hex");

const corridor = listExecutionCorridors(process.env).find(
  (c) => c.guard.outcome !== "BLOCK" && c.webhook.configuration === "configured",
);

function installFetchSpy() {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return { ok: true, status: 200, json: async () => ({ ok: true, status: "ok" }) };
  };
  return { calls, restore: () => void (globalThis.fetch = original) };
}

async function createIntent() {
  const response = await createRoute.POST(
    new Request(`http://localhost/api/agents/${corridor.agentId}/execution-intents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        skillId: corridor.skillId,
        autonomyLevel: corridor.evaluatedAtAutonomyLevel,
        client: "Acme Corp",
        email: "buyer@acme.test",
        actionType: "binding.test",
        missionId: "mission-binding-001",
        data: { amount: 100 },
      }),
    }),
    { params: Promise.resolve({ agentId: corridor.agentId }) },
  );
  const body = await response.json();
  assert.equal(response.status, 201, JSON.stringify(body));
  return body.intentId;
}

async function storedHash(workspaceId, intentId) {
  const intent = await repo.getAgentExecutionIntent(workspaceId, intentId);
  return hashOf(intent.payload);
}

async function approve(intentId, body) {
  const response = await approveRoute.POST(
    new Request(`http://localhost/api/agents/execution-intents/${intentId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    { params: Promise.resolve({ intentId }) },
  );
  return { status: response.status, body: await response.json() };
}

test("G2 — approval is bound to the reviewed payload hash", async (t) => {
  assert.ok(corridor, "no dispatchable corridor; cannot exercise the approve route");

  await t.test("(a) wrong expectedPayloadHash -> 409 changed, no effect", async () => {
    repo.__clearAgentExecutionIntentsForTests();
    const id = await createIntent();
    const spy = installFetchSpy();
    try {
      const res = await approve(id, { expectedPayloadHash: "0".repeat(64) });
      assert.equal(res.status, 409);
      assert.equal(res.body.reason, "changed");
      assert.equal(spy.calls.length, 0);
      assert.equal((await repo.getAgentExecutionIntent(WORKSPACE_ID, id)).status, "pending");
    } finally {
      spy.restore();
    }
  });

  await t.test("(a') missing expectedPayloadHash -> 400, no effect", async () => {
    repo.__clearAgentExecutionIntentsForTests();
    const id = await createIntent();
    const spy = installFetchSpy();
    try {
      const res = await approve(id, {});
      assert.equal(res.status, 400);
      assert.equal(spy.calls.length, 0);
      assert.equal((await repo.getAgentExecutionIntent(WORKSPACE_ID, id)).status, "pending");
    } finally {
      spy.restore();
    }
  });

  await t.test("(b) double approve (concurrent) -> exactly one dispatch", async () => {
    repo.__clearAgentExecutionIntentsForTests();
    const id = await createIntent();
    const expectedPayloadHash = await storedHash(WORKSPACE_ID, id);
    const spy = installFetchSpy();
    try {
      const [r1, r2] = await Promise.all([
        approve(id, { expectedPayloadHash }),
        approve(id, { expectedPayloadHash }),
      ]);
      const statuses = [r1.status, r2.status].sort();
      assert.deepEqual(statuses, [200, 409]);
      const loser = r1.status === 409 ? r1 : r2;
      assert.equal(loser.body.reason, "already_decided");
      assert.equal(spy.calls.length, 1);
    } finally {
      spy.restore();
    }
  });

  await t.test("(c) workspace B intent cannot be approved from workspace A", async () => {
    repo.__clearAgentExecutionIntentsForTests();
    const id = await createIntent();
    const original = await repo.getAgentExecutionIntent(WORKSPACE_ID, id);
    const foreign = { ...original, intentId: `${id}-b`, workspaceId: "workspace-b" };
    await repo.createAgentExecutionIntent("workspace-b", "owner-b", foreign);
    const spy = installFetchSpy();
    try {
      const res = await approve(foreign.intentId, {
        expectedPayloadHash: hashOf(foreign.payload),
        workspaceId: "workspace-b",
      });
      assert.equal(res.status, 404);
      assert.equal(spy.calls.length, 0);
      assert.equal(
        (await repo.getAgentExecutionIntent("workspace-b", foreign.intentId)).status,
        "pending",
      );
    } finally {
      spy.restore();
    }
  });

  await t.test("(d) forged approvedBy/workspaceId in body are ignored", async () => {
    repo.__clearAgentExecutionIntentsForTests();
    const id = await createIntent();
    const expectedPayloadHash = await storedHash(WORKSPACE_ID, id);
    const before = listLocalActionLedgerEntries().length;
    const spy = installFetchSpy();
    try {
      const res = await approve(id, {
        expectedPayloadHash,
        approvedBy: "attacker",
        actorId: "attacker",
        workspaceId: "workspace-b",
      });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      const written = listLocalActionLedgerEntries().slice(before);
      assert.ok(written.length > 0);
      for (const entry of written) {
        assert.notEqual(entry.actorId, "attacker");
        assert.notEqual(entry.approverId, "attacker");
        assert.equal(entry.workspaceId, WORKSPACE_ID);
      }
      const attempt = written.find((e) => e.eventType === "action");
      assert.equal(attempt.metadata.payloadHash, expectedPayloadHash);
    } finally {
      spy.restore();
    }
  });

  await t.test("(e) already-decided intent -> 409 already_decided", async () => {
    repo.__clearAgentExecutionIntentsForTests();
    const id = await createIntent();
    const expectedPayloadHash = await storedHash(WORKSPACE_ID, id);
    await repo.transitionAgentExecutionIntent(WORKSPACE_ID, id, {
      toStatus: "failed",
      updatedAt: new Date().toISOString(),
      failureCode: "REJECTED_BY_CEO",
    });
    const spy = installFetchSpy();
    try {
      const res = await approve(id, { expectedPayloadHash });
      assert.equal(res.status, 409);
      assert.equal(res.body.reason, "already_decided");
      assert.equal(spy.calls.length, 0);
    } finally {
      spy.restore();
    }
  });

  await t.test("(f) payload modified after queuing, old hash -> 409 changed", async () => {
    repo.__clearAgentExecutionIntentsForTests();
    const id = await createIntent();
    const oldHash = await storedHash(WORKSPACE_ID, id);
    assert.equal(
      typeof repo.__mutateAgentExecutionIntentPayloadForTests,
      "function",
      "test hook to simulate an out-of-band payload write is missing",
    );
    repo.__mutateAgentExecutionIntentPayloadForTests(WORKSPACE_ID, id, (p) => ({
      ...p,
      data: { amount: 999999 },
    }));
    assert.notEqual(await storedHash(WORKSPACE_ID, id), oldHash);
    const spy = installFetchSpy();
    try {
      const res = await approve(id, { expectedPayloadHash: oldHash });
      assert.equal(res.status, 409);
      assert.equal(res.body.reason, "changed");
      assert.equal(spy.calls.length, 0);
      assert.equal((await repo.getAgentExecutionIntent(WORKSPACE_ID, id)).status, "pending");
    } finally {
      spy.restore();
      repo.__clearAgentExecutionIntentsForTests();
    }
  });
});

test("G2 — payload immutability in application code", async (t) => {
  const { readFile, readdir } = await import("node:fs/promises");
  await t.test("the repository transition never writes payload", async () => {
    const src = await readFile(path.join(__dirname, "execution-intent-repository.ts"), "utf8");
    const fn = src.slice(src.indexOf("export async function transitionAgentExecutionIntent"));
    const body = fn.slice(0, fn.indexOf("\nexport "));
    assert.ok(!/payload\s*[:=]/.test(body.replace(/patch\.|\/\/.*$/gm, "")), "transition must not write payload");
  });
  await t.test("no migration UPDATEs agent_execution_intents payload", async () => {
    const dir = path.join(projectRoot, "db/migrations");
    for (const f of (await readdir(dir)).filter((n) => n.endsWith(".sql"))) {
      const sql = await readFile(path.join(dir, f), "utf8");
      assert.ok(!/update\s+(public\.)?agent_execution_intents[\s\S]{0,200}?set[^;]*payload/i.test(sql), f);
    }
  });
});
