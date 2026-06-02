#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("Cash action review projection", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mod = await jiti.import(path.join(__dirname, "cash-action-review-projection.ts"));
  const {
    REVIEWABLE_PREPARED_STATUSES,
    selectReviewablePreparedActions,
    toHermesPlanDisplay,
  } = mod;

  const cashMod = await jiti.import(path.join(__dirname, "cash-action-packet.ts"));
  const { buildCashActionPacket } = cashMod;
  const hermesMod = await jiti.import(path.join(__dirname, "hermes-outreach-plan.ts"));
  const { buildHermesOutreachPlanFromCashActionPacket } = hermesMod;
  const paMod = await jiti.import(path.join(__dirname, "prepared-action.ts"));
  const { buildPreparedAction } = paMod;

  function makePacket(packetId = "packet-001") {
    return buildCashActionPacket({
      packetId,
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
  }

  function makeAction(status, packetId = "packet-001") {
    const packet = makePacket(packetId);
    return buildPreparedAction({
      preparedActionId: `${packetId}_prepared`,
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
      status,
      createdAt: "2026-06-02T00:00:00.000Z",
    });
  }

  // -------------------------------------------------------------------------
  // selectReviewablePreparedActions
  // -------------------------------------------------------------------------
  await t.test("selects only reviewable statuses", () => {
    assert.deepEqual([...REVIEWABLE_PREPARED_STATUSES].sort(), ["prepared", "ready_for_ceo_review"]);

    const actions = [
      makeAction("ready_for_ceo_review", "p1"),
      makeAction("prepared", "p2"),
      makeAction("approved_for_manual_send", "p3"),
      makeAction("rejected", "p4"),
      makeAction("superseded", "p5"),
    ];
    const reviewable = selectReviewablePreparedActions(actions);
    assert.deepEqual(reviewable.map((a) => a.cashActionPacketId), ["p1", "p2"]);
  });

  await t.test("preserves input order", () => {
    const actions = [makeAction("prepared", "p2"), makeAction("ready_for_ceo_review", "p1")];
    assert.deepEqual(
      selectReviewablePreparedActions(actions).map((a) => a.cashActionPacketId),
      ["p2", "p1"],
    );
  });

  await t.test("empty in, empty out", () => {
    assert.deepEqual(selectReviewablePreparedActions([]), []);
  });

  // -------------------------------------------------------------------------
  // toHermesPlanDisplay
  // -------------------------------------------------------------------------
  await t.test("projects a stored plan to the display shape", () => {
    const packet = makePacket();
    const plan = buildHermesOutreachPlanFromCashActionPacket(packet);
    const display = toHermesPlanDisplay(packet.packetId, plan);

    assert.equal(display.packetId, "packet-001");
    assert.equal(display.channel, plan.channel);
    assert.equal(display.messageDraft, plan.messageDraft);
    assert.equal(display.cta, plan.cta);
    assert.equal(display.requiresCeoApproval, true);
    assert.equal(display.requiresManualSend, true);
    assert.equal(display.noExecutionAuthorized, true);
    assert.deepEqual(display.requiredEvidence, [...plan.requiredEvidence]);
  });

  await t.test("copies requiredEvidence (no shared reference)", () => {
    const packet = makePacket();
    const plan = buildHermesOutreachPlanFromCashActionPacket(packet);
    const display = toHermesPlanDisplay(packet.packetId, plan);
    display.requiredEvidence.push("stripe_charge");
    assert.equal(plan.requiredEvidence.includes("stripe_charge"), false);
  });

  // -------------------------------------------------------------------------
  // Purity
  // -------------------------------------------------------------------------
  await t.test("imports no DB/server/runtime modules", () => {
    const sourceText = readFileSync(path.join(__dirname, "cash-action-review-projection.ts"), "utf-8");
    const imports = Array.from(sourceText.matchAll(/import[\s\S]*?;/g)).map((m) => m[0]).join("\n");
    assert.ok(!/supabase/i.test(imports), "must not import Supabase");
    assert.ok(!/runtime/i.test(imports), "must not import runtime modules");
    assert.ok(!/@\/server|src\/server|\.\.\/server/.test(imports), "must not import server modules");
    assert.ok(!/resend|nodemailer|smtp|gmail/i.test(imports), "must not import email modules");
  });
});
