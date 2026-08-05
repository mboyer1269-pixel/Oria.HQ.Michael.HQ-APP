#!/usr/bin/env node

// src/server/ai/local-cli-json-client.test.mjs
//
// V7 Phase 1 step 2 — structured JSON through a local, already-logged-in agent
// CLI instead of an API key.
//
// The runner is injected everywhere, so nothing here spawns a process, spends a
// subscription, or needs a login. What IS exercised for real is the parsing and
// the refusal gates — the parts that decide whether a subscription gets spent
// and whether a refusal is reported honestly.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
  },
});

const {
  LOCAL_CLI_COMMAND_ALLOWLIST,
  LOCAL_CLI_INFERENCE_OPT_IN_ENV_VAR,
  createLocalCliRunner,
  extractJsonFromText,
  generateJsonWithLocalCli,
  isAllowlistedLocalCliCommand,
  readClaudeEnvelope,
} = await jiti.import(path.join(__dirname, "local-cli-json-client.ts"));

const CLAUDE_SPEC = LOCAL_CLI_COMMAND_ALLOWLIST.find((s) => s.runtime === "claude_code_cli");
const CODEX_SPEC = LOCAL_CLI_COMMAND_ALLOWLIST.find((s) => s.runtime === "codex_cli");

/** Envelope shape captured from a real `claude -p --output-format json` run. */
function claudeEnvelope({ result, isError = false, input = 120, output = 45, cost = 0.0012 }) {
  return JSON.stringify({
    type: "result",
    subtype: "success",
    is_error: isError,
    duration_ms: 1041,
    num_turns: 1,
    result,
    session_id: "1c2360f2-7715-44f5-bf3b-9149dc50e779",
    total_cost_usd: cost,
    usage: { input_tokens: input, output_tokens: output },
  });
}

function runnerReturning(outcome, capture) {
  return async (input) => {
    if (capture) Object.assign(capture, input);
    return outcome;
  };
}

test("Local CLI client — allowlist (V7 Phase 1 step 2)", async (t) => {
  await t.test("the frozen specs are allowlisted", () => {
    assert.equal(isAllowlistedLocalCliCommand(CLAUDE_SPEC), true);
    assert.equal(isAllowlistedLocalCliCommand(CODEX_SPEC), true);
  });

  await t.test("claude runs with no tools and codex read-only", () => {
    // The whole safety story for spending a subscription: these processes may
    // produce text and nothing else.
    assert.ok(CLAUDE_SPEC.args.includes("--allowedTools"));
    assert.ok(CODEX_SPEC.args.includes("--sandbox"));
    assert.ok(CODEX_SPEC.args.includes("read-only"));
  });

  await t.test("a tampered argument is refused", () => {
    for (const mutation of [
      { ...CLAUDE_SPEC, args: [...CLAUDE_SPEC.args, "--dangerously-skip-permissions"] },
      { ...CLAUDE_SPEC, args: ["-p", "--output-format", "json", "--allowedTools", "Bash"] },
      { ...CODEX_SPEC, args: ["exec", "--sandbox", "danger-full-access"] },
      { ...CODEX_SPEC, args: [...CODEX_SPEC.args, "--dangerously-bypass-approvals-and-sandbox"] },
      { ...CLAUDE_SPEC, binary: "sh" },
      { ...CLAUDE_SPEC, outputShape: "raw_text" },
    ]) {
      assert.equal(
        isAllowlistedLocalCliCommand(mutation),
        false,
        `must refuse ${JSON.stringify(mutation.args ?? mutation.binary)}`,
      );
    }
  });

  await t.test("no argument carries a bare dash marker", () => {
    // A lone "-" cannot pass the shared safe-token check. Codex reads stdin when
    // no prompt argument is given, so the marker is simply omitted rather than
    // loosening the token rule for one literal.
    for (const spec of LOCAL_CLI_COMMAND_ALLOWLIST) {
      assert.ok(!spec.args.includes("-"), `${spec.runtime} must not pass a bare dash`);
    }
  });

  await t.test("a shell metacharacter in a binary is refused", () => {
    assert.equal(isAllowlistedLocalCliCommand({ ...CLAUDE_SPEC, binary: "claude; rm -rf /" }), false);
  });
});

