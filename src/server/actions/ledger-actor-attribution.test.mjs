#!/usr/bin/env node

// src/server/actions/ledger-actor-attribution.test.mjs
//
// V7 Phase 0 — the ledger must be able to answer "who acted" and "who
// authorized", separately.
//
// Before this, a ledger row carried `agentId` (on whose behalf) but no record of
// the acting or approving identity. On the CEO-approval corridors that meant the
// audit trail could not name who clicked approve — tolerable while one human
// exists, a real gap the moment runs become autonomous or a second user appears.
//
// `actorId` and `approverId` ride in the existing payload/metadata jsonb — the
// same no-migration pattern already used for mission fields.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

process.env.NODE_ENV = "development";
delete process.env.MICHAEL_HQ_OWNER_ID;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
  },
});

const ledgerPath = path.join(projectRoot, "src/server/actions/ledger-events.ts");
const { LedgerEventValidationError, recordLedgerEvent, validateLedgerEventPayload } =
  await jiti.import(ledgerPath);

const workspace = {
  id: "workspace_test",
  slug: "workspace-test",
  displayName: "Workspace Test",
  ownerUserId: "owner_test",
  modes: [{ id: "hq", label: "HQ" }],
  defaultAssistantId: "joris",
};

const ctx = {
  activeWorkspace: workspace,
  activeMode: workspace.modes[0],
  activeAgentProfile: {
    id: "joris",
    workspaceId: workspace.id,
    name: "Joris",
    runtimeId: "local-runtime",
    allowedTools: [],
  },
  currentOwnerUser: { id: "owner_test" },
  workspace,
  userId: "owner_test",
  storagePreference: "local",
};

function baseEvent(overrides = {}) {
  return {
    eventType: "action",
    actionType: "test.action",
    summary: "Test action for attribution.",
    autonomyLevel: 2,
    requiresConfirmation: false,
    workspaceId: workspace.id,
    effect: { kind: "external_call", operation: "execute", target: "n8n_webhook" },
    ...overrides,
  };
}

test("Ledger actor/approver attribution (V7 Phase 0)", async (t) => {
  await t.test("actorId and approverId reach both payload and metadata", async () => {
    const entry = await recordLedgerEvent(
      ctx,
      baseEvent({ actorId: "user_ceo", approverId: "user_ceo" }),
    );

    assert.equal(entry.payload.actorId, "user_ceo", "payload carries the acting identity");
    assert.equal(entry.payload.approverId, "user_ceo", "payload carries the approving identity");
    assert.equal(entry.metadata.actorId, "user_ceo", "metadata is queryable for the actor");
    assert.equal(entry.metadata.approverId, "user_ceo");
  });

  await t.test("an autonomous run can be attributed without any approver", async () => {
    // The case the field exists for: no human in the loop, but the action is
    // still attributable.
    const entry = await recordLedgerEvent(ctx, baseEvent({ actorId: "agent_relay" }));

    assert.equal(entry.payload.actorId, "agent_relay");
    assert.equal(
      entry.payload.approverId,
      undefined,
      "no approver is recorded when no gate ran",
    );
    assert.equal(entry.metadata.approverId, undefined);
  });

  await t.test("both fields stay optional — existing callers are unaffected", async () => {
    const entry = await recordLedgerEvent(ctx, baseEvent());

    assert.equal(entry.payload.actorId, undefined);
    assert.equal(entry.payload.approverId, undefined);
    assert.equal(entry.actionType, "test.action", "the rest of the row is unchanged");
  });

  await t.test("a blank identity is rejected, not silently stored", () => {
    // A blank string looks like an attribution while carrying none — worse than
    // an absent field, because a reader would trust it.
    for (const blank of ["", "   "]) {
      assert.throws(
        () => validateLedgerEventPayload(baseEvent({ actorId: blank })),
        LedgerEventValidationError,
        `actorId ${JSON.stringify(blank)} must be rejected`,
      );
      assert.throws(
        () => validateLedgerEventPayload(baseEvent({ approverId: blank })),
        LedgerEventValidationError,
        `approverId ${JSON.stringify(blank)} must be rejected`,
      );
    }
  });

  await t.test("a non-string identity is rejected", () => {
    assert.throws(
      () => validateLedgerEventPayload(baseEvent({ actorId: 42 })),
      LedgerEventValidationError,
    );
  });
});
