#!/usr/bin/env node

// src/server/ventures/hermes-prep-tick.test.mjs

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

// Force the local-fallback path for the repository integration test.
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

test("Hermes prep tick (server orchestration)", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const tickMod = await jiti.import(path.join(__dirname, "hermes-prep-tick.ts"));
  const repoMod = await jiti.import(path.join(__dirname, "prepared-action-repository.ts"));
  const featureDir = path.join(projectRoot, "src/features/ventures");
  const cashMod = await jiti.import(path.join(featureDir, "cash-action-packet.ts"));

  const { runHermesPrepTick } = tickMod;
  const {
    listPreparedActionsForWorkspace,
    __clearPreparedActionsForTests,
  } = repoMod;
  const { buildCashActionPacket } = cashMod;

  const USER = "11111111-1111-1111-1111-111111111111";
  const AT = "2026-06-02T00:00:00.000Z";

  function makePacket(overrides = {}) {
    return buildCashActionPacket({
      packetId: overrides.packetId ?? "packet-001",
      ventureId: overrides.ventureId ?? "venture-001",
      agentId: "agent-001",
      targetBuyer: "Heads of RevOps at 20-100 person B2B SaaS companies",
      buyerType: "smb",
      painHypothesis: "They reconcile pipeline by hand every Friday and lose 3 hours to it.",
      offer: overrides.offer ?? "A done-for-you weekly pipeline reconciliation, delivered every Friday.",
      pricePointCents: 49_000,
      callToAction: "Reply 'pilot' to start a paid 2-week pilot this Friday.",
      outreachDraft: overrides.outreachDraft ?? "Hi {name}, saw your team reconciles pipeline manually — want a Friday report?",
      expectedCashSignal: "email_reply",
      requiredEvidence: ["email_reply"],
      expectedCashImpactCents: 49_000,
      expectedCostCents: 7_000,
      createdAt: AT,
    });
  }

  // An in-memory enqueue/list pair so the orchestration is tested without any DB.
  function makeMemoryStore(seed = []) {
    const store = [...seed];
    return {
      store,
      listExisting: async () => store.slice(),
      enqueue: async (_ws, _uid, action) => {
        store.unshift(action); // most-recent first
        return action;
      },
    };
  }

  const stubCouncil = () => ({
    readiness: "ready_for_ceo",
    verdictDecision: "needs_ceo_decision",
    recommendedManualAction: "CEO manually adapts and sends the outreach draft.",
  });

  t.beforeEach(() => __clearPreparedActionsForTests());
  t.afterEach(() => __clearPreparedActionsForTests());

  // -------------------------------------------------------------------------
  // Injected-deps path (no DB, no real composer)
  // -------------------------------------------------------------------------
  await t.test("enqueues new candidates via injected deps", async () => {
    const mem = makeMemoryStore();
    const result = await runHermesPrepTick(
      { workspaceId: "ws1", userId: USER, packets: [makePacket()] },
      { composeCouncil: stubCouncil, listExisting: mem.listExisting, enqueue: mem.enqueue, snapshotScores: async () => 0, now: () => AT },
    );
    assert.equal(result.plan.summary.created, 1);
    assert.equal(result.enqueued.length, 1);
    assert.equal(mem.store.length, 1);
    assert.equal(result.enqueued[0].status, "ready_for_ceo_review");
    assert.equal(result.enqueued[0].noExecutionAuthorized, true);
  });

  await t.test("calls snapshotScores and reports snapshotsWritten", async () => {
    const mem = makeMemoryStore();
    let calledWith = null;
    const result = await runHermesPrepTick(
      { workspaceId: "ws1", userId: USER, packets: [makePacket()] },
      {
        composeCouncil: stubCouncil,
        listExisting: mem.listExisting,
        enqueue: mem.enqueue,
        now: () => AT,
        snapshotScores: async (ws, uid) => { calledWith = { ws, uid }; return 3; },
      },
    );
    assert.deepEqual(calledWith, { ws: "ws1", uid: USER });
    assert.equal(result.snapshotsWritten, 3);
  });

  await t.test("snapshotScores failure is best-effort (never breaks the tick)", async () => {
    const mem = makeMemoryStore();
    const result = await runHermesPrepTick(
      { workspaceId: "ws1", userId: USER, packets: [makePacket()] },
      {
        composeCouncil: stubCouncil,
        listExisting: mem.listExisting,
        enqueue: mem.enqueue,
        now: () => AT,
        snapshotScores: async () => { throw new Error("snapshot store down"); },
      },
    );
    assert.equal(result.enqueued.length, 1, "prep still succeeds");
    assert.equal(result.snapshotsWritten, 0, "failure reported as 0");
  });

  await t.test("dedups against the existing queue on a second tick", async () => {
    const mem = makeMemoryStore();
    const input = { workspaceId: "ws1", userId: USER, packets: [makePacket()] };
    const deps = { composeCouncil: stubCouncil, listExisting: mem.listExisting, enqueue: mem.enqueue, now: () => AT };

    await runHermesPrepTick(input, deps);
    const second = await runHermesPrepTick(input, deps);

    assert.equal(second.plan.summary.deduped, 1);
    assert.equal(second.plan.summary.created, 0);
    assert.equal(mem.store.length, 1, "no duplicate persisted");
  });

  await t.test("composes a council summary per packet (default composer wiring)", async () => {
    // No composeCouncil override: exercises the real venture council composer
    // (pure TypeScript, no LLM). Uses an in-memory store, so still no DB.
    const mem = makeMemoryStore();
    const result = await runHermesPrepTick(
      { workspaceId: "ws1", userId: USER, packets: [makePacket()] },
      { listExisting: mem.listExisting, enqueue: mem.enqueue, now: () => AT },
    );
    assert.equal(result.enqueued.length, 1);
    const summary = result.enqueued[0].council;
    assert.ok(typeof summary.readiness === "string" && summary.readiness.length > 0);
    assert.ok(typeof summary.recommendedManualAction === "string" && summary.recommendedManualAction.length > 0);
  });

  // -------------------------------------------------------------------------
  // Repository path (local in-memory fallback — no real DB, no applied 0013)
  // -------------------------------------------------------------------------
  await t.test("persists through the repository local fallback (no DB, no migration)", async () => {
    const result = await runHermesPrepTick(
      { workspaceId: "ws-repo", userId: USER, packets: [makePacket(), makePacket({ packetId: "packet-002", offer: "A second, distinct cash move offer." })] },
      { composeCouncil: stubCouncil, now: () => AT },
    );
    assert.equal(result.plan.summary.created, 2);

    const persisted = await listPreparedActionsForWorkspace("ws-repo");
    assert.equal(persisted.length, 2);
    assert.ok(persisted.every((a) => a.requiresCeoApproval === true && a.noExecutionAuthorized === true));
  });
});
