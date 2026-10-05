#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..", "..");

const CANONICAL_POLICY_SHA256 = "c".repeat(64);
const OTHER_POLICY_SHA256 = "d".repeat(64);

const LAUNCH_CONFIG_FIXTURE = {
  imageDigest: `sha256:${"a".repeat(64)}`,
  executorVersion: "1.50.0",
  runnerId: "runner-1",
  permissionPolicy: "deny",
  maxCostCents: 500,
  maxTokens: 50000,
  maxIterations: 10,
  timeoutSeconds: 600,
  hardTokenLimitEnforced: false,
  providerProfile: {
    id: "claude-default",
    policySha256: CANONICAL_POLICY_SHA256,
    provider: "claude",
    authentication: "subscription",
    network: "restricted-proxy",
    accountConnectors: "disabled",
  },
};
const CANONICAL_ENV = { ORIA_OPENHANDS_LAUNCH_CONFIG: JSON.stringify(LAUNCH_CONFIG_FIXTURE) };

const BINDING = {
  version: 1,
  workspaceId: "workspace-a",
  provider: "claude-code-cli",
  runnerId: "runner-1",
  container: "qualified-claude-login",
  approval: { status: "approved", approvalReference: "test fixture approval only" },
  maxEvidenceAgeMs: 15 * 60 * 1000,
};

const NOW_ISO = "2026-10-05T12:00:00.000Z";
const NOW_MS = Date.parse(NOW_ISO);

function rowKey(workspaceId, providerId) {
  return `${workspaceId}::${providerId}`;
}

/** Minimal fake matching the exact query shape readRunnerConnectionEvidence
 * and recordRunnerConnectionEvidence issue. No network, no real Supabase
 * types — this proves the module's own logic, never real Postgres/RLS. */
function fakeSupabase({ rows = new Map(), selectError, selectThrow, upsertError, upsertThrow } = {}) {
  const upserts = [];
  const client = {
    from(table) {
      assert.equal(table, "provider_connection_evidence");
      return {
        select(columns) {
          assert.equal(columns, "*");
          const filter = {};
          return {
            eq(field, value) {
              filter[field] = value;
              return this;
            },
            async maybeSingle() {
              if (selectThrow) throw new Error("transport error");
              if (selectError) return { data: null, error: { message: "boom" } };
              const row = rows.get(rowKey(filter.workspace_id, filter.provider_id));
              return { data: row ?? null, error: null };
            },
          };
        },
        async upsert(row, options) {
          if (upsertThrow) throw new Error("transport error");
          upserts.push({ row, options });
          if (upsertError) return { error: { message: "boom" } };
          rows.set(rowKey(row.workspace_id, row.provider_id), row);
          return { error: null };
        },
      };
    },
  };
  return { client, rows, upserts };
}

async function loadModule({ client = null, clientError } = {}) {
  const jiti = createJiti(import.meta.url, {
    moduleCache: false,
    alias: { "@": path.join(projectRoot, "src") },
    virtualModules: {
      "server-only": {},
      // Pulled in transitively via runner-executor-connection-probe.ts ->
      // account-identity-repository.ts; not exercised by these tests.
      "@/lib/server-env": { isLocalPersistenceFallbackAllowed: () => false },
      "@/server/supabase/admin": {
        createOptionalSupabaseAdminClient() {
          if (clientError) throw clientError;
          return client;
        },
      },
    },
  });
  return jiti.import("./runner-connection-evidence.ts");
}

