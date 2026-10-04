#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..", "..");

test("Runner executor connection probe tests", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const {
    readRunnerProbeBinding,
    createConfiguredRunnerConnectionProbe,
    buildRunnerSshInvocation,
    resolveRunnerProbeEnvironment,
    createRunnerSshCommandRunner,
    createRunnerClaudeCliConnectionProbe,
    RUNNER_EXECUTOR_PROBE_APPROVAL,
    RUNNER_SSH_HOST_ENV_VAR,
    RUNNER_SSH_IDENTITY_FILE_ENV_VAR,
    RUNNER_CLAUDE_VERSION_COMMAND,
    RUNNER_CLAUDE_AUTH_STATUS_COMMAND,
  } = await jiti.import(path.join(__dirname, "runner-executor-connection-probe.ts"));
  const { isExecutionReady } = await jiti.import(path.join(__dirname, "provider-connection-discovery.ts"));

  const CLAUDE_PROVIDER = { id: "claude-code-cli", label: "Claude Code CLI", kind: "api", trustLevel: "reviewed", supportsMcp: false, supportsToolUse: true };
  const CODEX_PROVIDER = { id: "codex-acp-cli", label: "Codex ACP", kind: "api", trustLevel: "reviewed", supportsMcp: false, supportsToolUse: true };

  const binding = {
    version: 1, workspaceId: "workspace-a", provider: "claude-code-cli",
    approval: { status: "approved", approvalReference: "test fixture approval only" },
    sshHost: "runner@example.invalid", sshIdentityFile: path.resolve(os.tmpdir(), "fixture-key-not-read"),
    container: "qualified-claude-login",
  };
  async function withBinding(value, run) {
    const dir = await mkdtemp(path.join(os.tmpdir(), "runner-binding-test-"));
    const file = path.join(dir, "binding.json");
    try {
      await writeFile(file, typeof value === "string" ? value : JSON.stringify(value));
      await run({ NODE_ENV: "test", ORIA_OPENHANDS_RUNNER_PROBE_CONFIG_FILE: file }, file);
    } finally { await rm(dir, { recursive: true, force: true }); }
  }

  await t.test("operator binding absent, relative, unreadable or workspace-mismatched stays closed", async () => {
    assert.equal(await readRunnerProbeBinding("workspace-a", {}), null);
    assert.equal(await readRunnerProbeBinding("workspace-a", { ORIA_OPENHANDS_RUNNER_PROBE_CONFIG_FILE: "relative.json" }), null);
    await withBinding(binding, async (env, file) => {
      assert.deepEqual(await readRunnerProbeBinding("workspace-a", env), binding);
      assert.equal(await readRunnerProbeBinding("workspace-b", env), null);
      assert.equal(await readRunnerProbeBinding("workspace-a", { ...env, VERCEL: "1" }), null);
      assert.equal(await readRunnerProbeBinding("workspace-a", { ...env, NODE_ENV: "production" }), null);
      assert.deepEqual(await readRunnerProbeBinding("workspace-a", { ...env, NODE_ENV: "production", ORIA_ENABLE_OPENHANDS_RUNNER_PROBE: "1" }), binding);
      await rm(file);
      assert.equal(await readRunnerProbeBinding("workspace-a", env), null);
    });
  });

  await t.test("strict operator schema rejects malformed, unapproved and unsafe bindings", async () => {
    for (const value of [
      "{invalid", " ".repeat(16385),
      { ...binding, approval: { status: "not_approved" } },
      { ...binding, approval: { status: "approved", approvalReference: "   " } },
      { ...binding, workspaceId: "" }, { ...binding, provider: "codex-acp-cli" },
      { ...binding, container: "login; id" }, { ...binding, container: "--privileged" },
      { ...binding, sshHost: "-oProxyCommand=anything" }, { ...binding, sshHost: "host;id" },
      { ...binding, sshIdentityFile: "relative-key" }, { ...binding, version: 2 },
      { ...binding, remoteCommand: "anything" },
    ]) await withBinding(value, async (env) => {
      assert.equal(await readRunnerProbeBinding("workspace-a", env), null);
      let constructed = 0;
      const probe = createConfiguredRunnerConnectionProbe("workspace-a", { env, runnerFactory: () => { constructed++; throw Error("must not construct"); } });
      assert.equal((await probe(CLAUDE_PROVIDER, [])).connectionState, "unknown");
      assert.equal(constructed, 0);
    });
  });

  await t.test("SSH invocation is fixed Docker status only with strict host verification", () => {
    for (const command of [RUNNER_CLAUDE_VERSION_COMMAND, RUNNER_CLAUDE_AUTH_STATUS_COMMAND]) {
      const args = buildRunnerSshInvocation(binding.sshHost, binding.sshIdentityFile, binding.container, command);
      assert.deepEqual(args.slice(-2), [binding.sshHost, `docker exec ${binding.container} /usr/local/bin/claude-agent-acp --cli ${command === RUNNER_CLAUDE_VERSION_COMMAND ? "--version" : "auth status --json"}`]);
      assert.ok(args.includes("StrictHostKeyChecking=yes"));
      assert.ok(args.includes("IdentitiesOnly=yes"));
      assert.ok(!args.includes("StrictHostKeyChecking=accept-new"));
    }
    for (const command of ["claude -p hello", "claude auth login", "claude --version; id", "docker ps", ""]) {
      assert.equal(buildRunnerSshInvocation(binding.sshHost, binding.sshIdentityFile, binding.container, command), null);
    }
    for (const container of [undefined, "", "--privileged", "name$(id)", "name;id", "name with space"]) {
      assert.equal(buildRunnerSshInvocation(binding.sshHost, binding.sshIdentityFile, container, RUNNER_CLAUDE_VERSION_COMMAND), null);
    }
  });

  await t.test("approved transport still rejects arbitrary commands and missing container before spawn", async () => {
    const env = { NODE_ENV: "test", [RUNNER_SSH_HOST_ENV_VAR]: binding.sshHost, [RUNNER_SSH_IDENTITY_FILE_ENV_VAR]: binding.sshIdentityFile };
    const runner = createRunnerSshCommandRunner(binding.approval, { env, container: binding.container });
    assert.equal((await runner("claude -p forbidden")).kind, "rejected");
    assert.equal((await createRunnerSshCommandRunner(binding.approval, { env })(RUNNER_CLAUDE_VERSION_COMMAND)).kind, "rejected");
  });

  await t.test("configured probe attests only its workspace and rereads revocation before next probe", async () => {
    await withBinding(binding, async (env, file) => {
      const commands = [];
      const runnerFactory = (actual) => {
        assert.deepEqual(actual, binding);
        return async (command) => {
          commands.push(command);
          return { kind: "completed", exitCode: 0, stderr: "", stdout: command === RUNNER_CLAUDE_VERSION_COMMAND ? "2.0.0 (Claude Code)" : JSON.stringify({ loggedIn: true, authMethod: "claude.ai", apiProvider: "firstParty", email: "binding-fixture@example.invalid" }) };
        };
      };
      const probe = createConfiguredRunnerConnectionProbe("workspace-a", { env, runnerFactory });
      const first = await probe(CLAUDE_PROVIDER, []);
      assert.equal(first.connectionState, "connected");
      assert.match(first.accountId, /^[0-9a-f-]{36}$/);
      assert.equal(JSON.stringify(first).includes("binding-fixture@example.invalid"), false);
      assert.deepEqual(commands, [RUNNER_CLAUDE_VERSION_COMMAND, RUNNER_CLAUDE_AUTH_STATUS_COMMAND]);
      const other = await createConfiguredRunnerConnectionProbe("workspace-b", { env, runnerFactory })(CLAUDE_PROVIDER, []);
      assert.equal(other.connectionState, "unknown");
      assert.equal(commands.length, 2);
      await writeFile(file, JSON.stringify({ ...binding, approval: { status: "not_approved" } }));
      assert.equal((await probe(CLAUDE_PROVIDER, [])).connectionState, "unknown");
      assert.equal(commands.length, 2);
    });
  });

  await t.test("production default launch factory reads workspace operator binding without injected probe", async () => {
    const { createDefaultConnectionProbe } = await jiti.import(path.join(projectRoot, "src/server/missions/model-emission-launch-gate.ts"));
    await withBinding({ ...binding, approval: { status: "not_approved" } }, async (env) => {
      const original = process.env.ORIA_OPENHANDS_RUNNER_PROBE_CONFIG_FILE;
      try {
        process.env.ORIA_OPENHANDS_RUNNER_PROBE_CONFIG_FILE = env.ORIA_OPENHANDS_RUNNER_PROBE_CONFIG_FILE;
        const outcome = await createDefaultConnectionProbe("workspace-a")(CLAUDE_PROVIDER, []);
        assert.equal(outcome.connectionState, "unknown");
        assert.match(outcome.requiredAction, /operator binding/);
      } finally {
        if (original === undefined) delete process.env.ORIA_OPENHANDS_RUNNER_PROBE_CONFIG_FILE;
        else process.env.ORIA_OPENHANDS_RUNNER_PROBE_CONFIG_FILE = original;
      }
    });
  });

  // ---------------------------------------------------------------------
  // Environment gate — same doctrine as the local and Hermes probes.
  // ---------------------------------------------------------------------

  await t.test("environment gate: cloud markers always refuse", () => {
    assert.equal(resolveRunnerProbeEnvironment({ VERCEL: "1" }).allowed, false);
    assert.equal(resolveRunnerProbeEnvironment({ FLY_APP_NAME: "x" }).allowed, false);
  });

  await t.test("environment gate: production requires the explicit opt-in flag", () => {
    assert.equal(resolveRunnerProbeEnvironment({ NODE_ENV: "production" }).allowed, false);
    assert.equal(resolveRunnerProbeEnvironment({ NODE_ENV: "production", ORIA_ENABLE_OPENHANDS_RUNNER_PROBE: "1" }).allowed, true);
  });

  await t.test("environment gate: a non-production operator shell is sanctioned by default", () => {
    assert.equal(resolveRunnerProbeEnvironment({}).allowed, true);
  });

  // ---------------------------------------------------------------------
  // The default approval — deliberately absent, unlike the local/Hermes
  // probes which have a real written approval already.
  // ---------------------------------------------------------------------

  await t.test("RUNNER_EXECUTOR_PROBE_APPROVAL remains not_approved; only operator configuration can approve", () => {
    assert.deepEqual(RUNNER_EXECUTOR_PROBE_APPROVAL, { status: "not_approved" });
  });

  // ---------------------------------------------------------------------
  // createRunnerSshCommandRunner — every missing prerequisite is named,
  // nothing ever spawns in this environment.
  // ---------------------------------------------------------------------

  await t.test("no approval: every call is rejected before spawning, naming the missing approval", async () => {
    const runner = createRunnerSshCommandRunner(RUNNER_EXECUTOR_PROBE_APPROVAL, { env: {} });
    const outcome = await runner("claude --version");
    assert.equal(outcome.kind, "rejected");
    assert.match(outcome.reason, /not approved in writing/);
  });

  await t.test("approved, but no SSH host configured: rejected, naming the exact missing env var", async () => {
    const runner = createRunnerSshCommandRunner(
      { status: "approved", approvalReference: "test-only synthetic approval, 10+ chars" },
      { env: {} },
    );
    const outcome = await runner(RUNNER_CLAUDE_VERSION_COMMAND);
    assert.equal(outcome.kind, "rejected");
    assert.ok(outcome.reason.includes(RUNNER_SSH_HOST_ENV_VAR));
  });

  await t.test("approved and host configured, but no identity file: rejected, naming the exact missing env var", async () => {
    const runner = createRunnerSshCommandRunner(
      { status: "approved", approvalReference: "test-only synthetic approval, 10+ chars" },
      { env: { [RUNNER_SSH_HOST_ENV_VAR]: "root@example.invalid" } },
    );
    const outcome = await runner(RUNNER_CLAUDE_AUTH_STATUS_COMMAND);
    assert.equal(outcome.kind, "rejected");
    assert.ok(outcome.reason.includes(RUNNER_SSH_IDENTITY_FILE_ENV_VAR));
  });

  await t.test("a cloud marker refuses even with a full approval and host/identity configured", async () => {
    const runner = createRunnerSshCommandRunner(
      { status: "approved", approvalReference: "test-only synthetic approval, 10+ chars" },
      {
        env: {
          VERCEL: "1",
          [RUNNER_SSH_HOST_ENV_VAR]: "root@example.invalid",
          [RUNNER_SSH_IDENTITY_FILE_ENV_VAR]: "/dev/null",
        },
      },
    );
    const outcome = await runner(RUNNER_CLAUDE_VERSION_COMMAND);
    assert.equal(outcome.kind, "rejected");
    assert.match(outcome.reason, /execution environment forbidden/);
  });

  // ---------------------------------------------------------------------
  // createRunnerClaudeCliConnectionProbe — classification reused unmodified
  // from classifyClaudeCodeProbe (local-runtime-probe.ts), exercised here
  // with an injected runner so no real SSH ever spawns in this test.
  // ---------------------------------------------------------------------

  function injectedRunner(byCommand) {
    return async (remoteCommand) => byCommand[remoteCommand] ?? { kind: "spawn_error", message: "unexpected command in test" };
  }

  await t.test("logged in WITHOUT an orgId in the auth response: connected, but no accountId — never fabricated from loggedIn/authMethod alone", async () => {
    const probe = createRunnerClaudeCliConnectionProbe(
      injectedRunner({
        [RUNNER_CLAUDE_VERSION_COMMAND]: { kind: "completed", exitCode: 0, stdout: "1.50.0 (Claude Code)", stderr: "" },
        [RUNNER_CLAUDE_AUTH_STATUS_COMMAND]: { kind: "completed", exitCode: 0, stdout: JSON.stringify({ loggedIn: true, authMethod: "oauth" }), stderr: "" },
      }),
    );
    const outcome = await probe(CLAUDE_PROVIDER, []);
    assert.equal(outcome.connectionState, "connected");
    assert.equal(outcome.source, "cli-subscription-login");
    assert.equal(isExecutionReady(outcome), true);
    assert.equal(outcome.requiredAction, undefined, "a connected outcome must carry no requiredAction");
    assert.equal("accountId" in outcome, false);
  });

  await t.test("CORRECTION (independent review): logged in WITH a real orgId still attests NO accountId — orgId is an organization identifier, never a user one", async () => {
    const probe = createRunnerClaudeCliConnectionProbe(
      injectedRunner({
        [RUNNER_CLAUDE_VERSION_COMMAND]: { kind: "completed", exitCode: 0, stdout: "1.50.0 (Claude Code)", stderr: "" },
        [RUNNER_CLAUDE_AUTH_STATUS_COMMAND]: {
          kind: "completed", exitCode: 0,
          stdout: JSON.stringify({ loggedIn: true, authMethod: "claude.ai", orgId: "06e7421e-6478-4124-b2fa-3aff4368260a", subscriptionType: "pro" }),
          stderr: "",
        },
      }),
    );
    const outcome = await probe(CLAUDE_PROVIDER, []);
    assert.equal(outcome.connectionState, "connected");
    // An earlier version of this test asserted accountId WAS populated
    // here (a hash of orgId). That was the bug: hashing an org-scoped
    // value never turns it into a user-scoped one. Reverted — see
    // classifyClaudeCodeProbe's own comment for the full correction.
    assert.equal("accountId" in outcome, false);
  });

  await t.test("two DIFFERENT users under the SAME organization, NO workspace bound at construction: both connect, neither attests an accountId — never conflated into the same identity", async () => {
    const probeFor = (email) => createRunnerClaudeCliConnectionProbe(
      injectedRunner({
        [RUNNER_CLAUDE_VERSION_COMMAND]: { kind: "completed", exitCode: 0, stdout: "1.50.0 (Claude Code)", stderr: "" },
        [RUNNER_CLAUDE_AUTH_STATUS_COMMAND]: {
          kind: "completed", exitCode: 0,
          stdout: JSON.stringify({ loggedIn: true, authMethod: "claude.ai", email, orgId: "06e7421e-6478-4124-b2fa-3aff4368260a", orgName: "Shared Org", subscriptionType: "pro" }),
          stderr: "",
        },
      }),
      // No options: no workspace bound, so no attestation is attempted at
      // all, regardless of what the auth response carries.
    );
    const outcomeAlice = await probeFor("alice@example.com")(CLAUDE_PROVIDER, []);
    const outcomeBob = await probeFor("bob@example.com")(CLAUDE_PROVIDER, []);
    assert.equal(outcomeAlice.connectionState, "connected");
    assert.equal(outcomeBob.connectionState, "connected");
    assert.equal("accountId" in outcomeAlice, false);
    assert.equal("accountId" in outcomeBob, false);
    // Had accountId been derived from orgId, these two different people
    // would have attested identically — exactly what must never happen.
  });

  // ---------------------------------------------------------------------
  // Opaque account attestation — a workspace bound at construction (see
  // model-emission-launch-gate.ts's createDefaultConnectionProbe) lets a
  // real `email` in the auth response resolve to a real, server-persisted
  // opaque accountId via account-identity-repository.ts's
  // resolveOpaqueAccountId (the real function — not a fixture — since no
  // Supabase config exists in this test process, it exercises the explicit,
  // non-production, in-memory fallback path unchanged).
  // ---------------------------------------------------------------------

  function probeWithEmail(email, options) {
    return createRunnerClaudeCliConnectionProbe(
      injectedRunner({
        [RUNNER_CLAUDE_VERSION_COMMAND]: { kind: "completed", exitCode: 0, stdout: "1.50.0 (Claude Code)", stderr: "" },
        [RUNNER_CLAUDE_AUTH_STATUS_COMMAND]: {
          kind: "completed", exitCode: 0,
          stdout: JSON.stringify({ loggedIn: true, authMethod: "claude.ai", apiProvider: "firstParty", email, orgId: "06e7421e-6478-4124-b2fa-3aff4368260a", subscriptionType: "pro" }),
          stderr: "",
        },
      }),
      options,
    );
  }

  await t.test("workspace bound, real resolveOpaqueAccountId, email present: a real opaque accountId is attested — never the raw email, never a hash of it", async () => {
    const probe = probeWithEmail("alice@example.com", { workspaceId: "workspace-a" });
    const outcome = await probe(CLAUDE_PROVIDER, []);
    assert.equal(outcome.connectionState, "connected");
    assert.equal(typeof outcome.accountId, "string");
    assert.match(outcome.accountId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    assert.notEqual(outcome.accountId, "alice@example.com");
    assert.ok(!JSON.stringify(outcome).includes("alice@example.com"), "the outcome must never carry the raw email");
  });

  await t.test("workspace bound, runner auth shape without apiProvider but with subscriptionType still attests the real account", async () => {
    const probe = createRunnerClaudeCliConnectionProbe(
      injectedRunner({
        [RUNNER_CLAUDE_VERSION_COMMAND]: { kind: "completed", exitCode: 0, stdout: "1.50.0 (Claude Code)", stderr: "" },
        [RUNNER_CLAUDE_AUTH_STATUS_COMMAND]: {
          kind: "completed",
          exitCode: 0,
          stdout: JSON.stringify({ loggedIn: true, authMethod: "claude.ai", email: "runner-account@example.com", orgId: "06e7421e-6478-4124-b2fa-3aff4368260a", subscriptionType: "pro" }),
          stderr: "",
        },
      }),
      { workspaceId: "workspace-a" },
    );
    const outcome = await probe(CLAUDE_PROVIDER, []);
    assert.equal(outcome.connectionState, "connected");
    assert.equal(typeof outcome.accountId, "string");
    assert.notEqual(outcome.accountId, "runner-account@example.com");
    assert.ok(!JSON.stringify(outcome).includes("runner-account@example.com"), "the outcome must never carry the raw email");
  });

  await t.test("workspace bound, same email probed twice: the SAME opaque accountId comes back both times — stable across repeated probes", async () => {
    const probe = probeWithEmail("stable@example.com", { workspaceId: "workspace-a" });
    const first = await probe(CLAUDE_PROVIDER, []);
    const second = await probe(CLAUDE_PROVIDER, []);
    assert.equal(first.accountId, second.accountId);
  });

  await t.test("workspace bound, two DIFFERENT emails under the same workspace/org: two DIFFERENT opaque accountIds — never conflated", async () => {
    const alice = await probeWithEmail("alice2@example.com", { workspaceId: "workspace-a" })(CLAUDE_PROVIDER, []);
    const bob = await probeWithEmail("bob2@example.com", { workspaceId: "workspace-a" })(CLAUDE_PROVIDER, []);
    assert.equal(typeof alice.accountId, "string");
    assert.equal(typeof bob.accountId, "string");
    assert.notEqual(alice.accountId, bob.accountId);
  });

  await t.test("mode API refusé: workspace bound, email present, but apiProvider is NOT firstParty (API key, not subscription): still no accountId", async () => {
    const probe = createRunnerClaudeCliConnectionProbe(
      injectedRunner({
        [RUNNER_CLAUDE_VERSION_COMMAND]: { kind: "completed", exitCode: 0, stdout: "1.50.0 (Claude Code)", stderr: "" },
        [RUNNER_CLAUDE_AUTH_STATUS_COMMAND]: {
          kind: "completed", exitCode: 0,
          stdout: JSON.stringify({ loggedIn: true, authMethod: "claude.ai", apiProvider: "anthropic-api-key", email: "api-key-user@example.com" }),
          stderr: "",
        },
      }),
      { workspaceId: "workspace-a" },
    );
    const outcome = await probe(CLAUDE_PROVIDER, []);
    // classifyClaudeCodeProbe only requires loggedIn===true for "ready", so
    // the connection itself still shows connected — the API/subscription
    // distinction is this file's OWN extra gate on the attestation, not a
    // reclassification of the connection state itself.
    assert.equal(outcome.connectionState, "connected");
    assert.equal("accountId" in outcome, false);
  });

  await t.test("mode API refusé: workspace bound, email present, apiProvider is firstParty but authMethod is not claude.ai: still no accountId", async () => {
    const probe = createRunnerClaudeCliConnectionProbe(
      injectedRunner({
        [RUNNER_CLAUDE_VERSION_COMMAND]: { kind: "completed", exitCode: 0, stdout: "1.50.0 (Claude Code)", stderr: "" },
        [RUNNER_CLAUDE_AUTH_STATUS_COMMAND]: {
          kind: "completed", exitCode: 0,
          stdout: JSON.stringify({ loggedIn: true, authMethod: "oauth", apiProvider: "firstParty", email: "oauth-user@example.com" }),
          stderr: "",
        },
      }),
      { workspaceId: "workspace-a" },
    );
    const outcome = await probe(CLAUDE_PROVIDER, []);
    assert.equal(outcome.connectionState, "connected");
    assert.equal("accountId" in outcome, false);
  });

  await t.test("workspace bound, SAME email under two DIFFERENT workspaces: two DIFFERENT opaque accountIds — workspace isolation holds for the identity axis too", async () => {
    const workspaceOne = await probeWithEmail("shared@example.com", { workspaceId: "workspace-one" })(CLAUDE_PROVIDER, []);
    const workspaceTwo = await probeWithEmail("shared@example.com", { workspaceId: "workspace-two" })(CLAUDE_PROVIDER, []);
    assert.notEqual(workspaceOne.accountId, workspaceTwo.accountId);
  });

  await t.test("workspace bound, but the auth response carries no email: still no accountId — connected is never enough on its own", async () => {
    const probe = createRunnerClaudeCliConnectionProbe(
      injectedRunner({
        [RUNNER_CLAUDE_VERSION_COMMAND]: { kind: "completed", exitCode: 0, stdout: "1.50.0 (Claude Code)", stderr: "" },
        [RUNNER_CLAUDE_AUTH_STATUS_COMMAND]: { kind: "completed", exitCode: 0, stdout: JSON.stringify({ loggedIn: true, authMethod: "claude.ai" }), stderr: "" },
      }),
      { workspaceId: "workspace-a" },
    );
    const outcome = await probe(CLAUDE_PROVIDER, []);
    assert.equal(outcome.connectionState, "connected");
    assert.equal("accountId" in outcome, false);
  });

  await t.test("workspace bound, email present, but identity persistence itself fails: connected, no accountId, the probe never throws and never exposes the lookup email", async () => {
    const failing = async () => { throw new Error("private@example.com persistence unavailable"); };
    const probe = probeWithEmail("private@example.com", { workspaceId: "workspace-a", resolveAccountId: failing });
    const outcome = await probe(CLAUDE_PROVIDER, []);
    assert.equal(outcome.connectionState, "connected");
    assert.equal("accountId" in outcome, false);
  });

  await t.test("workspace bound, but not actually logged in (blocked): no account resolution is even attempted", async () => {
    let calls = 0;
    const probe = createRunnerClaudeCliConnectionProbe(
      injectedRunner({
        [RUNNER_CLAUDE_VERSION_COMMAND]: { kind: "completed", exitCode: 0, stdout: "1.50.0 (Claude Code)", stderr: "" },
        [RUNNER_CLAUDE_AUTH_STATUS_COMMAND]: { kind: "completed", exitCode: 0, stdout: JSON.stringify({ loggedIn: false, email: "nope@example.com" }), stderr: "" },
      }),
      { workspaceId: "workspace-a", resolveAccountId: async () => { calls += 1; return "should-never-be-called"; } },
    );
    const outcome = await probe(CLAUDE_PROVIDER, []);
    assert.equal(outcome.connectionState, "connection_required");
    assert.equal("accountId" in outcome, false);
    assert.equal(calls, 0, "a blocked (not logged in) classification must never reach identity resolution");
  });

  await t.test("installed but not logged in classifies as connection_required, never silently connected", async () => {
    const probe = createRunnerClaudeCliConnectionProbe(
      injectedRunner({
        [RUNNER_CLAUDE_VERSION_COMMAND]: { kind: "completed", exitCode: 0, stdout: "1.50.0 (Claude Code)", stderr: "" },
        [RUNNER_CLAUDE_AUTH_STATUS_COMMAND]: { kind: "completed", exitCode: 0, stdout: JSON.stringify({ loggedIn: false }), stderr: "" },
      }),
    );
    const outcome = await probe(CLAUDE_PROVIDER, []);
    assert.equal(outcome.connectionState, "connection_required");
    assert.equal(outcome.source, "cli-subscription-login");
    assert.equal(isExecutionReady(outcome), false);
  });

  await t.test("a timeout, spawn error, or rejection on the runner all become unknown, never a guessed state", async () => {
    for (const failure of [
      { kind: "timeout", timeoutMs: 15000 },
      { kind: "spawn_error", message: "ENOENT" },
      { kind: "rejected", reason: "not approved" },
    ]) {
      const probe = createRunnerClaudeCliConnectionProbe(
        injectedRunner({ [RUNNER_CLAUDE_VERSION_COMMAND]: failure, [RUNNER_CLAUDE_AUTH_STATUS_COMMAND]: failure }),
      );
      const outcome = await probe(CLAUDE_PROVIDER, []);
      assert.equal(outcome.connectionState, "unknown");
      assert.equal(outcome.source, "declared-capability");
      assert.ok(isExecutionReady(outcome) === false);
    }
  });

  await t.test("malformed/non-JSON auth output classifies as unknown, never a false positive", async () => {
    const probe = createRunnerClaudeCliConnectionProbe(
      injectedRunner({
        [RUNNER_CLAUDE_VERSION_COMMAND]: { kind: "completed", exitCode: 0, stdout: "1.50.0 (Claude Code)", stderr: "" },
        [RUNNER_CLAUDE_AUTH_STATUS_COMMAND]: { kind: "completed", exitCode: 0, stdout: "not json at all", stderr: "" },
      }),
    );
    const outcome = await probe(CLAUDE_PROVIDER, []);
    assert.equal(outcome.connectionState, "unknown");
  });

  await t.test("codex-acp-cli gets its own named, specific gap — never the generic 'this probe only checks' abstention, never guessed from file presence", async () => {
    const probe = createRunnerClaudeCliConnectionProbe(injectedRunner({}));
    const outcome = await probe(CODEX_PROVIDER, []);
    assert.equal(outcome.connectionState, "unknown");
    assert.equal(outcome.source, "declared-capability");
    assert.ok(outcome.requiredAction.includes("Codex ACP candidate runtime"));
    assert.ok(!outcome.requiredAction.startsWith("this probe only checks"));
  });

  await t.test("an unrelated provider id gets the generic honest abstention, composable with composeProviderConnectionProbes", async () => {
    const probe = createRunnerClaudeCliConnectionProbe(injectedRunner({}));
    const outcome = await probe({ id: "openrouter", label: "OpenRouter", kind: "router", trustLevel: "allowlisted", supportsMcp: false, supportsToolUse: true }, []);
    assert.equal(outcome.connectionState, "unknown");
    assert.equal(outcome.source, "declared-capability");
    assert.ok(outcome.requiredAction.startsWith("this probe only checks"));
  });

  await t.test("end-to-end default construction (no injected runner, no approval, no host): resolves to unknown, nothing spawns", async () => {
    const probe = createRunnerClaudeCliConnectionProbe();
    const outcome = await probe(CLAUDE_PROVIDER, []);
    assert.equal(outcome.connectionState, "unknown");
    assert.equal(isExecutionReady(outcome), false);
  });
});
