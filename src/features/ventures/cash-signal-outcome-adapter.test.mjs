#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("CashSignalOutcomeAdapter", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const adapterMod = await jiti.import(path.join(__dirname, "cash-signal-outcome-adapter.ts"));
  const intakeMod = await jiti.import(path.join(__dirname, "cash-signal-intake.ts"));
  const outcomeMod = await jiti.import(path.join(__dirname, "agent-revenue-outcome.ts"));

  const { classifyCashSignalForOutcome, mapCashSignalToOutcomeInput } = adapterMod;
  const { buildCashSignalIntake } = intakeMod;
  const { buildAgentRevenueOutcome, validateAgentRevenueOutcome } = outcomeMod;

  function makeIntake(overrides = {}) {
    return buildCashSignalIntake({
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
    });
  }

  // Helper: map -> build -> validate, returning both the built outcome and result.
  function buildAndValidate(intake) {
    const input = mapCashSignalToOutcomeInput(intake);
    const built = buildAgentRevenueOutcome(input);
    const result = validateAgentRevenueOutcome(built);
    return { input, built, result };
  }

  // -------------------------------------------------------------------------
  // Group 1 — Verified financial proof becomes real cash
  // -------------------------------------------------------------------------
  await t.test("verified financial proof -> cashGenerated", async (t) => {
    await t.test("verified stripe_charge creates a cashGenerated-ready outcome", () => {
      const intake = makeIntake({ signalType: "stripe_charge", referenceId: "ch_1" });
      assert.equal(classifyCashSignalForOutcome(intake), "verified_cash");
      const { built, result } = buildAndValidate(intake);
      assert.equal(result.valid, true, JSON.stringify(result.errors));
      assert.equal(built.cashGenerated.amountCents, 49_000);
      assert.equal(built.cashGenerated.verified, true);
      assert.equal(built.cashGenerated.evidence.length, 1);
      assert.equal(built.cashGenerated.evidence[0].kind, "stripe_charge");
    });

    await t.test("verified signed_loi creates a cashGenerated-ready outcome", () => {
      const intake = makeIntake({
        signalType: "signed_loi",
        referenceId: "loi-014",
        summary: "ACME signed a 6-month LOI for the paid pilot at $490/mo.",
      });
      assert.equal(classifyCashSignalForOutcome(intake), "verified_cash");
      const { built, result } = buildAndValidate(intake);
      assert.equal(result.valid, true, JSON.stringify(result.errors));
      assert.equal(built.cashGenerated.amountCents, 49_000);
      assert.equal(built.cashGenerated.evidence[0].kind, "signed_loi");
      assert.ok(built.paymentSignal.score > 0, "payment signal must be non-zero for positive cash");
    });
  });

  // -------------------------------------------------------------------------
  // Group 2 — Market signals never become cash
  // -------------------------------------------------------------------------
  await t.test("market signals -> paymentSignal / customerProof, not cash", async (t) => {
    await t.test("email_reply maps to paymentSignal evidence, not cashGenerated", () => {
      const intake = makeIntake({
        signalType: "email_reply",
        referenceId: "msg-77",
        isVerified: false,
        amountCents: undefined,
        summary: "Buyer replied: 'interested, send me pricing for the pilot'.",
      });
      assert.equal(classifyCashSignalForOutcome(intake), "market_signal");
      const { built, result } = buildAndValidate(intake);
      assert.equal(result.valid, true, JSON.stringify(result.errors));
      assert.equal(built.cashGenerated.amountCents, 0);
      assert.equal(built.cashGenerated.evidence.length, 0);
      assert.equal(built.paymentSignal.evidence.length, 1);
      assert.equal(built.paymentSignal.evidence[0].kind, "email_reply");
    });

    await t.test("meeting_booked maps to customerProof evidence, not cashGenerated", () => {
      const intake = makeIntake({
        signalType: "meeting_booked",
        referenceId: "evt-22",
        isVerified: true,
        amountCents: undefined,
        summary: "Discovery call booked with the RevOps lead for Thursday.",
      });
      assert.equal(classifyCashSignalForOutcome(intake), "market_signal");
      const { built, result } = buildAndValidate(intake);
      assert.equal(result.valid, true, JSON.stringify(result.errors));
      assert.equal(built.cashGenerated.amountCents, 0);
      assert.equal(built.customerProof.evidence.length, 1);
      assert.equal(built.customerProof.evidence[0].kind, "analytics_event");
    });

    await t.test("unverified stripe_charge is a market signal, never cash", () => {
      const intake = makeIntake({
        signalType: "stripe_charge",
        referenceId: "ch_unv",
        isVerified: false,
        amountCents: undefined,
        summary: "Saw a pending charge in the dashboard, not yet reconciled.",
      });
      assert.equal(classifyCashSignalForOutcome(intake), "market_signal");
      const { built, result } = buildAndValidate(intake);
      assert.equal(result.valid, true, JSON.stringify(result.errors));
      assert.equal(built.cashGenerated.amountCents, 0);
    });
  });

  // -------------------------------------------------------------------------
  // Group 3 — Weak signals stay exploration
  // -------------------------------------------------------------------------
  await t.test("weak signals -> exploration only", async (t) => {
    await t.test("manual_note maps to exploratory evidence only", () => {
      const intake = makeIntake({
        signalType: "manual_note",
        referenceId: "note-9",
        isVerified: false,
        amountCents: undefined,
        summary: "Heard secondhand that two founders feel this pain acutely.",
      });
      assert.equal(classifyCashSignalForOutcome(intake), "exploration");
      const { built, result } = buildAndValidate(intake);
      assert.equal(result.valid, true, JSON.stringify(result.errors));
      assert.equal(built.cashGenerated.amountCents, 0);
      assert.equal(built.customerProof.evidence[0].kind, "manual_note");
      assert.ok(built.customerProof.score < 60, "exploration stays low-confidence");
    });

    await t.test("verbal_commitment maps to exploratory evidence only", () => {
      const intake = makeIntake({
        signalType: "verbal_commitment",
        referenceId: "call-3",
        isVerified: false,
        amountCents: undefined,
        summary: "On the call they said 'yes we'd buy this' but nothing signed.",
      });
      assert.equal(classifyCashSignalForOutcome(intake), "exploration");
      const { built, result } = buildAndValidate(intake);
      assert.equal(result.valid, true, JSON.stringify(result.errors));
      assert.equal(built.cashGenerated.amountCents, 0);
      assert.equal(built.customerProof.evidence[0].kind, "self_reported");
    });
  });

  // -------------------------------------------------------------------------
  // Group 4 — Fake cash is structurally rejected
  // -------------------------------------------------------------------------
  await t.test("fake cash is rejected", async (t) => {
    await t.test("a hand-forged manual_note with an amount never reaches cashGenerated", () => {
      // Bypass the intake builder/validator to simulate a malicious caller:
      // a manual_note claiming money. The adapter must still zero the cash.
      const forged = {
        signalId: "signal-evil",
        packetId: "packet-001",
        ventureId: "venture-001",
        sourceAgentId: "agent-rogue",
        signalType: "manual_note",
        referenceId: "note-evil",
        isVerified: true, // claims verified, but manual_note can never be financial
        amountCents: 999_999,
        summary: "Trust me, we definitely got paid a lot of money for this.",
        capturedAt: "2026-06-02T00:00:00.000Z",
        evidenceRef: {
          kind: "manual_note",
          referenceId: "note-evil",
          isVerified: true,
          source: "cash-signal:agent-rogue",
          capturedAt: "2026-06-02T00:00:00.000Z",
          summary: "Trust me, we definitely got paid a lot of money for this.",
        },
      };
      assert.equal(classifyCashSignalForOutcome(forged), "exploration");
      const { built, result } = buildAndValidate(forged);
      assert.equal(result.valid, true, JSON.stringify(result.errors));
      assert.equal(built.cashGenerated.amountCents, 0, "forged cash must be zeroed");
      assert.equal(built.cashGenerated.evidence.length, 0);
    });
  });

  // -------------------------------------------------------------------------
  // Group 5 — Consumability & determinism
  // -------------------------------------------------------------------------
  await t.test("consumability & determinism", async (t) => {
    await t.test("output is consumable by the AgentRevenueOutcome builder", () => {
      const intake = makeIntake();
      const built = buildAgentRevenueOutcome(mapCashSignalToOutcomeInput(intake));
      assert.equal(built.humanOnTheLoop, true);
      assert.equal(built.approvalRequired, true);
      assert.equal(built.noExecutionAuthorized, true);
    });

    await t.test("carries identity through deterministically", () => {
      const input = mapCashSignalToOutcomeInput(makeIntake());
      assert.equal(input.agentId, "agent-sales");
      assert.equal(input.ventureId, "venture-001");
      assert.equal(input.outcomeId, "outcome:signal-001");
      assert.equal(input.taskId, "task:packet-001");
      assert.equal(input.createdAt, "2026-06-02T00:00:00.000Z");
    });

    await t.test("mapping is deterministic", () => {
      assert.deepEqual(
        mapCashSignalToOutcomeInput(makeIntake()),
        mapCashSignalToOutcomeInput(makeIntake()),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Group 6 — Module boundary static source scan
  // -------------------------------------------------------------------------
  await t.test("Module boundary static source scan", async (t) => {
    const sourceText = readFileSync(path.join(__dirname, "cash-signal-outcome-adapter.ts"), "utf-8");
    const imports = Array.from(sourceText.matchAll(/import[\s\S]*?;/g))
      .map((m) => m[0])
      .join("\n");

    await t.test("imports no Supabase, DB, API, runtime, server/agents, or ledger modules", () => {
      assert.ok(!/supabase/i.test(imports), "must not import Supabase");
      assert.ok(!/(^|[/\\])db($|[/\\])/i.test(imports), "must not import db modules");
      assert.ok(!/(^|[/\\])api($|[/\\])/i.test(imports), "must not import API modules");
      assert.ok(!/runtime/i.test(imports), "must not import runtime modules");
      assert.ok(!/ledger/i.test(imports), "must not import Action Ledger modules");
      assert.ok(!/@\/server|src\/server|\.\.\/server/.test(imports), "must not import server modules");
      assert.ok(!/agents/i.test(imports), "must not import server/agents modules");
    });

    await t.test("exports no save, persist, send, or execute paths", () => {
      assert.ok(!sourceText.match(/\bexport\s+function\s+save/i), "no save export");
      assert.ok(!sourceText.match(/\bexport\s+function\s+persist/i), "no persist export");
      assert.ok(!sourceText.match(/\bexport\s+function\s+send/i), "no send export");
      assert.ok(!sourceText.match(/\bexport\s+function\s+execute/i), "no execute export");
    });
  });
});
