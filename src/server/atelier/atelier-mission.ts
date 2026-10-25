/**
 * Atelier V1 — single workshop module, subscription CLIs only (Codex ChatGPT, Claude Code claude.ai).
 * No API key, no OpenHands, no remote database. Contract: docs/atelier-contract.md (atelier-mission/v1).
 */
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { rmSync, lstatSync, readlinkSync, appendFileSync, closeSync, linkSync, existsSync, mkdirSync, openSync, readFileSync, writeSync, readdirSync, realpathSync, rmdirSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import type { BigIntStats } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { subscriptionEnvironment } from "../ai/subscription-runtime";

export const ATELIER_CONTRACT = "atelier-mission/v1" as const;
export type RuntimeId = "codex" | "claude-code";
export type AgentStepKind = "spec" | "code" | "revision";
export type StepKind = AgentStepKind | "test" | "preview";
export type StepStatus = "running" | "succeeded" | "failed" | "interrupted" | "blocked" | "needs_human_review";
export type MissionStatus = "created" | "running" | "interrupted" | "awaiting_review" | "failed" | "blocked" | "needs_human_review";
export type ArtifactKind = "spec" | "diff" | "test_log" | "preview" | "transcript" | "commit";
export type AtelierArtifact = { id: string; kind: ArtifactKind; stepId: string; path: string; sha256: string; bytes: number; createdAt: string };
export type AtelierStep = {
  id: string; kind: StepKind; status: StepStatus; startedAt: string; endedAt: string | null;
  executor: "codex_cli" | "claude_code_cli" | "runner"; sessionId: string | null; resumedFrom: string | null; /** stash sha of changes set aside after subscription_auth_required */ quarantineRef?: string | null;
  /** SENT-412-30: test harness files changed by the mission, owner approval, sandbox used by the runner step */ harnessFiles?: string[]; harnessApprovedBy?: string | null; sandbox?: "bwrap" | "none"; unsandboxedApprovedBy?: string | null; secretKinds?: string[];
  requestedModelId: string | null; observedModelId: string | null; exitCode: number | null; reason: string | null;
  commitSha: string | null;
};
export type AtelierLock = { runnerPid: number; runnerStart?: string | null; childPid: number | null; childStart?: string | null; token?: string; stepId: string; since: string };
export type AtelierMission = {
  contract: typeof ATELIER_CONTRACT; id: string; workspaceId: string; createdBy: string | null;
  title: string; need: string; createdAt: string; updatedAt: string; status: MissionStatus;
  runtime: { runtimeId: RuntimeId; consumptionMode: "subscription"; authMode: "chatgpt_session" | "claude_ai_session"; requestedModelId: string };
  repo: { path: string; /** SENT-412-20: dedicated git worktree of this mission (absent on legacy missions) */ worktree?: string; baseBranch: string; branch: string; baseSha: string; headSha: string };
  sessionId: string | null; lock: AtelierLock | null; steps: AtelierStep[]; artifacts: AtelierArtifact[];
};
export type AtelierEvent = { seq: number; at: string; type: string; stepId?: string; data?: Record<string, unknown> };

export const LEGACY_WORKSPACE = "michael-hq";
export const atelierRoot = (env = process.env) => env.ORIA_ATELIER_ROOT || join(homedir(), ".oria-atelier", "missions");
export const atelierReposRoot = (env = process.env) => env.ORIA_ATELIER_REPOS_ROOT || join(homedir(), "oria-atelier-repos");
const now = () => new Date().toISOString();
export const missionDir = (id: string, root = atelierRoot()) => {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("invalid_mission_id");
  return join(root, id);
};
function git(repo: string, args: string[]) {
  const r = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git_${args[0]}_failed`);
  return r.stdout.trim();
}
export function loadMission(id: string, root = atelierRoot()): AtelierMission {
  const m = JSON.parse(readFileSync(join(missionDir(id, root), "mission.json"), "utf8"));
  m.workspaceId ??= LEGACY_WORKSPACE; m.createdBy ??= null; return m;
}
export function listMissions(root = atelierRoot(), workspaceId?: string): AtelierMission[] {
  if (!existsSync(root)) return [];
  return readdirSync(root).filter(n => /^[0-9a-f-]{36}$/.test(n) && existsSync(join(root, n, "mission.json"))).map(n => loadMission(n, root))
    .filter(m => !workspaceId || m.workspaceId === workspaceId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
function save(m: AtelierMission, root = atelierRoot()) {
  m.updatedAt = now();
  const file = join(missionDir(m.id, root), "mission.json");
  writeFileSync(file + ".tmp", JSON.stringify(m, null, 2)); renameSync(file + ".tmp", file);
}
export function readEvents(id: string, root = atelierRoot(), afterSeq = 0): AtelierEvent[] {
  const f = join(missionDir(id, root), "events.jsonl");
  if (!existsSync(f)) return [];
  return readFileSync(f, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l) as AtelierEvent).filter(e => e.seq > afterSeq);
}
export function logEvent(id: string, type: string, root = atelierRoot(), stepId?: string, data?: Record<string, unknown>) {
  const f = join(missionDir(id, root), "events.jsonl");
  const seq = existsSync(f) ? readFileSync(f, "utf8").split("\n").filter(Boolean).length + 1 : 1;
  appendFileSync(f, JSON.stringify({ seq, at: now(), type, ...(stepId ? { stepId } : {}), ...(data ? { data } : {}) }) + "\n");
}
function hashArtifact(m: AtelierMission, stepId: string, kind: ArtifactKind, file: string, root: string) {
  const buf = readFileSync(file);
  const art: AtelierArtifact = { id: randomUUID(), kind, stepId, path: relative(missionDir(m.id, root), file), sha256: createHash("sha256").update(buf).digest("hex"), bytes: buf.length, createdAt: now() };
  m.artifacts.push(art); return art;
}
function addArtifact(m: AtelierMission, stepId: string, kind: ArtifactKind, name: string, content: string | Buffer, root: string) {
  const dir = join(missionDir(m.id, root), "artifacts"); mkdirSync(dir, { recursive: true });
  const file = join(dir, name); writeFileSync(file, content); return hashArtifact(m, stepId, kind, file, root);
}
export function readArtifact(id: string, artifactId: string, root = atelierRoot()) {
  const m = loadMission(id, root); const a = m.artifacts.find(x => x.id === artifactId);
  if (!a) return null;
  return { artifact: a, content: readFileSync(join(missionDir(id, root), a.path)) };
}

// ---------- runtimes (subscription only) ----------
const API_KEYS = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CODEX_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN"];
/**
 * Child env of the CLIs: the subscription allowlist, minus (defence in depth, SENT-412-21) anything that could
 * redirect or authenticate an API call: ANTHROPIC_*, OPENAI_*, *_BASE_URL, *TOKEN*, *_KEY.
 */
export function agentEnvironment(env = process.env): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(subscriptionEnvironment(env)).filter(([k]) => !/^(ANTHROPIC_|OPENAI_|CODEX_|CLAUDE_CODE_)|BASE_URL|TOKEN|_KEY$/i.test(k))) as NodeJS.ProcessEnv;
}
/**
 * Pre-launch DIAGNOSTIC only (SENT-412-31): refuses no-login / API-key env, but `claude auth status` does not see
 * project/settings overrides — the in-step protection is the init stream guard (apiKeySource) + the cleaned env.
 */
export function assertSubscriptionOnly(runtimeId: RuntimeId = "codex", env = process.env, run = spawnSync) {
  const leaked = [...API_KEYS, ...(runtimeId === "claude-code" ? CLAUDE_PAID_SWITCHES : [])].filter(k => Object.entries(env).some(([n, v]) => n === k && v));
  if (leaked.length) throw new Error(`api_key_present:${leaked.join(",")}`);
  // SENT-412-31: the real pre-launch refusal is the env (above) + the settings Claude will load (only ours: --setting-sources "").
  if (runtimeId === "claude-code") assertClaudeLoadedSettings(agentInvocation("claude-code", "x", null).args);
  const s = run(runtimeId === "codex" ? "codex" : "claude", runtimeId === "codex" ? ["login", "status"] : ["auth", "status"], { encoding: "utf8", env: agentEnvironment(env), timeout: 20_000 });
  const out = `${s.stdout ?? ""}${s.stderr ?? ""}`;
  if (runtimeId === "codex") { if (!/logged in using chatgpt/i.test(out) || /api[ _-]?key/i.test(out)) throw new Error("subscription_auth_required"); return; }
  try { const j = JSON.parse(String(s.stdout)); if (j.loggedIn === true && j.authMethod === "claude.ai" && (!j.apiProvider || j.apiProvider === "firstParty")) return; } catch { /* fallthrough */ }
  throw new Error("subscription_auth_required");
}
const AGENT_HARNESS_DENY = ["package.json", "package-lock.json", "npm-shrinkwrap.json", "yarn.lock", "pnpm-lock.yaml", ".npmrc", ".yarnrc", ".yarnrc.yml"]
  .flatMap(f => [f, `**/${f}`]).flatMap(f => [`Edit(${f})`, `Write(${f})`]).join(",");
const CLAUDE_PAID_SWITCHES = ["CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX", "CLAUDE_CODE_USE_FOUNDRY", "ANTHROPIC_BASE_URL"];
/** 412-31: settings actually loaded by the CLI = only `--settings` (user/project/local disabled); no apiKeyHelper, no env. */
export function assertClaudeLoadedSettings(args: string[]) {
  const i = args.indexOf("--setting-sources"); const j = args.indexOf("--settings");
  if (i < 0 || args[i + 1] !== "") throw new Error("subscription_auth_required");
  let st: Record<string, unknown> = {};
  try { st = j < 0 ? {} : JSON.parse(args[j + 1]); } catch { throw new Error("subscription_auth_required"); }
  if ((typeof st.apiKeyHelper === "string" && st.apiKeyHelper !== "") || (st.apiKeyHelper != null && typeof st.apiKeyHelper !== "string") || st.env) throw new Error("subscription_auth_required");
}
export function agentInvocation(runtimeId: RuntimeId, modelId: string, resumeSession: string | null): { binary: string; args: string[] } {
  if (runtimeId === "codex") {
    const common = ["--json", "-m", modelId, "-c", 'forced_login_method="chatgpt"', "-c", 'model_provider="openai"', "-c", "mcp_servers={}", "-c", 'web_search="disabled"',
      // 412-24: pin the ChatGPT backend; an `openai_base_url` in the HOME config is otherwise applied.
      "-c", 'openai_base_url="https://chatgpt.com/backend-api/codex"'];
    return { binary: "codex", args: resumeSession ? ["exec", "resume", ...common, "-c", 'sandbox_mode="workspace-write"', resumeSession, "-"] : ["exec", ...common, "-s", "workspace-write", "-"] };
  }
  const args = ["-p", "--model", modelId, "--output-format", "stream-json", "--verbose", "--permission-mode", "acceptEdits",
    // SENT-412-23: no shell at all (tests run in the runner's confined test step); file tools denied on credential dirs.
    "--allowedTools", "Read,Edit,Write,Glob,Grep",
    // 412-30 (Ronny): the agent cannot touch what decides what `npm test` runs.
    "--disallowedTools", `Bash,WebFetch,WebSearch,${AGENT_HARNESS_DENY},Read(~/.claude/**),Edit(~/.claude/**),Write(~/.claude/**),Grep(~/.claude/**),Glob(~/.claude/**),Read(~/.codex/**),Edit(~/.codex/**),Write(~/.codex/**),Grep(~/.codex/**),Glob(~/.codex/**),Read(~/.ssh/**),Edit(~/.ssh/**),Write(~/.ssh/**),Grep(~/.ssh/**),Glob(~/.ssh/**),Read(~/.config/**),Edit(~/.config/**),Write(~/.config/**),Grep(~/.config/**),Glob(~/.config/**),Read(~/.aws/**),Edit(~/.aws/**),Write(~/.aws/**),Grep(~/.aws/**),Glob(~/.aws/**),Read(~/.npmrc),Edit(~/.npmrc),Write(~/.npmrc),Grep(~/.npmrc),Glob(~/.npmrc),Read(~/.netrc),Edit(~/.netrc),Write(~/.netrc),Grep(~/.netrc),Glob(~/.netrc),Read(~/.gitconfig),Edit(~/.gitconfig),Write(~/.gitconfig),Grep(~/.gitconfig),Glob(~/.gitconfig),Read(~/.git-credentials),Edit(~/.git-credentials),Write(~/.git-credentials),Grep(~/.git-credentials),Glob(~/.git-credentials)`,
    "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}',
    // SENT-412-17: never load user/project/local settings (their `env`, apiKeyHelper, skills, plugins could switch to the paid API).
    "--setting-sources", "", "--settings", '{"disableAllHooks":true,"apiKeyHelper":""}'];
  return { binary: "claude", args: resumeSession ? [...args, "--resume", resumeSession] : args };
}
/**
 * Session id + completion from the CLI's own stream.
 * Claude Code (stream-json): `system/init.model` only ECHOES the request, so it is never used as the observed model.
 * The observed model is the `message.model` of the last `assistant` event (the id returned by the Anthropic API),
 * falling back to the only key of the final `result.modelUsage` when no assistant message was streamed.
 * `quota` = the CLI reported a subscription limit (rate_limit_event status "rejected", or an error result about limits).
 */
export function parseTranscript(runtimeId: RuntimeId, transcript: string) {
  const lines = transcript.split("\n").filter(Boolean).flatMap(l => { try { return [JSON.parse(l)]; } catch { return []; } });
  if (runtimeId === "codex") {
    return { sessionId: lines.find(e => e.type === "thread.started")?.thread_id ?? null, completed: lines.some(e => e.type === "turn.completed") && !lines.some(e => e.type === "turn.failed"), streamModel: null as string | null, quota: false };
  }
  const init = lines.find(e => e.type === "system" && e.subtype === "init");
  const result = [...lines].reverse().find(e => e.type === "result");
  const assistant = [...lines].reverse().find(e => e.type === "assistant" && typeof e.message?.model === "string" && e.message.model !== "<synthetic>");
  const usage = Object.keys(result?.modelUsage ?? {});
  const quota = lines.some(e => e.type === "rate_limit_event" && e.rate_limit_info?.status === "rejected")
    || (!!result && result.is_error === true && /usage limit|rate limit|quota|limit reached/i.test(String(result.result ?? "")));
  return { sessionId: (init?.session_id ?? result?.session_id ?? lines.find(e => typeof e.session_id === "string")?.session_id ?? null) as string | null,
    completed: !!result && result.is_error === false && result.subtype === "success",
    streamModel: (assistant ? assistant.message.model : usage.length === 1 ? usage[0] : null) as string | null, quota };
}
/**
 * SENT-412-17: subscription proof from the CLI's own stream. Claude Code's `system/init` reports `apiKeySource`
 * ("none" = claude.ai subscription login). Anything else (ANTHROPIC_API_KEY, apiKeyHelper, …) or a non first-party
 * provider means a paid API session → "paid". "pending" until init is seen. Codex `--json` exposes no auth field
 * (guarded before spawn by `codex login status` + forced_login_method="chatgpt") → always "unknown".
 */
export function streamAuth(runtimeId: RuntimeId, transcript: string): "subscription" | "paid" | "pending" | "unknown" {
  if (runtimeId === "codex") return "unknown";
  for (const l of transcript.split("\n")) {
    if (!l.includes('"init"')) continue;
    let e: { type?: string; subtype?: string; apiKeySource?: unknown; apiProvider?: unknown }; try { e = JSON.parse(l); } catch { continue; }
    if (e.type !== "system" || e.subtype !== "init") continue;
    return e.apiKeySource === "none" && (e.apiProvider == null || e.apiProvider === "firstParty") ? "subscription" : "paid";
  }
  return "pending";
}
/** Model actually used, from the CLI's own record (never inferred from the request). */
export function observedModel(runtimeId: RuntimeId, sessionId: string, transcript: string, home = homedir()): string | null {
  if (runtimeId === "claude-code") return parseTranscript(runtimeId, transcript).streamModel;
  const base = join(home, ".codex", "sessions");
  const walk = (d: string): string | null => {
    for (const n of readdirSync(d)) { const p = join(d, n);
      if (statSync(p).isDirectory()) { const r = walk(p); if (r) return r; }
      else if (n.includes(sessionId) && n.endsWith(".jsonl")) return p; }
    return null;
  };
  const file = existsSync(base) ? walk(base) : null; if (!file) return null;
  const models = [...readFileSync(file, "utf8").matchAll(/"model":"([^"]+)"/g)].map(x => x[1]);
  return models.length ? models[models.length - 1] : null;
}
const executorOf = (r: RuntimeId) => r === "codex" ? "codex_cli" as const : "claude_code_cli" as const;

// ---------- missions ----------
/**
 * Repos are stored per workspace: <reposRoot>/<lowercased workspaceId>/... (SENT-412-4/8/13). The path segment is
 * lowercased (case-insensitive file systems such as APFS), and the first workspace to use a directory claims it
 * (`.oria-workspace-id`, created exclusively): another id mapping to the same directory is refused.
 */
export function workspaceReposRoot(workspaceId: string, env = process.env) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(workspaceId) || workspaceId.includes("..")) throw new Error("invalid_workspace_id");
  return join(atelierReposRoot(env), workspaceId.toLowerCase());
}
export const WORKSPACE_CLAIM_FILE = ".oria-workspace-id";
/**
 * Reserve the workspace repo directory (SENT-412-13/14). Called on the first owner+subscription-holder mission
 * creation (and by the CLI). The directory is created if missing and claimed at once. An existing directory without
 * a claim (created before claims existed) is adopted ONLY by the workspace whose id is exactly the normalised
 * (lowercase) directory name; any other id → workspace_path_collision. The claim is published via tmp+link (never
 * observable empty).
 */
export function claimWorkspaceReposRoot(workspaceId: string, env = process.env) {
  const dir = workspaceReposRoot(workspaceId, env); const claim = join(dir, WORKSPACE_CLAIM_FILE);
  const existed = existsSync(dir);
  if (!existsSync(claim)) {
    if (existed && workspaceId !== workspaceId.toLowerCase()) throw new Error("workspace_path_collision");
    mkdirSync(dir, { recursive: true });
    publishExclusiveText(claim, workspaceId);
  }
  if (readFileSync(claim, "utf8") !== workspaceId) throw new Error("workspace_path_collision");
  return dir;
}
function publishExclusiveText(target: string, text: string) {
  const tmp = `${target}.tmp-${process.pid}-${randomUUID()}`; writeFileSync(tmp, text);
  try { linkSync(tmp, target); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e; } finally { try { unlinkSync(tmp); } catch { /* */ } }
}
export function resolveRepoPath(repoPath: string, workspaceId: string, env = process.env) {
  let base: string, real: string;
  claimWorkspaceReposRoot(workspaceId, env);
  try { base = realpathSync(workspaceReposRoot(workspaceId, env)); real = realpathSync(repoPath); } catch (e) {
    if ((e as Error).message === "invalid_workspace_id") throw e; throw new Error("repo_outside_atelier_root");
  }
  if (real !== base && !real.startsWith(base + sep)) throw new Error("repo_outside_atelier_root");
  if (!existsSync(join(real, ".git"))) throw new Error("repo_not_git");
  return real;
}
export function createMission(input: { title: string; need: string; repoPath: string; modelId: string; runtimeId?: RuntimeId; workspaceId?: string; createdBy?: string | null }, root = atelierRoot(), opts: { branch?: string } = {}): AtelierMission {
  const id = randomUUID(); const runtimeId = input.runtimeId ?? "codex";
  const baseBranch = git(input.repoPath, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const baseSha = git(input.repoPath, ["rev-parse", "HEAD"]);
  const branch = opts.branch ?? `atelier/${id.slice(0, 8)}`;
  // SENT-412-20: one worktree per mission (never switch the shared checkout: two missions can share a repo).
  // 412-32/33: stale worktree entries pruned first; on failure nothing is left behind; taken branch → branch_in_use.
  spawnSync("git", ["-C", input.repoPath, "worktree", "prune"]);
  const dir = missionDir(id, root); mkdirSync(dir, { recursive: true });
  const worktree = join(dir, "worktree");
  const w = spawnSync("git", ["-C", input.repoPath, "worktree", "add", "-q", "-b", branch, worktree, baseSha], { encoding: "utf8" });
  if (w.status !== 0) {
    rmSync(dir, { recursive: true, force: true }); spawnSync("git", ["-C", input.repoPath, "worktree", "prune"]);
    throw new Error(/already exists|already checked out|is already used/i.test(String(w.stderr)) ? "branch_in_use" : "git_worktree_failed");
  }
  const m: AtelierMission = { contract: ATELIER_CONTRACT, id, workspaceId: input.workspaceId ?? LEGACY_WORKSPACE, createdBy: input.createdBy ?? null,
    title: input.title, need: input.need, createdAt: now(), updatedAt: now(), status: "created",
    runtime: { runtimeId, consumptionMode: "subscription", authMode: runtimeId === "codex" ? "chatgpt_session" : "claude_ai_session", requestedModelId: input.modelId },
    repo: { path: input.repoPath, worktree, baseBranch, branch, baseSha, headSha: baseSha }, sessionId: null, lock: null, steps: [], artifacts: [] };
  save(m, root); logEvent(id, "mission_created", root, undefined, { runtimeId, requestedModelId: input.modelId, branch }); return m;
}
/**
 * 412-32: end of a mission — remove its worktree (never forced: a dirty worktree is refused, worktree_dirty) and
 * prune. The branch and the quarantine refs stay in the repo.
 */
export function closeMission(id: string, root = atelierRoot()) {
  const m = loadMission(id, root); if (!m.repo.worktree) return m;
  // P3: the mission lock is TAKEN (not just checked) for the whole close: no step can start meanwhile.
  const { lockFile } = acquire(m, randomUUID(), false, root);
  try {
    if (existsSync(m.repo.worktree)) {
      if (git(m.repo.worktree, ["status", "--porcelain"])) throw new Error("worktree_dirty");
      git(m.repo.path, ["worktree", "remove", m.repo.worktree]);
    }
    spawnSync("git", ["-C", m.repo.path, "worktree", "prune"]);
  } finally { release(m, lockFile); save(m, root); }
  logEvent(id, "mission_closed", root); return m;
}

/** Where the agent and the runner work: the mission worktree (legacy missions: the repo itself). */
export const workPath = (m: AtelierMission) => m.repo.worktree ?? m.repo.path;
/** SENT-412-20: the work tree must still be on the mission branch at the recorded head (before each step and commit). */
export function assertRepoHead(m: AtelierMission) {
  const dir = workPath(m); let branch: string, head: string;
  try { branch = git(dir, ["rev-parse", "--abbrev-ref", "HEAD"]); head = git(dir, ["rev-parse", "HEAD"]); } catch { throw new Error("repo_head_mismatch"); }
  if (branch !== m.repo.branch || head !== m.repo.headSha) throw new Error("repo_head_mismatch");
}
/** 412-35: refuse a work tree holding a symlink that resolves outside it (agent file tools / test step could follow it). */
export function assertNoEscapingSymlink(dir: string) {
  const base = realpathSync(dir);
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      if (d === dir && n === ".git") continue;
      const pth = join(d, n); const st = lstatSync(pth);
      if (st.isSymbolicLink()) {
        let target: string; try { target = realpathSync(pth); } catch { target = resolve(dirname(pth), readlinkSync(pth)); }
        if (target !== base && !target.startsWith(base + sep)) throw new Error("repo_symlink_escape");
      } else if (st.isDirectory()) walk(pth);
    }
  };
  walk(dir);
}
/**
 * SENT-412-30a: files that decide WHAT `npm test` executes (manifests, lockfiles, npm/yarn config, test-runner
 * configs, hooks, node_modules). A mission diff (vs baseSha, committed or not, untracked or ignored included)
 * touching one → the runner test step is refused until the owner approves explicitly.
 */
