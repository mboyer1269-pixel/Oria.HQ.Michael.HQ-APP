import { spawnSync, type ChildProcess, type SpawnOptions } from "node:child_process";
import { randomUUID } from "node:crypto";
import { constants, closeSync, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync,
  readdirSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { TextDecoder } from "node:util";
import { ownerSpecPayloadSchema, ownerSpecAdmissionSchema, ownerSpecAdmissionMatches,
  validateOwnerSpecResult, sha256, type OwnerSpecExecution, type OwnerSpecResult } from "../missions/atelier-owner-spec-contract";
import { ATELIER_CONTRACT, acquireLockFile, agentEnvironment, agentInvocation, assertNoEscapingSymlink,
  assertRepoHead, killRecordedGroup, logEvent, missionDir, parseTranscript, procStartTime,
  resolveRepoPath, sandboxArgs, secretFindings, workspaceReposRoot,
  type AtelierMission, type AtelierStep } from "./atelier-mission";

/** No production adapter is installed. This port is injected by offline verification only.
 * A real subscription adapter requires independent confinement/auth qualification, not an env flag.
 */
export type BoundSpecProvider = {
  assertSubscription: () => void;
  sandboxAvailable: () => boolean;
  spawn: (binary: string, args: string[], options: SpawnOptions) => ChildProcess;
};
export type BoundSpecOptions = { root: string; env: NodeJS.ProcessEnv; provider?: BoundSpecProvider | null };
const MAX_TRANSCRIPT = 256_000;
const MAX_SPEC = 64_000;
const stamp = () => new Date().toISOString();
const noEvidence = (status: OwnerSpecResult["status"], sessionId: string | null = null): OwnerSpecResult => ({ status, sessionId });
function gitEnvironment(): NodeJS.ProcessEnv {
  return { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => ["PATH", "SYSTEMROOT", "WINDIR", "LANG"].includes(key))),
    NODE_ENV: "development", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0" };
}
function git(dir: string, args: string[]) {
  const r = spawnSync("git", ["-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false", "-C", dir, ...args], { encoding: "utf8", timeout: 20_000, env: gitEnvironment() });
  if (r.status !== 0) throw new Error("bound_git_failed");
  return r.stdout;
}
function assertNoCheckoutPrograms(repository: string) {
  // Checkout filters can run commands before the provider sandbox. Reject them (including indirect config).
  const r = spawnSync("git", ["-c", "core.fsmonitor=false", "-C", repository, "config", "--local", "--name-only", "--get-regexp",
    "^(filter\\.|include\\.|includeif\\.|extensions\\.worktreeconfig|core\\.fsmonitor)"], { encoding: "utf8", timeout: 5000, env: gitEnvironment() });
  if (r.status !== 1) throw new Error("repository_checkout_configuration_refused");
}
function save(file: string, value: unknown) {
  const tmp = `${file}.${randomUUID()}.tmp`;
  writeFileSync(tmp, JSON.stringify(value), { mode: 0o600, flag: "wx" }); renameSync(tmp, file);
}
function checkedExecution(raw: OwnerSpecExecution): OwnerSpecExecution | null {
  const p = ownerSpecPayloadSchema.safeParse(raw?.payload), r = ownerSpecAdmissionSchema.safeParse(raw?.receipt);
  if (!p.success || !r.success) return null;
  const payload = p.data, receipt = r.data, b = payload.binding;
  const { bindingHash, ...body } = b;
  if (sha256(JSON.stringify(payload)) !== raw.payloadHash || sha256(payload.instructions.text) !== payload.instructions.sha256
    || sha256(JSON.stringify(body)) !== bindingHash || b.workspaceId !== payload.workspaceId || b.actorId !== payload.actorId
    || b.modeId !== payload.modeId || b.missionId !== payload.missionId
    || !ownerSpecAdmissionMatches(receipt, payload, raw.payloadHash)) return null;
  return { payload, receipt, payloadHash: raw.payloadHash };
}
function regularBytes(file: string, max: number) {
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const s = fstatSync(fd);
    if (!s.isFile() || s.nlink !== 1 || s.size > max) throw new Error("invalid_spec_file");
    const bytes = readFileSync(fd); if (bytes.length > max) throw new Error("invalid_spec_file");
    return bytes;
  } finally { closeSync(fd); }
}
/** Sandbox is deliberately offline and credential-free in this unmounted candidate. */
export function boundSpecInvocation(m: AtelierMission, home: string) {
  const work = m.repo.worktree!, spec = join(work, "SPEC.md");
  const args = sandboxArgs(work, home);
  const index = args.findIndex((v, i) => v === "--bind" && args[i + 1] === work && args[i + 2] === work);
  if (index < 0) throw new Error("sandbox_recipe_invalid");
  args[index] = "--ro-bind";
  args.splice(args.indexOf("--chdir"), 0, "--bind", spec, spec);
  const invocation = agentInvocation("codex", m.runtime.requestedModelId, null);
  const disabled = ["shell_tool", "unified_exec", "apps", "hooks", "multi_agent", "multi_agent_v2",
    "browser_use", "browser_use_external", "browser_use_full_cdp_access", "in_app_browser", "image_generation"];
  return { binary: "bwrap", args: [...args, invocation.binary, ...invocation.args.slice(0, -1),
    ...disabled.flatMap(flag => ["-c", `features.${flag}=false`]), "-"] };
}
function recordedModel(home: string, sessionId: string): string | null {
  // Never consult the user's ~/.codex/sessions. Only this fresh private home is eligible.
  const base = join(home, ".codex", "sessions"); if (!existsSync(base)) return null;
  for (const dir of [home, join(home, ".codex"), base]) if (lstatSync(dir).isSymbolicLink()) throw new Error("model_record_symlink");
  let count = 0, total = 0; const models: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (++count > 200) throw new Error("model_record_limit");
      const file = join(dir, name), s = lstatSync(file);
      if (s.isSymbolicLink()) throw new Error("model_record_symlink");
      if (s.isDirectory()) walk(file);
      else if (name.endsWith(".jsonl") && name.includes(sessionId)) {
        const bytes = regularBytes(file, MAX_TRANSCRIPT); total += bytes.length;
        if (total > MAX_TRANSCRIPT) throw new Error("model_record_limit");
        const records = bytes.toString("utf8").split("\n").filter(Boolean).map(line => JSON.parse(line));
        if (!records.some(record => record.type === "session_meta" && record.payload?.id === sessionId)) throw new Error("model_record_session_mismatch");
        for (const record of records) {
          if (record.type === "turn_context" && typeof record.payload?.model === "string") models.push(record.payload.model);
        }
      }
    }
  };
  walk(base); return models.length && new Set(models).size === 1 ? models[0] : null;
}
function changedFiles(work: string, base: string) {
  return [...new Set([
    ...git(work, ["diff", "--no-ext-diff", "--no-textconv", "--name-only", "-z", base]).split("\0"),
    ...git(work, ["ls-files", "--others", "--exclude-standard", "-z"]).split("\0"),
    ...git(work, ["ls-files", "--others", "--ignored", "--exclude-standard", "-z"]).split("\0"),
  ].filter(Boolean))];
}
/** Consumes only a service-verified v2 receipt; hashes here are consistency checks, not authorization.
 * The canonical service must perform current owner/G1/atomic-claim checks before calling execute.
 * A run directory is an irreversible local attempt marker: crash/uncertainty never causes a relaunch.
 */
