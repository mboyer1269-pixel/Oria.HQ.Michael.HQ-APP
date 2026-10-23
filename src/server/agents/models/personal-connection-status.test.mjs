import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const jiti = createJiti(import.meta.url, { alias: {
  "@": path.join(root, "src"), "server-only": path.join(root, "src/scripts/smoke/server-only-stub.mjs"),
} });
const { getPersonalConnectionStatus } = await jiti.import("./personal-connection-status.ts");
const owner = "11111111-1111-4111-8111-111111111111";
const account = "22222222-2222-4222-8222-222222222222";
const otherAccount = "33333333-3333-4333-8333-333333333333";
const context = { workspaceId: "workspace-a", access: { status: "authorized", user: { id: owner, email: "reader@fixture.test" } } };
const config = {
  imageDigest: `sha256:${"a".repeat(64)}`, foundationModelId: "claude-fixture-1", executorVersion: "1.50.0",
  runnerId: "runner-1", permissionPolicy: "deny", maxCostCents: 100, maxTokens: 1000,
  maxIterations: 2, timeoutSeconds: 120, hardTokenLimitEnforced: false,
  providerProfile: { id: "private-policy", policySha256: "b".repeat(64), provider: "claude",
    authentication: "subscription", network: "restricted-proxy", accountConnectors: "disabled" },
};
const binding = {
  version: 1, workspaceId: "workspace-a", provider: "claude-code-cli", runnerId: "runner-1",
  container: "private-container-canary", approval: { status: "approved", approvalReference: "private-approval-canary" },
  maxEvidenceAgeMs: 30_000,
};
function deps(overrides = {}) {
  return {
    loadLaunchConfig: () => config,
    loadEvidenceBinding: () => binding,
    readEvidence: async () => ({ status: "ok", outcome: {
      connectionState: "connected", source: "cli-subscription-login", accountId: account,
      evidence: ["private-evidence-canary"], requiredAction: "private-action-canary",
    } }),
    confirmationTransport: () => "persisted",
    ...overrides,
  };
}