const HARNESS = [
  /(^|\/)(package\.json|package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|pnpm-workspace\.yaml|bun\.lockb?|\.npmrc|\.yarnrc(\.yml)?|\.pnpmfile\.c?js|\.nvmrc|\.node-version|\.mocharc(\.[a-z]+)?|\.babelrc(\.[a-z]+)?|\.taprc|\.c8rc(\.json)?|\.nycrc(\.[a-z]+)?|run-tests\.[cm]?[jt]s)$/,
  /(^|\/)[^/]*(jest|vitest|vite|mocha|ava|playwright|cypress|karma|babel|tap|c8|nyc|test)\.config\.[cm]?[jt]s(on)?$/,
  /(^|\/)(\.husky|\.githooks|node_modules)(\/|$)/,
];
export function harnessChanges(m: AtelierMission): string[] {
  const dir = workPath(m);
  const tracked = git(dir, ["diff", "--name-only", m.repo.baseSha]).split("\n");
  const untracked = git(dir, ["ls-files", "--others", "--exclude-standard"]).split("\n");
  const ignored = git(dir, ["ls-files", "--others", "--ignored", "--exclude-standard", "--directory"]).split("\n");
  return [...new Set([...tracked, ...untracked, ...ignored].filter(Boolean))].filter(f => HARNESS.some(re => re.test(f))).sort();
}
/** SENT-412-30b: unprivileged bubblewrap available? (user namespaces + net namespace) */
let sandboxProbe: boolean | null = null;
export function sandboxAvailable(): boolean {
  if (sandboxProbe == null) sandboxProbe = spawnSync("bwrap", ["--ro-bind", "/", "/", "--unshare-net", "--die-with-parent", "true"], { timeout: 5_000 }).status === 0;
  return sandboxProbe;
}
/**
 * bwrap arguments: system dirs read-only, NO /home, /root, /workspace, /tmp of the host (fresh tmpfs /tmp), no
 * network (--unshare-net), the node install read-only, the mission work tree and private HOME the only writable binds.
 */
