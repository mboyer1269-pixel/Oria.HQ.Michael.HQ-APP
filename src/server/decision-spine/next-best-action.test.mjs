#!/usr/bin/env node

// src/server/decision-spine/next-best-action.test.mjs
//
// Pure-engine tests. The engine imports nothing and does no I/O — every case is
// built from in-memory literal snapshots; no filesystem, network, or store mocks
// are required.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

const NOW = "2026-06-15T12:00:00.000Z";
const LOI96_HREF = "/hq/ventures/loi96";

function target(over = {}) {
  return {
    domain: over.domain ?? "leetwo.com",
    name: over.name ?? "Métal Leetwo inc.",
    tier: over.tier ?? 1,
    status: over.status ?? "to_verify",
    hasEmail: over.hasEmail ?? false,
    sentDate: over.sentDate ?? null,
    replyDate: over.replyDate ?? null,
    outboundActionId: over.outboundActionId ?? null,
  };
}

function snap(over = {}) {
  return {
    now: over.now ?? NOW,
    loi96: {
      present: over.present ?? true,
      weeklyGoalAuditsSent: over.weeklyGoalAuditsSent ?? 15,
      killMetrics: over.killMetrics ?? [],
      targets: over.targets ?? [],
    },
    sendDesk: {
      queuedCount: over.queuedCount ?? 0,
      queuedActionIds: over.queuedActionIds ?? [],
    },
    ledger: { recent: over.ledger ?? [] },
  };
}