test("Local CLI client — refusal gates (V7 Phase 1 step 2)", async (t) => {
  const baseSpawn = { spec: CLAUDE_SPEC, stdin: "hello", timeoutMs: 1000 };

  await t.test("refuses without the explicit opt-in", async () => {
    const runner = createLocalCliRunner({ env: { NODE_ENV: "development" } });
    const outcome = await runner(baseSpawn);

    assert.equal(outcome.kind, "rejected");
    assert.match(outcome.reason, new RegExp(LOCAL_CLI_INFERENCE_OPT_IN_ENV_VAR));
  });

  await t.test("refuses in the cloud even when opted in", async () => {
    // A personal subscription is never spent by a deployed host.
    const runner = createLocalCliRunner({
      env: {
        NODE_ENV: "production",
        VERCEL: "1",
        [LOCAL_CLI_INFERENCE_OPT_IN_ENV_VAR]: "1",
      },
    });
    const outcome = await runner(baseSpawn);

    assert.equal(outcome.kind, "rejected");
    assert.match(outcome.reason, /environment forbidden/);
  });

  await t.test("refuses a command that is not on the allowlist", async () => {
    const runner = createLocalCliRunner({
      env: { NODE_ENV: "development", [LOCAL_CLI_INFERENCE_OPT_IN_ENV_VAR]: "1" },
    });
    const outcome = await runner({
      ...baseSpawn,
      spec: { ...CLAUDE_SPEC, args: ["-p", "--output-format", "json", "--allowedTools", "Bash"] },
    });

    assert.equal(outcome.kind, "rejected");
    assert.match(outcome.reason, /allowlist/);
  });

  await t.test("a refusal surfaces as not_enabled, not as a crash", async () => {
    const result = await generateJsonWithLocalCli(
      { systemPrompt: "s", userPrompt: "u" },
      runnerReturning({ kind: "rejected", reason: "opt-in missing" }),
    );

    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "not_enabled");
  });
});

test("Local CLI client — claude envelope (V7 Phase 1 step 2)", async (t) => {
  await t.test("reads the reply and the token counters", () => {
    const reading = readClaudeEnvelope(claudeEnvelope({ result: '{"a":1}' }));

    assert.equal(reading.ok, true);
    assert.equal(reading.text, '{"a":1}');
    assert.deepEqual(reading.tokenUsage, { input: 120, output: 45 });
    assert.equal(reading.costUsd, 0.0012);
  });

  await t.test("is_error wins over subtype 'success'", () => {
    // Captured from a real run: a "Not logged in" refusal arrives with
    // subtype "success" and is_error true. Trusting subtype would feed a
    // human-readable sentence to JSON.parse and report a login problem as
    // malformed model output.
    const reading = readClaudeEnvelope(
      claudeEnvelope({ result: "Not logged in · Please run /login", isError: true }),
    );

    assert.equal(reading.ok, false);
    assert.match(reading.reason, /Not logged in/);
  });

  await t.test("a login refusal surfaces as runtime_error, never invalid_json", async () => {
    const result = await generateJsonWithLocalCli(
      { systemPrompt: "s", userPrompt: "u", runtime: "claude_code_cli" },
      runnerReturning({
        kind: "completed",
        exitCode: 0,
        stdout: claudeEnvelope({ result: "Not logged in · Please run /login", isError: true }),
        stderr: "",
      }),
    );

    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "runtime_error");
    assert.match(result.fallbackReason, /Not logged in/);
  });

  await t.test("a non-json envelope is reported as such", () => {
    assert.equal(readClaudeEnvelope("not json at all").ok, false);
  });

  await t.test("token usage reaches the caller for the budget engine", async () => {
    const result = await generateJsonWithLocalCli(
      { systemPrompt: "s", userPrompt: "u" },
      runnerReturning({
        kind: "completed",
        exitCode: 0,
        stdout: claudeEnvelope({ result: '{"verdict":"go"}', input: 900, output: 120 }),
        stderr: "",
      }),
    );

    assert.equal(result.ok, true);
    assert.deepEqual(result.json, { verdict: "go" });
    assert.deepEqual(result.tokenUsage, { input: 900, output: 120 });
    assert.equal(result.runtime, "claude_code_cli");
  });
});