/** Per-mission HOME root for Codex: <mission>/codex-root/.codex is bound as ~/.codex inside the sandbox. */
export const codexRoot = (id: string, root = atelierRoot()) => join(missionDir(id, root), "codex-root");
const CODEX_CONFIG = "# Managed by Oria Atelier (SENT-412-37): the user's ~/.codex/config.toml is never loaded.\nforced_login_method = \"chatgpt\"\n";
/** Resolve a binary on PATH (absolute path, symlinks followed) — null if absent. */
function onPath(bin: string, env = process.env): string | null {
  for (const d of (env.PATH ?? "").split(":")) { if (!d) continue; const p = join(d, bin); if (existsSync(p)) return p; }
  return null;
}
export function codexSandboxInvocation(m: AtelierMission, root: string, binary: string, args: string[], env = process.env): { binary: string; args: string[] } {
  const home = homedir(); const croot = codexRoot(m.id, root); const ch = join(croot, ".codex");
  mkdirSync(ch, { recursive: true }); writeFileSync(join(ch, "config.toml"), CODEX_CONFIG);
  const sensitive = [".codex", ".claude", ".ssh", ".config", ".aws", ".gnupg", ".npmrc", ".netrc", ".git-credentials", ".docker", ".kube"].map(d => join(home, d));
  const okDir = (d: string) => d.startsWith("/") && d !== home && d !== "/" && !sensitive.some(s => d === s || d.startsWith(s + sep));
  // SENT-412-38: a PATH entry that is HOME or one of its ancestors (/home, /) would cover the isolated HOME → excluded.
  const isAncestorOfHome = (d: string) => d === "/" || home === d || home.startsWith(d + sep);
  const pathDirs = [...new Set((env.PATH ?? "").split(":").filter(d => d && existsSync(d)).map(d => realpathSync(d)).filter(d => okDir(d) && !isAncestorOfHome(d)))];
  const found = onPath(binary, env); const pkg = found ? dirname(dirname(realpathSync(found))) : null;
  const nodePrefix = dirname(dirname(process.execPath));
  const ro = ["/usr", "/bin", "/sbin", "/lib", "/lib32", "/lib64", "/etc", "/opt"].flatMap(d => ["--ro-bind-try", d, d]);
  const auth = join(home, ".codex", "auth.json");
  const work = workPath(m);
  const tools = [...new Set([nodePrefix, ...pathDirs, ...(pkg && okDir(pkg) && !isAncestorOfHome(pkg) ? [pkg] : [])])].filter(d => !isAncestorOfHome(d));
  return { binary: "bwrap", args: ["--die-with-parent", "--unshare-pid", "--unshare-ipc", "--unshare-uts", ...ro, "--dev", "/dev", "--proc", "/proc",
    // 412-38: tool dirs outside HOME are mounted BEFORE the HOME tmpfs (cannot cover it); those inside HOME (never
    // HOME itself, an ancestor, or a credential dir) after it, as read-only descendants.
    "--tmpfs", "/tmp",
    ...tools.filter(d => !d.startsWith(home + sep)).flatMap(d => ["--ro-bind-try", d, d]),
    "--tmpfs", home,
    ...tools.filter(d => d.startsWith(home + sep)).flatMap(d => ["--ro-bind-try", d, d]),
    "--bind", ch, join(home, ".codex"),
    // the ChatGPT login is the one secret Codex must see: read-only, alone (no Claude token, no ~/.ssh…)
    ...(existsSync(auth) ? ["--ro-bind", auth, join(home, ".codex", "auth.json")] : []),
    "--bind", work, work, "--chdir", work, "--", binary, ...args] };
}
export function sandboxArgs(work: string, home: string): string[] {
  const nodePrefix = dirname(dirname(process.execPath));
  const ro = ["/usr", "/bin", "/sbin", "/lib", "/lib32", "/lib64", "/etc", "/opt"].flatMap(d => ["--ro-bind-try", d, d]);
  return ["--die-with-parent", "--unshare-net", "--unshare-pid", "--unshare-ipc", "--unshare-uts", ...ro, "--dev", "/dev", "--proc", "/proc", "--tmpfs", "/tmp",
    "--ro-bind", nodePrefix, nodePrefix, "--bind", home, home, "--bind", work, work, "--chdir", work, "--"];
}
/** Signal 0 probe. EPERM = the pid exists but belongs to another user: it is ALIVE (SENT-412-7). */
export const pidAlive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === "EPERM"; } };
/**
 * Identity of a pid = its start time (SENT-412-3/6).
 * - Linux: /proc/<pid>/stat field 22 (clock ticks since boot) → "<ticks>".
 * - Elsewhere (macOS/BSD, no /proc): `ps -o etime=,comm= -p <pid>` (SENT-412-10/11). etime is an elapsed
 *   duration, so it does not depend on the time zone or locale (unlike lstart); start = now - etime, in epoch
 *   seconds → "ps:<pid>:<epochSec>:<comm>". ps runs with TZ=UTC LC_ALL=C anyway. Comparison: same pid, same
 *   command, start within PS_START_TOLERANCE_S (second resolution + the time between ps and Date.now()).
 * - Neither available → null = identity UNPROVABLE. An unprovable identity is never treated as the recorded
 *   process: never "live" (no lock blocked for ever) and never killed (no blind kill). New locks refuse to be
 *   created without a provable runner identity (process_identity_unavailable).
 */
