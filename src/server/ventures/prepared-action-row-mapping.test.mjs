#!/usr/bin/env node

// src/server/ventures/prepared-action-row-mapping.test.mjs

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("Prepared action row mapping", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mapMod = await jiti.import(path.join(__dirname, "prepared-action-row-mapping.ts"));
  const featureDir = path.join(projectRoot, "src/features/ventures");
  const paMod = await jiti.import(path.join(featureDir, "prepared-action.ts"));
  const cashMod = await jiti.import(path.join(featureDir, "cash-action-packet.ts"));
  const hermesMod = await jiti.import(path.join(featureDir, "hermes-outreach-plan.ts"));

  const { mapPreparedActionToInsert, mapRowToPreparedAction, PreparedActionMappingError } = mapMod;
  const { buildPreparedAction, validatePreparedAction } = paMod;
  const { buildCashActionPacket } = cashMod;
  const { buildHermesOutreachPlanFromCashActionPacket } = hermesMod;

  const USER = "11111111-1111-1111-1111-111111111111";

  function makeAction(overrides = {}) {
    const packet = buildCashActionPacket({
      packetId: "packet-001",
      ventureId: "venture-001",
      agentId: "agent-001",
      targetBuyer: "Heads of RevOps at 20-100 person B2B SaaS companies",
      buyerType: "smb",
      painHypothesis: "They reconcile pipeline by hand every Friday and lose 3 hours to it.",
      offer: "A done-for-you weekly pipeline reconciliation, delivered every Friday.",
      pricePointCents: 49_000,
      callToAction: "Reply 'pilot' to start a paid 2-week pilot this Friday.",
      outreachDraft: "Hi {name}, saw your team reconciles pipeline manually — want a Friday report?",
      expectedCashSignal: "email_reply",
      requiredEvidence: ["email_reply"],
      expectedCashImpactCents: 49_000,
      expectedCostCents: 7_000,
      createdAt: "2026-06-02T00:00:00.000Z",
    });
    return buildPreparedAction({
      preparedActionId: "packet-001_prepared",
      ventureId: packet.ventureId,
      cashActionPacketId: packet.packetId,
      packet,
      council: {
        readiness: "ready_for_ceo",
        verdictDecision: "needs_ceo_decision",
        recommendedManualAction: "CEO manually adapts and sends the outreach draft.",
      },
      hermesPlan: buildHermesOutreachPlanFromCashActionPacket(packet),
      priority: "high",
      priorityScore: 42,
      status: "ready_for_ceo_review",
      createdAt: "2026-06-02T00:00:00.000Z",
      ...overrides,
    });
  }

  await t.test("maps an action to a snake_case insert", () => {
    const insert = mapPreparedActionToInsert("ws1", USER, makeAction());
    assert.equal(insert.workspace_id, "ws1");
    assert.equal(insert.created_by_user_id, USER);
    assert.equal(insert.prepared_action_id, "packet-001_prepared");
    assert.equal(insert.cash_action_packet_id, "packet-001");
    assert.equal(insert.priority, "high");
    assert.equal(insert.status, "ready_for_ceo_review");
    assert.equal(insert.requires_ceo_approval, true);
    assert.equal(insert.requires_manual_send, true);
    assert.equal(insert.no_execution_authorized, true);
    assert.equal(insert.supersedes_id, null);
    assert.equal(insert.id, undefined, "DB assigns the id");
  });

  await t.test("round-trips action -> insert(row) -> action", () => {
    const action = makeAction({ supersedesId: "packet-001_prepared_old" });
    const insert = mapPreparedActionToInsert("ws1", USER, action);
    // Simulate the DB assigning id + created_at.
    const row = { ...insert, id: "row-uuid-1", created_at: action.createdAt };
    const back = mapRowToPreparedAction(row);
    assert.equal(validatePreparedAction(back).valid, true);
    assert.equal(back.preparedActionId, action.preparedActionId);
    assert.equal(back.supersedesId, "packet-001_prepared_old");
    assert.equal(back.packet.packetId, "packet-001");
    assert.equal(back.contentHash, action.contentHash);
  });

  await t.test("round-trips durable council run fields through the jsonb council column (P4b)", () => {
    const action = makeAction({
      council: {
        readiness: "ready_for_ceo",
        verdictDecision: "needs_ceo_decision",
        recommendedManualAction: "CEO manually adapts and sends the outreach draft.",
        runId: "prep:packet-001",
        runStatus: "ready_for_ceo",
        turnCount: 5,
      },
    });
    const insert = mapPreparedActionToInsert("ws1", USER, action);
    const row = { ...insert, id: "row-uuid-2", created_at: action.createdAt };
    const back = mapRowToPreparedAction(row);
    assert.equal(validatePreparedAction(back).valid, true);
    assert.equal(back.council.runId, "prep:packet-001");
    assert.equal(back.council.runStatus, "ready_for_ceo");
    assert.equal(back.council.turnCount, 5);
  });

  await t.test("rejects a forged insert that authorizes execution", () => {
    const forged = { ...makeAction(), noExecutionAuthorized: false };
    assert.throws(
      () => mapPreparedActionToInsert("ws1", USER, forged),
      (err) => err instanceof PreparedActionMappingError && /no_execution_authorized/i.test(err.message),
    );
  });

  await t.test("rejects a row with an unknown status", () => {
    const insert = mapPreparedActionToInsert("ws1", USER, makeAction());
    const row = { ...insert, id: "r", created_at: "2026-06-02T00:00:00.000Z", status: "sent" };
    assert.throws(
      () => mapRowToPreparedAction(row),
      (err) => err instanceof PreparedActionMappingError && /status/i.test(err.message),
    );
  });

  await t.test("rejects a row with a non-object packet", () => {
    const insert = mapPreparedActionToInsert("ws1", USER, makeAction());
    const row = { ...insert, id: "r", created_at: "2026-06-02T00:00:00.000Z", packet: "nope" };
    assert.throws(
      () => mapRowToPreparedAction(row),
      (err) => err instanceof PreparedActionMappingError && /packet/i.test(err.message),
    );
  });

  await t.test("omits supersedesId when the column is null", () => {
    const insert = mapPreparedActionToInsert("ws1", USER, makeAction());
    const row = { ...insert, id: "r", created_at: "2026-06-02T00:00:00.000Z", supersedes_id: null };
    const back = mapRowToPreparedAction(row);
    assert.equal("supersedesId" in back, false);
  });
});
