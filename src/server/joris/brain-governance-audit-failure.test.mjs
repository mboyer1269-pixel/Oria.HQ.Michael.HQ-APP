#!/usr/bin/env node

// src/server/joris/brain-governance-audit-failure.test.mjs
//
// V7 Phase 0 — a governance decision whose audit record fails to persist must
// stay VISIBLE. The decision itself still stands (a persistence failure must not
// break the read-only governance response), but the reviewer is told that no
// durable trace exists.
//
// Regression guard for the pre-fix behaviour: the failure was swallowed by a
// try/catch with only a server-side logger.warn, so the CEO saw a normal
// decision response while nothing was recorded. An audit trail that fails
// invisibly is worse than no audit trail, because it still looks like one.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

delete process.env.MICHAEL_HQ_OWNER_ID;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

test("Joris governance audit-failure surfacing (V7 Phase 0)", async (t) => {
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
  const { getPendingGovernanceBundle, resetGovernanceSessionForTests } = govSessionMod;
  const repoMod = await jiti.import("@/server/joris/governance-decision-repository");
  const { __clearGovernanceDecisionsForTests } = repoMod;
  const draftSessionMod = await jiti.import("@/server/missions/mission-draft-session");
  const { resetMissionDraftSessionForTests } = draftSessionMod;

  const wsMod = await jiti.import(path.join(projectRoot, "src/core/workspace-context.ts"));
  const { getActiveWorkspaceContext } = wsMod;
  const ctx = getActiveWorkspaceContext();
  const WS = ctx.workspace.id;
  const run = (message) => runJorisCommand(message, ctx);

  const OPPORTUNITY_MESSAGE = "Trouve-moi une idée de business autonome avec IA";

  /** Stands in for the live failure mode: the table is absent, so insert errors. */
  function installFailingPersistence() {
    globalThis.__governanceDecisionRepositoryClientFactory = () => ({
      from: () => ({
        insert: async () => ({
          error: { message: 'relation "public.governance_decisions" does not exist' },
        }),
      }),
    });
  }

  function clearPersistenceOverride() {
    globalThis.__governanceDecisionRepositoryClientFactory = null;
  }

  t.beforeEach(() => {
    resetGovernanceSessionForTests();
    resetMissionDraftSessionForTests();
    __clearGovernanceDecisionsForTests();
    clearPersistenceOverride();
  });

  t.after(() => {
    clearPersistenceOverride();
  });

  async function preview() {
    await run(OPPORTUNITY_MESSAGE);
    const pending = getPendingGovernanceBundle(WS, ctx.userId);
    assert.ok(pending, "preview must store a pending bundle");
    return pending.bundle.workOrder.id;
  }

  await t.test("a failed audit write is surfaced to the reviewer", async () => {
    await preview();
    installFailingPersistence();

    const result = await run("Approuve pour le plan");

    assert.match(
      result.summary,
      /Trace d'audit manquante/,
      "the reviewer must be told the decision has no durable trace",
    );
  });

  await t.test("the decision itself still stands when the audit write fails", async () => {
    await preview();
    installFailingPersistence();

    const result = await run("Approuve pour le plan");

    // The response must not be broken by an audit-persistence failure.
    assert.equal(result.intent, "opportunity.score");
    assert.equal(result.requiresConfirmation, false);
    assert.ok(
      result.summary.includes("Aucune action exécutée"),
      "the read-only governance response is preserved",
    );
  });

  await t.test("the notice is absent when the audit write succeeds", async () => {
    await preview();

    // No override installed — the in-memory local fallback persists normally.
    const result = await run("Approuve pour le plan");

    assert.doesNotMatch(
      result.summary,
      /Trace d'audit manquante/,
      "a successful audit write must not warn",
    );
  });

  await t.test("a rejected decision also surfaces a failed audit write", async () => {
    await preview();
    installFailingPersistence();

    const result = await run("Non, rejette cette idée");

    assert.match(result.summary, /Trace d'audit manquante/);
  });
});
