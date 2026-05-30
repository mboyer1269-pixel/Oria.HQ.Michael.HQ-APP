#!/usr/bin/env node

// src/server/joris/brain-governance-decision-record.test.mjs
//
// PR132 — verifies that applying a CEO review in Joris persists an auditable
// governance decision record (best-effort, dry-run). Ambiguous messages record
// nothing; the response stays read-only with no execution.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

delete process.env.MICHAEL_HQ_OWNER_ID;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

test("Joris Governance Decision Record wiring (PR132) tests", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const brainMod = await jiti.import(path.join(__dirname, "brain.ts"));
  const { runJorisCommand } = brainMod;

  // Shared stateful stores via the SAME alias specifiers brain uses.
  const govSessionMod = await jiti.import("@/server/joris/governance-bundle-session");
  const { getPendingGovernanceBundle, resetGovernanceSessionForTests } = govSessionMod;
  const repoMod = await jiti.import("@/server/joris/governance-decision-repository");
  const {
    getGovernanceDecisionsForWorkOrder,
    getGovernanceDecisionsForWorkspace,
    __clearGovernanceDecisionsForTests,
  } = repoMod;
  const draftSessionMod = await jiti.import("@/server/missions/mission-draft-session");
  const { resetMissionDraftSessionForTests } = draftSessionMod;

  const wsMod = await jiti.import(path.join(projectRoot, "src/core/workspace-context.ts"));
  const { getActiveWorkspaceContext } = wsMod;
  const ctx = getActiveWorkspaceContext();
  const WS = ctx.workspace.id;
  const run = (message) => runJorisCommand(message, ctx);

  const OPPORTUNITY_MESSAGE = "Trouve-moi une idée de business autonome avec IA";

  t.beforeEach(() => {
    resetGovernanceSessionForTests();
    resetMissionDraftSessionForTests();
    __clearGovernanceDecisionsForTests();
  });

  async function previewAndGetWorkOrderId() {
    await run(OPPORTUNITY_MESSAGE);
    const pending = getPendingGovernanceBundle(WS, ctx.userId);
    assert.ok(pending, "preview must store a pending bundle");
    return pending.bundle.workOrder.id;
  }

  await t.test("approve records an approved_to_plan decision", async () => {
    const woId = await previewAndGetWorkOrderId();
    await run("Approuve pour le plan");

    const decisions = getGovernanceDecisionsForWorkOrder(WS, woId);
    assert.equal(decisions.length, 1);
    assert.equal(decisions[0].outcome, "approved_to_plan");
    assert.equal(decisions[0].workOrderId, woId);
    assert.equal(decisions[0].humanOnTheLoop, true);
    assert.equal(decisions[0].noExecutionAuthorized, true);
  });

  await t.test("reject records a rejected decision", async () => {
    const woId = await previewAndGetWorkOrderId();
    await run("Non, rejette cette idée");
    const decisions = getGovernanceDecisionsForWorkOrder(WS, woId);
    assert.equal(decisions.length, 1);
    assert.equal(decisions[0].outcome, "rejected");
  });

  await t.test("execution language records a blocked_execution_request decision", async () => {
    const woId = await previewAndGetWorkOrderId();
    await run("Déploie maintenant !");
    const decisions = getGovernanceDecisionsForWorkOrder(WS, woId);
    assert.equal(decisions.length, 1);
    assert.equal(decisions[0].outcome, "blocked_execution_request");
    assert.equal(decisions[0].reviewId, undefined, "no review backs a blocked decision");
  });

  await t.test("an ambiguous message records no decision", async () => {
    await previewAndGetWorkOrderId();
    await run("Raconte-moi une blague sur les licornes");
    assert.equal(
      getGovernanceDecisionsForWorkspace(WS).length,
      0,
      "ambiguous messages must not record a decision",
    );
  });

  await t.test("a review verb with no pending bundle records no decision", async () => {
    await run("Approuve pour le plan");
    assert.equal(getGovernanceDecisionsForWorkspace(WS).length, 0);
  });

  await t.test("each preview→decision cycle appends a new audit record", async () => {
    const wo1 = await previewAndGetWorkOrderId();
    await run("Approuve pour le plan");
    const wo2 = await previewAndGetWorkOrderId();
    await run("Non, rejette cette idée");

    const all = getGovernanceDecisionsForWorkspace(WS);
    assert.equal(all.length, 2);
    // Most-recent first.
    assert.equal(all[0].outcome, "rejected");
    assert.equal(all[0].workOrderId, wo2);
    assert.equal(all[1].outcome, "approved_to_plan");
    assert.equal(all[1].workOrderId, wo1);
  });

  await t.test("the governance response is unchanged: read-only, no confirmation", async () => {
    await previewAndGetWorkOrderId();
    const result = await run("Approuve pour le plan");
    assert.equal(result.intent, "opportunity.score");
    assert.equal(result.requiresConfirmation, false);
    assert.equal(result.pendingDraftId, undefined);
    assert.ok(result.summary.includes("Aucune action exécutée"));
  });
});
