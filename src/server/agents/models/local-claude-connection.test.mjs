import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const jiti = createJiti(import.meta.url, { alias: {
  "@": path.join(root, "src"), "server-only": path.join(root, "src/scripts/smoke/server-only-stub.mjs"),
} });
const { observeLocalClaudeConnection, sanitizeLocalClaudeEnvironment, LOCAL_CLAUDE_ATTESTATION_OPT_IN } = await jiti.import("./local-claude-connection.ts");
const owner = "11111111-1111-4111-8111-111111111111";
const account = "22222222-2222-4222-8222-222222222222";
const nextAccount = "33333333-3333-4333-8333-333333333333";
const context = { workspaceId: "workspace-a", hostRef: "personal-host-1", access: { status: "authorized", user: { id: owner } } };
const binding = { version: 1, placement: "personal_local", ownerActorId: owner, workspaceId: context.workspaceId,
  hostRef: context.hostRef, executablePath: path.resolve("fixture-native-client.exe"),
  approval: { status: "approved", approvalReference: "private-operator-approval-canary" } };
const connectedAuth = { loggedIn: true, authMethod: "claude.ai", apiProvider: "firstParty", email: "synthetic@fixture.test" };
const now = Date.parse("2026-10-22T12:00:00.000Z");
const completed = stdout => ({ kind: "completed", exitCode: 0, stdout, stderr: "" });
function dependencies(overrides = {}) {
  return {
    env: { NODE_ENV: "test", [LOCAL_CLAUDE_ATTESTATION_OPT_IN]: "1", PATH: "native-path-fixture" },
    now: () => now,
    transport: async request => completed(request.args[0] === "--version" ? "2.1.284 (Claude Code)" : JSON.stringify(connectedAuth)),
    resolveAccountId: async () => account,
    ...overrides,
  };
}

test("only two frozen native commands run and return a local observation without dispatch rights or private data", async () => {
  const commands = [], identities = [];
  const result = await observeLocalClaudeConnection(context, binding, dependencies({
    transport: async request => {
      commands.push(request);
      return completed(request.args[0] === "--version" ? "2.1.284 (Claude Code)" : JSON.stringify({ ...connectedAuth,
        orgId: "private-org-canary", accessToken: "private-token-canary", projectsDirectory: "/private-path-canary" }));
    },
    resolveAccountId: async key => { identities.push(key); return account; },
  }));
  assert.deepEqual(commands.map(command => command.args), [["--version"], ["auth", "status", "--json"]]);
  assert.ok(commands.every(command => command.executablePath === binding.executablePath && command.timeoutMs === 10_000));
  assert.deepEqual(identities, [{ provider: "claude-code-cli", workspaceId: context.workspaceId, email: connectedAuth.email }]);
  assert.equal(result.status, "observed"); assert.equal(result.reason, "account_observed");
  assert.equal(result.accountRef, account); assert.notEqual(result.accountRef, owner);
  assert.deepEqual(result.scope, { workspaceRef: context.workspaceId, ownerActorRef: owner, hostRef: context.hostRef });
  assert.equal(result.loginStatus, "recognized"); assert.equal(result.observedAtIso, new Date(now).toISOString());
  assert.equal(result.hqTransport, "not_paired"); assert.equal(result.enablesDispatch, false);
  assert.equal(result.confirmationReadiness, "not_verified"); assert.equal(result.chatStatus, "unavailable");
  assert.equal(result.missionStatus, "not_verified"); assert.equal(result.placement, "personal_local");
  for (const forbidden of ["private-", connectedAuth.email, "executablePath", "approvalReference", "stderr", "stdout", "PATH"]) {
    assert.equal(JSON.stringify(result).includes(forbidden), false, forbidden);
  }
});

test("denied reader, invalid scope, revoked approval and unsupported binding refuse before any command or identity lookup", async () => {
  let commands = 0, identities = 0;
  const deps = dependencies({ transport: async () => { commands++; throw Error(); }, resolveAccountId: async () => { identities++; throw Error(); } });
  const cases = [
    [{ ...context, access: { status: "forbidden", user: { id: owner } } }, binding, "access_denied"],
    [{ ...context, workspaceId: "../other" }, binding, "invalid_context"],
    [{ ...context, hostRef: "https://other.test" }, binding, "invalid_context"],
    [{ ...context, hostRef: "host\nother" }, binding, "invalid_context"],
    [context, { ...binding, ownerActorId: nextAccount }, "scope_mismatch"],
    [context, { ...binding, workspaceId: "workspace-b" }, "scope_mismatch"],
    [context, { ...binding, hostRef: "personal-host-2" }, "scope_mismatch"],
    [context, { ...binding, placement: "vps" }, "invalid_binding"],
    [context, { ...binding, container: "vps-container" }, "invalid_binding"],
    [context, { ...binding, approval: { ...binding.approval, status: "revoked" } }, "invalid_binding"],
    [context, { ...binding, approval: { status: "approved", approvalReference: "" } }, "invalid_binding"],
  ];
  for (const [input, operator, reason] of cases) {
    const result = await observeLocalClaudeConnection(input, operator, deps);
    assert.equal(result.status, "rejected"); assert.equal(result.reason, reason);
    assert.equal(result.accountRef, null); assert.equal(result.scope, null);
  }
  assert.equal(commands, 0); assert.equal(identities, 0);
});

