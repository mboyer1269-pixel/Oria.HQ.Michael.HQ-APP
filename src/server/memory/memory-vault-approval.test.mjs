#!/usr/bin/env node
// Tests for the Memory Vault propose -> approve | reject governance path
// (memory-vault-repository.ts). Offline, no network, no Supabase: exercises the
// real module-scoped store through jiti, with the server-only import stubbed.
//
// Covers: propose trust levels, CEO approval promoting proposed -> verified
// (with approvedBy + Joris-injection visibility), rejection demoting to draft,
// workspace scoping, and the proposed-only guard. Each test uses its own
// workspace id so the shared in-process store cannot cross-contaminate.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

async function loadModule() {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });
  return jiti.import(path.join(__dirname, "memory-vault-repository.ts"));
}

const repo = await loadModule();

function proposeFrom(workspaceId, author, overrides = {}) {
  return repo.proposeMemoryVaultEntry({
    workspaceId,
    type: "note",
    title: "Test entry",
    content: "Test content",
    tags: [],
    author,
    ...overrides,
  });
}

test("Memory Vault — propose/approve governance path", async (t) => {
  await t.test("joris proposal lands as 'proposed', not in the verified read", () => {
    const ws = "test-ws-propose-joris";
    const entry = proposeFrom(ws, "joris");

    assert.equal(entry.trustLevel, "proposed");
    assert.equal(entry.approvedBy, undefined);

    const verified = repo.readVerifiedVaultContext(ws);
    assert.equal(verified.entries.length, 0, "proposed entries are never injected");
  });

  await t.test("human proposal is verified directly (unchanged behavior)", () => {
    const ws = "test-ws-propose-human";
    const entry = proposeFrom(ws, "human");

    assert.equal(entry.trustLevel, "verified");

    const verified = repo.readVerifiedVaultContext(ws);
    assert.equal(verified.entries.length, 1);
    assert.equal(verified.entries[0].id, entry.id);
  });

  await t.test("approval promotes proposed -> verified, stamps approvedBy, becomes injectable", () => {
    const ws = "test-ws-approve";
    const proposed = proposeFrom(ws, "agent");
    assert.equal(repo.readVerifiedVaultContext(ws).entries.length, 0);

    const result = repo.approveMemoryVaultEntry({
      entryId: proposed.id,
      workspaceId: ws,
      approvedBy: "ceo-michael",
    });

    assert.equal(result.ok, true);
    assert.equal(result.entry.trustLevel, "verified");
    assert.equal(result.entry.approvedBy, "ceo-michael");

    const verified = repo.readVerifiedVaultContext(ws);
    assert.equal(verified.entries.length, 1, "approved entry is now injected");
    assert.equal(verified.entries[0].id, proposed.id);
  });

  await t.test("rejection demotes proposed -> draft (out of injection, no approvedBy)", () => {
    const ws = "test-ws-reject";
    const proposed = proposeFrom(ws, "agent");

    const result = repo.rejectMemoryVaultEntry({ entryId: proposed.id, workspaceId: ws });

    assert.equal(result.ok, true);
    assert.equal(result.entry.trustLevel, "draft");
    assert.equal(result.entry.approvedBy, undefined);
    assert.equal(repo.readVerifiedVaultContext(ws).entries.length, 0);
    assert.equal(repo.listPendingProposals(ws).length, 0, "rejected entry leaves the queue");
  });

  await t.test("approval is workspace-scoped: another workspace cannot approve it", () => {
    const ownerWs = "test-ws-scope-owner";
    const attackerWs = "test-ws-scope-attacker";
    const proposed = proposeFrom(ownerWs, "agent");

    const result = repo.approveMemoryVaultEntry({
      entryId: proposed.id,
      workspaceId: attackerWs,
      approvedBy: "ceo-michael",
    });

    assert.equal(result.ok, false);
    assert.equal(result.reason, "not_found");
    // The entry in its own workspace is untouched.
    assert.equal(repo.listPendingProposals(ownerWs)[0].id, proposed.id);
  });

  await t.test("approving an unknown id returns not_found", () => {
    const result = repo.approveMemoryVaultEntry({
      entryId: "mem_does_not_exist",
      workspaceId: "test-ws-unknown",
      approvedBy: "ceo-michael",
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "not_found");
  });

  await t.test("approving an already-verified entry returns not_proposed (no silent re-promote)", () => {
    const ws = "test-ws-double-approve";
    const proposed = proposeFrom(ws, "agent");
    repo.approveMemoryVaultEntry({ entryId: proposed.id, workspaceId: ws, approvedBy: "ceo" });

    const second = repo.approveMemoryVaultEntry({
      entryId: proposed.id,
      workspaceId: ws,
      approvedBy: "ceo-2",
    });

    assert.equal(second.ok, false);
    assert.equal(second.reason, "not_proposed");
  });

  await t.test("rejecting a non-proposed entry returns not_proposed", () => {
    const ws = "test-ws-reject-verified";
    const human = proposeFrom(ws, "human"); // verified

    const result = repo.rejectMemoryVaultEntry({ entryId: human.id, workspaceId: ws });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "not_proposed");
  });

  await t.test("listPendingProposals returns only this workspace's proposed entries", () => {
    const ws = "test-ws-queue";
    const other = "test-ws-queue-other";
    const p1 = proposeFrom(ws, "agent", { title: "first" });
    const p2 = proposeFrom(ws, "joris", { title: "second" });
    proposeFrom(other, "agent", { title: "other-ws" });
    proposeFrom(ws, "human", { title: "verified-not-pending" });

    const pending = repo.listPendingProposals(ws);
    const ids = pending.map((e) => e.id).sort();
    assert.deepEqual(ids, [p1.id, p2.id].sort());
    for (const entry of pending) {
      assert.equal(entry.workspaceId, ws);
      assert.equal(entry.trustLevel, "proposed");
    }
  });

  await t.test("approval removes the entry from the pending queue", () => {
    const ws = "test-ws-queue-drain";
    const proposed = proposeFrom(ws, "agent");
    assert.equal(repo.listPendingProposals(ws).length, 1);

    repo.approveMemoryVaultEntry({ entryId: proposed.id, workspaceId: ws, approvedBy: "ceo" });
    assert.equal(repo.listPendingProposals(ws).length, 0);
  });
});