export const PS_START_TOLERANCE_S = 2;
export function parseEtime(v: string): number | null {
  const m = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/.exec(v.trim()); if (!m) return null;
  return ((Number(m[1] ?? 0) * 24 + Number(m[2] ?? 0)) * 60 + Number(m[3])) * 60 + Number(m[4]);
}
export function procStartTime(pid: number, opts: { proc?: boolean; ps?: boolean; nowMs?: number } = {}): string | null {
  if (opts.proc !== false) {
    try { const st = readFileSync(`/proc/${pid}/stat`, "utf8"); const v = st.slice(st.lastIndexOf(")") + 2).split(" ")[19]; if (v) return v; } catch { /* no /proc or gone */ }
    if (existsSync("/proc/self/stat") && opts.ps !== true) return null; // Linux: /proc is authoritative
  }
  if (opts.ps === false) return null;
  const r = spawnSync("ps", ["-o", "etime=,comm=", "-p", String(pid)], { encoding: "utf8", timeout: 2000, env: { ...process.env, TZ: "UTC", LC_ALL: "C" } });
  const line = r.status === 0 ? String(r.stdout).trim() : ""; const sp = line.search(/\s/);
  const elapsed = sp > 0 ? parseEtime(line.slice(0, sp)) : null; const comm = sp > 0 ? line.slice(sp).trim() : "";
  if (elapsed == null || !comm) return null;
  return `ps:${pid}:${Math.floor((opts.nowMs ?? Date.now()) / 1000) - elapsed}:${comm}`;
}
/** Compare two "ps:" identities with an explicit tolerance on the start second (SENT-412-11). */
export function samePsIdentity(a: string, b: string): boolean {
  const pa = /^ps:(\d+):(\d+):(.+)$/.exec(a), pb = /^ps:(\d+):(\d+):(.+)$/.exec(b);
  return !!pa && !!pb && pa[1] === pb[1] && pa[3] === pb[3] && Math.abs(Number(pa[2]) - Number(pb[2])) <= PS_START_TOLERANCE_S;
}
/** Same process as recorded? Requires a provable identity on both sides (null → false: neither live nor killable). */
export function sameProcess(pid: number | null | undefined, start: string | null | undefined): boolean {
  if (!pid || !pidAlive(pid) || start == null) return false;
  if (start.startsWith("ps:")) { const cur = procStartTime(pid, { proc: false }); return cur != null && samePsIdentity(cur, start); }
  return procStartTime(pid) === start;
}
/** Kill a process group only if its leader is still the recorded process (never a reused pid, never blind). */
export function killRecordedGroup(pid: number | null | undefined, start: string | null | undefined, signal: NodeJS.Signals): "killed" | "gone" | "identity_mismatch" | "identity_unknown" | "kill_failed" {
  if (!pid || !pidAlive(pid)) return "gone";
  if (start == null) return "identity_unknown";
  if (!sameProcess(pid, start)) return "identity_mismatch";
  try { process.kill(-pid, signal); return "killed"; } catch (e) { return (e as NodeJS.ErrnoException).code === "ESRCH" ? "gone" : "kill_failed"; }
}
const lockPath = (id: string, root: string) => join(missionDir(id, root), "run.lock");
export function currentLock(id: string, root = atelierRoot()): (AtelierLock & { live: boolean }) | null {
  const f = lockPath(id, root); if (!existsSync(f)) return null;
  const l = JSON.parse(readFileSync(f, "utf8")) as AtelierLock; return { ...l, live: sameProcess(l.runnerPid, l.runnerStart) };
}
const readLock = (f: string): AtelierLock | null => { try { return JSON.parse(readFileSync(f, "utf8")) as AtelierLock; } catch { return null; } };
/**
 * Exclusive lock. A fresh lock is only ever created with O_EXCL ("wx"). A stale lock (dead runner) is reclaimed
 * only on explicit resume, and the reclaim is serialised by a second O_EXCL file (run.lock.reclaim): under it the
 * lock is re-read and re-checked, so a concurrent reclaimer can never delete a lock another reclaimer just created.
 * The whole reclaim is synchronous. Lock and reclaim files are published already filled (link(), never empty);
 * a reclaim file left by a killed process is broken safely (see breakAbandoned), so nothing blocks for ever.
 */