test("all cloud markers defeat every opt-in; local production needs both explicit opt-ins", async () => {
  let calls = 0;
  for (const marker of ["VERCEL", "VERCEL_ENV", "AWS_LAMBDA_FUNCTION_NAME", "K_SERVICE", "FLY_APP_NAME", "RENDER"]) {
    const result = await observeLocalClaudeConnection(context, binding, dependencies({ env: {
      NODE_ENV: "production", ORIA_ENABLE_LOCAL_RUNTIME_PROBE: "1", [LOCAL_CLAUDE_ATTESTATION_OPT_IN]: "1", [marker]: "set",
    }, transport: async () => { calls++; throw Error(); } }));
    assert.equal(result.reason, "environment_forbidden");
  }
  for (const [env, expected] of [
    [{ NODE_ENV: "test" }, "operator_opt_in_required"],
    [{ NODE_ENV: "production", [LOCAL_CLAUDE_ATTESTATION_OPT_IN]: "1" }, "environment_forbidden"],
    [{ NODE_ENV: "production", ORIA_ENABLE_LOCAL_RUNTIME_PROBE: "1" }, "operator_opt_in_required"],
  ]) {
    const result = await observeLocalClaudeConnection(context, binding, dependencies({ env, transport: async () => { calls++; throw Error(); } }));
    assert.equal(result.reason, expected);
  }
  assert.equal(calls, 0);
  const local = await observeLocalClaudeConnection(context, binding, dependencies({ env: {
    NODE_ENV: "production", ORIA_ENABLE_LOCAL_RUNTIME_PROBE: "1", [LOCAL_CLAUDE_ATTESTATION_OPT_IN]: "1",
  } }));
  assert.equal(local.status, "observed");
});

test("a prequalified native absolute path is required; PowerShell and shell shims are never retried", async () => {
  let calls = 0;
  for (const executablePath of ["claude", "relative/client.exe", "https://example.test/claude.exe", "bad\npath",
    ...[".ps1", ".cmd", ".bat", ".sh", ".js", ".mjs", ".cjs", ".py"].map(extension => path.resolve(`fixture-client${extension}`))]) {
    const result = await observeLocalClaudeConnection(context, { ...binding, executablePath }, dependencies({ transport: async () => { calls++; throw Error(); } }));
    assert.equal(result.reason, "invalid_binding");
  }
  assert.equal(calls, 0);
});

test("child environment contains only OS/native-login references and leaves parent untouched", async () => {
  const env = { NODE_ENV: "test", [LOCAL_CLAUDE_ATTESTATION_OPT_IN]: "1", PATH: "path-fixture", Home: "home-fixture",
    APPDATA: "appdata-fixture", SYSTEMROOT: "system-fixture", XDG_CONFIG_HOME: "config-fixture", CLAUDE_CONFIG_DIR: "native-config-fixture",
    ANTHROPIC_API_KEY: "api-canary", OPENAI_API_KEY: "api-canary", custom_api_key: "api-canary", CLAUDE_CODE_OAUTH_TOKEN: "oauth-canary",
    ANTHROPIC_AUTH_TOKEN: "auth-canary", SUPABASE_SERVICE_ROLE_KEY: "hq-canary", VERCEL_TOKEN: "hq-canary", AWS_SECRET_ACCESS_KEY: "cloud-canary",
    ANTHROPIC_BASE_URL: "endpoint-canary", NODE_OPTIONS: "injection-canary", UNRELATED_SECRET: "private-canary" };
  const before = { ...env }, commands = [];
  await observeLocalClaudeConnection(context, binding, dependencies({ env, transport: async request => {
    commands.push(request); return completed(request.args[0] === "--version" ? "2.1.284 (Claude Code)" : JSON.stringify(connectedAuth));
  } }));
  const expected = { PATH: env.PATH, Home: env.Home, APPDATA: env.APPDATA, SYSTEMROOT: env.SYSTEMROOT,
    XDG_CONFIG_HOME: env.XDG_CONFIG_HOME, CLAUDE_CONFIG_DIR: env.CLAUDE_CONFIG_DIR };
  assert.deepEqual(sanitizeLocalClaudeEnvironment(env), expected);
  assert.ok(commands.every(command => JSON.stringify(command.env) === JSON.stringify(expected)));
  assert.deepEqual(env, before);
});

