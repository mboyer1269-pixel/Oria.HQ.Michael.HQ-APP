/**
 * Atelier E1/D — single qualified workshop path: subscription Codex CLI in a
 * local git checkout. No API key, no OpenHands, no remote database.
 * Contract: docs/atelier-contract.md (atelier-mission/v1).
 */
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync, writeSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative } from "node:path";
import { subscriptionEnvironment } from "../ai/subscription-runtime";

export const ATELIER_CONTRACT = "atelier-mission/v1" as const;
export type StepKind = "spec" | "code" | "test" | "preview" | "revision";
export type StepStatus = "running" | "succeeded" | "failed" | "interrupted" | "blocked";
export type MissionStatus = "created" | "running" | "interrupted" | "awaiting_review" | "failed" | "blocked";
export type ArtifactKind = "spec" | "diff" | "test_log" | "preview" | "transcript" | "commit";
export type AtelierArtifact = { id: string; kind: ArtifactKind; stepId: string; path: string; sha256: string; bytes: number; createdAt: string };
export type AtelierStep = {
  id: string; kind: StepKind; status: StepStatus; startedAt: string; endedAt: string | null;
  executor: "codex_cli" | "runner"; sessionId: string | null; resumedFrom: string | null;
  requestedModelId: string | null; observedModelId: string | null; exitCode: number | null; reason: string | null;
  commitSha: string | null;
};
export type AtelierMission = {
  contract: typeof ATELIER_CONTRACT; id: string; title: string; need: string; createdAt: string; updatedAt: string;
  status: MissionStatus;
  runtime: { runtimeId: "codex"; consumptionMode: "subscription"; authMode: "chatgpt_session"; requestedModelId: string };
  repo: { path: string; baseBranch: string; branch: string; baseSha: string; headSha: string };
  sessionId: string | null; lock: { runnerPid: number; childPid: number | null; stepId: string; since: string } | null;
  steps: AtelierStep[]; artifacts: AtelierArtifact[];
};