export function acquireLockFile(lockFile: string, stepId: string, opts: { explicitResume: boolean; onStale?: (held: AtelierLock) => void; afterStaleCheck?: () => void }) {
  if (existsSync(lockFile)) {
    const held = readLock(lockFile);
    // Unreadable lock (legacy/corrupt; new locks are never empty): held until ABANDONED_AFTER_MS old.
    if (!held && !abandonedUnreadable(lockFile)) throw new Error("mission_locked_by_live_runner");
    if (held && sameProcess(held.runnerPid, held.runnerStart)) throw new Error("mission_locked_by_live_runner");
    if (!opts.explicitResume) throw new Error("stale_lock_requires_explicit_resume");
    const mutex = `${lockFile}.reclaim`;
    const mine = { runnerPid: process.pid, runnerStart: procStartTime(process.pid), stepId, since: now() };
    if (!publishExclusive(mutex, mine)) {
      // SENT-412-5: an abandoned reclaim file (owner dead / identity unprovable, or unreadable and old) is broken safely, once.
      if (!breakAbandoned(mutex) || !publishExclusive(mutex, mine)) throw new Error("stale_lock_reclaim_in_progress");
    }
    try {
      opts.afterStaleCheck?.();
      const again = readLock(lockFile);
      if (!again && existsSync(lockFile)) { if (held || !abandonedUnreadable(lockFile)) throw new Error("mission_locked_by_live_runner"); unlinkSync(lockFile); }
      else if (again) {
        if (sameProcess(again.runnerPid, again.runnerStart)) throw new Error("mission_locked_by_live_runner");
        if (!held || again.token !== held.token || again.runnerPid !== held.runnerPid || again.since !== held.since) throw new Error("mission_locked_by_live_runner");
        opts.onStale?.(again);
        unlinkSync(lockFile);
      }
      return createLock(lockFile, stepId);
    } finally { const cur = readLock(mutex); if (cur?.runnerPid === mine.runnerPid && cur.since === mine.since && cur.stepId === mine.stepId) try { unlinkSync(mutex); } catch { /* */ } }
  }
  return createLock(lockFile, stepId);
}
function createLock(lockFile: string, stepId: string) {
  const runnerStart = procStartTime(process.pid);
  if (runnerStart == null) throw new Error("process_identity_unavailable");
  const lock: AtelierLock = { runnerPid: process.pid, runnerStart, childPid: null, childStart: null, token: randomUUID(), stepId, since: now() };
  if (!publishExclusive(lockFile, lock)) throw new Error("mission_locked_by_live_runner");
  return lock;
}
/** Grace period: a reclaim lasts milliseconds; an unreadable file older than this was abandoned by a killed writer. */
export const ABANDONED_AFTER_MS = 10_000;
/**
 * Exclusive publish with content: write a private temp file, then link() it to the target (atomic, fails if the
 * target exists). The target is therefore never observable empty or half-written.
 */
function publishExclusive(target: string, content: object): boolean {
  const tmp = `${target}.tmp-${process.pid}-${randomUUID()}`;
  writeFileSync(tmp, JSON.stringify(content));
  try { linkSync(tmp, target); return true; } catch (e) { if ((e as NodeJS.ErrnoException).code === "EEXIST") return false; throw e; } finally { try { unlinkSync(tmp); } catch { /* */ } }
}
function abandonedUnreadable(file: string) { try { return Date.now() - statSync(file).mtimeMs > ABANDONED_AFTER_MS; } catch { return false; } }
/**
 * Break an abandoned reclaim file (SENT-412-5/12/15/16): owner recorded but not provably alive, or unreadable and
 * older than ABANDONED_AFTER_MS.
 * - Breakers of one file instance are serialised by an atomic mkdir (`<file>.breaking-<ino>-<ctimeNs>-<gen>`, a 10 s
 *   lease; a crashed breaker is succeeded by the next generation).
 * - Correctness does NOT depend on that lease (a breaker may be suspended past it): the file is captured with an
 *   atomic rename to a private name, and the captured file is checked under that name (same inode, same bytes as
 *   judged, owner still not alive). Only then is it deleted. If a fresh file was captured, it is put back with
 *   link() (never overwrites); in the µs window where someone else published meanwhile the restore fails and the
 *   fresh file is kept under its private name for diagnosis (event-free, never deleted).
 * - Housekeeping: lease directories and private captures older than ABANDONED_AFTER_MS are purged (they no longer
 *   guard anything once their instance is gone).
 */
