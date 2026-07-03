#!/usr/bin/env node

// Command Tower v1 model contract — see docs/COMMAND_TOWER_V1.md.
//
// Pins the tower's HONESTY rules: no runtime claims readiness without probe
// evidence, every dispatch corridor requires approval, cards cap at 3
// intents, and a failed source renders "unavailable" instead of a fake zero.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..", "..");

test("Command Tower v1 model contract", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mod = await jiti.import(path.join(__dirname, "command-tower-model.ts"));
  const {
    RUNTIME_STATUS_BOARD,
    DISPATCH_CORRIDORS,
    PARKING_LOT,
    MAX_QUEUE_ITEMS,
    MAX_EVIDENCE_ITEMS,
    buildCommandTowerModel,
  } = mod;

  const intent = (n) => ({
    intentId: `intent-${n}`,
    agentId: "hermes",
    skillId: "hermes.task",
    toolName: "n8n_webhook_trigger",
    autonomyLevel: 2,
    createdAt: `2026-07-02T10:0${n}:00.000Z`,
  });

  const evidenceItem = (n) => ({
    id: `ledger-${n}`,
    summary: `Entry ${n}`,
    eventType: "action",
    agentId: "hermes",
    createdAt: `2026-07-02T09:0${n}:00.000Z`,
  });

  const readyInputs = {
    pendingIntents: [intent(1), intent(2)],
    nextAction: {
      highlighted: {
        id: "nba:reply_awaiting:x",
        title: "Répondre au prospect",
        summary: "Une réponse attend depuis 2 jours.",
        priority: "high",
        safety: "requires_ceo_click",
        ctaLabel: "Ouvrir",
        ctaHref: "/hq/ventures",
      },
      isZeroState: false,
      totalActions: 2,
    },
    evidence: { items: [evidenceItem(1), evidenceItem(2)], source: "local" },
  };

  await t.test("no runtime claims readiness without probe evidence", () => {
    assert.equal(RUNTIME_STATUS_BOARD.length, 4);
    for (const entry of RUNTIME_STATUS_BOARD) {
      assert.notEqual(entry.status, "ready", `${entry.id} must not claim ready without a probe`);
      assert.ok(entry.evidence.length > 0, `${entry.id} must cite evidence`);
    }
    const ids = RUNTIME_STATUS_BOARD.map((e) => e.id).sort();
    assert.deepEqual(ids, ["claude_code_cli", "codex_cli", "gemini_cli", "zapier_mcp"]);
  });

  await t.test("every dispatch corridor requires approval; only n8n acts today", () => {
    for (const corridor of DISPATCH_CORRIDORS) {
      assert.equal(corridor.requiresApproval, true, `${corridor.id} must require approval`);
    }
    const actionable = DISPATCH_CORRIDORS.filter((c) => c.action !== null);
    assert.equal(actionable.length, 1);
    assert.equal(actionable[0].id, "n8n_execution_rail");
    assert.equal(actionable[0].mode, "governed_live");
    // The button prepares an intent — it must say so, not pretend to execute.
    assert.match(actionable[0].action.label, /requires approval/);
  });

  await t.test("decision queue caps at MAX_QUEUE_ITEMS with an overflow count", () => {
    const five = [intent(1), intent(2), intent(3), intent(4), intent(5)];
    const model = buildCommandTowerModel({ ...readyInputs, pendingIntents: five });
    assert.equal(model.decisionQueue.state, "ready");
    assert.equal(model.decisionQueue.items.length, MAX_QUEUE_ITEMS);
    assert.equal(model.decisionQueue.overflowCount, 5 - MAX_QUEUE_ITEMS);
    assert.equal(model.approvalRail.pendingCount, 5);
    assert.equal(model.missionBrief.pendingDecisionCount, 5);
  });

  await t.test("evidence feed caps at MAX_EVIDENCE_ITEMS and keeps its source", () => {
    const many = Array.from({ length: 8 }, (_, i) => evidenceItem(i));
    const model = buildCommandTowerModel({
      ...readyInputs,
      evidence: { items: many, source: "supabase" },
    });
    assert.equal(model.evidenceFeed.items.length, MAX_EVIDENCE_ITEMS);
    assert.equal(model.evidenceFeed.source, "supabase");
    assert.equal(model.evidenceFeed.state, "ready");
  });

  await t.test("empty is a state, not an error", () => {
    const model = buildCommandTowerModel({
      pendingIntents: [],
      nextAction: { highlighted: null, isZeroState: true, totalActions: 1 },
      evidence: { items: [], source: "local" },
    });
    assert.equal(model.decisionQueue.state, "empty");
    assert.equal(model.evidenceFeed.state, "empty");
    assert.equal(model.approvalRail.state, "empty");
    assert.equal(model.missionBrief.state, "ready");
    assert.match(model.missionBrief.headline, /aucune décision en attente/);
    assert.match(model.missionBrief.headline, /état zéro honnête/);
  });

  await t.test("a failed source renders unavailable, never a fake zero", () => {
    const model = buildCommandTowerModel({
      pendingIntents: null,
      nextAction: null,
      evidence: null,
    });
    assert.equal(model.decisionQueue.state, "unavailable");
    assert.equal(model.evidenceFeed.state, "unavailable");
    assert.equal(model.approvalRail.state, "unavailable");
    assert.equal(model.missionBrief.state, "unavailable");
    assert.equal(model.missionBrief.pendingDecisionCount, null);
    assert.equal(model.evidenceFeed.source, null);
    assert.match(model.missionBrief.headline, /indisponible/);
  });

  await t.test("the model is deterministic", () => {
    assert.deepEqual(
      buildCommandTowerModel(readyInputs),
      buildCommandTowerModel(readyInputs),
    );
  });

  await t.test("the parking lot cites evidence for every parked item", () => {
    assert.ok(PARKING_LOT.length >= 1);
    for (const item of PARKING_LOT) {
      assert.ok(item.reason.length > 0);
      assert.match(item.evidence, /PR #\d+/);
    }
  });
});
