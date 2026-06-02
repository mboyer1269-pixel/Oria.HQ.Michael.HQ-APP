#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("CashSignalIntake model", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mod = await jiti.import(path.join(__dirname, "cash-signal-intake.ts"));
  const evidenceMod = await jiti.import(path.join(__dirname, "evidence-ref.ts"));
  const {
    cashSignalTypeToEvidenceKind,
    cashSignalToEvidenceRef,
    isVerifiedFinancialSignal,
    validateCashSignalIntake,
    buildCashSignalIntake,
    intakeIsVerifiedFinancial,
  } = mod;
  const { isVerifiedFinancialEvidence, validateEvidenceRef } = evidenceMod;

  function makeInput(overrides = {}) {
    return {
      signalId: "signal-001",
      packetId: "packet-001",
      ventureId: "venture-001",
      sourceAgentId: "agent-sales",
      signalType: "stripe_charge",
      referenceId: "ch_test_001",
      isVerified: true,
      amountCents: 49_000,
      summary: "ACME paid the $490 pilot via Stripe charge ch_test_001.",
      capturedAt: "2026-06-02T00:00:00.000Z",
      ...overrides,
    };
  }

  function makeIntake(overrides = {}) {
    return buildCashSignalIntake(makeInput(overrides));
  }

  // -------------------------------------------------------------------------
  // Group 1 — Financial signals (real cash candidates)
  // -------------------------------------------------------------------------
  await t.test("financial signals", async (t) => {
    await t.test("accepts a verified stripe_charge with amount", () => {
      const intake = makeIntake({ signalType: "stripe_charge", referenceId: "ch_1" });
      const result = validateCashSignalIntake(intake);
      assert.equal(result.valid, true);
      assert.deepEqual(result.errors, []);
      assert.equal(intakeIsVerifiedFinancial(intake), true);
    });

    await t.test("accepts a verified signed_loi with amount", () => {
      const intake = makeIntake({
        signalType: "signed_loi",
        referenceId: "loi-014",
        summary: "ACME signed a 6-month LOI for the paid pilot at $490/mo.",
      });
      const result = validateCashSignalIntake(intake);
      assert.equal(result.valid, true);
      assert.equal(intakeIsVerifiedFinancial(intake), true);
    });

    await t.test("rejects positive amount without a verified financial signal", () => {
      const intake = makeIntake({
        signalType: "manual_note",
        referenceId: "note-1",
        isVerified: true,
        amountCents: 49_000,
        summary: "I am pretty sure we landed a paying customer somehow.",
      });
      const result = validateCashSignalIntake(intake);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("positive amountCents requires a verified financial signal")));
    });

    await t.test("rejects positive amount on an UNVERIFIED stripe_charge", () => {
      const intake = makeIntake({ signalType: "stripe_charge", isVerified: false, referenceId: "ch_unv" });
      const result = validateCashSignalIntake(intake);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("positive amountCents")));
    });
  });

  // -------------------------------------------------------------------------
  // Group 2 — Market signals (useful, non-cash)
  // -------------------------------------------------------------------------
  await t.test("market signals (non-cash)", async (t) => {
    await t.test("allows email_reply as a non-cash signal (no amount)", () => {
      const intake = makeIntake({
        signalType: "email_reply",
        referenceId: "msg-77",
        amountCents: undefined,
        summary: "Buyer replied: 'interested, send me pricing for the pilot'.",
      });
      const result = validateCashSignalIntake(intake);
      assert.equal(result.valid, true);
      assert.equal(intakeIsVerifiedFinancial(intake), false);
    });

    await t.test("allows meeting_booked as a non-cash signal", () => {
      const intake = makeIntake({
        signalType: "meeting_booked",
        referenceId: "evt-22",
        amountCents: undefined,
        summary: "Discovery call booked with the RevOps lead for Thursday.",
      });
      const result = validateCashSignalIntake(intake);
      assert.equal(result.valid, true);
      assert.equal(cashSignalTypeToEvidenceKind("meeting_booked"), "analytics_event");
    });

    await t.test("email_reply with a positive amount is rejected (not financial)", () => {
      const intake = makeIntake({
        signalType: "email_reply",
        referenceId: "msg-78",
        amountCents: 10_000,
        summary: "Buyer replied that they would probably pay us eventually.",
      });
      const result = validateCashSignalIntake(intake);
      assert.equal(result.valid, false);
    });
  });

  // -------------------------------------------------------------------------
  // Group 3 — Exploration (weakest signals)
  // -------------------------------------------------------------------------
  await t.test("exploration signals", async (t) => {
    await t.test("allows manual_note as exploration (no amount)", () => {
      const intake = makeIntake({
        signalType: "manual_note",
        referenceId: "note-9",
        isVerified: false,
        amountCents: undefined,
        summary: "Heard secondhand that two founders feel this pain acutely.",
      });
      const result = validateCashSignalIntake(intake);
      assert.equal(result.valid, true);
    });

    await t.test("allows verbal_commitment as a weak signal (no amount)", () => {
      const intake = makeIntake({
        signalType: "verbal_commitment",
        referenceId: "call-3",
        isVerified: false,
        amountCents: undefined,
        summary: "On the call they said 'yes we'd buy this' but nothing signed.",
      });
      const result = validateCashSignalIntake(intake);
      assert.equal(result.valid, true);
      assert.equal(cashSignalTypeToEvidenceKind("verbal_commitment"), "self_reported");
    });
  });

  // -------------------------------------------------------------------------
  // Group 4 — Normalization into EvidenceRef
  // -------------------------------------------------------------------------
  await t.test("normalization into EvidenceRef", async (t) => {
    await t.test("converts a valid financial signal into a verified financial EvidenceRef", () => {
      const input = makeInput({ signalType: "stripe_charge", referenceId: "ch_42" });
      const ref = cashSignalToEvidenceRef(input);
      assert.equal(ref.kind, "stripe_charge");
      assert.equal(ref.isVerified, true);
      assert.equal(ref.referenceId, "ch_42");
      assert.equal(validateEvidenceRef(ref).valid, true);
      assert.equal(isVerifiedFinancialEvidence(ref), true);
    });

    await t.test("built intake carries a structurally valid evidenceRef", () => {
      const intake = makeIntake();
      assert.equal(validateEvidenceRef(intake.evidenceRef).valid, true);
    });

    await t.test("isVerifiedFinancialSignal is true only for verified stripe_charge / signed_loi", () => {
      assert.equal(isVerifiedFinancialSignal(makeInput({ signalType: "stripe_charge", isVerified: true })), true);
      assert.equal(isVerifiedFinancialSignal(makeInput({ signalType: "signed_loi", isVerified: true })), true);
      assert.equal(isVerifiedFinancialSignal(makeInput({ signalType: "stripe_charge", isVerified: false })), false);
      assert.equal(isVerifiedFinancialSignal(makeInput({ signalType: "email_reply", isVerified: true })), false);
    });

    await t.test("evidenceRef.kind / isVerified mismatch is rejected", () => {
      const intake = makeIntake();
      const tampered = { ...intake, evidenceRef: { ...intake.evidenceRef, kind: "manual_note" } };
      const result = validateCashSignalIntake(tampered);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("evidenceRef.kind")));
    });
  });

  // -------------------------------------------------------------------------
  // Group 5 — Determinism & purity
  // -------------------------------------------------------------------------
  await t.test("determinism & purity", async (t) => {
    await t.test("build output is deterministic", () => {
      assert.deepEqual(makeIntake(), makeIntake());
    });

    await t.test("cashSignalToEvidenceRef is deterministic", () => {
      const input = makeInput({ signalType: "signed_loi", referenceId: "loi-5" });
      assert.deepEqual(cashSignalToEvidenceRef(input), cashSignalToEvidenceRef(input));
    });

    await t.test("validation does not mutate input", () => {
      const intake = makeIntake();
      const snapshot = JSON.stringify(intake);
      validateCashSignalIntake(intake);
      assert.equal(JSON.stringify(intake), snapshot);
    });

    await t.test("omits amountCents when not provided", () => {
      const intake = makeIntake({ signalType: "email_reply", amountCents: undefined, summary: "Buyer replied asking about pricing details." });
      assert.equal("amountCents" in intake, false);
    });
  });

  // -------------------------------------------------------------------------
  // Group 6 — Module boundary static source scan
  // -------------------------------------------------------------------------
  await t.test("Module boundary static source scan", async (t) => {
    const sourceText = readFileSync(path.join(__dirname, "cash-signal-intake.ts"), "utf-8");
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
    });
  });
});