export function breakAbandoned(file: string, hooks: { afterJudge?: () => void; beforeCapture?: () => void } = {}): boolean {
  purgeBreakLeftovers(file);
  let raw: string, st: BigIntStats;
  try { st = statSync(file, { bigint: true }); raw = readFileSync(file, "utf8"); } catch { return true; /* already gone */ }
  const isAbandoned = (text: string, mtimeMs: number) => {
    let owner: AtelierLock | null = null; try { owner = JSON.parse(text) as AtelierLock; } catch { /* unreadable */ }
    return owner ? !sameProcess(owner.runnerPid, owner.runnerStart) : Date.now() - mtimeMs > ABANDONED_AFTER_MS;
  };
  if (!isAbandoned(raw, Number(st.mtimeMs))) return false;
  hooks.afterJudge?.();
  const prefix = `${file}.breaking-${st.ino}-${st.ctimeNs}-`;
  let lease: string | null = null;
  for (let gen = 0; gen < 1000 && !lease; gen++) {
    try { mkdirSync(prefix + gen); lease = prefix + gen; } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      try { if (Date.now() - statSync(prefix + gen).mtimeMs <= ABANDONED_AFTER_MS) return false; } catch { gen--; }
    }
  }
  if (!lease) return false;
  try {
    hooks.beforeCapture?.();
    const priv = `${file}.captured-${randomUUID()}`;
    try { renameSync(file, priv); } catch { return true; /* gone */ }
    let ok = false;
    try { const got = statSync(priv, { bigint: true }); const text = readFileSync(priv, "utf8");
      ok = got.ino === st.ino && text === raw && isAbandoned(text, Number(got.mtimeMs)); } catch { /* */ }
    if (ok) { unlinkSync(priv); return true; }
    try { linkSync(priv, file); unlinkSync(priv); } catch { /* someone published meanwhile: keep priv, never delete a fresh file */ }
    return false;
  } finally { try { rmdirSync(lease); } catch { /* */ } }
}
function purgeBreakLeftovers(file: string) {
  const dir = dirname(file), base = basename(file);
  let names: string[] = []; try { names = readdirSync(dir); } catch { return; }
  for (const n of names) {
    if (!n.startsWith(`${base}.breaking-`) && !n.startsWith(`${base}.captured-`)) continue;
    const pth = join(dir, n);
    try { const st = statSync(pth); if (Date.now() - st.mtimeMs <= ABANDONED_AFTER_MS) continue; if (st.isDirectory()) rmdirSync(pth); else if (!isLiveCapture(pth)) unlinkSync(pth); } catch { /* */ }
  }
}
/** A capture whose recorded owner is still alive is a fresh file kept after a failed restore: never purged. */
function isLiveCapture(pth: string) { try { const o = JSON.parse(readFileSync(pth, "utf8")) as AtelierLock; return sameProcess(o.runnerPid, o.runnerStart); } catch { return false; } }
function acquire(m: AtelierMission, stepId: string, explicitResume: boolean, root: string) {
  const lockFile = lockPath(m.id, root);
  const lock = acquireLockFile(lockFile, stepId, { explicitResume, onStale: (held) => {
    const stale = m.steps.find(s => s.id === held.stepId);
    if (stale && stale.status === "running") {
      stale.status = "interrupted"; stale.endedAt = now(); stale.reason = "runner_died";
      const tfile = join(missionDir(m.id, root), "artifacts", `${stale.id.slice(0, 8)}-${stale.kind}.jsonl`);
      if (existsSync(tfile)) {
        const t = readFileSync(tfile, "utf8"); const p = parseTranscript(m.runtime.runtimeId, t);
        if (p.sessionId) { stale.sessionId = p.sessionId; m.sessionId = p.sessionId; stale.observedModelId = observedModel(m.runtime.runtimeId, p.sessionId, t, codexRoot(m.id, root)); }
        hashArtifact(m, stale.id, "transcript", tfile, root);
      }
    }
    const orphan = killRecordedGroup(held.childPid, held.childStart, "SIGKILL");
    logEvent(m.id, "stale_lock_reclaimed", root, held.stepId, { deadRunnerPid: held.runnerPid, orphanChild: held.childPid, orphanKill: orphan });
  } });
  m.lock = lock; return { lockFile, lock };
}
/**
 * Boot cleanup: a crashed runner can leave its CLI child running (it keeps editing the repo and burning quota).
 * Kill such orphans, but ONLY when the child pid still has the start time recorded in the lock (never a reused pid).
 * The stale lock itself is kept: recovery still requires an explicit resume.
 */
export function reapOrphanChildren(root = atelierRoot()) {
  const reaped: { missionId: string; childPid: number; result: string }[] = [];
  if (!existsSync(root)) return reaped;
  for (const id of readdirSync(root)) {
    let f: string; try { f = lockPath(id, root); } catch { continue; } if (!existsSync(f)) continue;
    const l = readLock(f); if (!l?.childPid || sameProcess(l.runnerPid, l.runnerStart)) continue;
    const result = killRecordedGroup(l.childPid, l.childStart, "SIGKILL");
    if (result === "gone") continue;
    reaped.push({ missionId: id, childPid: l.childPid, result });
    logEvent(id, "orphan_child_reaped", root, l.stepId, { childPid: l.childPid, deadRunnerPid: l.runnerPid, result });
  }
  return reaped;
}
function release(m: AtelierMission, lockFile: string) {
  const mine = m.lock?.token; m.lock = null;
  // Only remove our own lock (token match): never a lock someone else holds now.
  try { const cur = readLock(lockFile); if (cur && (!mine || cur.token === mine)) unlinkSync(lockFile); } catch { /* */ }
}

/** SENT-412-39: simple secret scan of the ADDED lines of a diff → kinds found (never the values). */
const SECRET_PATTERNS: [string, RegExp][] = [
  ["anthropic_token", /sk-ant-[A-Za-z0-9_-]{20,}/],
  ["openai_token", /sk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}/],
  ["jwt", /eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/],
  ["oauth_token_field", /["']?(refresh_token|access_token|id_token)["']?\s*[:=]\s*["']?[A-Za-z0-9._-]{8,}/i],
  ["auth_json", /"(OPENAI_API_KEY|tokens|last_refresh|claudeAiOauth)"\s*:/],
];
export function secretFindings(diff: string): string[] {
  const added = diff.split("\n").filter(l => l.startsWith("+") && !l.startsWith("+++")).join("\n");
  return SECRET_PATTERNS.filter(([, re]) => re.test(added)).map(([k]) => k);
}
export function commitIfChanged(m: AtelierMission, step: AtelierStep, root: string) {
  const repo = workPath(m);
  assertRepoHead(m);
  git(repo, ["add", "-A"]);
  if (spawnSync("git", ["-C", repo, "diff", "--cached", "--quiet"]).status === 0) return;
  const diff = git(repo, ["diff", "--cached", "--stat", "-p"]);
  // SENT-412-39: never commit (nor store as a diff artifact) a step that wrote a secret: quarantined instead.
  const hits = secretFindings(git(repo, ["diff", "--cached", "-U0", "--no-color"]));
  if (hits.length) {
    step.status = "failed"; step.reason = "secret_detected"; step.secretKinds = hits;
    quarantine(m, step); return;
  }
  git(repo, ["-c", "user.name=Oria Atelier", "-c", "user.email=atelier@oria.local", "commit", "-q", "-m", `atelier(${step.kind}): ${m.title} [${step.id.slice(0, 8)}]`]);
  step.commitSha = git(repo, ["rev-parse", "HEAD"]); m.repo.headSha = step.commitSha;
  addArtifact(m, step.id, "diff", `${step.id.slice(0, 8)}-${step.kind}.diff`, diff, root);
  addArtifact(m, step.id, "commit", `${step.id.slice(0, 8)}-commit.txt`, `${step.commitSha}\n`, root);
}

/**
 * SENT-412-17/25/26/28: set aside (never delete) whatever the step touched in THIS mission's work tree, with
 * `git stash push --include-untracked`. The stash really produced (refs/stash compared before/after, never a blind
 * stash@{0}) is pinned under a named ref refs/atelier/quarantine/<mission>/<step> (survives stash drop / gc);
 * that ref name goes in step.quarantineRef.
 */
