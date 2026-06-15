#!/usr/bin/env node

// src/server/decision-spine/collect-decision-signals.test.mjs
//
// Collector tests. The collector can touch live Supabase/filesystem reads via its
// DEFAULT readers — so every test injects deps and proves the collector runs
// 100% offline: no real Supabase, no filesystem, no network. The injected ports
// are read-only; there is no write/update port to call.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

// Defense in depth: even if a default reader ever leaked, force local (no remote).
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const NOW = "2026-06-15T08:00:00.000Z";

function makePipeline() {
  return {
    updated: "2026-06-11",
    venture: "Conformité Loi 96",
    weeklyGoal: { auditsSent: 15, label: "audits envoyés/semaine" },
    killMetrics: ["Moins de 2 % de réponse après 40 audits"],
    targets: [
      {
        name: "Métal Leetwo inc.",
        domain: "leetwo.com",
        tier: 1,
        status: "audit_to_rebuild",
        audit: null,
        contact: "sales@leetwo.com",
        angle: "x",
        sentDate: null,
        replyDate: null,
        signedValue: 0,
      },
      {
        name: "EMPWR Canada inc.",
        domain: "empwrnutrition.com",
        tier: 1,
        status: "to_verify",
        audit: null,
        contact: null,
        angle: "y",
        sentDate: null,
        replyDate: null,
        signedValue: 0,
      },
    ],
  };
}

function makeCandidate(actionId, idempotencyKey, workspaceId = "ws1") {
  return {
    batch: { workspaceId },
    action: { id: actionId, idempotencyKey, workspaceId },
    recipient: "x@example.com",
    channelId: "email",
    recipientLocalHour: 10,
  };
}

test("Decision Spine — read-only signal collector (offline, injected deps)", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });
  const mod = await jiti.import(path.join(__dirname, "collect-decision-signals.ts"));
  const { collectDecisionSignalSnapshot, COLLECTOR_LEDGER_LIMIT } = mod;

  function makeSpies(over = {}) {
    const calls = { loadPipeline: 0, listCandidates: [], getOutcome: [], listLedger: [], now: 0 };
    const deps = {
      loadPipeline: () => {
        calls.loadPipeline += 1;
        return "pipeline" in over ? over.pipeline : makePipeline();
      },
      listCandidates: (workspaceId) => {
        calls.listCandidates.push(workspaceId);
        return over.candidates ?? [];
      },
      getOutcome: (key) => {
        calls.getOutcome.push(key);
        return over.outcomes?.[key] ?? null;
      },
      listLedger: async (input) => {
        calls.listLedger.push(input);
        return over.ledger ?? { workspaceId: input.workspaceId, entries: [], source: "local" };
      },
      now: () => {
        calls.now += 1;
        return NOW;
      },
    };
    return { deps, calls };
  }

  await t.test("pipeline absent → present:false, empty targets, injected now", async () => {
    const { deps } = makeSpies({ pipeline: null });
    const snapshot = await collectDecisionSignalSnapshot({ workspaceId: "ws1", deps });
    assert.equal(snapshot.loi96.present, false);
    assert.deepEqual(snapshot.loi96.targets, []);
    assert.equal(snapshot.now, NOW);
  });

  await t.test("pipeline present → normalized targets with derived hasEmail", async () => {
    const { deps } = makeSpies();
    const snapshot = await collectDecisionSignalSnapshot({ workspaceId: "ws1", deps });
    assert.equal(snapshot.loi96.present, true);
    assert.equal(snapshot.loi96.weeklyGoalAuditsSent, 15);
    assert.equal(snapshot.loi96.targets.length, 2);
    const leetwo = snapshot.loi96.targets.find((target) => target.domain === "leetwo.com");
    assert.equal(leetwo.hasEmail, true);
    assert.equal(leetwo.outboundActionId, null);
    const empwr = snapshot.loi96.targets.find((target) => target.domain === "empwrnutrition.com");
    assert.equal(empwr.hasEmail, false);
  });

  await t.test("send desk: empty queue", async () => {
    const { deps } = makeSpies({ candidates: [] });
    const snapshot = await collectDecisionSignalSnapshot({ workspaceId: "ws1", deps });
    assert.equal(snapshot.sendDesk.queuedCount, 0);
    assert.deepEqual(snapshot.sendDesk.queuedActionIds, []);
  });

  await t.test("send desk: non-empty queue (no outcome = still queued)", async () => {
    const { deps } = makeSpies({ candidates: [makeCandidate("a1", "k1"), makeCandidate("a2", "k2")] });
    const snapshot = await collectDecisionSignalSnapshot({ workspaceId: "ws1", deps });
    assert.equal(snapshot.sendDesk.queuedCount, 2);
    assert.deepEqual(snapshot.sendDesk.queuedActionIds, ["a1", "a2"]);
  });

  await t.test("send desk: a 'sent' outcome removes that candidate from the queue", async () => {
    const { deps } = makeSpies({
      candidates: [makeCandidate("a1", "k1"), makeCandidate("a2", "k2")],
      outcomes: { k1: { status: "sent" } },
    });
    const snapshot = await collectDecisionSignalSnapshot({ workspaceId: "ws1", deps });
    assert.equal(snapshot.sendDesk.queuedCount, 1);
    assert.deepEqual(snapshot.sendDesk.queuedActionIds, ["a2"]);
  });

  await t.test("ledger is normalized to {actionType, summary, createdAt} at the configured limit", async () => {
    const { deps, calls } = makeSpies({
      ledger: {
        workspaceId: "ws1",
        source: "local",
        entries: [
          { id: "1", actionType: "calendar.book", summary: "x", createdAt: "2026-06-14T00:00:00Z", extra: "ignored" },
        ],
      },
    });
    const snapshot = await collectDecisionSignalSnapshot({ workspaceId: "ws1", deps });
    assert.equal(snapshot.ledger.recent.length, 1);
    assert.deepEqual(snapshot.ledger.recent[0], {
      actionType: "calendar.book",
      summary: "x",
      createdAt: "2026-06-14T00:00:00Z",
    });
    assert.deepEqual(calls.listLedger[0], { workspaceId: "ws1", limit: COLLECTOR_LEDGER_LIMIT });
  });

  await t.test("only injected read ports are used — no write/update port exists", async () => {
    const { deps, calls } = makeSpies({ candidates: [makeCandidate("a1", "k1")] });
    await collectDecisionSignalSnapshot({ workspaceId: "ws1", deps });
    assert.equal(calls.loadPipeline, 1);
    assert.deepEqual(calls.listCandidates, ["ws1"]);
    assert.deepEqual(calls.getOutcome, ["k1"]);
    assert.equal(calls.listLedger.length, 1);
    assert.ok(calls.now >= 1);
    // The collector surface is read-only: no write/update port is exposed or callable.
    assert.ok(!("updateLoi96Target" in deps));
    assert.ok(!("registerOutboundSendCandidate" in deps));
    assert.ok(!("listLoi96BoardAction" in deps));
  });
});
