#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

const CREATED_AT = "2026-06-02T00:00:00.000Z";

test("CashActionPacketGenerator", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const genMod = await jiti.import(path.join(__dirname, "cash-action-packet-generator.ts"));
  const packetMod = await jiti.import(path.join(__dirname, "cash-action-packet.ts"));
  const dataMod = await jiti.import(path.join(__dirname, "agent-venture-workbench-data.ts"));

  const {
    buildCashActionPacketFromOffer,
    buildCashActionPacketsFromItems,
    inferBuyerType,
  } = genMod;
  const { validateCashActionPacket, isProposalOnly } = packetMod;
  const { AGENT_VENTURE_WORKBENCH_ITEMS } = dataMod;

  // A synthetic offer draft so the test controls the recommendation directly,
  // independent of the profitability scorer.
  function makeOffer(overrides = {}) {
    return {
      workbenchItemId: "wb-001",
      opportunityTitle: "Weekly pipeline reconciliation",
      agentId: "agent-research",
      targetCustomer: "RevOps leads at 20-100 person B2B SaaS companies",
      customerPain: "They reconcile pipeline by hand every Friday and lose hours to it.",
      offerPromise: "Help RevOps leads kill manual Friday reconciliation with a done-for-you report.",
      packageLabel: "Limited pilot package",
      packageDeliverables: ["Offer one-pager", "Pilot onboarding checklist"],
      priceHypothesisCents: 49_000,
      priceHypothesisLabel: "$490/mo",
      mainObjection: "The buyer will ask what proof exists before committing.",
      riskReduction: "Tight pilot, explicit success metric, and short feedback loop.",
      reasonToBuyNow: "Fast first-dollar path and a bounded pilot make this worth testing now.",
      nextValidationStep: "Confirm the Friday pain with three target buyers.",
      recommendation: "prioritize_for_validation",
      profitabilityScore: 82,
      riskLevel: "medium",
      validationCostCents: 7_000,
      speedToFirstDollarDays: 14,
      blockerCount: 0,
      readOnly: true,
      humanOnTheLoop: true,
      approvalRequired: true,
      noExecutionAuthorized: true,
      ...overrides,
    };
  }

  // -------------------------------------------------------------------------
  // Group 1 — Produces a valid, proposal-only packet
  // -------------------------------------------------------------------------
  await t.test("produces a valid packet", async (t) => {
    await t.test("maps a prioritize_for_validation offer to a valid packet", () => {
      const packet = buildCashActionPacketFromOffer(makeOffer(), { createdAt: CREATED_AT });
      const result = validateCashActionPacket(packet);
      assert.equal(result.valid, true, JSON.stringify(result.errors));
    });

    await t.test("carries identity from the offer", () => {
      const packet = buildCashActionPacketFromOffer(makeOffer(), { createdAt: CREATED_AT });
      assert.equal(packet.ventureId, "wb-001");
      assert.equal(packet.agentId, "agent-research");
      assert.equal(packet.packetId, "packet:wb-001");
      assert.equal(packet.targetBuyer, "RevOps leads at 20-100 person B2B SaaS companies");
      assert.equal(packet.pricePointCents, 49_000);
      assert.equal(packet.expectedCostCents, 7_000);
    });

    await t.test("is governance-locked (approval required, no execution)", () => {
      const packet = buildCashActionPacketFromOffer(makeOffer(), { createdAt: CREATED_AT });
      assert.equal(packet.requiresCeoApproval, true);
      assert.equal(packet.noExecutionAuthorized, true);
      assert.equal(isProposalOnly(packet), true);
    });

    await t.test("derives ROI from price impact and validation cost", () => {
      const packet = buildCashActionPacketFromOffer(
        makeOffer({ priceHypothesisCents: 20_000, validationCostCents: 5_000 }),
        { createdAt: CREATED_AT },
      );
      assert.equal(packet.expectedRoiMultiple, 4);
    });

    await t.test("outreachDraft mentions the buyer and pain (draft only)", () => {
      const packet = buildCashActionPacketFromOffer(makeOffer(), { createdAt: CREATED_AT });
      assert.ok(packet.outreachDraft.includes("RevOps"));
      assert.ok(packet.outreachDraft.length >= 10);
    });

    await t.test("honors packetId and ventureId overrides", () => {
      const packet = buildCashActionPacketFromOffer(makeOffer(), {
        createdAt: CREATED_AT,
        packetId: "custom-packet",
        ventureId: "venture-xyz",
      });
      assert.equal(packet.packetId, "custom-packet");
      assert.equal(packet.ventureId, "venture-xyz");
    });
  });

  // -------------------------------------------------------------------------
  // Group 2 — Recommendation drives the expected signal & evidence
  // -------------------------------------------------------------------------
  await t.test("recommendation drives the cash action", async (t) => {
    const cases = [
      { rec: "prioritize_for_validation", signal: "signed_loi", evidence: ["signed_loi", "stripe_charge"] },
      { rec: "refine_offer", signal: "signed_loi", evidence: ["signed_loi", "stripe_charge"] },
      { rec: "reduce_validation_cost", signal: "meeting_booked", evidence: ["analytics_event"] },
      { rec: "gather_more_evidence", signal: "email_reply", evidence: ["email_reply"] },
      { rec: "request_ceo_review", signal: "meeting_booked", evidence: ["analytics_event"] },
      { rec: "reject_for_now", signal: "manual_note", evidence: ["manual_note"] },
    ];

    for (const { rec, signal, evidence } of cases) {
      await t.test(`${rec} -> expects ${signal}`, () => {
        const packet = buildCashActionPacketFromOffer(makeOffer({ recommendation: rec }), { createdAt: CREATED_AT });
        assert.equal(packet.expectedCashSignal, signal);
        assert.deepEqual(packet.requiredEvidence, evidence);
        assert.ok(packet.callToAction.length > 0);
        // Every recommendation still produces a structurally valid packet.
        assert.equal(validateCashActionPacket(packet).valid, true);
      });
    }
  });

  // -------------------------------------------------------------------------
  // Group 3 — Buyer type inference
  // -------------------------------------------------------------------------
  await t.test("buyer type inference", async (t) => {
    await t.test("maps known buyer phrasings deterministically", () => {
      assert.equal(inferBuyerType("Enterprise procurement teams"), "enterprise");
      assert.equal(inferBuyerType("Mid-market operations leads"), "mid_market");
      assert.equal(inferBuyerType("Two-sided marketplace operators"), "marketplace");
      assert.equal(inferBuyerType("SMB founders and ops leads"), "smb");
      assert.equal(inferBuyerType("Individual freelancers"), "individual");
      assert.equal(inferBuyerType("Some unusual audience"), "other");
    });

    await t.test("inferred buyer type is always a valid packet buyerType", () => {
      const packet = buildCashActionPacketFromOffer(
        makeOffer({ targetCustomer: "Enterprise revenue teams" }),
        { createdAt: CREATED_AT },
      );
      assert.equal(packet.buyerType, "enterprise");
      assert.equal(validateCashActionPacket(packet).valid, true);
    });
  });

  // -------------------------------------------------------------------------
  // Group 4 — End-to-end on real seed ventures
  // -------------------------------------------------------------------------
  await t.test("end-to-end on real workbench items", async (t) => {
    await t.test("every seed item yields a valid, proposal-only packet", () => {
      const packets = buildCashActionPacketsFromItems(AGENT_VENTURE_WORKBENCH_ITEMS, { createdAt: CREATED_AT });
      assert.equal(packets.length, AGENT_VENTURE_WORKBENCH_ITEMS.length);
      assert.ok(packets.length > 0, "seed must contain at least one venture");
      for (const packet of packets) {
        const result = validateCashActionPacket(packet);
        assert.equal(result.valid, true, `${packet.packetId}: ${JSON.stringify(result.errors)}`);
        assert.equal(isProposalOnly(packet), true);
        assert.ok(packet.expectedCashImpactCents >= 0);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Group 5 — Determinism & purity
  // -------------------------------------------------------------------------
  await t.test("determinism & purity", async (t) => {
    await t.test("same offer + same createdAt -> identical packet", () => {
      assert.deepEqual(
        buildCashActionPacketFromOffer(makeOffer(), { createdAt: CREATED_AT }),
        buildCashActionPacketFromOffer(makeOffer(), { createdAt: CREATED_AT }),
      );
    });

    await t.test("does not mutate the offer", () => {
      const offer = makeOffer();
      const snapshot = JSON.stringify(offer);
      buildCashActionPacketFromOffer(offer, { createdAt: CREATED_AT });
      assert.equal(JSON.stringify(offer), snapshot);
    });

    await t.test("seed batch generation is deterministic", () => {
      assert.deepEqual(
        buildCashActionPacketsFromItems(AGENT_VENTURE_WORKBENCH_ITEMS, { createdAt: CREATED_AT }),
        buildCashActionPacketsFromItems(AGENT_VENTURE_WORKBENCH_ITEMS, { createdAt: CREATED_AT }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Group 6 — Module boundary static source scan
  // -------------------------------------------------------------------------
  await t.test("Module boundary static source scan", async (t) => {
    const sourceText = readFileSync(path.join(__dirname, "cash-action-packet-generator.ts"), "utf-8");
    const imports = Array.from(sourceText.matchAll(/import[\s\S]*?;/g))
      .map((m) => m[0])
      .join("\n");

    await t.test("imports no Supabase, DB, API, runtime, ledger, or server modules", () => {
      assert.ok(!/supabase/i.test(imports), "must not import Supabase");
      assert.ok(!/(^|[/\\])db($|[/\\])/i.test(imports), "must not import db modules");
      assert.ok(!/(^|[/\\])api($|[/\\])/i.test(imports), "must not import API modules");
      assert.ok(!/runtime/i.test(imports), "must not import runtime modules");
      assert.ok(!/ledger/i.test(imports), "must not import Action Ledger modules");
      assert.ok(!/@\/server|src\/server|\.\.\/server/.test(imports), "must not import server modules");
    });

    await t.test("exports no save, persist, send, or execute paths", () => {
      assert.ok(!sourceText.match(/\bexport\s+function\s+save/i), "no save export");
      assert.ok(!sourceText.match(/\bexport\s+function\s+persist/i), "no persist export");
      assert.ok(!sourceText.match(/\bexport\s+function\s+send/i), "no send export");
      assert.ok(!sourceText.match(/\bexport\s+function\s+execute/i), "no execute export");
      assert.ok(!sourceText.match(/\bexport\s+function\s+dispatch/i), "no dispatch export");
    });
  });
});