export function quarantine(m: AtelierMission, s: Pick<AtelierStep, "id" | "quarantineRef">) {
  s.quarantineRef = null; const dir = workPath(m);
  if (!git(dir, ["status", "--porcelain"])) return;
  // 412-34: snapshot with `git stash create` (no refs/stash, shared by all worktrees), pinned under a named ref,
  // verified (snapshot tree == work tree), and only THEN the work tree is reset to HEAD (nothing is lost).
  git(dir, ["add", "-A"]);
  const snap = git(dir, ["stash", "create", `atelier-quarantine-${m.id}-${s.id}`]);
  if (!snap || git(dir, ["rev-parse", `${snap}^{tree}`]) !== git(dir, ["write-tree"])) throw new Error("quarantine_failed");
  const ref = `refs/atelier/quarantine/${m.id}/${s.id}`;
  git(dir, ["update-ref", ref, snap]);
  if (git(dir, ["rev-parse", ref]) !== snap) throw new Error("quarantine_failed");
  git(dir, ["reset", "-q", "--hard", "HEAD"]);
  s.quarantineRef = ref;
}
export type StartedStep = { mission: AtelierMission; stepId: string; done: Promise<AtelierMission> };
/**
 * Starts an agent step. Lock + validation are synchronous (errors throw before return);
 * `done` resolves when the CLI exits. `resume` continues the previous CLI session and is
 * the only way to reclaim a stale lock. A resumed step keeps the interrupted step's kind.
 */
/** Max time before Claude Code's `system/init` (SENT-412-22): later → group killed, subscription_auth_required. */
export const INIT_TIMEOUT_MS = 30_000;
export function startAgentStep(id: string, kind: AgentStepKind | null, prompt: string, opts: { resume?: boolean; timeoutMs?: number; initTimeoutMs?: number; root?: string } = {}): StartedStep {
  const root = opts.root ?? atelierRoot();
  let m = loadMission(id, root);
  assertSubscriptionOnly(m.runtime.runtimeId, process.env, spawnSync); // diagnostic (412-31); real guard = init stream
  const lastAgent = [...m.steps].reverse().find(s => s.executor !== "runner");
  const stepKind: AgentStepKind = kind ?? (opts.resume && lastAgent && lastAgent.kind !== "test" && lastAgent.kind !== "preview" ? lastAgent.kind : "code");
  const step: AtelierStep = { id: randomUUID(), kind: stepKind, status: "running", startedAt: now(), endedAt: null, executor: executorOf(m.runtime.runtimeId), sessionId: null,
    resumedFrom: null, requestedModelId: m.runtime.requestedModelId, observedModelId: null, exitCode: null, reason: null, commitSha: null };
  const { lockFile, lock } = acquire(m, step.id, !!opts.resume, root);
  try {
    assertRepoHead(m); assertNoEscapingSymlink(workPath(m));
    if (m.runtime.runtimeId === "codex" && !sandboxAvailable()) throw new Error("sandbox_unavailable"); // SENT-412-37
  } catch (e) { release(m, lockFile); save(m, root); throw e; }
  if (opts.resume) {
    if (!m.sessionId) { release(m, lockFile); save(m, root); throw new Error("no_session_to_resume"); }
    step.sessionId = m.sessionId; step.resumedFrom = m.sessionId;
  }
  m.steps.push(step); m.status = "running"; save(m, root);
  logEvent(id, "step_started", root, step.id, { kind: stepKind, resumedFrom: step.resumedFrom, runtimeId: m.runtime.runtimeId, requestedModelId: m.runtime.requestedModelId });
  const inv = agentInvocation(m.runtime.runtimeId, m.runtime.requestedModelId, step.resumedFrom);
  // SENT-412-37: Codex has a shell → the CLI itself runs under bwrap (fake HOME; only its ChatGPT auth file + a
  // per-mission CODEX_HOME are visible). No bwrap → refused (sandbox_unavailable), never a silent fallback.
  let binary = inv.binary, args = inv.args;
  if (m.runtime.runtimeId === "codex") {
    ({ binary, args } = codexSandboxInvocation(m, root, inv.binary, inv.args));
  }
  const transcriptName = `${step.id.slice(0, 8)}-${stepKind}.jsonl`;
  const tdir = join(missionDir(id, root), "artifacts"); mkdirSync(tdir, { recursive: true });
  const tfd = openSync(join(tdir, transcriptName), "a");
  const child = spawn(binary, args, { cwd: workPath(m), env: agentEnvironment(process.env), detached: true, stdio: ["pipe", "pipe", "pipe"] });
  lock.childPid = child.pid ?? null; lock.childStart = child.pid ? procStartTime(child.pid) : null; writeFileSync(lockFile, JSON.stringify(lock)); m.lock = lock; save(m, root);
  child.stdin?.end(prompt);
  const killGroup = () => { try { process.kill(-child.pid!, "SIGKILL"); } catch { /* */ } };
  let stderr = ""; child.stderr?.on("data", c => { stderr = (stderr + c).slice(-4000); });
  child.on("error", () => { /* surfaced through close */ });
  const timer = setTimeout(killGroup, opts.timeoutMs ?? 900_000);
  // SENT-412-17/21/22: stdout is read as a stream (no file polling). Claude: the first `system/init` decides — not
  // the subscription → group killed at once; no init before the deadline → killed; never seen → fail closed.
  const isClaude = m.runtime.runtimeId === "claude-code";
  let auth: ReturnType<typeof streamAuth> = isClaude ? "pending" : "unknown"; let pendingLine = "";
  const initTimer = isClaude ? setTimeout(() => { if (auth === "pending") killGroup(); }, opts.initTimeoutMs ?? INIT_TIMEOUT_MS) : null;
  child.stdout?.on("data", (c: Buffer) => {
    writeSync(tfd, c);
    if (auth !== "pending") return;
    pendingLine += c.toString("utf8"); const lines = pendingLine.split("\n"); pendingLine = lines.pop() ?? "";
    for (const l of lines) { const a = streamAuth("claude-code", l); if (a === "pending") continue; auth = a; if (initTimer) clearTimeout(initTimer); if (a === "paid") killGroup(); break; }
  });
  const done = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(r => child.on("close", (code, signal) => r({ code, signal }))).then(({ code, signal }) => {
    clearTimeout(timer); if (initTimer) clearTimeout(initTimer); closeSync(tfd);
    m = loadMission(id, root); const s = m.steps.find(x => x.id === step.id)!;
    try { // SENT-412-27: whatever throws below (git…), the lock is released and the state saved
      const transcript = readFileSync(join(tdir, transcriptName), "utf8");
      const p = parseTranscript(m.runtime.runtimeId, transcript);
      if (p.sessionId) { m.sessionId = p.sessionId; s.sessionId = p.sessionId; }
      s.exitCode = code; s.endedAt = now();
      if (isClaude && auth === "pending") auth = streamAuth("claude-code", transcript);
      const authFailed = isClaude && auth !== "subscription"; // paid, or init missing / too late (fail closed)
      s.status = authFailed ? "failed" : signal ? "interrupted" : code === 0 && p.completed ? "succeeded" : "failed";
      if (authFailed) s.reason = "subscription_auth_required";
      else if (s.status !== "succeeded") s.reason = signal ? `signal_${signal}` : p.quota || /usage limit|rate limit|quota|limit reached/i.test(stderr + (m.runtime.runtimeId === "codex" ? transcript : "")) ? "subscription_quota" : "cli_nonzero_exit";
      if (s.status === "failed" && s.reason === "subscription_quota") s.status = "blocked";
      if (s.sessionId) s.observedModelId = observedModel(m.runtime.runtimeId, s.sessionId, transcript, codexRoot(id, root));
      hashArtifact(m, s.id, "transcript", join(tdir, transcriptName), root);
      const spec = stepKind === "spec" && existsSync(join(workPath(m), "SPEC.md")) ? readFileSync(join(workPath(m), "SPEC.md")) : null;
      if (authFailed) quarantine(m, s); // never commit, never destroy: changes set aside
      else commitIfChanged(m, s, root);
      // 412-39: no spec artifact when the step was quarantined for a secret.
      if (spec && s.reason !== "secret_detected" && !authFailed) addArtifact(m, s.id, "spec", `${s.id.slice(0, 8)}-SPEC.md`, spec, root);
    } catch (e) {
      s.status = "failed"; s.endedAt ??= now();
      if (s.reason !== "subscription_auth_required") s.reason = (e as Error).message === "repo_head_mismatch" ? "repo_head_mismatch" : "runner_error";
    } finally {
      m.status = s.status === "succeeded" ? "awaiting_review" : s.status === "interrupted" ? "interrupted" : s.status === "blocked" ? "blocked" : "failed";
      release(m, lockFile); save(m, root);
      logEvent(id, "step_finished", root, s.id, { status: s.status, reason: s.reason, observedModelId: s.observedModelId, commitSha: s.commitSha, sessionId: s.sessionId, quarantineRef: s.quarantineRef ?? null });
    }
    return m;
  });
  return { mission: m, stepId: step.id, done };
}
export async function runAgentStep(id: string, kind: AgentStepKind | null, prompt: string, opts: { resume?: boolean; timeoutMs?: number; initTimeoutMs?: number; root?: string } = {}) {
  return startAgentStep(id, kind, prompt, opts).done;
}

