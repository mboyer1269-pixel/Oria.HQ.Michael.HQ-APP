#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("CashActionReview view-model", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const reviewMod = await jiti.import(path.join(__dirname, "cash-action-review.ts"));
  const intakeMod = await jiti.import(path.join(__dirname, "cash-signal-intake.ts"));
  const { summarizeCapturedSignal, CASH_ACTION_DECISIONS } = reviewMod;
  const { buildCashSignalIntake } = intakeMod;

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

  // -------------------------------------------------------------------------
  // Group 1 — Verified financial proof reads as real cash
  // -------------------------------------------------------------------------
  await t.test("verified financial proof reads as real cash", async (t) => {
    await t.test("verified stripe_charge becomes real cash", () => {
      const summary = summarizeCapturedSignal(makeIntake({ signalType: "stripe_charge" }));
      assert.equal(summary.classification, "verified_cash");
      assert.equal(summary.becameRealCash, true);
      assert.equal(summary.cashAmountCents, 49_000);
      assert.equal(summary.trustLevel, "strongest");
      assert.ok(summary.headline.includes("Verified cash captured"));
    });

    await t.test("verified signed_loi becomes real cash", () => {
      const summary = summarizeCapturedSignal(makeIntake({
        signalType: "signed_loi",
        referenceId: "loi-1",
        summary: "ACME signed a 6-month LOI for the paid pilot at $490/mo.",
      }));
      assert.equal(summary.classification, "verified_cash");
      assert.equal(summary.becameRealCash, true);
      assert.equal(summary.trustLevel, "high");
    });
  });

  // -------------------------------------------------------------------------
  // Group 2 — Market signals are NOT cash
  // -------------------------------------------------------------------------
  await t.test("market signals are not cash", async (t) => {
    await t.test("email_reply is a market signal, not cash", () => {
      const summary = summarizeCapturedSignal(makeIntake({
        signalType: "email_reply",
        referenceId: "msg-1",
        isVerified: false,
        amountCents: undefined,
        summary: "Buyer replied asking for pricing on the pilot.",
      }));
      assert.equal(summary.classification, "market_signal");
      assert.equal(summary.becameRealCash, false);
      assert.equal(summary.cashAmountCents, 0);
      assert.ok(summary.headline.includes("Market signal"));
    });

    await t.test("meeting_booked is a market signal, not cash", () => {
      const summary = summarizeCapturedSignal(makeIntake({
        signalType: "meeting_booked",
        referenceId: "evt-1",
        isVerified: true,
        amountCents: undefined,
        summary: "Discovery call booked with the RevOps lead for Thursday.",
      }));
      assert.equal(summary.classification, "market_signal");
      assert.equal(summary.becameRealCash, false);
    });
  });

  // -------------------------------------------------------------------------
  // Group 3 — Weak signals are exploration
  // -------------------------------------------------------------------------
  await t.test("weak signals are exploration", async (t) => {
    await t.test("verbal_commitment is exploration", () => {
      const summary = summarizeCapturedSignal(makeIntake({
        signalType: "verbal_commitment",
        referenceId: "call-1",
        isVerified: false,
        amountCents: undefined,
        summary: "They said on the call they would buy, nothing signed yet.",
      }));
      assert.equal(summary.classification, "exploration");
      assert.equal(summary.becameRealCash, false);
      assert.ok(summary.headline.includes("Exploration"));
    });

    await t.test("manual_note is exploration", () => {
      const summary = summarizeCapturedSignal(makeIntake({
        signalType: "manual_note",
        referenceId: "note-1",
        isVerified: false,
        amountCents: undefined,
        summary: "Heard secondhand that two founders feel this pain.",
      }));
      assert.equal(summary.classification, "exploration");
      assert.equal(summary.becameRealCash, false);
      assert.equal(summary.trustLevel, "low");
    });
  });

  // -------------------------------------------------------------------------
  // Group 4 — Determinism & exports
  // -------------------------------------------------------------------------
  await t.test("determinism & exports", async (t) => {
    await t.test("summary is deterministic", () => {
      assert.deepEqual(
        summarizeCapturedSignal(makeIntake()),
        summarizeCapturedSignal(makeIntake()),
      );
    });

    await t.test("decision states are exposed", () => {
      assert.deepEqual([...CASH_ACTION_DECISIONS], [
        "pending",
        "approved_for_manual_action",
        "rejected_needs_refinement",
      ]);
    });
  });

  // -------------------------------------------------------------------------
  // Group 5 — Module boundary static source scan
  // -------------------------------------------------------------------------
  await t.test("Module boundary static source scan", async (t) => {
    const sourceText = readFileSync(path.join(__dirname, "cash-action-review.ts"), "utf-8");
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
