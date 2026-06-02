#!/usr/bin/env node

// src/server/ventures/cash-signal-intake-row-mapping.test.mjs

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("Cash signal intake row mapping", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mapMod = await jiti.import(path.join(__dirname, "cash-signal-intake-row-mapping.ts"));
  const intakeMod = await jiti.import(
    path.join(projectRoot, "src/features/ventures/cash-signal-intake.ts"),
  );
  const { mapIntakeToInsert, mapRowToIntake, CashSignalIntakeMappingError } = mapMod;
  const { buildCashSignalIntake } = intakeMod;

  const USER = "11111111-1111-1111-1111-111111111111";

  function makeIntake(overrides = {}) {
    return buildCashSignalIntake({
      signalId: "signal:packet-001",
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

  await t.test("maps a verified financial intake to a snake_case insert", () => {
    const insert = mapIntakeToInsert("ws1", USER, makeIntake());
    assert.equal(insert.workspace_id, "ws1");
    assert.equal(insert.captured_by_user_id, USER);
    assert.equal(insert.signal_type, "stripe_charge");
    assert.equal(insert.amount_cents, 49_000);
    assert.equal(insert.reference_id, "ch_test_001");
    assert.equal(insert.evidence_ref.kind, "stripe_charge");
    assert.equal("id" in insert, false, "DB assigns id");
    assert.equal("created_at" in insert, false, "DB assigns created_at");
  });

  await t.test("maps a no-amount market signal (amount_cents null)", () => {
    const insert = mapIntakeToInsert("ws1", USER, makeIntake({
      signalType: "email_reply",
      referenceId: "msg-1",
      isVerified: false,
      amountCents: undefined,
      summary: "Buyer replied asking for pricing.",
    }));
    assert.equal(insert.amount_cents, null);
    assert.equal(insert.signal_type, "email_reply");
  });

  await t.test("round-trips insert -> row -> intake", () => {
    const insert = mapIntakeToInsert("ws1", USER, makeIntake());
    const row = { ...insert, id: "row-1", created_at: insert.captured_at };
    const intake = mapRowToIntake(row);
    assert.equal(intake.signalId, "signal:packet-001");
    assert.equal(intake.amountCents, 49_000);
    assert.equal(intake.evidenceRef.kind, "stripe_charge");
  });

  await t.test("mapping rejects fake cash (positive amount, non-financial signal)", () => {
    const forged = {
      signalId: "s",
      packetId: "p",
      ventureId: "v",
      sourceAgentId: "a",
      signalType: "manual_note",
      referenceId: "note-1",
      isVerified: true,
      amountCents: 1000,
      summary: "claims money but is a note",
      capturedAt: "2026-06-02T00:00:00.000Z",
      evidenceRef: {
        kind: "manual_note",
        referenceId: "note-1",
        isVerified: true,
        source: "cash-signal:a",
        capturedAt: "2026-06-02T00:00:00.000Z",
        summary: "claims money but is a note",
      },
    };
    assert.throws(() => mapIntakeToInsert("ws1", USER, forged), CashSignalIntakeMappingError);
  });

  await t.test("rejects an empty workspace or user id", () => {
    assert.throws(() => mapIntakeToInsert("", USER, makeIntake()), CashSignalIntakeMappingError);
    assert.throws(() => mapIntakeToInsert("ws1", "", makeIntake()), CashSignalIntakeMappingError);
  });

  await t.test("rejects a row with a non-object evidence_ref", () => {
    const insert = mapIntakeToInsert("ws1", USER, makeIntake());
    const row = { ...insert, id: "row-1", created_at: insert.captured_at, evidence_ref: "nope" };
    assert.throws(() => mapRowToIntake(row), CashSignalIntakeMappingError);
  });
});
