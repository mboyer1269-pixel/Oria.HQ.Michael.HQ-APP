import "server-only";
/**
 * Strict-JSON exchanges with the local Claude Code CLI on the owner's claude.ai SUBSCRIPTION.
 *
 * Concept (not code) from FounderOS lib/creative-engine/claude.ts (MIT, © FounderOS contributors):
 * strict JSON reply validated by a zod schema, one retry that feeds the validation error back,
 * and a missing binary reported as `{ ok: false }` instead of an exception. Rewritten for Oria's
 * subscription guards; no FounderOS code is copied.
 *
 * Guards reused (never bypassed): ORIA_HQ_SUBSCRIPTION_RUNTIMES + local-probe environment
 * (subscriptionEnabled), API-key/paid-switch env refusal, cleaned allowlisted env (agentEnvironment),
 * `--setting-sources ""` with our own settings only (assertClaudeLoadedSettings), secret-shaped argument
 * refusal (checkCliArguments), `claude auth status` = claude.ai first-party, and the stream `system/init`
 * guard on apiKeySource (streamAuth): a non-"none" source kills the run. No API client, no fallback.
 * Callers must already have passed the owner + subscription-owner session check (requireWorkspaceApiSession,
 * role owner, isSubscriptionOwner) — this module never runs from an unauthenticated path by itself.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { z } from "zod";
import { checkCliArguments } from "@/server/agents/providers/cli-runtime-provider-contract";
import { agentEnvironment, assertClaudeLoadedSettings, streamAuth } from "@/server/atelier/atelier-mission";
import { subscriptionEnabled } from "./subscription-catalog";
import { subscriptionRuntimeBusy } from "./subscription-runtime";

export type ClaudeJsonReason = "unavailable" | "disabled" | "api_key_present" | "subscription_auth_required" | "paid_session" | "busy" | "timeout" | "failed" | "invalid_output";
export type ClaudeJsonResult<T> = { ok: true; data: T; attempts: 1 | 2; model: string | null } | { ok: false; reason: ClaudeJsonReason; error?: string; attempts: 0 | 1 | 2 };
type Spawner = (binary: string, args: string[], options: { env: NodeJS.ProcessEnv; cwd: string; shell: false; stdio: "pipe"; detached: boolean }) => ChildProcessWithoutNullStreams;
export type ClaudeJsonOptions = { model?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv; binary?: string; spawn?: Spawner };

const PAID_ENV = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CODEX_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN", "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX", "CLAUDE_CODE_USE_FOUNDRY", "ANTHROPIC_BASE_URL"];

export function claudeJsonArguments(model: string): string[] {
  return ["-p", "--model", model, "--output-format", "stream-json", "--verbose", "--tools", "", "--permission-mode", "default",
    "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}',
    "--setting-sources", "", "--settings", '{"disableAllHooks":true,"apiKeyHelper":""}', "--no-session-persistence", "--max-turns", "1"];
}

type Run = { ok: true; stdout: string } | { ok: false; reason: ClaudeJsonReason; error?: string };
function run(binary: string, args: string[], input: string, cwd: string, env: NodeJS.ProcessEnv, spawner: Spawner, timeoutMs: number, watchInit: boolean): Promise<Run> {
  return new Promise(resolve => {
    let child: ChildProcessWithoutNullStreams;
    try { child = spawner(binary, args, { env, cwd, shell: false, stdio: "pipe", detached: process.platform !== "win32" }); }
    catch { resolve({ ok: false, reason: "unavailable" }); return; }
    let stdout = "", done = false;
    const finish = (r: Run, kill = false) => {
      if (done) return; done = true; clearTimeout(timer);
      if (kill) { try { if (child.pid && process.platform !== "win32") process.kill(-child.pid, "SIGKILL"); else child.kill("SIGKILL"); } catch { child.kill("SIGKILL"); } }
      resolve(r);
    };
    const timer = setTimeout(() => finish({ ok: false, reason: "timeout" }, true), timeoutMs);
    child.on("error", (e: NodeJS.ErrnoException) => finish({ ok: false, reason: e.code === "ENOENT" || e.code === "EACCES" ? "unavailable" : "failed" }));
    child.stdin.on("error", () => undefined);
    child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
    child.stdout.on("data", chunk => {
      stdout += String(chunk);
      if (stdout.length > 1_048_576) return finish({ ok: false, reason: "failed", error: "output_limit" }, true);
      if (watchInit && streamAuth("claude-code", stdout) === "paid") finish({ ok: false, reason: "paid_session" }, true);
    });
    child.stderr.on("data", () => undefined);
    child.on("close", code => finish(code === 0 ? { ok: true, stdout } : { ok: false, reason: "failed", error: `exit_${code}` }));
    child.stdin.end(input, "utf8");
  });
}

function stripFence(text: string): string {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (m ? m[1] : text).trim();
}

/** Parse one stream-json transcript into a schema-valid value. Pure; exported for tests. */
export function parseClaudeJsonTranscript<S extends z.ZodType>(transcript: string, schema: S): { ok: true; data: z.infer<S>; model: string | null } | { ok: false; error: string } {
  if (streamAuth("claude-code", transcript) !== "subscription") return { ok: false, error: "no_subscription_init" };
  const events = transcript.split("\n").filter(Boolean).flatMap(l => { try { return [JSON.parse(l)]; } catch { return []; } });
  const result = [...events].reverse().find(e => e.type === "result");
  if (!result || result.is_error || typeof result.result !== "string") return { ok: false, error: "no_result" };
  const assistant = [...events].reverse().find(e => e.type === "assistant" && typeof e.message?.model === "string");
  let candidate: unknown;
  try { candidate = JSON.parse(stripFence(result.result)); } catch (e) { return { ok: false, error: `reply was not valid JSON: ${e instanceof Error ? e.message : String(e)}` }; }
  const parsed = schema.safeParse(candidate);
  if (!parsed.success) return { ok: false, error: parsed.error.message.slice(0, 600) };
  return { ok: true, data: parsed.data, model: assistant?.message.model ?? null };
}

