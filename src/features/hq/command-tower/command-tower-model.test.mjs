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

  // --- Local Runtime Probe v1 mapping (docs/LOCAL_RUNTIME_PROBE_V1.md) ---

  const probedBoard = {
    probedAtIso: "2026-07-02T21:00:00.000Z",
    entries: [
      {
        id: "claude_code_cli",
        label: "Claude Code CLI",
        status: "ready",
        evidence: "claude auth status --json → loggedIn: true · subscriptionType: pro",
        note: "Connecté via le login CLI officiel.",
        probe: { probedAtIso: "2026-07-02T21:00:00.000Z", version: "2.1.199 (Claude Code)" },
      },
      {
        id: "codex_cli",
        label: "Codex CLI",
        status: "ready",
        evidence: "codex login status → Logged in using ChatGPT",
        note: "Connecté via le compte ChatGPT officiel.",
        probe: { probedAtIso: "2026-07-02T21:00:00.000Z", version: "codex-cli 0.137.0" },
      },
      {
        id: "gemini_cli",
        label: "Gemini CLI",
        status: "installed_unverified",
        evidence: "gemini --version → 0.45.2",
        note: "Aucune preuve d'auth non interactive.",
        probe: { probedAtIso: "2026-07-02T21:00:00.000Z", version: "0.45.2" },
      },
      {
        id: "zapier_mcp",
        label: "Zapier MCP",
        status: "future_tool_corridor",
        evidence: "Not probed — tool corridor",
        note: "Corridor d'outils futur.",
      },
    ],
  };

  await t.test("probe-backed board maps honestly: evidence-backed ready survives", () => {
    const model = buildCommandTowerModel({ ...readyInputs, runtimeBoard: probedBoard });
    assert.equal(model.runtimeStatus.gate, "probe_v1");
    assert.equal(model.runtimeStatus.probedAtIso, probedBoard.probedAtIso);
    const byId = Object.fromEntries(model.runtimeStatus.entries.map((e) => [e.id, e]));
    assert.equal(byId.claude_code_cli.status, "ready");
    assert.equal(byId.codex_cli.status, "ready");
    assert.equal(byId.gemini_cli.status, "installed_unverified");
    assert.equal(byId.zapier_mcp.status, "future_tool_corridor");
  });

  await t.test("ready without probe proof is downgraded, never trusted", () => {
    const dishonest = {
      probedAtIso: "2026-07-02T21:00:00.000Z",
      entries: [
        {
          id: "claude_code_cli",
          label: "Claude Code CLI",
          status: "ready",
          evidence: "",
          note: "prétendu ready sans preuve",
          probe: null,
        },
        {
          id: "gemini_cli",
          label: "Gemini CLI",
          status: "installed_unverified",
          evidence: "gemini --version → 0.45.2",
          note: "sans champ probe",
        },
      ],
    };
    const model = buildCommandTowerModel({ ...readyInputs, runtimeBoard: dishonest });
    const byId = Object.fromEntries(model.runtimeStatus.entries.map((e) => [e.id, e]));
    assert.equal(byId.claude_code_cli.status, "unavailable");
    assert.match(byId.claude_code_cli.note, /déclassé/);
    assert.equal(byId.gemini_cli.status, "unavailable");
  });

  await t.test("absent probe board = honest fallback, no ready anywhere", () => {
    const model = buildCommandTowerModel(readyInputs);
    assert.equal(model.runtimeStatus.gate, "probe_unavailable");
    assert.equal(model.runtimeStatus.probedAtIso, null);
    for (const entry of model.runtimeStatus.entries) {
      assert.notEqual(entry.status, "ready");
      assert.notEqual(entry.status, "installed_unverified");
    }
  });

  await t.test("probe alone never enables dispatch: corridors unchanged by a ready board", () => {
    const withProbe = buildCommandTowerModel({ ...readyInputs, runtimeBoard: probedBoard });
    const withoutProbe = buildCommandTowerModel(readyInputs);
    assert.deepEqual(withProbe.dispatchBoard, withoutProbe.dispatchBoard);
    const actionable = withProbe.dispatchBoard.corridors.filter((c) => c.action !== null);
    assert.equal(actionable.length, 1);
    assert.equal(actionable[0].id, "n8n_execution_rail");
    for (const corridor of withProbe.dispatchBoard.corridors) {
      assert.equal(corridor.requiresApproval, true, `${corridor.id} keeps requiresApproval`);
    }
  });
});
