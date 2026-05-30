#!/usr/bin/env node

// src/server/joris/brain-governance-plan.test.mjs
//
// PR133 — verifies that an approved_to_plan governance decision appends a
// self-contained DRY-RUN planning representation to Joris's response, while
// other outcomes do not, and the response stays read-only (no execution).

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

delete process.env.MICHAEL_HQ_OWNER_ID;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

test("Joris Governance Plan wiring (PR133) tests", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const brainMod = await jiti.import(path.join(__dirname, "brain.ts"));
  const { runJorisCommand } = brainMod;

  const govSessionMod = await jiti.import("@/server/joris/governance-bundle-session");
  const { resetGovernanceSessionForTests } = govSessionMod;
  const repoMod = await jiti.import("@/server/joris/governance-decision-repository");
  const { __clearGovernanceDecisionsForTests } = repoMod;
  const draftSessionMod = await jiti.import("@/server/missions/mission-draft-session");
  const { resetMissionDraftSessionForTests } = draftSessionMod;

  const wsMod = await jiti.import(path.join(projectRoot, "src/core/workspace-context.ts"));
  const { getActiveWorkspaceContext } = wsMod;
  const ctx = getActiveWorkspaceContext();
  const run = (message) => runJorisCommand(message, ctx);

  const OPPORTUNITY_MESSAGE = "Trouve-moi une idée de business autonome avec IA";

  t.beforeEach(() => {
    resetGovernanceSessionForTests();
    resetMissionDraftSessionForTests();
    __clearGovernanceDecisionsForTests();
  });

  await t.test("approve appends the dry-run planning representation", async () => {
    await run(OPPORTUNITY_MESSAGE);
    const result = await run("Approuve pour le plan");

    assert.equal(result.intent, "opportunity.score");
    assert.equal(result.requiresConfirmation, false);
    assert.equal(result.pendingDraftId, undefined);
    assert.ok(
      result.summary.includes("Plan de planification (dry-run)"),
      "approved response must include the dry-run plan",
    );
    assert.ok(result.summary.includes("Étapes internes planifiées"));
  });

  await t.test("approved plan stays planning-only with no-execution wording", async () => {
    await run(OPPORTUNITY_MESSAGE);
    const result = await run("Approuve pour le plan");
    assert.ok(result.summary.includes("Aucune action exécutée"));
    assert.ok(
      result.summary.includes("approve_to_plan") &&
        result.summary.includes("planification uniquement"),
    );
  });

  await t.test("reject does NOT append a planning representation", async () => {
    await run(OPPORTUNITY_MESSAGE);
    const result = await run("Non, rejette cette idée");
    assert.ok(!result.summary.includes("Plan de planification (dry-run)"));
  });

  await t.test("changes request does NOT append a planning representation", async () => {
    await run(OPPORTUNITY_MESSAGE);
    const result = await run("Modifie le budget stp");
    assert.ok(!result.summary.includes("Plan de planification (dry-run)"));
  });

  await t.test("blocked execution request does NOT append a planning representation", async () => {
    await run(OPPORTUNITY_MESSAGE);
    const result = await run("Déploie maintenant !");
    assert.ok(!result.summary.includes("Plan de planification (dry-run)"));
    assert.ok(result.summary.includes("Aucune action exécutée"));
  });

  await t.test("booking flow is unaffected by the plan wiring", async () => {
    const proposal = await run("Book RDV demain 9h00");
    assert.equal(proposal.intent, "mission.draft");
    assert.equal(proposal.requiresConfirmation, true);
    assert.ok(proposal.pendingDraftId);

    const confirm = await run("confirme");
    assert.equal(confirm.intent, "calendar.book");
    assert.ok(confirm.calendarEvent);
    assert.equal(confirm.storageMode, "local");
  });
});
