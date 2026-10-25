import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { readFileSync } from "node:fs";
import { createJiti } from "jiti";

const root = path.resolve(import.meta.dirname, "../..");
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(root, "src") }, moduleCache: false });
const load = (file) => jiti.import(path.join(root, "src", file));
const source = (file) => readFileSync(path.join(root, "src", file), "utf8");

// G2: test both sides of the opt-in, including dormant seed exports.
test("empty stores expose no seed numbers unless demo mode is explicitly enabled", async () => {
  const previous = process.env.NEXT_PUBLIC_ORIA_DEMO_MODE;
  try {
    for (const value of [undefined, "0", "true", "1"]) {
      if (value === undefined) delete process.env.NEXT_PUBLIC_ORIA_DEMO_MODE;
      else process.env.NEXT_PUBLIC_ORIA_DEMO_MODE = value;
      const enabled = value === "1";
      const { isDemoMode } = await load("lib/demo-mode.ts");
      assert.equal(isDemoMode(), enabled);
      const memory = await load("features/memory/seed.ts");
      const { mockMissions } = await load("features/missions/seed.ts");
      for (const rows of [memory.agentLeaderboard, memory.recentDailyLogs, memory.memorySubjects, memory.ventureProgress, mockMissions]) {
        assert.equal(rows.length > 0, enabled);
        assert.ok(rows.every((row) => row.provenance === "simulated"));
        assert.ok(rows.every((row) => JSON.stringify(row).includes("Démo")));
      }
      assert.equal(memory.moneyboard !== null, enabled);
      if (enabled) assert.equal(memory.moneyboard.provenance, "simulated");
      const { selectWorkflowsModel } = await load("features/workflows/workflows-page-data.ts");
      const model = selectWorkflowsModel([], new Map());
      assert.equal(model.isDemonstration, enabled);
      assert.equal(model.provenance, enabled ? "simulated" : "ledger");
      assert.equal(model.board.totals.runs > 0, enabled);
      assert.match(model.note, enabled ? /démo|démonstration/i : /Aucune donnée/);
    }
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_ORIA_DEMO_MODE;
    else process.env.NEXT_PUBLIC_ORIA_DEMO_MODE = previous;
  }
  assert.match(source("features/ventures/components/venture-command-center-client.tsx"), /showDemo = isDemoMode\(\)/);
});

// G3: bypassing validation must still fail at each preparation / outbound boundary.
test("unknown consent and undocumented implied consent block all outbound paths", async () => {
  const { validateSalesLead } = await load("features/sales/sales-lead.ts");
  const { prepareFollowUpDraft } = await load("features/sales/follow-up-draft.ts");
  const { prepareAppointmentSms } = await load("features/sales/appointment-book.ts");
  const { buildApprovedSendCandidate } = await load("server/outbound/outbound-queue-intake.ts");
  const { canExecuteOutboundAction } = await load("server/outbound/outbound-policy-engine.ts");
  const { validateActionForChannel, EMAIL_CHANNEL, SMS_CHANNEL } = await load("server/outbound/outbound-channel.ts");
  const now = "2026-10-25T12:00:00Z";
  const leadBase = { leadId: "l1", fullName: "Test", phone: "+18195550123", source: "phone_in", interestedStockIds: [], interestedModels: [], stage: "new", notes: "", createdAt: now, updatedAt: now, createdByUserId: "u1" };
  for (const consentBasis of ["unknown", "implied_verified"]) {
    const lead = { ...leadBase, consentBasis };
    if (consentBasis === "implied_verified") assert.equal(validateSalesLead(lead).valid, false);
    assert.equal(prepareFollowUpDraft({ lead, channel: "sms", nowIso: now }).ok, false);
    assert.equal(prepareAppointmentSms({ lead, appointment: { phone: lead.phone }, kind: "invite" }).ok, false);
    assert.equal(buildApprovedSendCandidate({ consentBasis }).ok, false);
    for (const jurisdiction of ["CA", "US", "unknown"]) {
      const batch = { consentBasis, consentProvenance: [], jurisdiction, approvalToken: "even-with-approval", audienceType: "internal_test", unsubscribeMechanism: "present" };
      assert.equal(canExecuteOutboundAction({ batch, suppressionEntries: [] }).decision, "BLOCK");
      for (const channel of [EMAIL_CHANNEL, SMS_CHANNEL]) {
        assert.equal(validateActionForChannel(channel, batch, { renderedBody: "Bonjour" }, { sentTodayOnChannel: 0, recipientLocalHour: 12 }).ok, false);
      }
    }
  }
  const documented = { ...leadBase, consentBasis: "implied_verified", consentEvidence: { source: "crm", reference: "record-1", recordedAt: now } };
  assert.equal(validateSalesLead(documented).valid, true);
  assert.equal(prepareFollowUpDraft({ lead: documented, channel: "sms", nowIso: now }).ok, true);
  for (const consentEvidence of [{}, { source: "crm", reference: "", recordedAt: now }, { source: "crm", reference: "r1", recordedAt: "invalid" }]) {
    assert.equal(validateSalesLead({ ...documented, consentEvidence }).valid, false);
  }
  for (const file of ["features/sales/components/sales-desk-client.tsx", "features/ventures/loi96-pipeline-action.ts", "server/marketplace-listings/capture-lead.ts"]) {
    assert.match(source(file), /consentBasis: "unknown"/);
    assert.doesNotMatch(source(file), /consentBasis: "(?:express|implied_verified)"/);
  }
});

