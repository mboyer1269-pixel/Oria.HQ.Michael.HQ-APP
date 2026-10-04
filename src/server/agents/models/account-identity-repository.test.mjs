import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const key = (overrides = {}) => ({ provider: "claude", workspaceId: "ws-1", email: "person@example.com", ...overrides });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const neutralError = { message: "Account identity persistence failed." };
const rowKey = (row) => JSON.stringify([row.provider, row.workspace_id, row.email]);

async function loadRepository({ client = null, fallback = true, clientError } = {}) {
  const jiti = createJiti(import.meta.url, {
    moduleCache: false,
    virtualModules: {
      "server-only": {},
      "@/lib/server-env": { isLocalPersistenceFallbackAllowed: () => fallback },
      "@/server/supabase/admin": {
        createOptionalSupabaseAdminClient() {
          if (clientError) throw clientError;
          return client;
        },
      },
    },
  });
  return jiti.import("./account-identity-repository.ts");
}

// Persists outside repository instances; no network, auth, or runtime credentials.
function backend({ rows = new Map(), failAt, result, barrier } = {}) {
  const calls = [];
  const marker = "private-person@example.com";
  const client = {
    from(table) {
      assert.equal(table, "account_identities");
      return {
        async upsert(row, options) {
          calls.push({ row, options });
          assert.deepEqual(options, { onConflict: "provider,workspace_id,email", ignoreDuplicates: true });
          if (barrier) await barrier();
          if (failAt === "insertThrow") throw new Error(marker);
          if (failAt === "insert") return { error: { message: marker } };
          if (!rows.has(rowKey(row))) rows.set(rowKey(row), structuredClone(row));
          return { error: null };
        },
        select(columns) {
          assert.equal(columns, "account_id");
          const filter = {};
          return {
            eq(field, value) { filter[field] = value; return this; },
            async maybeSingle() {
              if (failAt === "readThrow") throw new Error(marker);
              if (failAt === "read") return { data: null, error: { message: marker } };
              if (result) return result();
              const row = rows.get(rowKey(filter));
              return { data: row ? { account_id: row.account_id } : null, error: null };
            },
          };
        },
      };
    },
  };
  return { client, rows, calls, marker };
}

test("concurrent creators return the winning persisted UUID without overwriting it", async () => {
  let release;
  let arrivals = 0;
  const ready = new Promise((resolve) => { release = resolve; });
  const db = backend({ barrier: async () => { if (++arrivals === 2) release(); await ready; } });
  const a = await loadRepository({ client: db.client });
  const b = await loadRepository({ client: db.client });
  const ids = await Promise.all([a.resolveOpaqueAccountId(key()), b.resolveOpaqueAccountId(key())]);
  assert.equal(ids[0], ids[1]);
  assert.match(ids[0], uuid);
  assert.equal(db.rows.size, 1);
  assert.notEqual(db.calls[0].row.account_id, db.calls[1].row.account_id);
  assert.equal(ids[0], [...db.rows.values()][0].account_id);
});

test("fresh repository instances reuse a persistent backend fixture without changing created_at", async () => {
  const rows = new Map();
  const firstDb = backend({ rows });
  const first = await loadRepository({ client: firstDb.client });
  const original = await first.resolveOpaqueAccountId(key(), () => "2026-01-01T00:00:00.000Z");
  const persistedSnapshot = new Map(JSON.parse(JSON.stringify([...rows])));
  const restartedDb = backend({ rows: persistedSnapshot });
  const restarted = await loadRepository({ client: restartedDb.client });
  assert.notEqual(first.resolveOpaqueAccountId, restarted.resolveOpaqueAccountId);
  assert.equal(await restarted.resolveOpaqueAccountId(key(), () => "2026-02-01T00:00:00.000Z"), original);
  assert.equal([...persistedSnapshot.values()][0].created_at, "2026-01-01T00:00:00.000Z");
});