export function createBoundSpecEngine(options: BoundSpecOptions) {
  const { root, env, provider = null } = options;
  function recover(raw: OwnerSpecExecution): OwnerSpecResult {
    const e = checkedExecution(raw); if (!e) return noEvidence("blocked");
    try {
      const dir = missionDir(e.payload.runId, root);
      const saved = JSON.parse(regularBytes(join(dir, "execution.json"), 64_000).toString("utf8"));
      if (JSON.stringify(saved) !== JSON.stringify(e)) return noEvidence("reconciliation_required");
      const result = JSON.parse(regularBytes(join(dir, "result.json"), 256_000).toString("utf8"));
      return validateOwnerSpecResult(result, e) ?? noEvidence("reconciliation_required");
    } catch { return noEvidence("reconciliation_required"); }
  }
  async function execute(raw: OwnerSpecExecution): Promise<OwnerSpecResult> {
    const e = checkedExecution(raw); if (!e) return noEvidence("blocked");
    const p = e.payload, receipt = e.receipt, dir = missionDir(p.runId, root);
    mkdirSync(root, { recursive: true, mode: 0o700 });
    try { mkdirSync(dir, { mode: 0o700 }); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") return recover(e);
      return noEvidence("reconciliation_required");
    }
    // Persist before any provider call, repository mutation, or worktree creation.
    save(join(dir, "execution.json"), e);
    let m: AtelierMission | null = null, step: AtelierStep | null = null;
    let result = noEvidence("blocked"), reason = "provider_unavailable";
    let lockFile: string | null = null, token: string | undefined, childClosed = true;
    try {
      if (!provider) throw new Error(reason);
      if (env.NODE_ENV === "production") throw new Error("production_execution_disabled");
      if (Date.parse(p.reviewExpiresAt) <= Date.now() || Date.parse(receipt.admittedAt) > Date.now()
        || Date.parse(receipt.admittedAt) >= Date.parse(p.reviewExpiresAt)) throw new Error("review_expired");
      if (p.binding.selection.runtimeId !== "codex") throw new Error("runtime_not_confined");
      // The environment can never choose a paid connection, even with an injected port.
      if (Object.entries(env).some(([k, v]) => v && /^(OPENAI_|ANTHROPIC_|CODEX_API_KEY|CLAUDE_CODE_OAUTH_TOKEN)/i.test(k))) throw new Error("api_configuration_present");
      provider.assertSubscription();
      if (!provider.sandboxAvailable()) throw new Error("sandbox_unavailable");
      const repository = resolveRepoPath(resolve(workspaceReposRoot(p.workspaceId, env), p.binding.repository.relativePath), p.workspaceId, env);
      if (git(repository, ["rev-parse", "HEAD"]).trim() !== p.binding.repository.baseSha) throw new Error("repo_head_mismatch");
      assertNoCheckoutPrograms(repository);
      const work = join(dir, "worktree"), home = join(dir, "provider-home");
      git(repository, ["worktree", "add", "--detach", work, p.binding.repository.baseSha]);
      assertNoEscapingSymlink(work);
      mkdirSync(join(home, ".codex"), { recursive: true, mode: 0o700 });
      writeFileSync(join(home, ".codex", "config.toml"), 'forced_login_method = "chatgpt"\n', { flag: "wx", mode: 0o600 });
      const spec = join(work, "SPEC.md");
      const before = existsSync(spec) ? regularBytes(spec, MAX_SPEC) : null;
      if (!existsSync(spec)) writeFileSync(spec, "", { flag: "wx", mode: 0o600 });
      const original = lstatSync(spec);
      if (!original.isFile() || original.nlink !== 1 || realpathSync(spec) !== spec) throw new Error("invalid_spec_file");
      const startedAt = stamp();
      step = { id: receipt.attemptId, kind: "spec", status: "running", startedAt, endedAt: null, executor: "codex_cli",
        sessionId: null, resumedFrom: null, requestedModelId: p.binding.selection.modelId, observedModelId: null,
        exitCode: null, reason: null, commitSha: null, sandbox: "bwrap" };
      m = { contract: ATELIER_CONTRACT, id: p.runId, workspaceId: p.workspaceId, createdBy: p.actorId,
        title: "Owner specification", need: p.instructions.text, createdAt: startedAt, updatedAt: startedAt, status: "running",
        runtime: { runtimeId: "codex", consumptionMode: "subscription", authMode: "chatgpt_session", requestedModelId: p.binding.selection.modelId },
        repo: { path: repository, worktree: work, baseBranch: "HEAD", branch: "HEAD", baseSha: p.binding.repository.baseSha, headSha: p.binding.repository.baseSha },
        sessionId: null, lock: null, steps: [step], artifacts: [],
        boundSpec: { version: 2, missionId: p.missionId, runId: p.runId, installationId: p.installationId,
          attemptId: receipt.attemptId, decisionId: receipt.decisionId, payloadHash: e.payloadHash, bindingHash: p.binding.bindingHash,
          instructionHash: p.instructions.sha256, automaticCommitAllowed: false, maxNewSteps: 1, output: "SPEC.md" } };
      lockFile = join(dir, "run.lock"); m.lock = acquireLockFile(lockFile, step.id, { explicitResume: false }); token = m.lock.token;
      assertRepoHead(m); save(join(dir, "mission.json"), m);
      const invocation = boundSpecInvocation(m, home);
      result = noEvidence("reconciliation_required"); childClosed = false;
      const child = provider.spawn(invocation.binary, invocation.args, { cwd: work, detached: true, stdio: ["pipe", "pipe", "pipe"],
        env: { ...agentEnvironment(env), HOME: home, USERPROFILE: home, CODEX_HOME: join(home, ".codex") } });
      m.lock.childPid = child.pid ?? null; m.lock.childStart = child.pid ? procStartTime(child.pid) : null;
      const completion = await new Promise<{ code: number | null; signal: NodeJS.Signals | null; transcript: string; fault: string | null }>(done => {
        let output = Buffer.alloc(0), fault: string | null = null, settled = false;
        const finish = (code: number | null, signal: NodeJS.Signals | null) => {
          if (settled) return; settled = true; clearTimeout(timer); done({ code, signal, transcript: output.toString("utf8"), fault });
        };
        const stop = () => killRecordedGroup(m!.lock!.childPid, m!.lock!.childStart, "SIGKILL");
        const timer = setTimeout(() => { fault = "timeout"; stop(); finish(null, "SIGKILL"); }, p.binding.limits.timeoutMs);
        child.stdout?.on("data", (data: Buffer) => {
          if (settled) return;
          const chunk = Buffer.from(data);
          if (output.length + chunk.length > MAX_TRANSCRIPT) { fault = "transcript_limit"; stop(); finish(null, "SIGKILL"); }
          else output = Buffer.concat([output, chunk]);
        });
        // stderr may contain sensitive context; never copy it into a canonical artifact.
        child.stderr?.on("data", () => {});
        child.on("error", () => { fault = "spawn_error"; stop(); finish(null, null); });
        child.on("close", (code, signal) => { childClosed = true; finish(code, signal); });
        child.stdin?.on("error", () => { fault = "stdin_error"; stop(); finish(null, null); });
        // Supervision is armed before the first post-spawn I/O, which can fail (full disk, permissions, etc.).
        try {
          save(lockFile!, m!.lock); save(join(dir, "mission.json"), m);
          logEvent(m!.id, "bound_spec_started", root, step!.id, { payloadHash: e.payloadHash });
          child.stdin?.end(p.instructions.text); // Exact reviewed bytes. No post-approval additions.
        } catch { fault = "post_spawn_persistence_failed"; stop(); finish(null, null); }
      });
      step.exitCode = completion.code;
      const parsed = parseTranscript("codex", completion.transcript);
      const sessionId = typeof parsed.sessionId === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(parsed.sessionId) ? parsed.sessionId : null;
      step.sessionId = sessionId; m.sessionId = sessionId;
      if (completion.fault) { result = noEvidence("reconciliation_required", sessionId); throw new Error(completion.fault); }
      if (completion.signal) { result = noEvidence("interrupted", sessionId); throw new Error("interrupted"); }
      result = noEvidence("failed", sessionId);
      if (completion.code !== 0 || !parsed.completed || !sessionId) throw new Error("cli_completion_unproven");
      step.observedModelId = recordedModel(home, sessionId);
      if (step.observedModelId !== p.binding.selection.modelId) throw new Error("model_unproven_or_mismatched");
      assertRepoHead(m); assertNoEscapingSymlink(work);
      if (changedFiles(work, p.binding.repository.baseSha).some(file => file !== "SPEC.md")) throw new Error("spec_scope_exceeded");
      const after = lstatSync(spec);
      if (after.dev !== original.dev || after.ino !== original.ino) throw new Error("spec_replaced");
      const bytes = regularBytes(spec, MAX_SPEC);
      if (!bytes.length || (before && before.equals(bytes))) throw new Error("spec_missing_or_unchanged");
      const specText = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (secretFindings(specText.split("\n").map(line => `+ ${line}`).join("\n")).length) throw new Error("secret_detected");
      const digest = sha256(bytes);
      result = { status: "succeeded", sessionId, evidence: { specText, sha256: digest, bytes: bytes.length,
        manifest: { version: 2, workspaceId: p.workspaceId, actorId: p.actorId, missionId: p.missionId, runId: p.runId,
          installationId: p.installationId, attemptId: receipt.attemptId, decisionId: receipt.decisionId, stepId: receipt.attemptId,
          instructionHash: p.instructions.sha256, sessionId, payloadHash: e.payloadHash, bindingHash: p.binding.bindingHash,
          baseSha: p.binding.repository.baseSha, headSha: m.repo.headSha, artifact: { kind: "spec", path: "SPEC.md", sha256: digest, bytes: bytes.length } } } };
      if (!validateOwnerSpecResult(result, e)) throw new Error("result_validation_failed");
      mkdirSync(join(dir, "artifacts"), { mode: 0o700 }); writeFileSync(join(dir, "artifacts", "SPEC.md"), bytes, { flag: "wx", mode: 0o600 });
      m.artifacts.push({ id: randomUUID(), kind: "spec", stepId: step.id, path: "artifacts/SPEC.md", sha256: digest, bytes: bytes.length, createdAt: stamp() });
      reason = "completed";
    } catch (error) {
      reason = error instanceof Error ? error.message : "engine_error";
      if (result.status === "succeeded") result = noEvidence("reconciliation_required", m?.sessionId ?? null);
    } finally {
      if (m && step) {
        step.endedAt = stamp(); step.reason = reason;
        step.status = result.status === "reconciliation_required" ? "interrupted" : result.status;
        m.status = result.status === "succeeded" ? "awaiting_review" : result.status === "reconciliation_required" ? "interrupted" : result.status;
        m.updatedAt = stamp(); if (childClosed) m.lock = null; save(join(dir, "mission.json"), m);
      }
      // Durable result precedes unlock; failure to persist remains uncertain, never retried automatically.
      save(join(dir, "result.json"), result);
      if (lockFile && token && childClosed) {
        try { if (JSON.parse(readFileSync(lockFile, "utf8")).token === token) unlinkSync(lockFile); } catch { /* Preserve uncertainty. */ }
      }
    }
    return result;
  }
  return { execute, recover };
}