test("simulated or malformed evidence cannot authorize implied outbound consent", async () => {
  const { hasRecordedConsentProvenance } = await load("server/outbound/consent-evidence.ts");
  const ref = { source: "crm", referenceId: "record-1", capturedAt: "2026-10-25T12:00:00Z", isVerified: true };
  assert.equal(hasRecordedConsentProvenance({ consentProvenance: [ref] }), true);
  for (const patch of [{ provenance: "simulated" }, { isVerified: false }, { capturedAt: "invalid" }, { source: "" }, { referenceId: "" }]) {
    assert.equal(hasRecordedConsentProvenance({ consentProvenance: [{ ...ref, ...patch }] }), false);
  }
});

// G4: exercise generated output branches, and guard the template sources as well.
test("marketing outputs contain no unsupported percentage or CARFAX claims", async () => {
  const { buildInventoryDebrief } = await load("features/inventory/inventory-debrief.ts");
  const { prepareListingFromStock } = await load("features/marketplace-listings/listing-packet.ts");
  const { buildMarketAdvantageBrief } = await load("server/market/market-advantage-brief.ts");
  const prohibited = /\+\d+\s?%|CARFAX/i;
  for (const condition of ["new", "used", "cpo"]) {
    const vehicle = { stockId: "s1", year: 2025, make: "Chevrolet", model: "Trax", condition, priceCad: 20000, mileageKm: 12000, photoUrls: [], listingUrl: "https://example.com/vehicle" };
    const outputs = [
      buildInventoryDebrief([vehicle]),
      prepareListingFromStock({ packetId: "p1", workspaceId: "w1", vehicle, nowIso: "2026-10-25T12:00:00Z" }),
      buildMarketAdvantageBrief({ target: vehicle, inventory: [vehicle], sourceUrl: "https://example.com/comps", comps: [{ priceCad: 22000, mileageKm: 13000, priceBadge: "great" }] }),
    ];
    for (const output of outputs) assert.doesNotMatch(JSON.stringify(output), prohibited);
  }
  for (const file of ["features/inventory/inventory-debrief.ts", "features/marketplace-listings/listing-packet.ts", "server/market/market-advantage-brief.ts"]) {
    assert.doesNotMatch(source(file), prohibited);
  }
});

test("simulated evidence cannot become financial proof through copying", async () => {
  const { copyEvidenceRef, isVerifiedFinancialEvidence, classifyEvidenceTrust } = await load("features/ventures/evidence-ref.ts");
  const ref = copyEvidenceRef({ kind: "stripe_charge", referenceId: "fake", isVerified: true, provenance: "simulated", source: "demo", capturedAt: "2026-10-25T12:00:00Z", summary: "Demo charge" });
  assert.equal(ref.provenance, "simulated");
  assert.equal(isVerifiedFinancialEvidence(ref), false);
  assert.equal(classifyEvidenceTrust(ref), "low");
});
