#!/usr/bin/env node

// Locks the action-ledger metadata traceability invariants.
//
// These tests pin the audit-metadata shaping used when action ledger records
// are created. They fail loudly if traceability weakens: assistantProfileId
// fallback, explicit override precedence, undefined-key cleanup, missionId
// precedence, layered metadata merge order, and recorded/failed status mapping.
//
// Pure exports (toWorkspaceLedgerMetadata, withWorkspaceActionMetadata,
// toActionLedgerStatus) are exercised directly. The non-exported buildMetadata
// is exercised through its only public surface: createActionLedgerRepository's
// local record() path, which returns entry.metadata = buildMetadata(input).
//
// Test-only. Local persistence mode. No Supabase, no production calls, no
// runtime dispatch, no ledger writes beyond the in-memory local array.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

const originalNodeEnv = process.env.NODE_ENV;
const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalSupabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function clearSupabaseAdminEnv() {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
}

async function importRepository() {
  // Local-fallback mode requires a non-production NODE_ENV; clearing Supabase
  // admin env keeps createActionLedgerRepository on the in-memory local path.
  process.env.NODE_ENV = "development";
  clearSupabaseAdminEnv();

  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  return jiti.import(path.join(projectRoot, "src/server/actions/action-ledger-repository.ts"));
}

function baseRecordInput(overrides = {}) {
  return {
    actionType: "calendar.book",
    summary: "Décision test",
    autonomyLevel: 2,
    requiresConfirmation: true,
    ...overrides,
  };
}

test.after(() => {
  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalNodeEnv;
  }

  if (originalSupabaseUrl === undefined) {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  } else {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
  }

  if (originalSupabaseServiceRoleKey === undefined) {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  } else {
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalSupabaseServiceRoleKey;
  }
});

// ---------------------------------------------------------------------------
// toWorkspaceLedgerMetadata — assistantProfileId fallback + undefined cleanup
// ---------------------------------------------------------------------------

test("toWorkspaceLedgerMetadata falls back assistantProfileId to agentId when absent", async () => {
  const { toWorkspaceLedgerMetadata } = await importRepository();

  const metadata = toWorkspaceLedgerMetadata({ agentId: "joris" });

  assert.equal(metadata.agentId, "joris");
  assert.equal(metadata.assistantProfileId, "joris");
});

test("toWorkspaceLedgerMetadata lets explicit assistantProfileId win over agentId", async () => {
  const { toWorkspaceLedgerMetadata } = await importRepository();

  const metadata = toWorkspaceLedgerMetadata({
    agentId: "joris",
    assistantProfileId: "assistant-explicit",
  });

  assert.equal(metadata.agentId, "joris");
  assert.equal(metadata.assistantProfileId, "assistant-explicit");
});

