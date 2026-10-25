import "server-only";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { checkCliArguments, type CliAuthMode } from "@/server/agents/providers/cli-runtime-provider-contract";
import type { LocalRuntimeKind } from "@/server/agents/runtimes/local-runtime-contract";
import { catalogRevision, selectSubscriptionModel, subscriptionCatalogSchema, subscriptionEnabled, type SubscriptionCatalog, type SubscriptionSelection } from "./subscription-catalog";
import { recordBoundBrainRoute } from "./model-router";

export type SubscriptionRunConfig = Readonly<{
  executionId: string; runtimeId: SubscriptionSelection["runtimeId"]; provider: "openai" | "anthropic";
  modelId: string; consumptionMode: "subscription"; binary: "codex" | "claude"; startedAt: string;
  catalogRevision: string; configRevision: string; authMode: CliAuthMode; machineScope: "local_only"; kind: LocalRuntimeKind;
}>;
export type SubscriptionTurn = {
  status: "completed" | "blocked"; summary: string; consumptionMode: "subscription";
  executedModelId: string | null; runConfig: SubscriptionRunConfig | null; reason?: string;
};
export type SubscriptionSpawner = (binary: string, args: string[], options: { env: NodeJS.ProcessEnv; cwd: string; shell: false; stdio: "pipe"; detached: boolean }) => ChildProcessWithoutNullStreams;
type Dependencies = { spawn?: SubscriptionSpawner; env?: NodeJS.ProcessEnv; timeoutMs?: number; log?: (config: SubscriptionRunConfig, inputChars: number) => void };
/** Allowlist rather than a credential-name blacklist: cloud credentials, API
 * overrides, NODE_OPTIONS, proxies and injected auth tokens never reach a CLI. */