function connectedRow(overrides = {}) {
  return {
    workspace_id: "workspace-a",
    provider_id: "claude-code-cli",
    runner_id: "runner-1",
    container: "qualified-claude-login",
    contract_version: 1,
    policy_sha256: CANONICAL_POLICY_SHA256,
    connection_state: "connected",
    source: "cli-subscription-login",
    account_id: "attested-account-1",
    evidence: ["claude --version -> 1.50.0", "claude auth status --json -> ready"],
    required_action: null,
    checked_at: "2026-10-05T11:50:00.000Z",
    recorded_at: "2026-10-05T11:50:01.000Z",
    recorded_by: "operator-script:runner-1",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Read path
// ---------------------------------------------------------------------------

test("refuses by default: no binding configured means no evidence is ever consulted", async () => {
  const mod = await loadModule();
  assert.equal(mod.loadConnectionEvidenceBinding({}), null);
  assert.equal(mod.loadConnectionEvidenceBinding({ ORIA_OPENHANDS_CONNECTION_EVIDENCE_BINDING: "{not json" }), null);
  assert.equal(
    mod.loadConnectionEvidenceBinding({ ORIA_OPENHANDS_CONNECTION_EVIDENCE_BINDING: JSON.stringify({ ...BINDING, approval: { status: "not_approved" } }) }),
    null,
  );
  assert.equal(
    mod.loadConnectionEvidenceBinding({ ORIA_OPENHANDS_CONNECTION_EVIDENCE_BINDING: JSON.stringify(BINDING).padEnd(5000, " ") }),
    null,
  );
});

test("fresh, matching, policy-consistent, connected row reads as ok with the attested accountId carried through unmodified", async () => {
  const rows = new Map([[rowKey("workspace-a", "claude-code-cli"), connectedRow()]]);
  const db = fakeSupabase({ rows });
  const mod = await loadModule({ client: db.client });
  const result = await mod.readRunnerConnectionEvidence(BINDING, { env: CANONICAL_ENV, now: () => NOW_MS });
  assert.deepEqual(result, {
    status: "ok",
    outcome: {
      connectionState: "connected",
      source: "cli-subscription-login",
      accountId: "attested-account-1",
      evidence: ["claude --version -> 1.50.0", "claude auth status --json -> ready"],
    },
  });
});

test("no canonical launch config resolvable refuses as policy_unavailable, before even querying the store", async () => {
  const rows = new Map([[rowKey("workspace-a", "claude-code-cli"), connectedRow()]]);
  const db = fakeSupabase({ rows });
  const mod = await loadModule({ client: db.client });
  for (const env of [{}, { ORIA_OPENHANDS_LAUNCH_CONFIG: "{not json" }, { ORIA_OPENHANDS_LAUNCH_CONFIG: JSON.stringify({ ...LAUNCH_CONFIG_FIXTURE, providerProfile: undefined }) }]) {
    assert.deepEqual(await mod.readRunnerConnectionEvidence(BINDING, { env, now: () => NOW_MS }), { status: "policy_unavailable" });
  }
});

test("the approved binding's runner no longer matches the canonical launch config's runner: policy_mismatch, before querying the store", async () => {
  const mod = await loadModule({ client: fakeSupabase().client });
  const mismatchedEnv = { ORIA_OPENHANDS_LAUNCH_CONFIG: JSON.stringify({ ...LAUNCH_CONFIG_FIXTURE, runnerId: "runner-2" }) };
  assert.deepEqual(await mod.readRunnerConnectionEvidence(BINDING, { env: mismatchedEnv, now: () => NOW_MS }), { status: "policy_mismatch" });
});

test("fresh proof, correct identity, wrong policy digest on the stored row: refused", async () => {
  const rows = new Map([[rowKey("workspace-a", "claude-code-cli"), connectedRow({ policy_sha256: OTHER_POLICY_SHA256 })]]);
  const db = fakeSupabase({ rows });
  const mod = await loadModule({ client: db.client });
  const result = await mod.readRunnerConnectionEvidence(BINDING, { env: CANONICAL_ENV, now: () => NOW_MS });
  assert.deepEqual(result, { status: "policy_mismatch" });
});

test("no Supabase client configured (or a constructor throw) is unavailable, never connected", async () => {
  const mod1 = await loadModule({ client: null });
  assert.deepEqual(await mod1.readRunnerConnectionEvidence(BINDING, { env: CANONICAL_ENV, now: () => NOW_MS }), { status: "unavailable" });
  const mod2 = await loadModule({ clientError: new Error("boom") });
  assert.deepEqual(await mod2.readRunnerConnectionEvidence(BINDING, { env: CANONICAL_ENV, now: () => NOW_MS }), { status: "unavailable" });
});

test("a transport error or a reported query error is unavailable, not a silent empty row", async () => {
  const dbThrow = fakeSupabase({ selectThrow: true });
  const modThrow = await loadModule({ client: dbThrow.client });
  assert.deepEqual(await modThrow.readRunnerConnectionEvidence(BINDING, { env: CANONICAL_ENV, now: () => NOW_MS }), { status: "unavailable" });
  const dbError = fakeSupabase({ selectError: true });
  const modError = await loadModule({ client: dbError.client });
  assert.deepEqual(await modError.readRunnerConnectionEvidence(BINDING, { env: CANONICAL_ENV, now: () => NOW_MS }), { status: "unavailable" });
});

test("no row yet is refused explicitly, never treated as connected", async () => {
  const db = fakeSupabase();
  const mod = await loadModule({ client: db.client });
  assert.deepEqual(await mod.readRunnerConnectionEvidence(BINDING, { env: CANONICAL_ENV, now: () => NOW_MS }), { status: "no_row" });
});

test("malformed stored row fails closed", async () => {
  for (const override of [
    { connection_state: "definitely_connected" },
    { source: "made_up_source" },
    { evidence: "not-an-array" },
    { checked_at: "not-a-date" },
    { contract_version: 2 },
    { policy_sha256: "not-a-hash" },
  ]) {
    const rows = new Map([[rowKey("workspace-a", "claude-code-cli"), connectedRow(override)]]);
    const db = fakeSupabase({ rows });
    const mod = await loadModule({ client: db.client });
    const result = await mod.readRunnerConnectionEvidence(BINDING, { env: CANONICAL_ENV, now: () => NOW_MS });
    assert.equal(result.status, "malformed_row", JSON.stringify(override));
  }
});

test("binding/row mismatch on workspace, runner, or container refuses even though the row is otherwise valid, policy-consistent and fresh", async () => {
  for (const override of [{ workspace_id: "workspace-b" }, { runner_id: "runner-2" }, { container: "other-container" }]) {
    const rows = new Map([[rowKey("workspace-a", "claude-code-cli"), connectedRow(override)]]);
    const db = fakeSupabase({ rows });
    const mod = await loadModule({ client: db.client });
    const result = await mod.readRunnerConnectionEvidence(BINDING, { env: CANONICAL_ENV, now: () => NOW_MS });
    assert.equal(result.status, "binding_mismatch", JSON.stringify(override));
  }
});

test("TTL and future-dating both refuse: age beyond maxEvidenceAgeMs, and a checkedAt after now", async () => {
  const stale = connectedRow({ checked_at: new Date(NOW_MS - BINDING.maxEvidenceAgeMs - 1000).toISOString() });
  const modStale = await loadModule({ client: fakeSupabase({ rows: new Map([[rowKey("workspace-a", "claude-code-cli"), stale]]) }).client });
  assert.deepEqual(await modStale.readRunnerConnectionEvidence(BINDING, { env: CANONICAL_ENV, now: () => NOW_MS }), { status: "stale" });

  const future = connectedRow({ checked_at: new Date(NOW_MS + 60_000).toISOString() });
  const modFuture = await loadModule({ client: fakeSupabase({ rows: new Map([[rowKey("workspace-a", "claude-code-cli"), future]]) }).client });
  assert.deepEqual(await modFuture.readRunnerConnectionEvidence(BINDING, { env: CANONICAL_ENV, now: () => NOW_MS }), { status: "stale" });

  const edge = connectedRow({ checked_at: new Date(NOW_MS - BINDING.maxEvidenceAgeMs).toISOString() });
  const modEdge = await loadModule({ client: fakeSupabase({ rows: new Map([[rowKey("workspace-a", "claude-code-cli"), edge]]) }).client });
  assert.equal((await modEdge.readRunnerConnectionEvidence(BINDING, { env: CANONICAL_ENV, now: () => NOW_MS })).status, "ok");
});

test("a negative or ambiguous persisted state never reads as connected: connection_required, unknown, declared-capability source, missing accountId", async () => {
  for (const override of [
    { connection_state: "connection_required", account_id: null },
    { connection_state: "unknown", account_id: null },
    { source: "declared-capability" },
    { account_id: null },
  ]) {
    const rows = new Map([[rowKey("workspace-a", "claude-code-cli"), connectedRow(override)]]);
    const db = fakeSupabase({ rows });
    const mod = await loadModule({ client: db.client });
    const result = await mod.readRunnerConnectionEvidence(BINDING, { env: CANONICAL_ENV, now: () => NOW_MS });
    assert.equal(result.status, "not_connected", JSON.stringify(override));
  }
});

test("revocation between the gate's initial discovery and its pre-CAS recheck: two sequential reads observe the change, nothing is cached", async () => {
  const rows = new Map([[rowKey("workspace-a", "claude-code-cli"), connectedRow()]]);
  const db = fakeSupabase({ rows });
  const mod = await loadModule({ client: db.client });

  const first = await mod.readRunnerConnectionEvidence(BINDING, { env: CANONICAL_ENV, now: () => NOW_MS });
  assert.equal(first.status, "ok");

  rows.set(rowKey("workspace-a", "claude-code-cli"), connectedRow({ connection_state: "connection_required", account_id: null, source: "cli-subscription-login" }));

  const recheck = await mod.readRunnerConnectionEvidence(BINDING, { env: CANONICAL_ENV, now: () => NOW_MS + 1000 });
  assert.equal(recheck.status, "not_connected");
});

test("account substitution between two reads is never read as 'the same account' — the raw accountId is passed through unmemoized", async () => {
  const rows = new Map([[rowKey("workspace-a", "claude-code-cli"), connectedRow({ account_id: "account-A" })]]);
  const db = fakeSupabase({ rows });
  const mod = await loadModule({ client: db.client });
  const first = await mod.readRunnerConnectionEvidence(BINDING, { env: CANONICAL_ENV, now: () => NOW_MS });
  assert.equal(first.outcome.accountId, "account-A");

  rows.set(rowKey("workspace-a", "claude-code-cli"), connectedRow({ account_id: "account-B", checked_at: new Date(NOW_MS - 1000).toISOString() }));
  const second = await mod.readRunnerConnectionEvidence(BINDING, { env: CANONICAL_ENV, now: () => NOW_MS + 1000 });
  assert.equal(second.outcome.accountId, "account-B");
  assert.notEqual(first.outcome.accountId, second.outcome.accountId);
});

// ---------------------------------------------------------------------------
// Write path (primitive)
// ---------------------------------------------------------------------------

const RECORDABLE = {
  workspaceId: "workspace-a",
  runnerId: "runner-1",
  container: "qualified-claude-login",
  policySha256: CANONICAL_POLICY_SHA256,
  outcome: { connectionState: "connected", source: "cli-subscription-login", accountId: "attested-account-1", evidence: ["ok"] },
  checkedAtIso: "2026-10-05T11:50:00.000Z",
  recordedBy: "operator-script:runner-1",
};

test("recording rejects fields that the consuming probe cannot read", async () => {
  const db = fakeSupabase();
  const mod = await loadModule({ client: db.client });
  for (const outcome of [
    { ...RECORDABLE.outcome, evidence: ["x".repeat(201)] },
    { ...RECORDABLE.outcome, evidence: Array(11).fill("ok") },
    { ...RECORDABLE.outcome, requiredAction: "x".repeat(401) },
    { ...RECORDABLE.outcome, accountId: "x".repeat(161) },
  ]) {
    const result = await mod.recordRunnerConnectionEvidence({ ...RECORDABLE, outcome }, { env: {}, now: () => NOW_MS });
    assert.equal(result.status, "rejected");
  }
  assert.equal(db.upserts.length, 0);
});

test("recording refuses outside the operator/non-cloud environment, same gate as the SSH probe itself", async () => {
  const db = fakeSupabase();
  const mod = await loadModule({ client: db.client });
  const result = await mod.recordRunnerConnectionEvidence(RECORDABLE, { env: { VERCEL: "1" }, now: () => NOW_MS });
  assert.equal(result.status, "rejected");
  assert.match(result.reason, /forbidden/);
  assert.equal(db.upserts.length, 0, "a forbidden environment must never reach the database");
});

test("recording refuses an invalid or missing policySha256", async () => {
  const db = fakeSupabase();
  const mod = await loadModule({ client: db.client });
  for (const policySha256 of ["not-a-hash", "", undefined]) {
    const result = await mod.recordRunnerConnectionEvidence({ ...RECORDABLE, policySha256 }, { env: {}, now: () => NOW_MS });
    assert.equal(result.status, "rejected");
  }
  assert.equal(db.upserts.length, 0);
});

test("recording refuses a 'connected' claim without an attested accountId or with only a declared-capability source", async () => {
  const db = fakeSupabase();
  const mod = await loadModule({ client: db.client });
  for (const outcome of [
    { connectionState: "connected", source: "cli-subscription-login", evidence: [] },
    { connectionState: "connected", source: "declared-capability", accountId: "x", evidence: [] },
  ]) {
    const result = await mod.recordRunnerConnectionEvidence({ ...RECORDABLE, outcome }, { env: {}, now: () => NOW_MS });
    assert.equal(result.status, "rejected");
  }
  assert.equal(db.upserts.length, 0);
});

test("recording refuses a future-dated checkedAtIso", async () => {
  const db = fakeSupabase();
  const mod = await loadModule({ client: db.client });
  const result = await mod.recordRunnerConnectionEvidence(
    { ...RECORDABLE, checkedAtIso: new Date(NOW_MS + 60_000).toISOString() },
    { env: {}, now: () => NOW_MS },
  );
  assert.equal(result.status, "rejected");
  assert.equal(db.upserts.length, 0);
});

test("a valid operator-environment write upserts the exact expected row, including the policy digest, keyed to overwrite the prior one", async () => {
  const db = fakeSupabase();
  const mod = await loadModule({ client: db.client });
  const result = await mod.recordRunnerConnectionEvidence(RECORDABLE, { env: {}, now: () => NOW_MS });
  assert.deepEqual(result, { status: "recorded" });
  assert.equal(db.upserts.length, 1);
  assert.deepEqual(db.upserts[0].options, { onConflict: "workspace_id,provider_id" });
  assert.deepEqual(db.upserts[0].row, {
    workspace_id: "workspace-a",
    provider_id: "claude-code-cli",
    runner_id: "runner-1",
    container: "qualified-claude-login",
    contract_version: 1,
    policy_sha256: CANONICAL_POLICY_SHA256,
    connection_state: "connected",
    source: "cli-subscription-login",
    account_id: "attested-account-1",
    evidence: ["ok"],
    required_action: null,
    checked_at: "2026-10-05T11:50:00.000Z",
    recorded_at: NOW_ISO,
    recorded_by: "operator-script:runner-1",
  });
});

test("database errors on write are rejected, not silently dropped", async () => {
  for (const flags of [{ upsertError: true }, { upsertThrow: true }]) {
    const db = fakeSupabase(flags);
    const mod = await loadModule({ client: db.client });
    const result = await mod.recordRunnerConnectionEvidence(RECORDABLE, { env: {}, now: () => NOW_MS });
    assert.equal(result.status, "rejected");
  }
});

// ---------------------------------------------------------------------------
// Write path (orchestration) — recordFromLiveRunnerProbe
// ---------------------------------------------------------------------------

const SSH_BINDING = {
  version: 1,
  workspaceId: "workspace-a",
  provider: "claude-code-cli",
  approval: { status: "approved", approvalReference: "test fixture approval only" },
  sshHost: "runner@example.invalid",
  sshIdentityFile: "/fixture/ssh-identity",
  container: "qualified-claude-login",
};

function fakeProbe(outcome, { delayMs = 0 } = {}) {
  let calls = 0;
  const fn = async () => {
    calls += 1;
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    return outcome;
  };
  return { fn, callCount: () => calls };
}

test("recordFromLiveRunnerProbe refuses before reading the SSH binding when the canonical launch config is unresolvable", async () => {
  const mod = await loadModule({ client: fakeSupabase().client });
  let bindingReads = 0;
  const result = await mod.recordFromLiveRunnerProbe("workspace-a", "operator", {
    env: {},
    readBinding: async () => { bindingReads += 1; return SSH_BINDING; },
  });
  assert.equal(result.status, "rejected");
  assert.equal(bindingReads, 0, "the SSH binding must never be read when there is no canonical runner/policy to bind the proof to");
});

test("recordFromLiveRunnerProbe reads the SSH binding exactly once, even though the probe is invoked afterward — a binding edited mid-run cannot disagree with the one actually probed", async () => {
  const db = fakeSupabase();
  const mod = await loadModule({ client: db.client });
  let bindingReads = 0;
  const probe = fakeProbe({ connectionState: "connected", source: "cli-subscription-login", accountId: "attested-account-1", evidence: [] });
  const result = await mod.recordFromLiveRunnerProbe("workspace-a", "operator-script:runner-1", {
    env: CANONICAL_ENV,
    now: () => NOW_MS,
    readBinding: async () => { bindingReads += 1; return SSH_BINDING; },
    createProbe: (binding) => { assert.equal(binding.container, "qualified-claude-login"); return probe.fn; },
  });
  assert.equal(bindingReads, 1);
  assert.equal(probe.callCount(), 1);
  assert.deepEqual(result, { status: "recorded" });
  assert.equal(db.upserts[0].row.container, "qualified-claude-login");
  assert.equal(db.upserts[0].row.runner_id, "runner-1");
  assert.equal(db.upserts[0].row.policy_sha256, CANONICAL_POLICY_SHA256);
});

test("recordFromLiveRunnerProbe captures checkedAtIso BEFORE invoking the probe, never after — a slow probe never inflates the apparent freshness", async () => {
  const db = fakeSupabase();
  const mod = await loadModule({ client: db.client });
  const probe = fakeProbe({ connectionState: "connected", source: "cli-subscription-login", accountId: "attested-account-1", evidence: [] }, { delayMs: 30 });
  let tick = 0;
  const clock = () => NOW_MS + (tick++ ? 10_000 : 0); // first call (pre-probe) = NOW_MS, any later call would be +10s
  await mod.recordFromLiveRunnerProbe("workspace-a", "operator-script:runner-1", {
    env: CANONICAL_ENV,
    now: clock,
    readBinding: async () => SSH_BINDING,
    createProbe: () => probe.fn,
  });
  assert.equal(db.upserts[0].row.checked_at, NOW_ISO, "checkedAtIso must reflect the clock read BEFORE the probe ran, not after");
});

test("recordFromLiveRunnerProbe: no approved SSH binding at all refuses and never invokes the probe", async () => {
  const mod = await loadModule({ client: fakeSupabase().client });
  const probe = fakeProbe({ connectionState: "connected", source: "cli-subscription-login", accountId: "a", evidence: [] });
  const result = await mod.recordFromLiveRunnerProbe("workspace-a", "operator", {
    env: CANONICAL_ENV,
    readBinding: async () => null,
    createProbe: () => probe.fn,
  });
  assert.equal(result.status, "rejected");
  assert.equal(probe.callCount(), 0);
});

// ---------------------------------------------------------------------------
// The ProviderConnectionProbe wrapper
// ---------------------------------------------------------------------------

const CLAUDE_PROVIDER = { id: "claude-code-cli", label: "Claude Code CLI", kind: "api", trustLevel: "reviewed", supportsMcp: false, supportsToolUse: true };
const CODEX_PROVIDER = { id: "codex-acp-cli", label: "Codex ACP", kind: "api", trustLevel: "reviewed", supportsMcp: false, supportsToolUse: true };

test("createPersistedRunnerConnectionProbe only ever speaks for claude-code-cli", async () => {
  const mod = await loadModule();
  const probe = mod.createPersistedRunnerConnectionProbe("workspace-a");
  const outcome = await probe(CODEX_PROVIDER, []);
  assert.equal(outcome.connectionState, "unknown");
  assert.match(outcome.requiredAction, /this probe only checks "claude-code-cli"/);
});

test("createPersistedRunnerConnectionProbe refuses explicitly when no binding is configured for this workspace", async () => {
  const mod = await loadModule();
  const probe = mod.createPersistedRunnerConnectionProbe("workspace-a", { env: {} });
  const outcome = await probe(CLAUDE_PROVIDER, []);
  assert.equal(outcome.connectionState, "unknown");
  assert.match(outcome.requiredAction, /no approved persisted-evidence consumption binding/);
});

test("explicit cloud-persisted path: a fresh, matching, policy-consistent, connected row reads as connected even with a cloud marker present — the read side never consults resolveRunnerProbeEnvironment", async () => {
  const rows = new Map([[rowKey("workspace-a", "claude-code-cli"), connectedRow()]]);
  const db = fakeSupabase({ rows });
  const mod = await loadModule({ client: db.client });
  const env = { VERCEL: "1", ...CANONICAL_ENV, ORIA_OPENHANDS_CONNECTION_EVIDENCE_BINDING: JSON.stringify(BINDING) };
  const probe = mod.createPersistedRunnerConnectionProbe("workspace-a", { env, now: () => NOW_MS });
  const outcome = await probe(CLAUDE_PROVIDER, []);
  assert.equal(outcome.connectionState, "connected");
  assert.equal(outcome.accountId, "attested-account-1");
});

test("a binding for a different workspace than the one this probe was constructed for is refused, not silently reused", async () => {
  const mod = await loadModule();
  const otherWorkspaceBinding = { ...BINDING, workspaceId: "workspace-b" };
  const env = { ...CANONICAL_ENV, ORIA_OPENHANDS_CONNECTION_EVIDENCE_BINDING: JSON.stringify(otherWorkspaceBinding) };
  const probe = mod.createPersistedRunnerConnectionProbe("workspace-a", { env });
  const outcome = await probe(CLAUDE_PROVIDER, []);
  assert.equal(outcome.connectionState, "unknown");
  assert.match(outcome.requiredAction, /no approved persisted-evidence consumption binding/);
});

// ---------------------------------------------------------------------------
// Migration structure — no live DB; this is a candidate file only. These
// assertions prove the SQL TEXT contains the expected grants/checks; they do
// not prove real Postgres RLS behavior, which requires an applied migration
// and a live database this worktree does not have.
// ---------------------------------------------------------------------------

test("candidate migration is server-only storage with no client policies, a policy digest column, and an account/source invariant", async () => {
  const sql = await readFile(new URL("../../../../db/migrations/0031_runner_connection_evidence.sql", import.meta.url), "utf8");
  assert.match(sql, /primary key \(workspace_id, provider_id\)/);
  assert.match(sql, /policy_sha256 text not null check \(policy_sha256 ~ '\^\[a-f0-9\]\{64\}\$'\)/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /force row level security/);
  assert.match(sql, /revoke all on table public\.provider_connection_evidence from public, anon, authenticated, service_role/);
  assert.match(sql, /grant select, insert, update on table public\.provider_connection_evidence to service_role/);
  assert.doesNotMatch(sql, /create policy/i);
  assert.doesNotMatch(sql, /grant .* to anon/i);
  assert.doesNotMatch(sql, /grant .* to authenticated/i);
  assert.match(sql, /connection_state <> 'connected' or \(account_id is not null and source <> 'declared-capability'\)/);
});