/** Interrupt the running agent step (works across processes via the lock's child pid). */
export function interruptMission(id: string, root = atelierRoot()) {
  const lock = currentLock(id, root);
  if (!lock) return { interrupted: false, reason: "not_running" as const };
  logEvent(id, "interrupt_requested", root, lock.stepId, { live: lock.live });
  const k = killRecordedGroup(lock.childPid, lock.childStart, "SIGTERM");
  if (k === "killed") return { interrupted: true, reason: "signal_sent" as const };
  if (k === "identity_mismatch" || k === "identity_unknown") return { interrupted: false, reason: k };
  return { interrupted: false, reason: lock.live ? "no_child" as const : "runner_dead_resume_required" as const };
}

/**
 * SENT-412-18: repo scripts (npm test…) run with a minimal env: PATH/LANG/TERM only, HOME and TMPDIR moved to a
 * private per-mission dir, so the subscription logins (~/.codex, ~/.claude) and any secret of the server env are
 * out of reach of the default paths. Not an OS sandbox (same uid: an absolute path can still be read) — see docs.
 */
export function commandStepEnvironment(id: string, root = atelierRoot(), env = process.env): NodeJS.ProcessEnv {
  const home = join(missionDir(id, root), "sandbox-home"); const tmp = join(home, "tmp"); mkdirSync(tmp, { recursive: true });
  return { NODE_ENV: "test", CI: "1", HOME: home, USERPROFILE: home, TMPDIR: tmp, TMP: tmp, TEMP: tmp, npm_config_cache: join(home, ".npm"),
    ...Object.fromEntries(Object.entries(env).filter(([k, v]) => ["PATH", "LANG", "LC_ALL", "TERM", "SYSTEMROOT", "WINDIR"].includes(k) && v !== undefined)) };
}
/** Runner-executed verification (not agent-claimed): tests or preview. */
/**
 * 412-29: the command runs as the leader of its own process group (detached) under a tiny node supervisor; on
 * timeout the WHOLE group is SIGKILLed (no orphan grandchild). Output is relayed through the supervisor.
 */
const GROUP_SUPERVISOR = `const { spawn } = require("node:child_process"); const [cmd, ...args] = process.argv.slice(1);
const c = spawn(cmd, args, { detached: true, stdio: "inherit" }); const ms = Number(process.env.ATELIER_STEP_TIMEOUT_MS);
const kill = () => { try { process.kill(-c.pid, "SIGKILL"); } catch {} };
const t = setTimeout(() => { kill(); process.exitCode = 124; }, ms);
process.on("SIGTERM", () => { kill(); process.exit(143); });
c.on("error", () => { clearTimeout(t); process.exit(127); });
c.on("exit", (code, sig) => { clearTimeout(t); kill(); if (process.exitCode !== 124) process.exitCode = code ?? 1; });`;
export function runCommandStep(id: string, kind: "test" | "preview", command: string[], opts: { root?: string; previewFile?: string; timeoutMs?: number; approveHarnessChange?: { by: string }; approveUnsandboxed?: { by: string } } = {}): AtelierMission {
  const root = opts.root ?? atelierRoot();
  const m = loadMission(id, root);
  const step: AtelierStep = { id: randomUUID(), kind, status: "running", startedAt: now(), endedAt: null, executor: "runner", sessionId: null, resumedFrom: null,
    requestedModelId: null, observedModelId: null, exitCode: null, reason: null, commitSha: m.repo.headSha };
  const { lockFile } = acquire(m, step.id, false, root);
  try {
    assertRepoHead(m); assertNoEscapingSymlink(workPath(m)); const harness = harnessChanges(m);
    m.steps.push(step); save(m, root);
    logEvent(id, "step_started", root, step.id, { kind });
    if (harness.length) step.harnessFiles = harness;
    if (harness.length && !opts.approveHarnessChange?.by) {
      // SENT-412-30a: the mission changed what `npm test` runs → never executed without the owner's explicit approval.
      step.status = "needs_human_review"; step.reason = "test_harness_changed"; step.endedAt = now();
      addArtifact(m, step.id, kind === "test" ? "test_log" : "preview", `${step.id.slice(0, 8)}-${kind}.${kind === "test" ? "log" : "txt"}`,
        `# NOT RUN: test_harness_changed (owner approval required: approveHarnessChange)\n${harness.join("\n")}\n`, root);
      m.status = "needs_human_review";
      logEvent(id, "step_finished", root, step.id, { status: step.status, reason: step.reason, harnessFiles: harness });
      return m;
    }
    if (harness.length) step.harnessApprovedBy = opts.approveHarnessChange!.by;
    if (!sandboxAvailable() && !opts.approveUnsandboxed?.by) {
      // SENT-412-36: no bwrap → fail closed; only an explicit, recorded owner approval runs it unsandboxed.
      step.status = "needs_human_review"; step.reason = "sandbox_unavailable"; step.endedAt = now(); step.sandbox = "none";
      addArtifact(m, step.id, kind === "test" ? "test_log" : "preview", `${step.id.slice(0, 8)}-${kind}.${kind === "test" ? "log" : "txt"}`,
        "# NOT RUN: sandbox_unavailable (bwrap missing or unusable; owner approval required: approveUnsandboxed)\n", root);
      m.status = "needs_human_review";
      logEvent(id, "step_finished", root, step.id, { status: step.status, reason: step.reason });
      return m;
    }
    if (!sandboxAvailable()) step.unsandboxedApprovedBy = opts.approveUnsandboxed!.by;
    const timeoutMs = opts.timeoutMs ?? 120_000;
    const env = commandStepEnvironment(m.id, root); step.sandbox = sandboxAvailable() ? "bwrap" : "none";
    const argv = step.sandbox === "bwrap" ? ["bwrap", ...sandboxArgs(workPath(m), env.HOME!), ...command] : command;
    const r = spawnSync(process.execPath, ["-e", GROUP_SUPERVISOR, ...argv], { cwd: workPath(m), encoding: "utf8", timeout: timeoutMs + 5_000, killSignal: "SIGKILL",
      env: { ...env, ATELIER_STEP_TIMEOUT_MS: String(timeoutMs) } });
    step.exitCode = r.status; step.endedAt = now(); step.status = r.status === 0 ? "succeeded" : "failed";
    const log = `$ ${command.join(" ")}\n# HEAD ${m.repo.headSha}\n# sandbox ${step.sandbox}\n${r.stdout}\n${r.stderr}\n# exit ${r.status}\n`;
    addArtifact(m, step.id, kind === "test" ? "test_log" : "preview", `${step.id.slice(0, 8)}-${kind}.${kind === "test" ? "log" : "txt"}`, log, root);
    if (kind === "preview" && opts.previewFile && existsSync(join(workPath(m), opts.previewFile)))
      addArtifact(m, step.id, "preview", `${step.id.slice(0, 8)}-${opts.previewFile.replace(/[^\w.-]/g, "_")}`, readFileSync(join(workPath(m), opts.previewFile)), root);
    m.status = step.status === "succeeded" ? "awaiting_review" : "failed";
    logEvent(id, "step_finished", root, step.id, { status: step.status, exitCode: r.status, sandbox: step.sandbox, harnessApprovedBy: step.harnessApprovedBy ?? null });
    return m;
  } finally { release(m, lockFile); save(m, root); }
}

/** Public projection for the app. */
export function missionView(m: AtelierMission) {
  const last = [...m.steps].reverse().find(s => s.executor !== "runner" && s.observedModelId);
  return { ...m, modelProof: { requested: m.runtime.requestedModelId, observed: last?.observedModelId ?? null, matches: !!last?.observedModelId && last.observedModelId === m.runtime.requestedModelId } };
}
