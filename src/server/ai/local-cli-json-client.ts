// src/server/ai/local-cli-json-client.ts
//
// Structured-JSON generation through a LOCALLY INSTALLED, ALREADY LOGGED-IN
// agent CLI (Claude Code, Codex) instead of an HTTP API key.
//
// Why this exists: the operator holds personal subscriptions to these tools. On
// their own machine, driving their own workflows, routing inference through the
// CLI they are already signed into avoids provisioning a second, separately
// billed API credential for the same models.
//
// LOCAL ONLY — this path can never run in the cloud:
//   * Serverless hosts cannot spawn these binaries; they are not installed.
//   * resolveProbeExecutionEnvironment refuses on any cloud marker, and on a
//     production build without an explicit local opt-in.
// The HTTP clients (anthropic-json-client, openai-json-client) remain the only
// deployable providers. This one is additive and strictly local.
//
// Security posture — extends the local-runtime-probe infrastructure rather than
// rebuilding it:
//   * Same environment gate (cloud markers beat every flag).
//   * Same shell-safe token check on every command token.
//   * Same redaction applied to anything that leaves this module.
//   * Its OWN frozen allowlist, deliberately separate from the probe's: the
//     probe may only read versions and auth status, and widening that list to
//     include prompt-sending commands would erase the boundary between
//     "observe the runtime" and "spend the subscription".
//
// The prompt travels on STDIN, never in argv. Arguments are frozen literals, so
// nothing variable ever reaches a command line — which matters because the
// probe's Windows fallback concatenates tokens into one.
//
// Hard limits: no execution, no persistence, no side effects. Never throws
// toward the caller.

import "server-only";

import { spawn } from "node:child_process";
import {
  isShellSafeToken,
  redactProbeText,
  resolveProbeExecutionEnvironment,
} from "@/server/agents/runtimes/local-runtime-probe";

// ---------------------------------------------------------------------------
// Opt-in
// ---------------------------------------------------------------------------

/**
 * Explicit opt-in. Absent this, nothing spawns — a subscription is a finite
 * personal resource and must never be spent by default.
 */
export const LOCAL_CLI_INFERENCE_OPT_IN_ENV_VAR = "ORIA_ENABLE_LOCAL_CLI_INFERENCE";

export const LOCAL_CLI_DEFAULT_TIMEOUT_MS = 120_000;
const LOCAL_CLI_MAX_OUTPUT_BYTES = 2_097_152;

// ---------------------------------------------------------------------------
// Frozen allowlist
// ---------------------------------------------------------------------------

export type LocalCliRuntimeId = "claude_code_cli" | "codex_cli";

export type LocalCliCommandSpec = {
  runtime: LocalCliRuntimeId;
  binary: "claude" | "codex";
  /** Fixed literal arguments. The prompt is NOT here — it goes on stdin. */
  args: readonly string[];
  /**
   * How to read the process output:
   *   - "claude_envelope": --output-format json wraps the reply in a result
   *     object carrying usage counters.
   *   - "raw_text": stdout is the reply; JSON is extracted tolerantly.
   */
  outputShape: "claude_envelope" | "raw_text";
};

/**
 * The only commands this module may run.
 *
 * Claude: `-p` is non-interactive print mode; `--output-format json` yields a
 * single result object; `--allowedTools ""` grants no tools, so the process can
 * only produce text — it cannot read or write the filesystem.
 *
 * Codex: `exec` is non-interactive; `--sandbox read-only` prevents any
 * model-generated command from writing; `--skip-git-repo-check` keeps it from
 * refusing outside a repo. The prompt argument is omitted entirely — codex
 * reads instructions from stdin when none is given. The explicit `-` marker
 * would do the same but cannot pass the shared safe-token check (a lone dash
 * carries no alphanumeric), and loosening that rule for one literal is a worse
 * trade than simply not passing it.
 *
 * Codex is deliberately read as raw text. It also offers `--json` (JSONL
 * events), but that event schema was NOT verified against a live run when this
 * was written, and guessing a schema is how a parser silently returns garbage.
 * Raw text needs no schema. Claude's envelope, by contrast, was captured from a
 * real invocation, so it is parsed properly and yields token counts.
 */
