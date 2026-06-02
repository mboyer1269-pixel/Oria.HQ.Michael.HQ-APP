#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("CashActionPacket model", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mod = await jiti.import(path.join(__dirname, "cash-action-packet.ts"));
  const {
    CASH_SIGNAL_TYPES,
    CASH_FINANCIAL_SIGNAL_TYPES,
    CASH_ACTION_BUYER_TYPES,
    isCashFinancialSignalType,
    computeExpectedRoiMultiple,
    validateCashActionPacket,
    isProposalOnly,
    buildCashActionPacket,
  } = mod;

  function makeInput(overrides = {}) {
    return {
      packetId: "packet-001",
      ventureId: "venture-001",
      agentId: "agent-001",
      targetBuyer: "Heads of RevOps at 20-100 person B2B SaaS companies",
      buyerType: "smb",
      painHypothesis:
        "They reconcile pipeline by hand every Friday and lose 3 hours to it.",
      offer: "A done-for-you weekly pipeline reconciliation, delivered every Friday.",
      pricePointCents: 49_000,
      callToAction: "Reply 'pilot' to start a paid 2-week pilot this Friday.",
      outreachDraft:
        "Hi {name}, saw your team reconciles pipeline manually — want a done-for-you Friday report?",
      expectedCashSignal: "signed_loi",
      requiredEvidence: ["signed_loi"],
      expectedCashImpactCents: 49_000,
      expectedCostCents: 7_000,
      createdAt: "2026-06-02T00:00:00.000Z",
      ...overrides,
    };
  }

  function makePacket(overrides = {}) {
    return buildCashActionPacket(makeInput(overrides));
  }

  // -------------------------------------------------------------------------
  // Group 1 — Valid packet
  // -------------------------------------------------------------------------
  await t.test("valid packet", async (t) => {
    await t.test("creates a valid packet", () => {
      const result = validateCashActionPacket(makePacket());
      assert.equal(result.valid, true);
      assert.deepEqual(result.errors, []);
    });

    await t.test("exposes the six cash signal types", () => {
      assert.deepEqual([...CASH_SIGNAL_TYPES], [
        "stripe_charge",
        "signed_loi",
        "email_reply",
        "meeting_booked",
        "verbal_commitment",
        "manual_note",
      ]);
    });

    await t.test("financial signal types are exactly stripe_charge and signed_loi", () => {
      assert.deepEqual([...CASH_FINANCIAL_SIGNAL_TYPES], ["stripe_charge", "signed_loi"]);
      assert.equal(isCashFinancialSignalType("stripe_charge"), true);
      assert.equal(isCashFinancialSignalType("signed_loi"), true);
      assert.equal(isCashFinancialSignalType("email_reply"), false);
      assert.equal(isCashFinancialSignalType("manual_note"), false);
    });

    await t.test("exposes known buyer types", () => {
      assert.ok(CASH_ACTION_BUYER_TYPES.includes("smb"));
      assert.ok(CASH_ACTION_BUYER_TYPES.includes("enterprise"));
    });
  });

  // -------------------------------------------------------------------------
  // Group 2 — Required concreteness
  // -------------------------------------------------------------------------
  await t.test("required concreteness", async (t) => {
    await t.test("rejects missing target buyer", () => {
      const result = validateCashActionPacket(makePacket({ targetBuyer: "   " }));
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("targetBuyer")));
    });

    await t.test("rejects missing offer", () => {
      const result = validateCashActionPacket(makePacket({ offer: "" }));
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("offer")));
    });

    await t.test("rejects missing call to action", () => {
      const result = validateCashActionPacket(makePacket({ callToAction: "" }));
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("callToAction")));
    });

    await t.test("rejects missing pain hypothesis", () => {
      const result = validateCashActionPacket(makePacket({ painHypothesis: "" }));
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("painHypothesis")));
    });

    await t.test("rejects unknown buyer type", () => {
      const result = validateCashActionPacket(makePacket({ buyerType: "alien" }));
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("buyerType")));
    });

    await t.test("rejects empty required evidence", () => {
      const result = validateCashActionPacket(makePacket({ requiredEvidence: [] }));
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("requiredEvidence")));
    });

    await t.test("rejects unknown required evidence kind", () => {
      const result = validateCashActionPacket(makePacket({ requiredEvidence: ["telepathy"] }));
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("requiredEvidence")));
    });
  });

  // -------------------------------------------------------------------------
  // Group 3 — Cash math
  // -------------------------------------------------------------------------
  await t.test("cash math", async (t) => {
    await t.test("rejects negative price", () => {
      const result = validateCashActionPacket(makePacket({ pricePointCents: -1 }));
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("pricePointCents")));
    });

    await t.test("rejects negative cost", () => {
      const result = validateCashActionPacket(makePacket({ expectedCostCents: -1 }));
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("expectedCostCents")));
    });

    await t.test("rejects negative cash impact", () => {
      const result = validateCashActionPacket(makePacket({ expectedCashImpactCents: -1 }));
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("expectedCashImpactCents")));
    });

    await t.test("computes ROI multiple deterministically", () => {
      assert.equal(computeExpectedRoiMultiple(49_000, 7_000), 7);
      assert.equal(computeExpectedRoiMultiple(10_000, 4_000), 2.5);
    });

    await t.test("ROI is 0 when cost is 0 (no divide-by-zero, stays finite)", () => {
      assert.equal(computeExpectedRoiMultiple(49_000, 0), 0);
      const packet = makePacket({ expectedCostCents: 0 });
      assert.equal(packet.expectedRoiMultiple, 0);
      assert.equal(Number.isFinite(packet.expectedRoiMultiple), true);
    });

    await t.test("builder derives ROI from impact and cost", () => {
      const packet = makePacket({ expectedCashImpactCents: 20_000, expectedCostCents: 5_000 });
      assert.equal(packet.expectedRoiMultiple, 4);
    });
  });

  // -------------------------------------------------------------------------
  // Group 4 — Governance: proposal only, never executes
  // -------------------------------------------------------------------------
  await t.test("governance: proposal only", async (t) => {
    await t.test("builder locks requiresCeoApproval to true", () => {
      assert.equal(makePacket().requiresCeoApproval, true);
    });

    await t.test("builder locks noExecutionAuthorized to true", () => {
      assert.equal(makePacket().noExecutionAuthorized, true);
    });

    await t.test("isProposalOnly is true for a built packet", () => {
      assert.equal(isProposalOnly(makePacket()), true);
    });

    await t.test("validation rejects a packet that does not require approval", () => {
      const packet = { ...makePacket(), requiresCeoApproval: false };
      const result = validateCashActionPacket(packet);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("requiresCeoApproval")));
    });

    await t.test("validation rejects a packet that authorizes execution", () => {
      const packet = { ...makePacket(), noExecutionAuthorized: false };
      const result = validateCashActionPacket(packet);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("noExecutionAuthorized")));
    });

    await t.test("keeps outreachDraft as a draft only (plain string, no send path)", () => {
      const packet = makePacket();
      assert.equal(typeof packet.outreachDraft, "string");
      // The packet exposes no send / execute capability — it is data only.
      assert.equal("send" in packet, false);
      assert.equal("execute" in packet, false);
      assert.equal("dispatch" in packet, false);
    });
  });

  // -------------------------------------------------------------------------
  // Group 5 — Determinism & purity
  // -------------------------------------------------------------------------
  await t.test("determinism & purity", async (t) => {
    await t.test("build output is deterministic", () => {
      assert.deepEqual(makePacket(), makePacket());
    });

    await t.test("builder copies requiredEvidence (no shared reference)", () => {
      const evidence = ["signed_loi"];
      const packet = makePacket({ requiredEvidence: evidence });
      packet.requiredEvidence.push("stripe_charge");
      assert.equal(evidence.includes("stripe_charge"), false);
    });

    await t.test("validation does not mutate input", () => {
      const packet = makePacket();
      const snapshot = JSON.stringify(packet);
      validateCashActionPacket(packet);
      assert.equal(JSON.stringify(packet), snapshot);
    });
  });

  // -------------------------------------------------------------------------
  // Group 6 — Module boundary static source scan
  // -------------------------------------------------------------------------
  await t.test("Module boundary static source scan", async (t) => {
    const sourceText = readFileSync(path.join(__dirname, "cash-action-packet.ts"), "utf-8");
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
