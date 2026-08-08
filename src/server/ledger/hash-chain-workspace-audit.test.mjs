#!/usr/bin/env node
/**
 * hash-chain-workspace-audit.test.mjs — cockpit audit projection.
 */

import assert from "node:assert/strict";
import test from "node:test";

const { auditWorkspaceLedgerChain } = await import("./hash-chain-workspace-audit.ts");
const { sealLiveLedgerAppend, toCanonicalLedgerFields } = await import(
  "./hash-chain-live-write.ts"
);

const HMAC = "workspace-audit-test-key";

function sealedEntry(overrides = {}) {
  const identity = {
    id: overrides.id ?? "led_1",
    createdAt: overrides.createdAt ?? "2026-08-08T12:00:00.000Z",
  };
  const base = {
    identity,
    workspaceId: "ws",
    userId: "user",
    actionType: overrides.actionType ?? "test.action",
    summary: overrides.summary ?? "entry",
    autonomyLevel: 1,
    requiresConfirmation: false,
    payload: {},
    metadata: {},
    tail: overrides.tail ?? null,
    hmacKey: HMAC,
  };
  const cols = sealLiveLedgerAppend(base);
  const canonical = toCanonicalLedgerFields(base);
  return {
    id: canonical.id,
    userId: canonical.user_id,
    actionType: canonical.action_type,
    summary: canonical.summary,
    autonomyLevel: canonical.autonomy_level,
    requiresConfirmation: canonical.requires_confirmation,
    payload: canonical.payload,
    metadata: canonical.metadata,
    createdAt: canonical.created_at,
    workspaceId: "ws",
    storageMode: "local",
    prevHash: cols.prev_hash,
    entryHash: cols.entry_hash,
    hmac: cols.hmac,
    canonicalVersion: cols.canonical_version,
  };
}

test("empty workspace → no report, dormant write flag", () => {
  const audit = auditWorkspaceLedgerChain([], {
    LEDGER_HASH_CHAIN_WRITE: "0",
  });
  assert.equal(audit.writeEnabled, false);
  assert.equal(audit.sealedCount, 0);
  assert.equal(audit.report, null);
});

test("sealed chain verifies intact with hmac when key present", () => {
  const a = sealedEntry({ id: "a", createdAt: "2026-08-08T12:00:00.000Z", summary: "a" });
  const b = sealedEntry({
    id: "b",
    createdAt: "2026-08-08T12:00:01.000Z",
    summary: "b",
    tail: {
      id: a.id,
      workspace_id: "ws",
      user_id: a.userId,
      agent_id: null,
      skill_id: null,
      mission_id: null,
      action_type: a.actionType,
      event_type: null,
      summary: a.summary,
      autonomy_level: a.autonomyLevel,
      requires_confirmation: a.requiresConfirmation,
      payload: a.payload,
      metadata: a.metadata,
      created_at: a.createdAt,
      prev_hash: a.prevHash ?? null,
      entry_hash: a.entryHash,
      hmac: a.hmac,
      canonical_version: a.canonicalVersion,
    },
  });

  // Pass newest-first to prove the auditor re-sorts.
  const audit = auditWorkspaceLedgerChain([b, a], {
    LEDGER_HASH_CHAIN_WRITE: "1",
    LEDGER_HMAC_KEY: HMAC,
  });

  assert.equal(audit.writeEnabled, true);
  assert.equal(audit.hmacConfigured, true);
  assert.equal(audit.sealedCount, 2);
  assert.ok(audit.report);
  assert.equal(audit.report.ok, true);
  assert.equal(audit.tipPreview[0].id, "b");
});

test("unsealed rows are ignored in the chain count", () => {
  const sealed = sealedEntry();
  const plain = {
    id: "plain",
    userId: "user",
    actionType: "x",
    summary: "no seal",
    autonomyLevel: 1,
    requiresConfirmation: false,
    payload: {},
    metadata: {},
    createdAt: "2026-08-08T13:00:00.000Z",
    storageMode: "local",
  };

  const audit = auditWorkspaceLedgerChain([plain, sealed], {
    LEDGER_HASH_CHAIN_WRITE: "1",
    LEDGER_HMAC_KEY: HMAC,
  });
  assert.equal(audit.totalCount, 2);
  assert.equal(audit.sealedCount, 1);
  assert.equal(audit.report?.ok, true);
});