export const LOCAL_CLI_COMMAND_ALLOWLIST: readonly LocalCliCommandSpec[] = Object.freeze([
  {
    runtime: "claude_code_cli",
    binary: "claude",
    args: ["-p", "--output-format", "json", "--allowedTools", ""],
    outputShape: "claude_envelope",
  },
  {
    runtime: "codex_cli",
    binary: "codex",
    args: ["exec", "--sandbox", "read-only", "--skip-git-repo-check"],
    outputShape: "raw_text",
  },
] as LocalCliCommandSpec[]);

/**
 * Validates a spec against the frozen list.
 *
 * An empty-string argument is accepted as a literal: `--allowedTools ""` is how
 * Claude is told to grant no tools, and an empty token carries no shell
 * metacharacter. It is safe precisely because arguments here are frozen
 * literals passed to spawn without a shell — never user input.
 */
export function isAllowlistedLocalCliCommand(spec: LocalCliCommandSpec): boolean {
  if (!spec || typeof spec !== "object") return false;

  const match = LOCAL_CLI_COMMAND_ALLOWLIST.find((entry) => entry.runtime === spec.runtime);
  if (!match) return false;
  if (spec.binary !== match.binary) return false;
  if (spec.outputShape !== match.outputShape) return false;
  if (!Array.isArray(spec.args) || spec.args.length !== match.args.length) return false;
  if (!spec.args.every((arg, index) => arg === match.args[index])) return false;
  if (!isShellSafeToken(spec.binary, "binary")) return false;

  return spec.args.every((arg) => arg === "" || isShellSafeToken(arg, "arg"));
}

// ---------------------------------------------------------------------------
// Runner contract
// ---------------------------------------------------------------------------

export type LocalCliRunOutcome =
  | { kind: "completed"; exitCode: number; stdout: string; stderr: string }
  | { kind: "not_found" }
  | { kind: "timeout"; timeoutMs: number }
  | { kind: "spawn_error"; message: string }
  | { kind: "rejected"; reason: string };

export type LocalCliRunner = (input: {
  spec: LocalCliCommandSpec;
  stdin: string;
  timeoutMs: number;
}) => Promise<LocalCliRunOutcome>;

// ---------------------------------------------------------------------------
// Default runner — spawn with stdin, no shell, ever
// ---------------------------------------------------------------------------

/**
 * Spawns the CLI and writes the prompt to stdin.
 *
 * Uses spawn rather than the probe's execFile because execFile cannot supply
 * stdin, and the prompt must not travel in argv: argv is length-limited, is
 * visible in the process table, and would be concatenated into a command line
 * by a Windows shell fallback.
 *
 * On Windows, npm-installed CLIs are `.cmd` shims that Node refuses to spawn
 * shell-less. `shell: true` is used there — safe only because every token is a
 * frozen literal that already passed the strict character check, and the
 * variable part (the prompt) never touches the command line.
 */