export function subscriptionEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return { NODE_ENV: "production", ...Object.fromEntries(["PATH", "HOME", "USERPROFILE", "SYSTEMROOT", "WINDIR", "TMP", "TEMP", "TMPDIR", "LANG", "LC_ALL", "TERM"].flatMap(key => env[key] === undefined ? [] : [[key, env[key]]])) };
}
export function subscriptionArguments(config: SubscriptionRunConfig): string[] {
  return config.runtimeId === "codex"
    ? ["exec", "--skip-git-repo-check", "--sandbox", "read-only", "-m", config.modelId, "--json", "-c", 'model_provider="openai"', "-c", 'forced_login_method="chatgpt"', "-c", "features.shell_tool=false", "-c", "mcp_servers={}", "-c", 'web_search="disabled"', "-"]
    : ["-p", "--model", config.modelId, "--output-format", "json", "--tools", "", "--permission-mode", "default", "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}', "--setting-sources", "", "--settings", '{"disableAllHooks":true,"apiKeyHelper":""}', "--no-session-persistence"];
}
/** CLI launchers spawn native children: kill the whole process group, not just the launcher. */
function killTree(child: ChildProcessWithoutNullStreams) {
  try { if (child.pid && process.platform !== "win32") { process.kill(-child.pid, "SIGKILL"); return; } } catch { /* group already gone */ }
  child.kill("SIGKILL");
}
type ProcessResult = { stdout: string; stderr: string };
function runProcess(binary: string, args: string[], prompt: string, cwd: string, env: NodeJS.ProcessEnv, spawner: SubscriptionSpawner, timeoutMs: number): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    if (!checkCliArguments(args).ok) return reject(new Error("arguments_refused"));
    let child: ChildProcessWithoutNullStreams;
    try { child = spawner(binary, args, { env, cwd, shell: false, stdio: "pipe", detached: process.platform !== "win32" }); } catch { reject(new Error("binary_unavailable")); return; }
    let stdout = "", stderr = "", done = false;
    const finish = (reason?: string) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (reason) { killTree(child); reject(new Error(reason)); }
      else resolve({ stdout, stderr });
    };
    const timer = setTimeout(() => finish("timeout"), timeoutMs);
    child.on("error", () => finish("binary_unavailable"));
    child.stdin.on("error", () => finish("stdin_failed"));
    child.stdout.on("data", chunk => { stdout += String(chunk); if (stdout.length + stderr.length > 1_048_576) finish("output_limit"); });
    child.stderr.on("data", chunk => { stderr += String(chunk); if (stdout.length + stderr.length > 1_048_576) finish("output_limit"); });
    child.on("close", code => finish(code === 0 ? undefined : "nonzero_exit"));
    child.stdin.end(prompt);
  });
}
function subscriptionAuth(runtimeId: SubscriptionSelection["runtimeId"], result: ProcessResult): boolean {
  if (runtimeId === "codex") return /logged in using chatgpt/i.test(result.stdout + result.stderr) && !/api[ _-]?key/i.test(result.stdout + result.stderr);
  try { const status = JSON.parse(result.stdout); return status.loggedIn === true && status.authMethod === "claude.ai" && (!status.apiProvider || status.apiProvider === "firstParty"); } catch { return false; }
}
export function parseSubscriptionReply(runtimeId: SubscriptionSelection["runtimeId"], stdout: string) {
  if (runtimeId === "claude-code") {
    const data = JSON.parse(stdout);
    if (data.is_error || data.type !== "result" || typeof data.result !== "string" || !data.result.trim()) throw new Error("invalid_reply");
    const models = Object.keys(data.modelUsage ?? {});
    return { text: data.result, executedModelId: typeof data.model === "string" ? data.model : models.length === 1 ? models[0] : null };
  }
  const events = stdout.trim().split(/\r?\n/).map(line => JSON.parse(line));
  if (events.some(e => e.type === "turn.failed" || e.type === "error") || !events.some(e => e.type === "turn.completed")) throw new Error("invalid_reply");
  const text = events.filter(e => e.type === "item.completed" && e.item?.type === "agent_message").map(e => e.item.text).filter(t => typeof t === "string").join("\n");
  if (!text.trim()) throw new Error("invalid_reply");
  const reported = events.findLast(e => typeof e.model === "string");
  return { text, executedModelId: reported?.model ?? null };
}
/** The only dispatch boundary. No API client or fallback callback is accepted. */
export async function runSubscriptionTurn(selection: SubscriptionSelection, prompt: string, catalog: SubscriptionCatalog | null, deps: Dependencies = {}): Promise<SubscriptionTurn> {
  let runConfig: SubscriptionRunConfig | null = null;
  const blocked = (reason: string): SubscriptionTurn => ({ status: "blocked", summary: `Tour BLOQUÉ : abonnement CLI indisponible (${reason}). Aucun appel API payant ni remplacement de modèle.`, consumptionMode: "subscription", executedModelId: null, runConfig, reason });
  const env = { ...(deps.env ?? process.env) };
  if (!subscriptionEnabled(env)) return blocked("runtime_disabled");
  const parsed = subscriptionCatalogSchema.safeParse(catalog);
  if (!parsed.success || catalogRevision(parsed.data) !== selection.catalogRevision) return blocked("catalog_changed");
  const entry = parsed.data.entries.find(e => e.runtimeId === selection.runtimeId && e.modelId === selection.modelId);
  if (!entry || !selectSubscriptionModel(entry)?.eligible) return blocked("model_unavailable");
  runConfig = Object.freeze({ executionId: randomUUID(), runtimeId: entry.runtimeId, provider: entry.runtimeId === "codex" ? "openai" : "anthropic", modelId: entry.modelId, consumptionMode: "subscription", binary: entry.runtimeId === "codex" ? "codex" : "claude", startedAt: new Date().toISOString(), catalogRevision: selection.catalogRevision, configRevision: "subscription-adapter-v1", authMode: "subscription_session", machineScope: "local_only", kind: entry.runtimeId === "codex" ? "codex_cli" : "claude_code_cli" });
  const config = runConfig;
  (deps.log ?? ((config, inputChars) => console.info("[subscription-run]", { ...config, inputChars })))(config, prompt.length);
  recordBoundBrainRoute({ provider: config.provider, modelId: config.modelId, runtimeId: config.runtimeId, consumptionMode: config.consumptionMode, inputChars: prompt.length });
  let cwd: string | undefined;
  try {
    cwd = await mkdtemp(join(tmpdir(), "oria-subscription-"));
    const cleanEnv = subscriptionEnvironment(env);
    const spawner = deps.spawn ?? ((binary, args, options) => spawn(binary, args, options));
    const timeout = deps.timeoutMs ?? 120_000;
    const auth = await runProcess(config.binary, config.runtimeId === "codex" ? ["login", "status"] : ["auth", "status"], "", cwd, cleanEnv, spawner, Math.min(timeout, 10_000));
    if (!subscriptionAuth(config.runtimeId, auth)) return blocked("subscription_auth_required");
    const result = await runProcess(config.binary, subscriptionArguments(config), prompt, cwd, cleanEnv, spawner, timeout);
    const reply = parseSubscriptionReply(config.runtimeId, result.stdout);
    return { status: "completed", summary: reply.text, consumptionMode: "subscription", executedModelId: reply.executedModelId, runConfig: config };
  } catch (error) {
    const safe = ["binary_unavailable", "timeout", "nonzero_exit", "output_limit", "stdin_failed", "arguments_refused", "invalid_reply"];
    return blocked(error instanceof Error && safe.includes(error.message) ? error.message : "runtime_failed");
  } finally { if (cwd) await rm(cwd, { recursive: true, force: true }).catch(() => undefined); }
}