test("an observed opaque account is separate from reader, adapter, confirmation and completed mission", async () => {
  const result = await getPersonalConnectionStatus(context, deps());
  assert.deepEqual(result, {
    status: "configured", scope: { workspaceRef: "workspace-a", ownerActorRef: owner },
    connection: { provider: "claude", runnerRef: "runner-1", adapterStatus: "implemented", accountRef: account,
      evidenceStatus: "observed", confirmationTransport: "persisted", confirmationReadiness: "not_verified",
      chatStatus: "unavailable", missionStatus: "not_verified" },
  });
  const serialized = JSON.stringify(result);
  for (const forbidden of ["private-", "fixture.test", "policySha256", "approvalReference", "recordedBy", "email", "container", "evidence:"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test("denied or invalid readers never read configuration, bindings or evidence", async () => {
  let reads = 0;
  const forbidden = () => { reads++; throw Error("must not load"); };
  for (const invalid of [
    { ...context, access: { status: "forbidden", user: context.access.user } },
    { ...context, access: undefined },
    { ...context, workspaceId: "../other" },
    { ...context, workspaceId: "https://other.test" },
    { ...context, workspaceId: "a\nb" },
    { ...context, workspaceId: "a".repeat(161) },
    { ...context, access: { status: "authorized", user: { id: "configured-owner" } } },
    { ...context, access: { status: "authorized", user: { id: "reader@fixture.test" } } },
  ]) {
    const result = await getPersonalConnectionStatus(invalid, deps({ loadLaunchConfig: forbidden, loadEvidenceBinding: forbidden, readEvidence: forbidden }));
    assert.ok(["access_denied", "invalid_context"].includes(result.status));
    assert.equal(result.scope, null); assert.equal(result.connection, null);
  }
  assert.equal(reads, 0);
});

test("missing or offline configuration never becomes a personal account connection", async () => {
  const offline = { ...config };
  delete offline.providerProfile;
  for (const value of [null, offline]) {
    const result = await getPersonalConnectionStatus(context, deps({ loadLaunchConfig: () => value }));
    assert.equal(result.status, "not_configured"); assert.equal(result.connection, null);
  }
});

test("unsafe runner references and malformed configuration never cross the public boundary", async () => {
  for (const runnerId of ["/private/host", "https://private.test", "reader@fixture.test", "runner\nother", "a".repeat(161)]) {
    const result = await getPersonalConnectionStatus(context, deps({ loadLaunchConfig: () => ({ ...config, runnerId }) }));
    assert.equal(result.status, "unavailable"); assert.equal(result.connection, null);
    assert.equal(JSON.stringify(result).includes(runnerId), false);
  }
});

test("catalog-only Codex is unavailable before any binding or store read", async () => {
  let reads = 0;
  const result = await getPersonalConnectionStatus(context, deps({
    loadLaunchConfig: () => ({ ...config, providerProfile: { ...config.providerProfile, provider: "codex" } }),
    loadEvidenceBinding: () => { reads++; return binding; }, readEvidence: async () => { reads++; throw Error(); },
  }));
  assert.equal(result.connection.adapterStatus, "unavailable");
  assert.equal(result.connection.evidenceStatus, "not_checked"); assert.equal(result.connection.accountRef, null);
  assert.equal(reads, 0);
});

test("workspace, runner and provider mismatch or malformed binding refuses before reading store", async () => {
  let reads = 0;
  const cases = [
    [{ ...binding, workspaceId: "workspace-b" }, "scope_mismatch"],
    [{ ...binding, runnerId: "runner-2" }, "policy_mismatch"],
    [{ ...binding, provider: "codex-acp-cli" }, "invalid"],
    [{ ...binding, approval: { ...binding.approval, status: "revoked" } }, "invalid"],
    [null, "not_configured"],
  ];
  for (const [value, expected] of cases) {
    const result = await getPersonalConnectionStatus(context, deps({ loadEvidenceBinding: () => value,
      readEvidence: async () => { reads++; throw Error(); } }));
    assert.equal(result.connection.evidenceStatus, expected); assert.equal(result.connection.accountRef, null);
  }
  assert.equal(reads, 0);
});

test("all evidence failures remain explicit without stale account identity or diagnostic payload", async () => {
  const statuses = { policy_unavailable: "policy_mismatch", unavailable: "unavailable", no_row: "missing",
    malformed_row: "invalid", binding_mismatch: "scope_mismatch", policy_mismatch: "policy_mismatch",
    stale: "stale", not_connected: "not_connected" };
  for (const [status, expected] of Object.entries(statuses)) {
    const result = await getPersonalConnectionStatus(context, deps({ readEvidence: async () => ({ status,
      accountId: account, evidence: ["private-error-canary"] }) }));
    assert.equal(result.connection.evidenceStatus, expected); assert.equal(result.connection.accountRef, null);
    assert.equal(JSON.stringify(result).includes("private-error-canary"), false);
  }
});

test("malformed positive observations cannot turn email, profile identity or declared capability into an account", async () => {
  for (const outcome of [
    { connectionState: "connected", source: "cli-subscription-login", accountId: "reader@fixture.test" },
    { connectionState: "connected", source: "cli-subscription-login", accountId: "private-policy" },
    { connectionState: "connected", source: "declared-capability", accountId: account },
    { connectionState: "connection_required", source: "cli-subscription-login", accountId: account },
    { connectionState: "connected", source: "unknown", accountId: account },
    { connectionState: "connected", source: "cli-subscription-login" },
  ]) {
    const result = await getPersonalConnectionStatus(context, deps({ readEvidence: async () => ({ status: "ok", outcome }) }));
    assert.equal(result.connection.evidenceStatus, "invalid"); assert.equal(result.connection.accountRef, null);
  }
});

test("persisted evidence does not imply that confirmation actually consumes this transport", async () => {
  const result = await getPersonalConnectionStatus(context, deps({ confirmationTransport: () => "operator_probe" }));
  assert.equal(result.connection.evidenceStatus, "observed");
  assert.equal(result.connection.confirmationTransport, "operator_probe");
  assert.equal(result.connection.confirmationReadiness, "not_verified");
});

test("each render reads fresh, account replacement is never cached or inferred from reader identity", async () => {
  let reads = 0;
  const dependencies = deps({ readEvidence: async () => ({ status: "ok", outcome: {
    connectionState: "connected", source: "cli-subscription-login", accountId: ++reads === 1 ? account : otherAccount,
  } }) });
  const first = await getPersonalConnectionStatus(context, dependencies);
  const second = await getPersonalConnectionStatus(context, dependencies);
  assert.equal(first.connection.accountRef, account); assert.equal(second.connection.accountRef, otherAccount);
  assert.equal(reads, 2); assert.equal(first.scope.ownerActorRef, second.scope.ownerActorRef);
});

test("exceptions fail closed without copying errors, credentials or private paths", async () => {
  const fail = () => { throw Error("private-exception-canary /home/account token=secret"); };
  for (const override of [ { loadLaunchConfig: fail }, { resolveAdapter: fail }, { confirmationTransport: fail },
    { loadEvidenceBinding: fail }, { readEvidence: fail } ]) {
    const result = await getPersonalConnectionStatus(context, deps(override));
    assert.deepEqual(result, { status: "unavailable", scope: { workspaceRef: "workspace-a", ownerActorRef: owner }, connection: null });
    assert.equal(JSON.stringify(result).includes("private-"), false);
  }
});