export function createLocalCliRunner(options?: {
  env?: Readonly<Record<string, string | undefined>>;
}): LocalCliRunner {
  const env = options?.env ?? process.env;

  return async ({ spec, stdin, timeoutMs }) => {
    const environment = resolveProbeExecutionEnvironment(env);
    if (!environment.allowed) {
      return { kind: "rejected", reason: `execution environment forbidden: ${environment.reason}` };
    }
    if (env[LOCAL_CLI_INFERENCE_OPT_IN_ENV_VAR] !== "1") {
      return {
        kind: "rejected",
        reason: `${LOCAL_CLI_INFERENCE_OPT_IN_ENV_VAR}=1 is required before a local subscription is spent`,
      };
    }
    if (!isAllowlistedLocalCliCommand(spec)) {
      return { kind: "rejected", reason: "command is not on the frozen local-CLI allowlist" };
    }

    return new Promise<LocalCliRunOutcome>((resolve) => {
      let settled = false;
      const finish = (outcome: LocalCliRunOutcome) => {
        if (settled) return;
        settled = true;
        resolve(outcome);
      };

      try {
        const child = spawn(spec.binary, [...spec.args], {
          shell: process.platform === "win32",
          windowsHide: true,
          stdio: ["pipe", "pipe", "pipe"],
        });

        let stdout = "";
        let stderr = "";
        let truncated = false;

        const timer = setTimeout(() => {
          child.kill("SIGTERM");
          finish({ kind: "timeout", timeoutMs });
        }, timeoutMs);

        child.stdout.setEncoding("utf8");
        child.stdout.on("data", (chunk: string) => {
          if (stdout.length + chunk.length > LOCAL_CLI_MAX_OUTPUT_BYTES) {
            truncated = true;
            child.kill("SIGTERM");
            return;
          }
          stdout += chunk;
        });

        child.stderr.setEncoding("utf8");
        child.stderr.on("data", (chunk: string) => {
          if (stderr.length < LOCAL_CLI_MAX_OUTPUT_BYTES) stderr += chunk;
        });

        child.on("error", (error: NodeJS.ErrnoException) => {
          clearTimeout(timer);
          if (error.code === "ENOENT") {
            finish({ kind: "not_found" });
            return;
          }
          finish({ kind: "spawn_error", message: redactProbeText(error.message) });
        });

        child.on("close", (code) => {
          clearTimeout(timer);
          if (truncated) {
            finish({ kind: "spawn_error", message: "output exceeded the maximum buffer" });
            return;
          }
          finish({ kind: "completed", exitCode: code ?? 0, stdout, stderr });
        });

        child.stdin.on("error", () => {
          // A CLI that exits before reading stdin (missing binary, refusal)
          // produces EPIPE here; the close/error handler reports the real cause.
        });
        child.stdin.end(stdin, "utf8");
      } catch (error) {
        finish({
          kind: "spawn_error",
          message: redactProbeText(error instanceof Error ? error.message : String(error)),
        });
      }
    });
  };
}

// ---------------------------------------------------------------------------
// Output parsing
// ---------------------------------------------------------------------------

/** Extracts a JSON object from text that may carry prose or markdown fences. */
export function extractJsonFromText(text: string): unknown | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1]?.trim(), trimmed].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Fall through to a brace-bounded slice.
    }
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        // Try the next candidate.
      }
    }
  }
  return null;
}

export type ClaudeEnvelopeReading =
  | { ok: true; text: string; tokenUsage?: { input: number; output: number }; costUsd?: number }
  | { ok: false; reason: string };

/**
 * Reads Claude Code's `--output-format json` envelope.
 *
 * Shape captured from a real invocation. The important trap: `is_error` can be
 * true while `subtype` is still "success" — a refusal such as "Not logged in"
 * arrives that way. Trusting `subtype` would hand a human-readable error string
 * to the JSON parser and report it as malformed model output rather than as a
 * login problem, so `is_error` is the field that decides.
 */
