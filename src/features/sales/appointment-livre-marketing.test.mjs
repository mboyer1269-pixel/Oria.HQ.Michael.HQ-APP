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

const bookMod = await jiti.import(
  path.join(projectRoot, "src/features/sales/appointment-book.ts"),
);
const storeMod = await jiti.import(
  path.join(projectRoot, "src/server/sales/appointment-book-store.ts"),
);
const leadStoreMod = await jiti.import(
  path.join(projectRoot, "src/server/sales/lead-bank-store.ts"),
);
const packMod = await jiti.import(
  path.join(projectRoot, "src/features/sales/marketing-content-pack.ts"),
);
const draftMod = await jiti.import(
  path.join(projectRoot, "src/features/sales/follow-up-draft.ts"),
);

const { buildLivre, prepareAppointmentSms, purposeLabelFr } = bookMod;
const { scheduleAppointment, clearAppointmentBookStore, listAppointments } = storeMod;
const { upsertSalesLead, clearLeadBankStore } = leadStoreMod;
const { buildSalesMarketingPack } = packMod;
const { prepareFollowUpDraft } = draftMod;

const WS = "ws_livre_test";
const NOW = "2026-07-16T15:00:00.000Z";

test("livre + marketing adjoint: schedule → SMS → pack", async (t) => {
  clearAppointmentBookStore();
  clearLeadBankStore();

  const leadResult = upsertSalesLead({
    workspaceId: WS,
    nowIso: NOW,
    lead: {
      leadId: "lead_marie_1",
      fullName: "Marie Tremblay",
      phone: "+18195550123",
      source: "marketplace_message",
      interestedStockIds: ["stk_trax_1"],
      interestedModels: ["Trax"],
      stage: "contacted",
      consentBasis: "express",
      notes: "",
      createdByUserId: "rep_1",
    },
  });
  assert.equal(leadResult.ok, true);

  await t.test("schedule appointment advances lead to appointment_set", () => {
    const result = scheduleAppointment({
      workspaceId: WS,
      leadId: "lead_marie_1",
      startsAt: "2026-07-17T18:00:00.000Z",
      purpose: "test_drive",
      vehicleHint: "2025 Chevrolet Trax",
      createdByUserId: "rep_1",
      nowIso: NOW,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.appointment.fullName, "Marie Tremblay");
    assert.equal(result.leadStageUpdated, true);
    assert.equal(purposeLabelFr(result.appointment.purpose), "essai routier");

    const livre = buildLivre(listAppointments(WS), NOW);
    const flat = livre.flatMap((d) => d.appointments);
    assert.equal(flat.length, 1);
    assert.equal(flat[0].leadId, "lead_marie_1");
  });

  await t.test("appointment SMS confirm is prepare-only", () => {
    assert.equal(leadResult.ok, true);
    if (!leadResult.ok) return;
    const appt = listAppointments(WS)[0];
    const sms = prepareAppointmentSms({
      lead: leadResult.lead,
      appointment: appt,
      kind: "confirm",
    });
    assert.equal(sms.ok, true);
    if (!sms.ok) return;
    assert.match(sms.body, /confirmé/i);
    assert.match(sms.body, /Buckingham/);
    assert.equal(sms.to, "+18195550123");
  });

  await t.test("appointment_invite follow-up lane fills livre language", () => {
    assert.equal(leadResult.ok, true);
    if (!leadResult.ok) return;
    const draft = prepareFollowUpDraft({
      lead: leadResult.lead,
      channel: "sms",
      lane: "appointment_invite",
      vehicleHint: "Trax 2025",
      appointmentSlotHint: "ven. 17 juil., 14 h",
      nowIso: NOW,
    });
    assert.equal(draft.ok, true);
    if (!draft.ok) return;
    assert.match(draft.draft.body, /livre/i);
    assert.equal(draft.draft.requiresManualSend, true);
    assert.equal(draft.draft.noExecutionAuthorized, true);
  });

  await t.test("marketing pack is prepare-only and livre-oriented", () => {
    const pack = buildSalesMarketingPack({
      vehicle: {
        stockId: "stk_trax_1",
        year: 2025,
        make: "Chevrolet",
        model: "Trax",
        trim: "LT",
        condition: "new",
        priceCad: 28999,
        photoUrls: ["https://example.com/trax.jpg"],
      },
      workspaceId: WS,
      nowIso: NOW,
      prospectFirstName: "Marie",
    });
    assert.equal(pack.requiresManualPublish, true);
    assert.equal(pack.noExecutionAuthorized, true);
    assert.match(pack.facebookPostFr, /Buckingham/);
    assert.match(pack.marketplaceHookFr, /Trax/);
    assert.match(pack.prospectingSmsFr, /Marie/);
    assert.match(pack.prospectingSmsFr, /livre/i);
    assert.ok(pack.videoScript.scenes.length >= 2);
  });
});

test("7-day content calendar includes livre_fill day", async () => {
  const calMod = await jiti.import(
    path.join(projectRoot, "src/features/sales/sales-content-calendar.ts"),
  );
  const calendar = calMod.buildSalesContentCalendar({
    workspaceId: WS,
    nowIso: NOW,
    vehicles: [
      {
        stockId: "stk_trax_1",
        year: 2025,
        make: "Chevrolet",
        model: "Trax",
        condition: "new",
        priceCad: 28999,
        photoUrls: ["https://example.com/a.jpg", "https://example.com/b.jpg", "https://example.com/c.jpg"],
      },
    ],
    livreTargetSlots: 5,
  });
  assert.equal(calendar.slots.length, 7);
  assert.ok(calendar.slots.some((s) => s.kind === "livre_fill"));
  assert.equal(calendar.requiresManualPublish, true);
  assert.equal(calendar.noExecutionAuthorized, true);
  // Strategic fields present on every slot
  for (const slot of calendar.slots) {
    assert.ok(slot.bestTimeFr.length > 0, `bestTimeFr missing on ${slot.titleFr}`);
    assert.ok(slot.kpiFr.length > 0, `kpiFr missing on ${slot.titleFr}`);
    assert.ok(slot.strategyFr.length > 0, `strategyFr missing on ${slot.titleFr}`);
  }
  assert.ok(calendar.weeklyTargetsFr.length >= 4);
  assert.ok(calendar.weeklyTargetsFr.some((t) => /essais/i.test(t.labelFr)));
});

test("marketing pack includes quick replies, objections, follow-up sequence", async () => {
  const pack = buildSalesMarketingPack({
    vehicle: {
      stockId: "stk_equinox_1",
      year: 2023,
      make: "Chevrolet",
      model: "Equinox",
      condition: "used",
      priceCad: 24999,
      mileageKm: 45000,
      photoUrls: ["https://example.com/eq.jpg"],
    },
    workspaceId: WS,
    nowIso: NOW,
  });
  assert.ok(pack.quickRepliesFr.length >= 4);
  assert.ok(pack.quickRepliesFr.some((q) => /disponible/i.test(q.triggerFr)));
  assert.ok(pack.objectionRepliesFr.length >= 2);
  assert.equal(pack.followUpSequenceFr.length, 4);
  assert.match(pack.followUpSequenceFr[0].whenFr, /J0/);
  assert.match(pack.followUpSequenceFr[3].whenFr, /J5/);
});

test("marketplace listing packet uses 2026 structure (hook/bullets/trust/CTA)", async () => {
  const packetMod = await jiti.import(
    path.join(projectRoot, "src/features/marketplace-listings/listing-packet.ts"),
  );
  const packet = packetMod.prepareListingFromStock({
    packetId: "pkt_1",
    workspaceId: WS,
    nowIso: NOW,
    vehicle: {
      stockId: "stk_terrain_1",
      year: 2022,
      make: "GMC",
      model: "Terrain",
      trim: "SLE",
      condition: "used",
      priceCad: 27999,
      mileageKm: 52000,
      exteriorColor: "Noir",
      photoUrls: ["https://example.com/t1.jpg"],
    },
  });
  const validation = packetMod.validateMarketplaceListingPacket(packet);
  assert.equal(validation.valid, true, validation.errors.join("; "));
  // Hook first line, bullets, trust, CTA
  const lines = packet.description.split("\n");
  assert.match(lines[0], /Terrain/);
  assert.ok(packet.description.includes("• "), "bullets expected");
  assert.match(packet.description, /essai routier/i);
  assert.ok(packet.photoShotListFr.length >= 8);
  assert.match(packet.photoShotListFr[0], /3\/4/);
  assert.ok(packet.marketplaceFieldsFr.length >= 8);
  assert.ok(packet.marketplaceFieldsFr.some((f) => f.field === "NIV"));
  const checklist = packetMod.formatMarketplaceUploadChecklist(packet);
  assert.match(checklist, /ÉTAPE 1/);
  assert.match(checklist, /5 minutes/);
});
