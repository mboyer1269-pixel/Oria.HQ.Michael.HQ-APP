#!/usr/bin/env node

// src/server/joris/brain-governance-decision-continuity.test.mjs
//
// PR134 — verifies the READ side of the governance audit trail in Joris.
// After a CEO review records a decision, the next preview surfaces a read-only
// continuity note. The first preview (no history) shows none. The response
// stays read-only with no confirmation and no execution.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

delete process.env.MICHAEL_HQ_OWNER_ID;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

test("Joris governance decision continuity wiring (PR134)", async (t) => {
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

  await t.test("the first preview has no continuity note", async () => {
    const result = await run(OPPORTUNITY_MESSAGE);
    assert.ok(!result.summary.includes("Continuité gouvernance"));
  });

  await t.test("a later preview surfaces prior decisions as a continuity note", async () => {
    await run(OPPORTUNITY_MESSAGE);
    await run("Approuve pour le plan");

    const result = await run(OPPORTUNITY_MESSAGE);
    assert.ok(result.summary.includes("Continuité gouvernance"));
    assert.ok(result.summary.includes("approuvé pour planification"));
    assert.ok(result.summary.includes("n'autorisent aucune exécution"));
  });

  await t.test("the continuity note never makes the preview executable", async () => {
    await run(OPPORTUNITY_MESSAGE);
    await run("Non, rejette cette idée");

    const result = await run(OPPORTUNITY_MESSAGE);
    assert.equal(result.intent, "opportunity.score");
    assert.equal(result.requiresConfirmation, false);
    assert.equal(result.pendingDraftId, undefined);
    assert.ok(result.summary.includes("Continuité gouvernance"));
    assert.ok(result.summary.includes("rejeté"));
  });
});