test("provider, workspace and email scope identities; casing and padding normalize", async () => {
  const db = backend();
  const repo = await loadRepository({ client: db.client });
  const original = await repo.resolveOpaqueAccountId(key());
  assert.equal(await repo.resolveOpaqueAccountId(key({ email: " Person@Example.com " })), original);
  const ids = await Promise.all([
    repo.resolveOpaqueAccountId(key({ provider: "codex" })),
    repo.resolveOpaqueAccountId(key({ workspaceId: "ws-2" })),
    repo.resolveOpaqueAccountId(key({ email: "other@example.com" })),
  ]);
  assert.equal(new Set([original, ...ids]).size, 4);
});

test("database and transport errors expose no email or raw cause, and never fall back", async () => {
  for (const failAt of ["insert", "insertThrow", "read", "readThrow"]) {
    const db = backend({ failAt });
    const repo = await loadRepository({ client: db.client, fallback: true });
    await assert.rejects(repo.resolveOpaqueAccountId(key()), (error) => {
      assert.equal(error.message, neutralError.message);
      assert.doesNotMatch(error.stack, /private-person|person@example/);
      assert.equal(error.cause, undefined);
      return true;
    });
  }
  const repo = await loadRepository({ clientError: new Error("private-person@example.com") });
  await assert.rejects(repo.resolveOpaqueAccountId(key()), neutralError);
});

test("malformed or missing database UUIDs fail closed", async () => {
  for (const account_id of [undefined, null, 123, "person@example.com", "00000000-0000-0000-0000-000000000000", "a".repeat(36), "5bc90a1d-2e54-41b3-a3e6-d5d8aaea7c31\n"]) {
    const db = backend({ result: () => ({ data: { account_id }, error: null }) });
    const repo = await loadRepository({ client: db.client });
    await assert.rejects(repo.resolveOpaqueAccountId(key()), neutralError);
  }
  const db = backend({ result: () => ({ data: null, error: null }) });
  const repo = await loadRepository({ client: db.client });
  await assert.rejects(repo.resolveOpaqueAccountId(key()), neutralError);
});

test("invalid or oversized input is rejected before persistence", async () => {
  const db = backend();
  const repo = await loadRepository({ client: db.client });
  for (const input of [null, undefined, {}, key({ provider: "" }), key({ provider: "x".repeat(81) }), key({ workspaceId: " " }), key({ workspaceId: "x".repeat(161) }), key({ workspaceId: "ws\u0000" }), key({ email: 123 }), key({ email: "missing-at" }), key({ email: "x@@example.com" }), key({ email: "x\u0000@example.com" }), key({ email: "x".repeat(243) + "@example.com" })]) {
    await assert.rejects(repo.resolveOpaqueAccountId(input), { name: "TypeError", message: "Invalid account identity key." });
  }
  assert.equal(db.calls.length, 0);
  await assert.rejects(repo.resolveOpaqueAccountId(key(), () => "bad timestamp"), neutralError);
  assert.equal(db.calls.length, 0);
});

test("local fallback is explicitly process-local and production fails closed", async () => {
  const local = await loadRepository();
  const original = await local.resolveOpaqueAccountId(key());
  assert.match(original, uuid);
  assert.equal(await local.resolveOpaqueAccountId(key()), original);
  local.__clearMockAccountIdentities();
  assert.notEqual(await local.resolveOpaqueAccountId(key()), original);
  const production = await loadRepository({ fallback: false });
  await assert.rejects(production.resolveOpaqueAccountId(key()), neutralError);
});

test("migration defines bounded, unique server-only storage without client policies", async () => {
  const sql = await readFile(new URL("../../../../db/migrations/0029_account_identities.sql", import.meta.url), "utf8");
  assert.match(sql, /account_id uuid primary key/);
  assert.match(sql, /unique \(provider, workspace_id, email\)/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /force row level security/);
  assert.match(sql, /revoke all on table public.account_identities from public, anon, authenticated, service_role/);
  assert.match(sql, /grant select, insert on table public.account_identities to service_role/);
  assert.doesNotMatch(sql, /create policy/i);
  assert.match(sql, /between 1 and 160/);
  assert.match(sql, /between 3 and 254/);
});
