#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
  },
});

const leadMod = await jiti.import(path.join(__dirname, "sales-lead.ts"));
const draftMod = await jiti.import(path.join(__dirname, "follow-up-draft.ts"));
const {
  validateSalesLead,
  scoreSalesLead,
  buildMorningQueue,
} = leadMod;
const { prepareFollowUpDraft } = draftMod;

const NOW = "2026-07-11T12:00:00.000Z";

function sampleLead(overrides = {}) {
  return {
    leadId: "lead_1",
    fullName: "Alex Tremblay",
    phone: "+18195550123",
    source: "phone_in",
    interestedStockIds: ["stk_trax_1"],
    interestedModels: ["Trax LT"],
    stage: "new",
    consentBasis: "express",
    nextFollowUpAt: "2026-07-11T10:00:00.000Z",
    notes: "Hot — wants Trax",
    createdAt: NOW,
    updatedAt: NOW,
    createdByUserId: "user_1",
    ...overrides,
  };
}

test("sales lead bank scoring + drafts", async (t) => {
  await t.test("validates lead and requires soldStockId / lostReason", () => {
    assert.equal(validateSalesLead(sampleLead()).valid, true);
    assert.equal(validateSalesLead(sampleLead({ stage: "sold" })).valid, false);
    assert.equal(
      validateSalesLead(sampleLead({ stage: "sold", soldStockId: "stk_trax_1" })).valid,
      true,
    );
    assert.equal(validateSalesLead(sampleLead({ stage: "lost" })).valid, false);
    assert.equal(
      validateSalesLead(sampleLead({ stage: "lost", lostReason: "bought elsewhere" })).valid,
      true,
    );
  });

  await t.test("scores marketplace inbound higher and orders morning queue", () => {
    const hot = sampleLead({
      leadId: "lead_mkt",
      source: "marketplace_message",
      nextFollowUpAt: "2026-07-11T09:00:00.000Z",
    });
    const warm = sampleLead({
      leadId: "lead_web",
      source: "web_form",
      interestedStockIds: [],
      consentBasis: "unknown",
      nextFollowUpAt: "2026-07-12T12:00:00.000Z",
    });
    assert.ok(scoreSalesLead(hot, NOW) > scoreSalesLead(warm, NOW));
    const queue = buildMorningQueue([warm, hot], NOW);
    assert.equal(queue[0].lead.leadId, "lead_mkt");
    assert.equal(queue[0].due, true);
    assert.equal(queue[0].livreHint, "needs_slot");
  });

  await t.test("livre context boosts today's appointments to the front", () => {
    const withAppt = sampleLead({
      leadId: "lead_appt",
      source: "web_form",
      nextFollowUpAt: "2026-07-12T12:00:00.000Z",
      stage: "appointment_set",
    });
    const needsSlot = sampleLead({
      leadId: "lead_gap",
      source: "marketplace_message",
      nextFollowUpAt: "2026-07-11T09:00:00.000Z",
    });
    const livreByLeadId = new Map([
      ["lead_appt", { hasAppointmentToday: true, hasUpcomingAppointment: true }],
      ["lead_gap", { hasAppointmentToday: false, hasUpcomingAppointment: false }],
    ]);
    const queue = buildMorningQueue([needsSlot, withAppt], NOW, { livreByLeadId });
    assert.equal(queue[0].lead.leadId, "lead_appt");
    assert.equal(queue[0].livreHint, "today_appt");
    assert.equal(queue[1].livreHint, "needs_slot");
  });

  await t.test("prepare follow-up draft is manual-send only", () => {
    const result = prepareFollowUpDraft({
      lead: sampleLead(),
      channel: "sms",
      lane: "follow_up",
      vehicleHint: "2025 Chevrolet Trax LT",
      nowIso: NOW,
    });
    assert.equal(result.ok, true);
    assert.equal(result.draft.requiresManualSend, true);
    assert.equal(result.draft.noExecutionAuthorized, true);
    assert.match(result.draft.body, /Trax/);
  });

  await t.test("blocks unknown consent and sold stage", () => {
    const unknown = prepareFollowUpDraft({
      lead: sampleLead({ consentBasis: "unknown" }),
      channel: "sms",
      nowIso: NOW,
    });
    assert.equal(unknown.ok, false);
    const sold = prepareFollowUpDraft({
      lead: sampleLead({ stage: "sold", soldStockId: "stk_1" }),
      channel: "sms",
      nowIso: NOW,
    });
    assert.equal(sold.ok, false);
  });
});