export const atelierRoot = (env = process.env) => env.ORIA_ATELIER_ROOT || join(homedir(), ".oria-atelier", "missions");
const now = () => new Date().toISOString();
const missionDir = (id: string, root = atelierRoot()) => {
  if (!/^[a-z0-9-]{8,64}$/.test(id)) throw new Error("invalid_mission_id");
  return join(root, id);
};
function git(repo: string, args: string[]) {
  const r = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args[0]} failed: ${r.stderr.trim()}`);
  return r.stdout.trim();
}
export function loadMission(id: string, root = atelierRoot()): AtelierMission {
  return JSON.parse(readFileSync(join(missionDir(id, root), "mission.json"), "utf8"));
}
export function listMissions(root = atelierRoot()): AtelierMission[] {
  if (!existsSync(root)) return [];
  return readdirSync(root).filter(n => existsSync(join(root, n, "mission.json"))).map(n => loadMission(n, root))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
function save(m: AtelierMission, root = atelierRoot()) {
  m.updatedAt = now();
  const file = join(missionDir(m.id, root), "mission.json");
  writeFileSync(file + ".tmp", JSON.stringify(m, null, 2)); renameSync(file + ".tmp", file);
}
function addArtifact(m: AtelierMission, stepId: string, kind: ArtifactKind, name: string, content: string | Buffer, root = atelierRoot()) {
  const dir = join(missionDir(m.id, root), "artifacts"); mkdirSync(dir, { recursive: true });
  const file = join(dir, name); writeFileSync(file, content);
  const buf = readFileSync(file);
  const art: AtelierArtifact = { id: randomUUID(), kind, stepId, path: relative(missionDir(m.id, root), file), sha256: createHash("sha256").update(buf).digest("hex"), bytes: buf.length, createdAt: now() };
  m.artifacts.push(art); return art;
}
export function readArtifact(id: string, artifactId: string, root = atelierRoot()) {
  const m = loadMission(id, root); const a = m.artifacts.find(x => x.id === artifactId);
  if (!a) return null;
  return { artifact: a, content: readFileSync(join(missionDir(id, root), a.path)) };
}

export function assertSubscriptionOnly(env = process.env) {
  const leaked = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CODEX_API_KEY"].filter(k => env[k]);
  if (leaked.length) throw new Error(`api_key_present:${leaked.join(",")}`);
  const s = spawnSync("codex", ["login", "status"], { encoding: "utf8", env: subscriptionEnvironment(env) });
  const out = `${s.stdout}${s.stderr}`;
  if (!/logged in using chatgpt/i.test(out) || /api[ _-]?key/i.test(out)) throw new Error("subscription_auth_required");
}

export function createMission(input: { title: string; need: string; repoPath: string; modelId: string }, root = atelierRoot()): AtelierMission {
  const id = randomUUID();
  mkdirSync(missionDir(id, root), { recursive: true });
  const baseBranch = git(input.repoPath, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const baseSha = git(input.repoPath, ["rev-parse", "HEAD"]);
  const branch = `atelier/${id.slice(0, 8)}`;
  git(input.repoPath, ["switch", "-c", branch]);
  const m: AtelierMission = { contract: ATELIER_CONTRACT, id, title: input.title, need: input.need, createdAt: now(), updatedAt: now(), status: "created",
    runtime: { runtimeId: "codex", consumptionMode: "subscription", authMode: "chatgpt_session", requestedModelId: input.modelId },
    repo: { path: input.repoPath, baseBranch, branch, baseSha, headSha: baseSha }, sessionId: null, lock: null, steps: [], artifacts: [] };
  save(m, root); return m;
}

const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
function acquire(m: AtelierMission, stepId: string, explicitResume: boolean, root: string) {
  const lockFile = join(missionDir(m.id, root), "run.lock");
  if (existsSync(lockFile)) {
    const held = JSON.parse(readFileSync(lockFile, "utf8"));
    if (alive(held.runnerPid)) throw new Error("mission_locked_by_live_runner");
    // Stale lock = crashed runner. Never reclaimed implicitly: only an explicit resume.
    if (!explicitResume) throw new Error("stale_lock_requires_explicit_resume");
    const stale = m.steps.find(s => s.id === held.stepId);
    if (stale && stale.status === "running") {
      stale.status = "interrupted"; stale.endedAt = now(); stale.reason = "runner_died";
      // Recover the CLI session id streamed before the crash so resume continues the same thread.
      const tname = `${stale.id.slice(0, 8)}-${stale.kind}.jsonl`; const tfile = join(missionDir(m.id, root), "artifacts", tname);
      if (existsSync(tfile)) {
        const buf = readFileSync(tfile); const thread = buf.toString("utf8").match(/"thread_id":"([^"]+)"/)?.[1];
        if (thread) { stale.sessionId = thread; m.sessionId = thread; stale.observedModelId = observedCodexModel(thread); }
        m.artifacts.push({ id: randomUUID(), kind: "transcript", stepId: stale.id, path: join("artifacts", tname), sha256: createHash("sha256").update(buf).digest("hex"), bytes: buf.length, createdAt: now() });
      }
    }
    if (held.childPid && alive(held.childPid)) try { process.kill(-held.childPid, "SIGKILL"); } catch { /* gone */ }
    unlinkSync(lockFile);
  }
  const fd = openSync(lockFile, "wx");
  const lock = { runnerPid: process.pid, childPid: null as number | null, stepId, since: now() };
  writeSync(fd, JSON.stringify(lock)); closeSync(fd);
  m.lock = lock; return { lockFile, lock };
}
function release(m: AtelierMission, lockFile: string) { m.lock = null; try { unlinkSync(lockFile); } catch { /* */ } }

/** Model actually used, read from the CLI's own session record (not inferred from the request). */
export function observedCodexModel(sessionId: string, home = homedir()): string | null {
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

/** One agent step via `codex exec` (or `codex exec resume <session>` to continue the same thread). */
export async function runAgentStep(id: string, kind: StepKind, prompt: string, opts: { resume?: boolean; timeoutMs?: number; root?: string } = {}): Promise<AtelierMission> {
  const root = opts.root ?? atelierRoot();
  assertSubscriptionOnly();
  const m = loadMission(id, root);
  const step: AtelierStep = { id: randomUUID(), kind, status: "running", startedAt: now(), endedAt: null, executor: "codex_cli", sessionId: null,
    resumedFrom: null, requestedModelId: m.runtime.requestedModelId, observedModelId: null, exitCode: null, reason: null, commitSha: null };
  const { lockFile, lock } = acquire(m, step.id, !!opts.resume, root);
  if (opts.resume) { if (!m.sessionId) { release(m, lockFile); throw new Error("no_session_to_resume"); } step.sessionId = m.sessionId; step.resumedFrom = m.sessionId; }
  m.steps.push(step); m.status = "running"; save(m, root);
  const common = ["--json", "-m", m.runtime.requestedModelId, "-c", 'forced_login_method="chatgpt"', "-c", 'model_provider="openai"', "-c", "mcp_servers={}", "-c", 'web_search="disabled"'];
  const args = opts.resume && m.sessionId
    ? ["exec", "resume", ...common, "-c", 'sandbox_mode="workspace-write"', m.sessionId, "-"]
    : ["exec", ...common, "-s", "workspace-write", "-"];
  const transcriptName = `${step.id.slice(0, 8)}-${kind}.jsonl`;
  const tdir = join(missionDir(id, root), "artifacts"); mkdirSync(tdir, { recursive: true });
  const tfd = openSync(join(tdir, transcriptName), "a");
  const child = spawn("codex", args, { cwd: m.repo.path, env: subscriptionEnvironment(process.env), detached: true, stdio: ["pipe", tfd, "pipe"] });
  lock.childPid = child.pid ?? null; writeFileSync(lockFile, JSON.stringify(lock)); m.lock = lock; save(m, root);
  child.stdin?.end(prompt);
  let stderr = ""; child.stderr?.on("data", c => { stderr = (stderr + c).slice(-4000); });
  const timer = setTimeout(() => { try { process.kill(-child.pid!, "SIGKILL"); } catch { /* */ } }, opts.timeoutMs ?? 900_000);
  const { code, signal } = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(r => child.on("close", (code, signal) => r({ code, signal })));
  clearTimeout(timer); closeSync(tfd);
  const transcript = readFileSync(join(tdir, transcriptName), "utf8");
  const thread = transcript.match(/"thread_id":"([^"]+)"/)?.[1];
  if (thread) { m.sessionId = thread; step.sessionId = thread; }
  const completed = /"type":"turn.completed"/.test(transcript.split("\n").slice(-5).join("\n"));
  step.exitCode = code; step.endedAt = now();
  step.status = signal ? "interrupted" : code === 0 && completed ? "succeeded" : "failed";
  if (step.status !== "succeeded") step.reason = signal ? `signal_${signal}` : /usage limit|rate limit|quota/i.test(stderr + transcript) ? "subscription_quota" : "codex_nonzero_exit";
  if (step.sessionId) step.observedModelId = observedCodexModel(step.sessionId);
  const buf = readFileSync(join(tdir, transcriptName));
  m.artifacts.push({ id: randomUUID(), kind: "transcript", stepId: step.id, path: join("artifacts", transcriptName), sha256: createHash("sha256").update(buf).digest("hex"), bytes: buf.length, createdAt: now() });
  if (kind === "spec" && existsSync(join(m.repo.path, "SPEC.md"))) addArtifact(m, step.id, "spec", "SPEC.md", readFileSync(join(m.repo.path, "SPEC.md")), root);
  commitIfChanged(m, step, root);
  m.status = step.status === "succeeded" ? "awaiting_review" : step.status === "interrupted" ? "interrupted" : step.reason === "subscription_quota" ? "blocked" : "failed";
  release(m, lockFile); save(m, root); return m;
}

/** Runner-executed verification (not agent-claimed): tests or preview. */
export function runCommandStep(id: string, kind: "test" | "preview", command: string[], opts: { root?: string; previewFile?: string } = {}): AtelierMission {
  const root = opts.root ?? atelierRoot();
  const m = loadMission(id, root);
  const step: AtelierStep = { id: randomUUID(), kind, status: "running", startedAt: now(), endedAt: null, executor: "runner", sessionId: null, resumedFrom: null,
    requestedModelId: null, observedModelId: null, exitCode: null, reason: null, commitSha: m.repo.headSha };
  const { lockFile } = acquire(m, step.id, false, root); m.steps.push(step); save(m, root);
  const r = spawnSync(command[0], command.slice(1), { cwd: m.repo.path, encoding: "utf8", timeout: 120_000, env: subscriptionEnvironment(process.env) });
  step.exitCode = r.status; step.endedAt = now(); step.status = r.status === 0 ? "succeeded" : "failed";
  const log = `$ ${command.join(" ")}\n# HEAD ${m.repo.headSha}\n${r.stdout}\n${r.stderr}\n# exit ${r.status}\n`;
  addArtifact(m, step.id, kind === "test" ? "test_log" : "preview", `${step.id.slice(0, 8)}-${kind}.${kind === "test" ? "log" : "txt"}`, log, root);
  if (kind === "preview" && opts.previewFile && existsSync(join(m.repo.path, opts.previewFile)))
    addArtifact(m, step.id, "preview", `${step.id.slice(0, 8)}-${opts.previewFile.replace(/[^\w.-]/g, "_")}`, readFileSync(join(m.repo.path, opts.previewFile)), root);
  m.status = step.status === "succeeded" ? "awaiting_review" : "failed";
  release(m, lockFile); save(m, root); return m;
}

/** Public projection for the app (no absolute host paths beyond repo, no transcript bodies). */
export function missionView(m: AtelierMission) {
  const last = [...m.steps].reverse().find(s => s.executor === "codex_cli");
  return { ...m, modelProof: { requested: m.runtime.requestedModelId, observed: last?.observedModelId ?? null, matches: !!last?.observedModelId && last.observedModelId === m.runtime.requestedModelId } };
}
