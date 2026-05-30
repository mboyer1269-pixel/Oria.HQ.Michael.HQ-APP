#!/usr/bin/env node

// src/server/joris/brain-governance-preview.test.mjs
//
// PR127 — Joris Governance Preview Wiring (read-only) integration tests.
//
// Verifies that the opportunity.score branch in brain.ts surfaces the existing
// Work Order dry-run preview AND appends a read-only Governance Bundle preview,
// without ever enabling a confirmation/execution path. Also asserts the normal
// calendar booking proposal + confirm flow remains intact.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

// Defensive: force LOCAL persistence so the confirm-flow assertion never writes
// to Supabase, mirroring the joris-booking smoke harness.
delete process.env.MICHAEL_HQ_OWNER_ID;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

test("Joris Governance Preview Wiring (PR127) integration tests", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const brainMod = await jiti.import(path.join(__dirname, "brain.ts"));
  const { runJorisCommand } = brainMod;

  const OPPORTUNITY_MESSAGE = "Trouve-moi une idée de business autonome avec IA";

  // ---------------------------------------------------------------------------
  // Opportunity path: existing Work Order dry-run preview is retained
  // ---------------------------------------------------------------------------

  await t.test("opportunity command still includes the Work Order dry-run preview", async () => {
    const result = await runJorisCommand(OPPORTUNITY_MESSAGE);

    assert.equal(result.intent, "opportunity.score");
    assert.ok(result.summary.includes("dry-run"), "must keep dry-run Work Order preview");
    assert.ok(result.summary.includes("VentureWorkOrder"), "must keep Work Order type");
    assert.ok(
      result.summary.includes("Aucune action n’a été exécutée"),
      "must keep the existing no-execution line",
    );
  });

  // ---------------------------------------------------------------------------
  // Opportunity path: governance bundle preview is appended
  // ---------------------------------------------------------------------------

  await t.test("response additionally includes the Governance Bundle preview section", async () => {
    const result = await runJorisCommand(OPPORTUNITY_MESSAGE);
    assert.ok(
      result.summary.includes("Governance Bundle"),
      "governance preview section must be present",
    );
  });

  await t.test("response includes Human-on-the-Loop wording", async () => {
    const result = await runJorisCommand(OPPORTUNITY_MESSAGE);
    assert.ok(result.summary.includes("Human-on-the-Loop"));
  });

  await t.test("response includes Aucune action exécutée", async () => {
    const result = await runJorisCommand(OPPORTUNITY_MESSAGE);
    assert.ok(result.summary.includes("Aucune action exécutée"));
  });

  await t.test("response includes planning-only / not execution wording", async () => {
    const result = await runJorisCommand(OPPORTUNITY_MESSAGE);
    assert.ok(
      result.summary.includes("approve_to_plan") && result.summary.includes("planning only"),
      "must keep approve_to_plan planning-only / not-execution wording",
    );
  });

  await t.test("response lists allowed autonomous internal work", async () => {
    const result = await runJorisCommand(OPPORTUNITY_MESSAGE);
    assert.ok(result.summary.includes("Allowed Autonomous Internal Work"));
    assert.ok(result.summary.includes("research"), "an allowed autonomous action must appear");
  });

  await t.test("response lists approval-required actions", async () => {
    const result = await runJorisCommand(OPPORTUNITY_MESSAGE);
    assert.ok(result.summary.includes("Actions Requiring Approval"));
    assert.ok(result.summary.includes("publish"), "an approval-required action must appear");
  });

  await t.test("response lists blocked actions", async () => {
    const result = await runJorisCommand(OPPORTUNITY_MESSAGE);
    assert.ok(result.summary.includes("Blocked Actions"));
    assert.ok(result.summary.includes("runtime_dispatch"), "a blocked action must appear");
  });

  // ---------------------------------------------------------------------------
  // Opportunity path: NO confirmation / execution affordance
  // ---------------------------------------------------------------------------

  await t.test("opportunity response does not require confirmation", async () => {
    const result = await runJorisCommand(OPPORTUNITY_MESSAGE);
    assert.notEqual(result.requiresConfirmation, true);
    assert.equal(result.requiresConfirmation, false);
  });

  await t.test("opportunity response is not a calendar.book and has no pendingDraftId", async () => {
    const result = await runJorisCommand(OPPORTUNITY_MESSAGE);
    assert.notEqual(result.intent, "calendar.book");
    assert.equal(result.pendingDraftId, undefined);
  });

  // ---------------------------------------------------------------------------
  // Approval-like wording inside an opportunity message stays read-only
  // ---------------------------------------------------------------------------

  await t.test("approval-like wording in opportunity message does not trigger confirmation", async () => {
    const result = await runJorisCommand("Approuve cette idée de business autonome");
    assert.equal(result.intent, "opportunity.score");
    assert.notEqual(result.requiresConfirmation, true);
    assert.equal(result.pendingDraftId, undefined);
    assert.ok(result.summary.includes("Governance Bundle"));
    assert.ok(result.summary.includes("Aucune action exécutée"));
  });

  // ---------------------------------------------------------------------------
  // Execution-like wording inside an opportunity message stays read-only
  // ---------------------------------------------------------------------------

  await t.test("execution-like wording in opportunity message does not bypass no-execution preview", async () => {
    const result = await runJorisCommand("Lance un business qui exécute des paiements en IA");
    assert.equal(result.intent, "opportunity.score");
    assert.notEqual(result.requiresConfirmation, true);
    assert.equal(result.pendingDraftId, undefined);
    // The no-execution safety wording must remain visible regardless of the words used.
    assert.ok(result.summary.includes("Aucune action exécutée"));
    assert.ok(result.summary.includes("Blocked Actions"));
  });

  // ---------------------------------------------------------------------------
  // Normal calendar booking flow remains intact
  // ---------------------------------------------------------------------------

  await t.test("calendar booking proposal still requires confirmation with a pendingDraftId", async () => {
    const result = await runJorisCommand("Book RDV demain 10h00");
    assert.equal(result.intent, "mission.draft");
    assert.equal(result.requiresConfirmation, true);
    assert.ok(result.pendingDraftId, "booking proposal must still produce a pendingDraftId");
  });

  await t.test("calendar booking confirm flow still books a calendar event", async () => {
    const proposal = await runJorisCommand("Book RDV demain 14h00 pr127-governance");
    assert.equal(proposal.intent, "mission.draft");
    assert.ok(proposal.pendingDraftId);

    const confirm = await runJorisCommand("confirme");
    assert.equal(confirm.intent, "calendar.book");
    assert.ok(confirm.calendarEvent, "confirm must still produce a calendar event");
    assert.equal(confirm.storageMode, "local", "confirm must stay in local mode (no Supabase write)");
  });
});
