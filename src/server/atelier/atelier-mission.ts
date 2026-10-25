/**
 * Atelier V1 — single workshop module, subscription CLIs only (Codex ChatGPT, Claude Code claude.ai).
 * No API key, no OpenHands, no remote database. Contract: docs/atelier-contract.md (atelier-mission/v1).
 */
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, closeSync, linkSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, rmdirSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import type { BigIntStats } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative, sep } from "node:path";
import { subscriptionEnvironment } from "../ai/subscription-runtime";

export const ATELIER_CONTRACT = "atelier-mission/v1" as const;
export type RuntimeId = "codex" | "claude-code";
export type AgentStepKind = "spec" | "code" | "revision";
export type StepKind = AgentStepKind | "test" | "preview";
export type StepStatus = "running" | "succeeded" | "failed" | "interrupted" | "blocked";
export type MissionStatus = "created" | "running" | "interrupted" | "awaiting_review" | "failed" | "blocked";
export type ArtifactKind = "spec" | "diff" | "test_log" | "preview" | "transcript" | "commit";
export type AtelierArtifact = { id: string; kind: ArtifactKind; stepId: string; path: string; sha256: string; bytes: number; createdAt: string };
export type AtelierStep = {
  id: string; kind: StepKind; status: StepStatus; startedAt: string; endedAt: string | null;
  executor: "codex_cli" | "claude_code_cli" | "runner"; sessionId: string | null; resumedFrom: string | null;
  requestedModelId: string | null; observedModelId: string | null; exitCode: number | null; reason: string | null;
  commitSha: string | null;
};
export type AtelierLock = { runnerPid: number; runnerStart?: string | null; childPid: number | null; childStart?: string | null; token?: string; stepId: string; since: string };
export type AtelierMission = {
  contract: typeof ATELIER_CONTRACT; id: string; workspaceId: string; createdBy: string | null;
  title: string; need: string; createdAt: string; updatedAt: string; status: MissionStatus;
  runtime: { runtimeId: RuntimeId; consumptionMode: "subscription"; authMode: "chatgpt_session" | "claude_ai_session"; requestedModelId: string };
  repo: { path: string; baseBranch: string; branch: string; baseSha: string; headSha: string };
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
export function assertSubscriptionOnly(runtimeId: RuntimeId = "codex", env = process.env, run = spawnSync) {
  const leaked = API_KEYS.filter(k => env[k]);
  if (leaked.length) throw new Error(`api_key_present:${leaked.join(",")}`);
  const s = run(runtimeId === "codex" ? "codex" : "claude", runtimeId === "codex" ? ["login", "status"] : ["auth", "status"], { encoding: "utf8", env: subscriptionEnvironment(env) });
  const out = `${s.stdout ?? ""}${s.stderr ?? ""}`;
  if (runtimeId === "codex") { if (!/logged in using chatgpt/i.test(out) || /api[ _-]?key/i.test(out)) throw new Error("subscription_auth_required"); return; }
  try { const j = JSON.parse(String(s.stdout)); if (j.loggedIn === true && j.authMethod === "claude.ai" && (!j.apiProvider || j.apiProvider === "firstParty")) return; } catch { /* fallthrough */ }
  throw new Error("subscription_auth_required");
}
export function agentInvocation(runtimeId: RuntimeId, modelId: string, resumeSession: string | null): { binary: string; args: string[] } {
  if (runtimeId === "codex") {
    const common = ["--json", "-m", modelId, "-c", 'forced_login_method="chatgpt"', "-c", 'model_provider="openai"', "-c", "mcp_servers={}", "-c", 'web_search="disabled"'];
    return { binary: "codex", args: resumeSession ? ["exec", "resume", ...common, "-c", 'sandbox_mode="workspace-write"', resumeSession, "-"] : ["exec", ...common, "-s", "workspace-write", "-"] };
  }
  const args = ["-p", "--model", modelId, "--output-format", "stream-json", "--verbose", "--permission-mode", "acceptEdits",
    "--allowedTools", "Read,Edit,Write,Glob,Grep,Bash(npm test:*),Bash(node --test:*),Bash(ls:*),Bash(cat:*)",
    "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}', "--settings", '{"disableAllHooks":true,"apiKeyHelper":""}'];
  return { binary: "claude", args: resumeSession ? [...args, "--resume", resumeSession] : args };
}
/** Session id + completion from the CLI's own stream. */
export function parseTranscript(runtimeId: RuntimeId, transcript: string) {
  const lines = transcript.split("\n").filter(Boolean).flatMap(l => { try { return [JSON.parse(l)]; } catch { return []; } });
  if (runtimeId === "codex") {
    return { sessionId: lines.find(e => e.type === "thread.started")?.thread_id ?? null, completed: lines.some(e => e.type === "turn.completed") && !lines.some(e => e.type === "turn.failed"), streamModel: null as string | null };
  }
  const init = lines.find(e => e.type === "system" && e.subtype === "init");
  const result = [...lines].reverse().find(e => e.type === "result");
  const usage = Object.keys(result?.modelUsage ?? {});
  return { sessionId: init?.session_id ?? result?.session_id ?? null, completed: !!result && result.is_error === false, streamModel: (typeof init?.model === "string" ? init.model : usage.length === 1 ? usage[0] : null) as string | null };
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
/** Repos are stored per workspace: <reposRoot>/<workspaceId>/... (SENT-412-4/8). */
export function workspaceReposRoot(workspaceId: string, env = process.env) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(workspaceId) || workspaceId.includes("..")) throw new Error("invalid_workspace_id");
  return join(atelierReposRoot(env), workspaceId);
}
export function resolveRepoPath(repoPath: string, workspaceId: string, env = process.env) {
  let base: string, real: string;
  try { base = realpathSync(workspaceReposRoot(workspaceId, env)); real = realpathSync(repoPath); } catch (e) {
    if ((e as Error).message === "invalid_workspace_id") throw e; throw new Error("repo_outside_atelier_root");
  }
  if (real !== base && !real.startsWith(base + sep)) throw new Error("repo_outside_atelier_root");
  if (!existsSync(join(real, ".git"))) throw new Error("repo_not_git");
  return real;
}
export function createMission(input: { title: string; need: string; repoPath: string; modelId: string; runtimeId?: RuntimeId; workspaceId?: string; createdBy?: string | null }, root = atelierRoot()): AtelierMission {
  const id = randomUUID(); const runtimeId = input.runtimeId ?? "codex";
  mkdirSync(missionDir(id, root), { recursive: true });
  const baseBranch = git(input.repoPath, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const baseSha = git(input.repoPath, ["rev-parse", "HEAD"]);
  const branch = `atelier/${id.slice(0, 8)}`;
  git(input.repoPath, ["switch", "-q", "-c", branch]);
  const m: AtelierMission = { contract: ATELIER_CONTRACT, id, workspaceId: input.workspaceId ?? LEGACY_WORKSPACE, createdBy: input.createdBy ?? null,
    title: input.title, need: input.need, createdAt: now(), updatedAt: now(), status: "created",
    runtime: { runtimeId, consumptionMode: "subscription", authMode: runtimeId === "codex" ? "chatgpt_session" : "claude_ai_session", requestedModelId: input.modelId },
    repo: { path: input.repoPath, baseBranch, branch, baseSha, headSha: baseSha }, sessionId: null, lock: null, steps: [], artifacts: [] };
  save(m, root); logEvent(id, "mission_created", root, undefined, { runtimeId, requestedModelId: input.modelId, branch }); return m;
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
 * Break an abandoned reclaim file (SENT-412-5/12): owner recorded but not provably alive, or unreadable and older
 * than ABANDONED_AFTER_MS. Breaking is serialised per file INSTANCE by an atomic mkdir of a fixed name derived from
 * its inode + change time (`<file>.breaking-<ino>-<ctimeNs>-<gen>`): only one breaker per instance. Under it the
 * file is re-read and re-checked (same instance, still abandoned) and only then unlinked — nothing is renamed or
 * restored, so a fresh file published by someone else is never moved or deleted. Between the re-check and the
 * unlink the instance can only disappear through its owner (dead) or a breaker (excluded by the mkdir).
 * A breaker killed mid-break leaves its directory: after ABANDONED_AFTER_MS the next generation may take over.
 */
export function breakAbandoned(file: string, hooks: { afterJudge?: () => void } = {}): boolean {
  const judge = () => {
    let raw: string, st: BigIntStats;
    try { st = statSync(file, { bigint: true }); raw = readFileSync(file, "utf8"); } catch { return null; }
    let owner: AtelierLock | null = null; try { owner = JSON.parse(raw) as AtelierLock; } catch { /* unreadable */ }
    const abandoned = owner ? !sameProcess(owner.runnerPid, owner.runnerStart) : Date.now() - Number(st.mtimeMs) > ABANDONED_AFTER_MS;
    return { key: `${st.ino}-${st.ctimeNs}`, abandoned };
  };
  const first = judge(); if (!first) return true; /* already gone */
  if (!first.abandoned) return false;
  hooks.afterJudge?.();
  const prefix = `${file}.breaking-${first.key}-`;
  let mine: string | null = null;
  for (let gen = 0; gen < 1000 && !mine; gen++) {
    try { mkdirSync(prefix + gen); mine = prefix + gen; } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      try { if (Date.now() - statSync(prefix + gen).mtimeMs <= ABANDONED_AFTER_MS) return false; } catch { /* removed meanwhile: retry same gen */ gen--; }
    }
  }
  if (!mine) return false;
  try {
    const again = judge();
    if (!again) return true;
    if (again.key !== first.key || !again.abandoned) return false; // a different (fresh) file: leave it alone
    unlinkSync(file); return true;
  } finally {
    const dir = dirname(file), base = `${basename(file)}.breaking-${first.key}-`;
    for (const n of readdirSync(dir)) if (n.startsWith(base)) try { rmdirSync(join(dir, n)); } catch { /* */ }
  }
}
function acquire(m: AtelierMission, stepId: string, explicitResume: boolean, root: string) {
  const lockFile = lockPath(m.id, root);
  const lock = acquireLockFile(lockFile, stepId, { explicitResume, onStale: (held) => {
    const stale = m.steps.find(s => s.id === held.stepId);
    if (stale && stale.status === "running") {
      stale.status = "interrupted"; stale.endedAt = now(); stale.reason = "runner_died";
      const tfile = join(missionDir(m.id, root), "artifacts", `${stale.id.slice(0, 8)}-${stale.kind}.jsonl`);
      if (existsSync(tfile)) {
        const t = readFileSync(tfile, "utf8"); const p = parseTranscript(m.runtime.runtimeId, t);
        if (p.sessionId) { stale.sessionId = p.sessionId; m.sessionId = p.sessionId; stale.observedModelId = observedModel(m.runtime.runtimeId, p.sessionId, t); }
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

function commitIfChanged(m: AtelierMission, step: AtelierStep, root: string) {
  const repo = m.repo.path;
  git(repo, ["add", "-A"]);
  if (spawnSync("git", ["-C", repo, "diff", "--cached", "--quiet"]).status === 0) return;
  const diff = git(repo, ["diff", "--cached", "--stat", "-p"]);
  git(repo, ["-c", "user.name=Oria Atelier", "-c", "user.email=atelier@oria.local", "commit", "-q", "-m", `atelier(${step.kind}): ${m.title} [${step.id.slice(0, 8)}]`]);
  step.commitSha = git(repo, ["rev-parse", "HEAD"]); m.repo.headSha = step.commitSha;
  addArtifact(m, step.id, "diff", `${step.id.slice(0, 8)}-${step.kind}.diff`, diff, root);
  addArtifact(m, step.id, "commit", `${step.id.slice(0, 8)}-commit.txt`, `${step.commitSha}\n`, root);
}

export type StartedStep = { mission: AtelierMission; stepId: string; done: Promise<AtelierMission> };
/**
 * Starts an agent step. Lock + validation are synchronous (errors throw before return);
 * `done` resolves when the CLI exits. `resume` continues the previous CLI session and is
 * the only way to reclaim a stale lock. A resumed step keeps the interrupted step's kind.
 */
export function startAgentStep(id: string, kind: AgentStepKind | null, prompt: string, opts: { resume?: boolean; timeoutMs?: number; root?: string } = {}): StartedStep {
  const root = opts.root ?? atelierRoot();
  let m = loadMission(id, root);
  assertSubscriptionOnly(m.runtime.runtimeId);
  const lastAgent = [...m.steps].reverse().find(s => s.executor !== "runner");
  const stepKind: AgentStepKind = kind ?? (opts.resume && lastAgent && lastAgent.kind !== "test" && lastAgent.kind !== "preview" ? lastAgent.kind : "code");
  const step: AtelierStep = { id: randomUUID(), kind: stepKind, status: "running", startedAt: now(), endedAt: null, executor: executorOf(m.runtime.runtimeId), sessionId: null,
    resumedFrom: null, requestedModelId: m.runtime.requestedModelId, observedModelId: null, exitCode: null, reason: null, commitSha: null };
  const { lockFile, lock } = acquire(m, step.id, !!opts.resume, root);
  if (opts.resume) {
    if (!m.sessionId) { release(m, lockFile); save(m, root); throw new Error("no_session_to_resume"); }
    step.sessionId = m.sessionId; step.resumedFrom = m.sessionId;
  }
  m.steps.push(step); m.status = "running"; save(m, root);
  logEvent(id, "step_started", root, step.id, { kind: stepKind, resumedFrom: step.resumedFrom, runtimeId: m.runtime.runtimeId, requestedModelId: m.runtime.requestedModelId });
  const { binary, args } = agentInvocation(m.runtime.runtimeId, m.runtime.requestedModelId, step.resumedFrom);
  const transcriptName = `${step.id.slice(0, 8)}-${stepKind}.jsonl`;
  const tdir = join(missionDir(id, root), "artifacts"); mkdirSync(tdir, { recursive: true });
  const tfd = openSync(join(tdir, transcriptName), "a");
  const child = spawn(binary, args, { cwd: m.repo.path, env: subscriptionEnvironment(process.env), detached: true, stdio: ["pipe", tfd, "pipe"] });
  lock.childPid = child.pid ?? null; lock.childStart = child.pid ? procStartTime(child.pid) : null; writeFileSync(lockFile, JSON.stringify(lock)); m.lock = lock; save(m, root);
  child.stdin?.end(prompt);
  let stderr = ""; child.stderr?.on("data", c => { stderr = (stderr + c).slice(-4000); });
  child.on("error", () => { /* surfaced through close */ });
  const timer = setTimeout(() => { try { process.kill(-child.pid!, "SIGKILL"); } catch { /* */ } }, opts.timeoutMs ?? 900_000);
  const done = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(r => child.on("close", (code, signal) => r({ code, signal }))).then(({ code, signal }) => {
    clearTimeout(timer); closeSync(tfd);
    m = loadMission(id, root); const s = m.steps.find(x => x.id === step.id)!;
    const transcript = readFileSync(join(tdir, transcriptName), "utf8");
    const p = parseTranscript(m.runtime.runtimeId, transcript);
    if (p.sessionId) { m.sessionId = p.sessionId; s.sessionId = p.sessionId; }
    s.exitCode = code; s.endedAt = now();
    s.status = signal ? "interrupted" : code === 0 && p.completed ? "succeeded" : "failed";
    if (s.status !== "succeeded") s.reason = signal ? `signal_${signal}` : /usage limit|rate limit|quota|limit reached/i.test(stderr + transcript) ? "subscription_quota" : "cli_nonzero_exit";
    if (s.status === "failed" && s.reason === "subscription_quota") s.status = "blocked";
    if (s.sessionId) s.observedModelId = observedModel(m.runtime.runtimeId, s.sessionId, transcript);
    hashArtifact(m, s.id, "transcript", join(tdir, transcriptName), root);
    if (stepKind === "spec" && existsSync(join(m.repo.path, "SPEC.md"))) addArtifact(m, s.id, "spec", `${s.id.slice(0, 8)}-SPEC.md`, readFileSync(join(m.repo.path, "SPEC.md")), root);
    commitIfChanged(m, s, root);
    m.status = s.status === "succeeded" ? "awaiting_review" : s.status === "interrupted" ? "interrupted" : s.status === "blocked" ? "blocked" : "failed";
    release(m, lockFile); save(m, root);
    logEvent(id, "step_finished", root, s.id, { status: s.status, reason: s.reason, observedModelId: s.observedModelId, commitSha: s.commitSha, sessionId: s.sessionId });
    return m;
  });
  return { mission: m, stepId: step.id, done };
}
export async function runAgentStep(id: string, kind: AgentStepKind | null, prompt: string, opts: { resume?: boolean; timeoutMs?: number; root?: string } = {}) {
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

/** Runner-executed verification (not agent-claimed): tests or preview. */
export function runCommandStep(id: string, kind: "test" | "preview", command: string[], opts: { root?: string; previewFile?: string } = {}): AtelierMission {
  const root = opts.root ?? atelierRoot();
  const m = loadMission(id, root);
  const step: AtelierStep = { id: randomUUID(), kind, status: "running", startedAt: now(), endedAt: null, executor: "runner", sessionId: null, resumedFrom: null,
    requestedModelId: null, observedModelId: null, exitCode: null, reason: null, commitSha: m.repo.headSha };
  const { lockFile } = acquire(m, step.id, false, root); m.steps.push(step); save(m, root);
  logEvent(id, "step_started", root, step.id, { kind });
  const r = spawnSync(command[0], command.slice(1), { cwd: m.repo.path, encoding: "utf8", timeout: 120_000, env: subscriptionEnvironment(process.env) });
  step.exitCode = r.status; step.endedAt = now(); step.status = r.status === 0 ? "succeeded" : "failed";
  const log = `$ ${command.join(" ")}\n# HEAD ${m.repo.headSha}\n${r.stdout}\n${r.stderr}\n# exit ${r.status}\n`;
  addArtifact(m, step.id, kind === "test" ? "test_log" : "preview", `${step.id.slice(0, 8)}-${kind}.${kind === "test" ? "log" : "txt"}`, log, root);
  if (kind === "preview" && opts.previewFile && existsSync(join(m.repo.path, opts.previewFile)))
    addArtifact(m, step.id, "preview", `${step.id.slice(0, 8)}-${opts.previewFile.replace(/[^\w.-]/g, "_")}`, readFileSync(join(m.repo.path, opts.previewFile)), root);
  m.status = step.status === "succeeded" ? "awaiting_review" : "failed";
  release(m, lockFile); save(m, root);
  logEvent(id, "step_finished", root, step.id, { status: step.status, exitCode: r.status });
  return m;
}

/** Public projection for the app. */
export function missionView(m: AtelierMission) {
  const last = [...m.steps].reverse().find(s => s.executor !== "runner" && s.observedModelId);
  return { ...m, modelProof: { requested: m.runtime.requestedModelId, observed: last?.observedModelId ?? null, matches: !!last?.observedModelId && last.observedModelId === m.runtime.requestedModelId } };
}