test("toWorkspaceLedgerMetadata drops undefined keys from emitted metadata", async () => {
  const { toWorkspaceLedgerMetadata } = await importRepository();

  const metadata = toWorkspaceLedgerMetadata({ workspaceId: "michael-hq" });

  assert.deepEqual(Object.keys(metadata).sort(), ["workspaceId"]);
  // No agentId means assistantProfileId fallback is undefined and must not leak.
  assert.equal(Object.prototype.hasOwnProperty.call(metadata, "assistantProfileId"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(metadata, "agentId"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(metadata, "missionId"), false);
});

// ---------------------------------------------------------------------------
// withWorkspaceActionMetadata — traceability layer wins, base preserved
// ---------------------------------------------------------------------------

test("withWorkspaceActionMetadata overlays traceability metadata over the base and wins on conflicts", async () => {
  const { withWorkspaceActionMetadata } = await importRepository();

  const merged = withWorkspaceActionMetadata(
    { agentId: "stale-agent", custom: "kept" },
    { agentId: "joris", workspaceId: "michael-hq" },
  );

  // Traceability layer wins on overlapping keys.
  assert.equal(merged.agentId, "joris");
  assert.equal(merged.assistantProfileId, "joris");
  assert.equal(merged.workspaceId, "michael-hq");
  // Non-conflicting base keys survive.
  assert.equal(merged.custom, "kept");
});

test("withWorkspaceActionMetadata treats non-record metadata as an empty base", async () => {
  const { withWorkspaceActionMetadata } = await importRepository();

  for (const notARecord of [undefined, null, ["array"], "string", 42]) {
    const merged = withWorkspaceActionMetadata(notARecord, { agentId: "joris" });
    assert.equal(merged.agentId, "joris");
    assert.equal(merged.assistantProfileId, "joris");
  }
});

// ---------------------------------------------------------------------------
// toActionLedgerStatus — error mapping
// ---------------------------------------------------------------------------

test("toActionLedgerStatus maps truthy error to failed", async () => {
  const { toActionLedgerStatus } = await importRepository();

  assert.equal(toActionLedgerStatus(new Error("boom")), "failed");
  assert.equal(toActionLedgerStatus("some error string"), "failed");
  assert.equal(toActionLedgerStatus({ message: "x" }), "failed");
});

test("toActionLedgerStatus maps absent error to recorded", async () => {
  const { toActionLedgerStatus } = await importRepository();

  assert.equal(toActionLedgerStatus(null), "recorded");
  assert.equal(toActionLedgerStatus(undefined), "recorded");
  assert.equal(toActionLedgerStatus(0), "recorded");
  assert.equal(toActionLedgerStatus(""), "recorded");
});

// ---------------------------------------------------------------------------
// buildMetadata (via public record()) — missionId precedence + merge order
// ---------------------------------------------------------------------------

test("record() lets explicit input.missionId override metadata-derived missionId", async () => {
  const { createActionLedgerRepository } = await importRepository();
  const repository = createActionLedgerRepository({ userId: "owner-test", storagePreference: "local" });

  const entry = await repository.record(
    baseRecordInput({
      agentId: "joris",
      metadata: { missionId: "mission-from-metadata" },
      missionId: "mission-from-input",
    }),
  );

  assert.equal(entry.metadata.missionId, "mission-from-input");
});

test("record() uses metadata missionId when input.missionId is absent", async () => {
  const { createActionLedgerRepository } = await importRepository();
  const repository = createActionLedgerRepository({ userId: "owner-test", storagePreference: "local" });

  const entry = await repository.record(
    baseRecordInput({
      agentId: "joris",
      metadata: { missionId: "mission-from-metadata" },
    }),
  );

  assert.equal(entry.metadata.missionId, "mission-from-metadata");
});

test("record() merges metadata in payload -> input -> traceability order with later layers winning", async () => {
  const { createActionLedgerRepository } = await importRepository();
  const repository = createActionLedgerRepository({ userId: "owner-test", storagePreference: "local" });

  const entry = await repository.record(
    baseRecordInput({
      workspaceId: "michael-hq",
      skillId: "calendar.book",
      agentId: "joris",
      payload: {
        metadata: {
          fromPayloadOnly: "payload",
          overlap: "payload",
          agentId: "payload-agent",
        },
      },
      // input.metadata overrides payload.metadata on overlapping keys.
      metadata: { overlap: "input", modeId: "hq" },
    }),
  );

  // Layer 1: payload.metadata-only keys survive.
  assert.equal(entry.metadata.fromPayloadOnly, "payload");
  // Layer 2: input.metadata wins over payload.metadata.
  assert.equal(entry.metadata.overlap, "input");
  // modeId read from the merged base and re-emitted by the traceability layer.
  assert.equal(entry.metadata.modeId, "hq");
  // Layer 3: traceability fields win over anything in payload/input metadata.
  assert.equal(entry.metadata.agentId, "joris");
  assert.equal(entry.metadata.assistantProfileId, "joris");
  assert.equal(entry.metadata.workspaceId, "michael-hq");
  assert.equal(entry.metadata.skillId, "calendar.book");
});

test("record() derives assistantProfileId from agentId on the real shaping path", async () => {
  const { createActionLedgerRepository } = await importRepository();
  const repository = createActionLedgerRepository({ userId: "owner-test", storagePreference: "local" });

  const entry = await repository.record(
    baseRecordInput({ agentId: "joris", eventType: "decision" }),
  );

  assert.equal(entry.metadata.agentId, "joris");
  assert.equal(entry.metadata.assistantProfileId, "joris");
  assert.equal(entry.metadata.eventType, "decision");
});