test("Local CLI client — raw text path (V7 Phase 1 step 2)", async (t) => {
  await t.test("extracts json from a fenced reply", async () => {
    const result = await generateJsonWithLocalCli(
      { systemPrompt: "s", userPrompt: "u", runtime: "codex_cli" },
      runnerReturning({
        kind: "completed",
        exitCode: 0,
        stdout: 'Here you go:\n```json\n{"ok":true}\n```\n',
        stderr: "",
      }),
    );

    assert.equal(result.ok, true);
    assert.deepEqual(result.json, { ok: true });
  });

  await t.test("a non-zero exit is a runtime error, not malformed json", async () => {
    const result = await generateJsonWithLocalCli(
      { systemPrompt: "s", userPrompt: "u", runtime: "codex_cli" },
      runnerReturning({ kind: "completed", exitCode: 1, stdout: "", stderr: "not authenticated" }),
    );

    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "runtime_error");
    assert.match(result.fallbackReason, /not authenticated/);
  });

  await t.test("a reply with no json object is invalid_json", async () => {
    const result = await generateJsonWithLocalCli(
      { systemPrompt: "s", userPrompt: "u", runtime: "codex_cli" },
      runnerReturning({ kind: "completed", exitCode: 0, stdout: "I cannot help with that.", stderr: "" }),
    );

    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "invalid_json");
  });

  await t.test("extractJsonFromText tolerates prose around the object", () => {
    assert.deepEqual(extractJsonFromText('blah {"a":1} trailing'), { a: 1 });
    assert.deepEqual(extractJsonFromText('```\n{"b":2}\n```'), { b: 2 });
    assert.equal(extractJsonFromText("nothing here"), null);
    assert.equal(extractJsonFromText("   "), null);
  });
});

test("Local CLI client — failure mapping and stdin (V7 Phase 1 step 2)", async (t) => {
  await t.test("the prompt travels on stdin, never in argv", async () => {
    // argv is length-limited, visible in the process table, and would be
    // concatenated into a command line by the Windows shell fallback.
    const captured = {};
    await generateJsonWithLocalCli(
      { systemPrompt: "SYSTEM RULES", userPrompt: "USER QUESTION" },
      runnerReturning(
        { kind: "completed", exitCode: 0, stdout: claudeEnvelope({ result: "{}" }), stderr: "" },
        captured,
      ),
    );

    assert.match(captured.stdin, /SYSTEM RULES/);
    assert.match(captured.stdin, /USER QUESTION/);
    for (const arg of captured.spec.args) {
      assert.doesNotMatch(String(arg), /USER QUESTION/);
    }
  });

  await t.test("a missing binary maps to runtime_unavailable", async () => {
    const result = await generateJsonWithLocalCli(
      { systemPrompt: "s", userPrompt: "u" },
      runnerReturning({ kind: "not_found" }),
    );

    assert.equal(result.errorCode, "runtime_unavailable");
    assert.match(result.fallbackReason, /not installed/);
  });

  await t.test("a timeout maps to timeout", async () => {
    const result = await generateJsonWithLocalCli(
      { systemPrompt: "s", userPrompt: "u" },
      runnerReturning({ kind: "timeout", timeoutMs: 5000 }),
    );

    assert.equal(result.errorCode, "timeout");
    assert.match(result.fallbackReason, /5000/);
  });

  await t.test("an unknown runtime is refused before any spawn", async () => {
    const result = await generateJsonWithLocalCli({
      systemPrompt: "s",
      userPrompt: "u",
      runtime: "gemini_cli",
    });

    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "runtime_unavailable");
  });

  await t.test("a throwing runner never escapes to the caller", async () => {
    const result = await generateJsonWithLocalCli({ systemPrompt: "s", userPrompt: "u" }, async () => {
      throw new Error("boom");
    });

    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "unexpected_error");
  });

  await t.test("secret-looking values are redacted from failures", async () => {
    const result = await generateJsonWithLocalCli(
      { systemPrompt: "s", userPrompt: "u" },
      runnerReturning({ kind: "spawn_error", message: "failed for user me@example.com" }),
    );

    assert.equal(result.ok, false);
    assert.doesNotMatch(result.fallbackReason, /me@example\.com/);
    assert.match(result.fallbackReason, /redacted/);
  });
});
