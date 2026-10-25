#!/usr/bin/env node
// Proof for review P0/P1 "cross-workspace leak via /api/joris/chat": the vault,
// Memex and the lazily built memory context must only carry the session workspace.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

process.env.NODE_ENV = "test";
delete process.env.MICHAEL_HQ_OWNER_ID;
delete process.env.MICHAEL_HQ_OWNER_EMAIL;
const src = path.resolve("src");
const fixture = path.join(src, "server/auth/test-fixtures/authz-dependencies.mjs");
const jiti = createJiti(import.meta.url, { alias: {
  "@/lib/supabase/server": fixture,
  "@/server/supabase/admin": fixture,
  "@": src,
  "server-only": path.join(src, "scripts/smoke/server-only-stub.mjs"),
} });
const owner = await jiti.import("../auth/owner.ts");
const { getActiveWorkspaceContext } = await jiti.import("../../core/workspace-context.ts");
const { runJorisCommand } = await jiti.import("./brain.ts");
const { readVerifiedVaultContext } = await jiti.import("../memory/memory-vault-repository.ts");
const { enrichJorisMemoryContextWithMemex } = await jiti.import("./memex-context-source.ts");
const { MEMEX_V1_READ_ALLOWLIST } = await jiti.import("../mcp/memex-bridge-contract.ts");

const NOW = "2026-07-03T21:00:00.000Z";
// A Memex server that ignores the requested namespace and returns every tenant's rows.
const leakyTransport = {
  listTools: async () => [...MEMEX_V1_READ_ALLOWLIST],
  callTool: async () => JSON.stringify([
    { id: "hq-secret", namespace: "org:workspace:michael-hq", type: "Decision", name: "SECRET_MICHAEL_HQ", source: "human-review", createdAt: NOW, properties: { status: "verified", zone: "human" } },
    { id: "wsb-own", namespace: "org:workspace:wsB", type: "Decision", name: "OWN_WSB_DECISION", source: "human-review", createdAt: NOW, properties: { status: "verified", zone: "human" } },
  ]),
  close: async () => {},
};

async function runAs(user, workspace) {
  globalThis.authzTestUser = user;
  const session = await owner.requireWorkspaceApiSession(new Request(`http://localhost/api/joris/chat?workspace=${workspace}`));
  assert.ok(session.ctx, "session resolved");
  const ctx = getActiveWorkspaceContext({ ...session.ctx, email: session.user.email });
  const seen = { vault: [], memex: [], reply: [] };
  const deps = {
    generateReply: async (input) => { seen.reply.push(input); return { ok: true, text: "OK", modelId: "mock" }; },
    readVerifiedVault: (id) => { seen.vault.push(id); return readVerifiedVaultContext(id); },
    enrichMemexContext: (input) => { seen.memex.push(input.workspaceId);
      return enrichJorisMemoryContextWithMemex({ ...input, transport: leakyTransport, env: { MEMEX_CORE_ROOT: "/fake" }, nowIso: NOW }); },
  };
  const result = await runJorisCommand("Consulte le board sur cette question.", ctx, deps);
  return { ctx, seen, result, text: JSON.stringify(result) + JSON.stringify(seen.reply) };
}

test("joris chat memory context is scoped to the session workspace", async () => {
  process.env.ORIA_WORKSPACE_MEMBERS = JSON.stringify([{ userId: "userB", workspaceId: "wsB", role: "owner" }]);
  process.env.MICHAEL_HQ_OWNER_ID = "michael";
  try {
    const b = await runAs({ id: "userB" }, "wsB");
    assert.equal(b.ctx.workspace.id, "wsB");
    assert.deepEqual(b.seen.vault, ["wsB"]);
    assert.deepEqual(b.seen.memex, ["wsB"]);
    assert.ok(!b.text.includes("mem_seed") && !b.text.includes("Local persistence fallback"), "no michael-hq vault entry");
    assert.ok(!b.text.includes("SECRET_MICHAEL_HQ"), "no foreign Memex row");
    assert.ok(b.text.includes("OWN_WSB_DECISION"), "own Memex rows still injected");

    // Counter-proof: the same harness does surface michael-hq memory to its owner.
    const m = await runAs({ id: "michael" }, "michael-hq");
    assert.deepEqual(m.seen.vault, ["michael-hq"]);
    assert.ok(m.text.includes("SECRET_MICHAEL_HQ"));
    assert.ok(!m.text.includes("OWN_WSB_DECISION"));
  } finally {
    delete process.env.ORIA_WORKSPACE_MEMBERS;
    delete process.env.MICHAEL_HQ_OWNER_ID;
    delete globalThis.authzTestUser;
  }
});