test("API mode, missing native mode and empty subscription shape never call identity resolution", async () => {
  let lookups = 0;
  for (const auth of [
    { ...connectedAuth, authMethod: "api_key" }, { ...connectedAuth, apiProvider: "thirdParty" },
    { loggedIn: true, email: connectedAuth.email },
    { loggedIn: true, authMethod: "claude.ai", subscriptionType: "", email: connectedAuth.email },
    { loggedIn: true, authMethod: "claude.ai", subscriptionType: "   ", email: connectedAuth.email },
    { loggedIn: true, authMethod: "claude.ai", email: connectedAuth.email },
  ]) {
    const result = await observeLocalClaudeConnection(context, binding, dependencies({
      transport: async request => completed(request.args[0] === "--version" ? "2.1.284 (Claude Code)" : JSON.stringify(auth)),
      resolveAccountId: async () => { lookups++; return account; },
    }));
    assert.equal(result.status, "identity_unverifiable"); assert.equal(result.loginStatus, "unknown"); assert.equal(result.accountRef, null);
  }
  assert.equal(lookups, 0);
});

test("older official native subscription shape is accepted, without an API key fallback", async () => {
  const auth = { loggedIn: true, authMethod: "claude.ai", subscriptionType: "pro", email: connectedAuth.email };
  const result = await observeLocalClaudeConnection(context, binding, dependencies({
    transport: async request => completed(request.args[0] === "--version" ? "2.1.284 (Claude Code)" : JSON.stringify(auth)),
  }));
  assert.equal(result.status, "observed");
});

test("recognized login without person evidence or durable resolution does not invent an account", async () => {
  for (const auth of [{ ...connectedAuth, email: undefined }, { ...connectedAuth, email: undefined, orgId: "shared-org" }]) {
    let lookups = 0;
    const result = await observeLocalClaudeConnection(context, binding, dependencies({
      transport: async request => completed(request.args[0] === "--version" ? "2.1.284 (Claude Code)" : JSON.stringify(auth)),
      resolveAccountId: async () => { lookups++; return account; },
    }));
    assert.equal(result.status, "identity_unverifiable"); assert.equal(result.accountRef, null); assert.equal(lookups, 0);
  }
  for (const resolveAccountId of [async () => { throw Error("private-lookup-canary"); }, async () => "profile-1", async () => connectedAuth.email]) {
    const result = await observeLocalClaudeConnection(context, binding, dependencies({ resolveAccountId }));
    assert.equal(result.status, "identity_unverifiable"); assert.equal(result.accountRef, null);
    assert.equal(JSON.stringify(result).includes("private-"), false);
  }
});

test("disconnected, malformed, timed-out, missing and thrown transport outcomes stay closed without retries", async () => {
  for (const outcome of [completed(JSON.stringify({ loggedIn: false })), completed("not-json"),
    { kind: "timeout", timeoutMs: 10_000 }, { kind: "not_found" }, { kind: "completed", exitCode: 1, stdout: "private-output", stderr: "private-error" }]) {
    let calls = 0, lookups = 0;
    const result = await observeLocalClaudeConnection(context, binding, dependencies({ transport: async request => {
      calls++; return request.args[0] === "--version" ? completed("2.1.284 (Claude Code)") : outcome;
    }, resolveAccountId: async () => { lookups++; return account; } }));
    assert.ok(["connection_required", "unavailable"].includes(result.status));
    assert.equal(result.accountRef, null); assert.equal(calls, 2); assert.equal(lookups, 0);
    assert.equal(JSON.stringify(result).includes("private-"), false);
  }
  const thrown = await observeLocalClaudeConnection(context, binding, dependencies({ transport: async () => { throw Error("private-exception-canary"); } }));
  assert.equal(thrown.status, "unavailable"); assert.equal(JSON.stringify(thrown).includes("private-"), false);
});

test("observations are fresh per explicit call and account changes never change the local host identity", async () => {
  let calls = 0;
  const deps = dependencies({ resolveAccountId: async () => ++calls === 1 ? account : nextAccount });
  const first = await observeLocalClaudeConnection(context, binding, deps);
  const second = await observeLocalClaudeConnection(context, binding, deps);
  assert.equal(first.accountRef, account); assert.equal(second.accountRef, nextAccount);
  assert.deepEqual(first.scope, second.scope); assert.equal(first.hqTransport, "not_paired");
});