test("Decision Spine — next best action engine (pure)", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: { "@": path.join(projectRoot, "src") },
  });
  const mod = await jiti.import(path.join(__dirname, "next-best-action.ts"));
  const { computeNextBestActions, buildDecisionEvent } = mod;

  await t.test("no I/O required — runs on a literal snapshot", () => {
    const result = computeNextBestActions(snap());
    assert.ok(Array.isArray(result.actions));
    assert.equal(result.generatedAt, NOW);
  });

  await t.test("determinism: same snapshot → identical result", () => {
    const input = snap({ targets: [target({ status: "audit_ready", hasEmail: true })] });
    const first = computeNextBestActions(input);
    const second = computeNextBestActions(input);
    assert.deepEqual(first, second);
    assert.equal(first.generatedAt, NOW);
  });

  await t.test("stable priority order: critical before high; highlighted = actions[0]", () => {
    const result = computeNextBestActions(
      snap({
        queuedCount: 1,
        targets: [
          target({ domain: "wavo.me", name: "Wavo", status: "replied" }),
          target({ domain: "leetwo.com", name: "Leetwo", status: "sent", sentDate: "2026-06-10" }),
        ],
      }),
    );
    assert.equal(result.actions.length, 2);
    assert.equal(result.actions[0].ruleId, "reply_awaiting");
    assert.equal(result.actions[0].priority, "critical");
    assert.equal(result.actions[1].ruleId, "relance_due");
    assert.equal(result.actions[1].priority, "high");
    assert.equal(result.highlighted.id, result.actions[0].id);
  });

  await t.test("dedup: same stable id collapses to one action", () => {
    const result = computeNextBestActions(
      snap({
        queuedCount: 1,
        targets: [target({ status: "replied" }), target({ status: "replied" })],
      }),
    );
    assert.equal(result.actions.length, 1);
    assert.equal(result.actions[0].id, "nba:reply_awaiting:leetwo.com");
  });

  await t.test("3-line justification: signal → rule → action + cited source signals", () => {
    const result = computeNextBestActions(
      snap({ targets: [target({ status: "audit_ready", hasEmail: true })] }),
    );
    const action = result.actions[0];
    assert.ok(action.reason.signal.length > 0);
    assert.ok(action.reason.rule.length > 0);
    assert.ok(action.reason.action.length > 0);
    assert.ok(action.reason.sourceSignals.length >= 1);
    for (const signal of action.reason.sourceSignals) {
      assert.ok(typeof signal.id === "string" && signal.id.length > 0);
      assert.ok(typeof signal.kind === "string" && signal.kind.length > 0);
      assert.ok(typeof signal.subject === "string" && signal.subject.length > 0);
      assert.ok(typeof signal.label === "string" && signal.label.length > 0);
    }
  });

  await t.test("reply_awaiting: replied target → critical, CEO-click, loi96 CTA", () => {
    const result = computeNextBestActions(
      snap({ queuedCount: 1, targets: [target({ status: "replied" })] }),
    );
    const action = result.actions.find((a) => a.ruleId === "reply_awaiting");
    assert.ok(action);
    assert.equal(action.priority, "critical");
    assert.equal(action.safety, "requires_ceo_click");
    assert.equal(action.cta.href, LOI96_HREF);
  });

  await t.test("reply_awaiting: a booked call is not a pending reply", () => {
    const result = computeNextBestActions(
      snap({ queuedCount: 1, targets: [target({ status: "call_booked" })] }),
    );
    assert.equal(result.actions.find((a) => a.ruleId === "reply_awaiting"), undefined);
  });

  await t.test("relance_due: fires at J+4, no escalation copy", () => {
    const result = computeNextBestActions(
      snap({ targets: [target({ status: "sent", sentDate: "2026-06-11" })] }),
    );
    const action = result.actions.find((a) => a.ruleId === "relance_due");
    assert.ok(action);
    assert.ok(action.title.includes("J+4"));
    assert.ok(action.reason.rule.includes("J+4"));
    assert.ok(!action.reason.rule.includes("escalade"));
  });

  await t.test("relance_due: escalates at J+9", () => {
    const result = computeNextBestActions(
      snap({ targets: [target({ status: "sent", sentDate: "2026-06-06" })] }),
    );
    const action = result.actions.find((a) => a.ruleId === "relance_due");
    assert.ok(action);
    assert.ok(action.title.includes("J+9"));
    assert.ok(action.reason.rule.includes("escalade à J+9"));
    assert.ok(action.reason.action.includes("#2"));
  });

  await t.test("relance_due: not due before J+4, and never once replied", () => {
    const tooEarly = computeNextBestActions(
      snap({ targets: [target({ status: "sent", sentDate: "2026-06-12" })] }),
    );
    assert.equal(tooEarly.actions.find((a) => a.ruleId === "relance_due"), undefined);

    const alreadyReplied = computeNextBestActions(
      snap({ targets: [target({ status: "sent", sentDate: "2026-06-11", replyDate: "2026-06-13" })] }),
    );
    assert.equal(alreadyReplied.actions.find((a) => a.ruleId === "relance_due"), undefined);
  });

  await t.test("send_desk_empty: empty queue + audit_ready+email → prepare", () => {
    const result = computeNextBestActions(
      snap({ targets: [target({ status: "audit_ready", hasEmail: true })] }),
    );
    const action = result.actions.find((a) => a.ruleId === "send_desk_empty");
    assert.ok(action);
    assert.equal(action.id, "nba:send_desk_empty:global");
    assert.equal(action.priority, "high");
    assert.ok(action.title.includes("Prépare"));
    assert.ok(action.reason.action.includes("Préparer"));
  });

  await t.test("send_desk_empty: lost audit with email → rebuild step (real day-1 case)", () => {
    const result = computeNextBestActions(
      snap({ targets: [target({ status: "audit_to_rebuild", hasEmail: true })] }),
    );
    const action = result.actions.find((a) => a.ruleId === "send_desk_empty");
    assert.ok(action);
    assert.ok(action.title.includes("Régénère"));
  });

  await t.test("send_desk_empty: target without email → find-contact step", () => {
    const result = computeNextBestActions(
      snap({ targets: [target({ status: "to_verify", hasEmail: false })] }),
    );
    const action = result.actions.find((a) => a.ruleId === "send_desk_empty");
    assert.ok(action);
    assert.ok(action.title.includes("Trouve le courriel"));
  });

  await t.test("send_desk_empty: does not fire when the queue is non-empty", () => {
    const result = computeNextBestActions(
      snap({ queuedCount: 1, targets: [target({ status: "audit_ready", hasEmail: true })] }),
    );
    assert.equal(result.actions.find((a) => a.ruleId === "send_desk_empty"), undefined);
  });

  await t.test("kill_metric_watch: under threshold over a full sample → fires + cites metric", () => {
    const sent = Array.from({ length: 40 }, (_, i) =>
      target({ domain: `t${i}.example`, status: "sent" }),
    );
    const result = computeNextBestActions(
      snap({ targets: sent, killMetrics: ["Moins de 2 % de réponse après 40 audits"] }),
    );
    const action = result.actions.find((a) => a.ruleId === "kill_metric_watch");
    assert.ok(action);
    assert.equal(action.id, "nba:kill_metric_watch:reply_rate");
    assert.equal(action.priority, "medium");
    assert.equal(action.safety, "suggestion_only");
    assert.ok(action.reason.rule.includes("Moins de 2 %"));
  });

  await t.test("kill_metric_watch: does not fire below the sample size", () => {
    const sent = Array.from({ length: 39 }, (_, i) =>
      target({ domain: `t${i}.example`, status: "sent" }),
    );
    const result = computeNextBestActions(snap({ targets: sent }));
    assert.equal(result.actions.find((a) => a.ruleId === "kill_metric_watch"), undefined);
  });

  await t.test("zero_state: no signal at all → honest single action", () => {
    const result = computeNextBestActions(snap({ present: false }));
    assert.equal(result.isZeroState, true);
    assert.equal(result.actions.length, 1);
    assert.equal(result.actions[0].ruleId, "zero_state");
    assert.equal(result.actions[0].id, "nba:zero_state:global");
    assert.equal(result.actions[0].cta.href, LOI96_HREF);
  });

  await t.test("zero_state: stays honest about pending Send Desk sends", () => {
    const result = computeNextBestActions(snap({ targets: [], queuedCount: 2 }));
    assert.equal(result.isZeroState, true);
    assert.equal(result.actions[0].id, "nba:zero_state:send_desk");
    assert.equal(result.actions[0].cta.href, "/hq/outbound");
  });

  await t.test("buildDecisionEvent: deterministic provenance, no clock", () => {
    const result = computeNextBestActions(
      snap({
        queuedCount: 1,
        targets: [
          target({ domain: "wavo.me", name: "Wavo", status: "replied" }),
          target({ domain: "leetwo.com", name: "Leetwo", status: "sent", sentDate: "2026-06-10" }),
        ],
      }),
    );
    const event = buildDecisionEvent(result);
    assert.equal(event.id, `decision:${NOW}`);
    assert.equal(event.generatedAt, NOW);
    assert.equal(event.topActionId, result.highlighted.id);
    assert.deepEqual(event.actionIds, result.actions.map((a) => a.id));
    assert.deepEqual(event.ruleIdsFired, ["reply_awaiting", "relance_due"]);
  });
});