export function readClaudeEnvelope(raw: string): ClaudeEnvelopeReading {
  let envelope: unknown;
  try {
    envelope = JSON.parse(raw.trim());
  } catch {
    return { ok: false, reason: "claude envelope is not valid json" };
  }

  if (typeof envelope !== "object" || envelope === null) {
    return { ok: false, reason: "claude envelope is not an object" };
  }

  const record = envelope as Record<string, unknown>;
  const text = typeof record.result === "string" ? record.result : "";

  if (record.is_error === true) {
    return {
      ok: false,
      reason: redactProbeText(text.length > 0 ? text : "claude reported an error"),
    };
  }

  const usage = record.usage;
  const tokenUsage =
    typeof usage === "object" && usage !== null
      ? {
          input: Number((usage as Record<string, unknown>).input_tokens ?? 0) || 0,
          output: Number((usage as Record<string, unknown>).output_tokens ?? 0) || 0,
        }
      : undefined;

  return {
    ok: true,
    text,
    ...(tokenUsage ? { tokenUsage } : {}),
    ...(typeof record.total_cost_usd === "number" ? { costUsd: record.total_cost_usd } : {}),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type LocalCliJsonInput = {
  systemPrompt: string;
  userPrompt: string;
  runtime?: LocalCliRuntimeId;
  timeoutMs?: number;
};

export type LocalCliJsonSuccess = {
  ok: true;
  json: unknown;
  rawText: string;
  modelId: string;
  runtime: LocalCliRuntimeId;
  tokenUsage?: { input: number; output: number };
  costUsd?: number;
};

export type LocalCliJsonErrorCode =
  | "not_enabled"
  | "runtime_unavailable"
  | "runtime_error"
  | "timeout"
  | "invalid_json"
  | "unexpected_error";

export type LocalCliJsonFailure = {
  ok: false;
  errorCode: LocalCliJsonErrorCode;
  fallbackReason: string;
  runtime: LocalCliRuntimeId;
};

export type LocalCliJsonResult = LocalCliJsonSuccess | LocalCliJsonFailure;

/**
 * Generates structured JSON through a local agent CLI.
 *
 * Mirrors the anthropic/openai client contract so it can sit behind the same
 * provider abstraction: never throws, and every failure is an ok:false the
 * caller can fall back from.
 *
 * The system prompt is prepended to the user prompt because neither CLI accepts
 * a separate system message in non-interactive mode.
 */
export async function generateJsonWithLocalCli(
  input: LocalCliJsonInput,
  runner?: LocalCliRunner,
): Promise<LocalCliJsonResult> {
  const runtime: LocalCliRuntimeId = input.runtime ?? "claude_code_cli";
  const spec = LOCAL_CLI_COMMAND_ALLOWLIST.find((entry) => entry.runtime === runtime);

  if (!spec) {
    return {
      ok: false,
      errorCode: "runtime_unavailable",
      fallbackReason: `unknown local runtime: ${runtime}`,
      runtime,
    };
  }

  const execute = runner ?? createLocalCliRunner();
  const stdin = `${input.systemPrompt.trim()}\n\n${input.userPrompt.trim()}\n`;

  let outcome: LocalCliRunOutcome;
  try {
    outcome = await execute({
      spec,
      stdin,
      timeoutMs: input.timeoutMs ?? LOCAL_CLI_DEFAULT_TIMEOUT_MS,
    });
  } catch (error) {
    return {
      ok: false,
      errorCode: "unexpected_error",
      fallbackReason: redactProbeText(error instanceof Error ? error.message : String(error)),
      runtime,
    };
  }

  if (outcome.kind === "rejected") {
    return { ok: false, errorCode: "not_enabled", fallbackReason: outcome.reason, runtime };
  }
  if (outcome.kind === "not_found") {
    return {
      ok: false,
      errorCode: "runtime_unavailable",
      fallbackReason: `${spec.binary} is not installed or not on PATH`,
      runtime,
    };
  }
  if (outcome.kind === "timeout") {
    return {
      ok: false,
      errorCode: "timeout",
      fallbackReason: `local cli timed out after ${outcome.timeoutMs}ms`,
      runtime,
    };
  }
  if (outcome.kind === "spawn_error") {
    return {
      ok: false,
      errorCode: "runtime_error",
      fallbackReason: redactProbeText(outcome.message),
      runtime,
    };
  }

  let text = outcome.stdout;
  let tokenUsage: { input: number; output: number } | undefined;
  let costUsd: number | undefined;

  if (spec.outputShape === "claude_envelope") {
    const reading = readClaudeEnvelope(outcome.stdout);
    if (!reading.ok) {
      return {
        ok: false,
        errorCode: "runtime_error",
        fallbackReason: reading.reason,
        runtime,
      };
    }
    text = reading.text;
    tokenUsage = reading.tokenUsage;
    costUsd = reading.costUsd;
  } else if (outcome.exitCode !== 0) {
    return {
      ok: false,
      errorCode: "runtime_error",
      fallbackReason: redactProbeText(
        outcome.stderr.trim() || `local cli exited with code ${outcome.exitCode}`,
      ),
      runtime,
    };
  }

  const json = extractJsonFromText(text);
  if (json === null) {
    return {
      ok: false,
      errorCode: "invalid_json",
      fallbackReason: "no json object found in the local cli reply",
      runtime,
    };
  }

  return {
    ok: true,
    json,
    rawText: text,
    modelId: `${runtime}:subscription`,
    runtime,
    ...(tokenUsage ? { tokenUsage } : {}),
    ...(costUsd !== undefined ? { costUsd } : {}),
  };
}
