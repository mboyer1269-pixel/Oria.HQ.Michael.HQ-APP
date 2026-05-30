#!/usr/bin/env node

// src/server/joris/brain-governance-apply.test.mjs
//
// PR130 — Review → Session dry-run applicator wiring.
//
// Verifies that, once an opportunity preview has stored a pending Governance
// Bundle, a follow-up CEO review message advances the bundle's review session
// (dry-run, read-only). Booking precedence, ambiguity passthrough, and the
// no-execution invariants are all asserted.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

// Defensive: force LOCAL persistence so any booking path stays in-memory.
delete process.env.MICHAEL_HQ_OWNER_ID;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

test("Joris Governance Review Application (PR130) tests", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const brainMod = await jiti.import(path.join(__dirname, "brain.ts"));
  const { runJorisCommand } = brainMod;

  // Import shared stateful stores via the SAME alias specifiers brain uses, so
  // the test and brain share one in-memory instance (jiti caches by specifier).
  const govSessionMod = await jiti.import("@/server/joris/governance-bundle-session");
  const { getPendingGovernanceBundle, resetGovernanceSessionForTests } = govSessionMod;
  const draftSessionMod = await jiti.import("@/server/missions/mission-draft-session");
  const { resetMissionDraftSessionForTests } = draftSessionMod;

  const wsMod = await jiti.import(path.join(projectRoot, "src/core/workspace-context.ts"));
  const { getActiveWorkspaceContext } = wsMod;
  const ctx = getActiveWorkspaceContext();
  const WS = ctx.workspace.id;
  const USER = ctx.userId;
  const run = (message) => runJorisCommand(message, ctx);

  const OPPORTUNITY_MESSAGE = "Trouve-moi une idée de business autonome avec IA";

  t.beforeEach(() => {
    resetGovernanceSessionForTests();
    resetMissionDraftSessionForTests();
  });

  async function preview() {
    const r = await run(OPPORTUNITY_MESSAGE);
    assert.equal(r.intent, "opportunity.score");
    assert.ok(getPendingGovernanceBundle(WS, USER), "preview must store a pending bundle");
  }

  // ---------------------------------------------------------------------------
  // approve_to_plan
  // ---------------------------------------------------------------------------

  await t.test("approve message advances the pending bundle to approved_to_plan (dry-run)", async () => {
    await preview();
    const result = await run("Approuve pour le plan");

    assert.equal(result.intent, "opportunity.score");
    assert.equal(result.requiresConfirmation, false);
    assert.equal(result.pendingDraftId, undefined);
    assert.ok(
      result.summary.includes("approuvé pour planification") ||
        result.summary.includes("Approved to Plan"),
      "summary must reflect approve_to_plan",
    );
    // Decision closes the loop.
    assert.equal(getPendingGovernanceBundle(WS, USER), undefined, "pending bundle must be cleared");
  });

  await t.test("approve does not authorize execution and keeps planning-only wording", async () => {
    await preview();
    const result = await run("Approuve pour le plan");
    assert.ok(result.summary.includes("Aucune action exécutée"));
    assert.ok(
      result.summary.includes("approve_to_plan") && result.summary.includes("planning only"),
    );
  });

  // ---------------------------------------------------------------------------
  // request_changes / reject / ask_for_more_info
  // ---------------------------------------------------------------------------

  await t.test("change request advances the bundle to changes_requested", async () => {
    await preview();
    const result = await run("Modifie le budget stp");
    assert.equal(result.intent, "opportunity.score");
    assert.equal(result.requiresConfirmation, false);
    assert.ok(
      result.summary.includes("modifications") || result.summary.includes("Changes Requested"),
    );
    assert.equal(getPendingGovernanceBundle(WS, USER), undefined);
  });

  await t.test("reject message advances the bundle to rejected", async () => {
    await preview();
    const result = await run("Non, rejette cette idée");
    assert.equal(result.intent, "opportunity.score");
    assert.equal(result.requiresConfirmation, false);
    assert.ok(result.summary.includes("rejeté") || result.summary.includes("Rejected"));
    assert.equal(getPendingGovernanceBundle(WS, USER), undefined);
  });

  await t.test("more-info message advances the bundle to more_info_requested", async () => {
    await preview();
    const result = await run("Pourquoi ce budget ? Explique.");
    assert.equal(result.intent, "opportunity.score");
    assert.equal(result.requiresConfirmation, false);
    assert.ok(
      result.summary.includes("informations supplémentaires") ||
        result.summary.includes("More Info Requested"),
    );
    assert.equal(getPendingGovernanceBundle(WS, USER), undefined);
  });

  // ---------------------------------------------------------------------------
  // blocked_execution_request
  // ---------------------------------------------------------------------------

  await t.test("execution language blocks and moves to blocked_execution_request", async () => {
    await preview();
    const result = await run("Déploie maintenant !");
    assert.equal(result.intent, "opportunity.score");
    assert.equal(result.requiresConfirmation, false);
    assert.equal(result.pendingDraftId, undefined);
    assert.ok(
      result.summary.includes("bloquée") || result.summary.toLowerCase().includes("block"),
      "summary must reflect the execution block",
    );
    assert.ok(result.summary.includes("Aucune action exécutée"));
    assert.equal(getPendingGovernanceBundle(WS, USER), undefined);
  });

  // ---------------------------------------------------------------------------
  // ambiguity passthrough (does not consume the pending bundle)
  // ---------------------------------------------------------------------------

  await t.test("an unrelated/ambiguous message does not consume the pending bundle", async () => {
    await preview();
    const result = await run("Raconte-moi une blague sur les licornes");
    // Falls through to normal routing — not a governance application.
    assert.notEqual(result.intent, "calendar.book");
    assert.ok(
      getPendingGovernanceBundle(WS, USER),
      "ambiguous message must leave the pending bundle intact",
    );
  });

  await t.test("a brand-new opportunity message re-previews instead of applying a review", async () => {
    await preview();
    const firstId = getPendingGovernanceBundle(WS, USER).bundle.id;
    const result = await run("Prépare une autre opportunité de revenu pour Orya");
    assert.equal(result.intent, "opportunity.score");
    const secondId = getPendingGovernanceBundle(WS, USER).bundle.id;
    assert.notEqual(firstId, secondId, "a new opportunity must replace the pending preview");
  });

  // ---------------------------------------------------------------------------
  // No pending bundle → handler is inert
  // ---------------------------------------------------------------------------

  await t.test("a review verb with no pending bundle does not produce a governance result", async () => {
    const result = await run("Approuve pour le plan");
    // No pending bundle → normal routing; not a governance application summary.
    assert.ok(
      !result.summary.includes("Revue appliquée") && !result.summary.includes("Governance Bundle"),
      "without a pending bundle, no governance application should occur",
    );
  });

  // ---------------------------------------------------------------------------
  // Booking precedence
  // ---------------------------------------------------------------------------

  await t.test("booking takes precedence: confirm books even with a pending governance bundle", async () => {
    await preview();
    // Propose a booking; the governance bundle stays pending.
    const proposal = await run("Book RDV demain 10h00");
    assert.equal(proposal.intent, "mission.draft");
    assert.ok(getPendingGovernanceBundle(WS, USER), "governance bundle remains pending");

    // "confirme" must route to the booking confirm path, not governance.
    const confirm = await run("confirme");
    assert.equal(confirm.intent, "calendar.book");
    assert.ok(confirm.calendarEvent, "confirm must book a calendar event");
    assert.equal(confirm.storageMode, "local");
    // Governance bundle untouched by the booking confirm.
    assert.ok(getPendingGovernanceBundle(WS, USER), "governance bundle must remain pending");
  });

  // ---------------------------------------------------------------------------
  // Calendar booking proposal still works when a governance bundle is pending
  // ---------------------------------------------------------------------------

  await t.test("booking proposal still works while a governance bundle is pending", async () => {
    await preview();
    const result = await run("Book RDV demain 14h00");
    assert.equal(result.intent, "mission.draft");
    assert.equal(result.requiresConfirmation, true);
    assert.ok(result.pendingDraftId);
  });
});
