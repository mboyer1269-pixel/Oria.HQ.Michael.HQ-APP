#!/usr/bin/env node

// src/server/joris/brain-governance-continuity.test.mjs
//
// PR129 — verifies that the opportunity.score path stores the preview-state
// Governance Bundle in the in-memory session store (turn-to-turn continuity),
// while leaving the response shape unchanged and storing nothing for
// non-opportunity messages.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

// Defensive: force LOCAL persistence so any booking path stays in-memory.
delete process.env.MICHAEL_HQ_OWNER_ID;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

test("Joris Governance Continuity (PR129) tests", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const brainMod = await jiti.import(path.join(__dirname, "brain.ts"));
  const { runJorisCommand } = brainMod;

  // Import the store via the SAME alias specifier brain uses, so the test and
  // brain share one in-memory instance (jiti caches by specifier string).
  const sessionMod = await jiti.import("@/server/joris/governance-bundle-session");
  const { getPendingGovernanceBundle, resetGovernanceSessionForTests } = sessionMod;

  const wsMod = await jiti.import(path.join(projectRoot, "src/core/workspace-context.ts"));
  const { getActiveWorkspaceContext } = wsMod;
  // Use one explicit context for every command so the store key (workspace,user)
  // matches exactly between what brain writes and what the test reads.
  const ctx = getActiveWorkspaceContext();
  const WS = ctx.workspace.id;
  const USER = ctx.userId;
  const run = (message) => runJorisCommand(message, ctx);

  const OPPORTUNITY_MESSAGE = "Trouve-moi une idée de business autonome avec IA";

  t.beforeEach(() => resetGovernanceSessionForTests());

  await t.test("opportunity command stores a preview-state governance bundle", async () => {
    assert.equal(getPendingGovernanceBundle(WS, USER), undefined, "no bundle before");

    const result = await run(OPPORTUNITY_MESSAGE);
    assert.equal(result.intent, "opportunity.score");

    const pending = getPendingGovernanceBundle(WS, USER);
    assert.ok(pending, "a governance bundle must be stored after an opportunity command");
    assert.equal(pending.bundle.status, "preview");
    assert.equal(pending.bundle.humanOnTheLoop, true);
    assert.equal(pending.bundle.noExecutionAuthorized, true);
    assert.equal(pending.bundle.reviewSession.status, "previewed");
  });

  await t.test("stored bundle's workOrderId is consistent across artifacts", async () => {
    await run(OPPORTUNITY_MESSAGE);
    const pending = getPendingGovernanceBundle(WS, USER);
    const wid = pending.bundle.workOrder.id;
    assert.equal(pending.bundle.autonomyEnvelope.workOrderId, wid);
    assert.equal(pending.bundle.reviewSession.workOrderId, wid);
    assert.equal(pending.bundleId, pending.bundle.id);
  });

  await t.test("opportunity response shape is unchanged (no confirmation, no draft)", async () => {
    const result = await run(OPPORTUNITY_MESSAGE);
    assert.equal(result.intent, "opportunity.score");
    assert.equal(result.requiresConfirmation, false);
    assert.equal(result.pendingDraftId, undefined);
    assert.ok(result.summary.includes("Governance Bundle"));
    assert.ok(result.summary.includes("Aucune action exécutée"));
  });

  await t.test("a second opportunity command replaces the stored bundle", async () => {
    await run(OPPORTUNITY_MESSAGE);
    const first = getPendingGovernanceBundle(WS, USER).bundle.id;
    await run("Prépare une autre opportunité de revenu pour Orya");
    const second = getPendingGovernanceBundle(WS, USER).bundle.id;
    assert.notEqual(first, second, "the latest preview must replace the previous one");
  });

  await t.test("a non-opportunity chat message stores no governance bundle", async () => {
    const result = await run("Salut, comment ça va aujourd'hui ?");
    assert.notEqual(result.intent, "opportunity.score");
    assert.equal(
      getPendingGovernanceBundle(WS, USER),
      undefined,
      "non-opportunity messages must not store a governance bundle",
    );
  });

  await t.test("a calendar booking proposal stores no governance bundle", async () => {
    const result = await run("Book RDV demain 10h00");
    assert.equal(result.intent, "mission.draft");
    assert.equal(
      getPendingGovernanceBundle(WS, USER),
      undefined,
      "booking proposals must not store a governance bundle",
    );
  });
});