let inFlight = false;
export async function claudeJson<S extends z.ZodType>(prompt: string, schema: S, opts: ClaudeJsonOptions = {}): Promise<ClaudeJsonResult<z.infer<S>>> {
  const env = { ...(opts.env ?? process.env) };
  if (!subscriptionEnabled(env)) return { ok: false, reason: "disabled", attempts: 0 };
  if (PAID_ENV.some(k => env[k])) return { ok: false, reason: "api_key_present", attempts: 0 };
  const args = claudeJsonArguments(opts.model ?? "sonnet");
  try { assertClaudeLoadedSettings(args); } catch { return { ok: false, reason: "subscription_auth_required", attempts: 0 }; }
  if (!checkCliArguments(args).ok) return { ok: false, reason: "failed", error: "arguments_refused", attempts: 0 };
  if (inFlight || subscriptionRuntimeBusy()) return { ok: false, reason: "busy", attempts: 0 };
  inFlight = true;
  let cwd: string | undefined;
  try {
    cwd = await mkdtemp(join(tmpdir(), "oria-claude-json-"));
    const clean = agentEnvironment(env);
    const spawner: Spawner = opts.spawn ?? ((b, a, o) => spawn(b, a, o));
    const binary = opts.binary ?? "claude";
    const timeout = opts.timeoutMs ?? 120_000;
    const auth = await run(binary, ["auth", "status"], "", cwd, clean, spawner, Math.min(timeout, 10_000), false);
    if (!auth.ok) return { ...auth, attempts: 0 };
    try {
      const s = JSON.parse(auth.stdout);
      if (!(s.loggedIn === true && s.authMethod === "claude.ai" && (!s.apiProvider || s.apiProvider === "firstParty"))) throw new Error();
    } catch { return { ok: false, reason: "subscription_auth_required", attempts: 0 }; }
    let input = prompt;
    for (const attempt of [1, 2] as const) {
      const out = await run(binary, args, input, cwd, clean, spawner, timeout, true);
      if (!out.ok) return { ...out, attempts: attempt };
      const parsed = parseClaudeJsonTranscript(out.stdout, schema);
      if (parsed.ok) return { ok: true, data: parsed.data, model: parsed.model, attempts: attempt };
      if (parsed.error === "no_subscription_init") return { ok: false, reason: "paid_session", attempts: attempt };
      if (attempt === 2) return { ok: false, reason: "invalid_output", error: parsed.error, attempts: 2 };
      input = `${prompt}\n\nYour previous reply failed validation with this error:\n${parsed.error}\nReply again with ONLY corrected strict JSON — nothing else.`;
    }
    return { ok: false, reason: "invalid_output", attempts: 2 };
  } finally {
    inFlight = false;
    if (cwd) await rm(cwd, { recursive: true, force: true }).catch(() => undefined);
  }
}
