// SENT-412-2 / SENT-412-3: stale-lock reclaim race and pid-reuse kill.
import { test } from "node:test";
import assert from "node:assert/strict";
import { closeSync, existsSync, linkSync, mkdtempSync, openSync, readFileSync, unlinkSync, writeFileSync, writeSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJiti } from "jiti";

const SRC = new URL("../..", import.meta.url).pathname;
const ALIAS = { "@": SRC, "server-only": join(SRC, "__server-only-noop.js") };
const jiti = createJiti(import.meta.url, { alias: ALIAS });
const A = await jiti.import("./atelier-mission.ts");

const DEAD = { runnerPid: 2 ** 22 - 7, runnerStart: "1", childPid: null, stepId: "dead-step", since: "x", token: "stale-token" };
const fresh = () => { const d = mkdtempSync(join(tmpdir(), "atelier-lock-")); const f = join(d, "run.lock"); writeFileSync(f, JSON.stringify(DEAD)); return f; };

// The pre-fix algorithm (existsSync → read → unlinkSync → openSync "wx"), verbatim in spirit, with the same hook point.
function legacyAcquire(lockFile, stepId, hook) {
  if (existsSync(lockFile)) {
    const held = JSON.parse(readFileSync(lockFile, "utf8"));
    if (A.pidAlive(held.runnerPid)) throw new Error("mission_locked_by_live_runner");
    hook?.();
    unlinkSync(lockFile);
  }
  const fd = openSync(lockFile, "wx"); writeSync(fd, JSON.stringify({ stepId })); closeSync(fd);
  return stepId;
}

test("BEFORE the fix: two concurrent stale reclaims both believe they hold the lock", () => {
  const f = fresh(); const holders = [];
  holders.push(legacyAcquire(f, "A", () => { holders.push(legacyAcquire(f, "B")); }));
  assert.deepEqual(holders.sort(), ["A", "B"], "the race is reproduced: 2 holders");
  assert.equal(JSON.parse(readFileSync(f, "utf8")).stepId, "A", "B's fresh lock was deleted by A");
});

test("AFTER the fix: same interleaving, exactly one holder; the loser gets reclaim_in_progress", () => {
  const f = fresh(); const holders = []; let loser = null;
  const a = A.acquireLockFile(f, "A", { explicitResume: true, afterStaleCheck: () => {
    try { holders.push(A.acquireLockFile(f, "B", { explicitResume: true }).stepId); } catch (e) { loser = e.message; }
  } });
  holders.push(a.stepId);
  assert.deepEqual(holders, ["A"]);
  assert.equal(loser, "stale_lock_reclaim_in_progress");
  assert.equal(JSON.parse(readFileSync(f, "utf8")).token, a.token);
  assert.equal(existsSync(`${f}.reclaim`), false);
});

test("AFTER the fix: changed lock under the mutex is refused", () => {
  const f = fresh(); let err = null;
  try { A.acquireLockFile(f, "B", { explicitResume: true, afterStaleCheck: () => writeFileSync(f, JSON.stringify({ ...DEAD, token: "someone-else" })) }); } catch (e) { err = e.message; }
  assert.equal(err, "mission_locked_by_live_runner");
  assert.equal(JSON.parse(readFileSync(f, "utf8")).token, "someone-else", "the other lock is intact");
});

test("multi-process: 8 processes reclaim the same stale lock at once → exactly one wins", async () => {
  const f = fresh(); const go = Date.now() + 1500;
  const script = `
    const { createJiti } = await import("jiti");
    const jiti = createJiti(${JSON.stringify(import.meta.url)}, { alias: ${JSON.stringify(ALIAS)} });
    const A = await jiti.import("./atelier-mission.ts");
    while (Date.now() < ${go}) {}
    try { A.acquireLockFile(${JSON.stringify(f)}, "p" + process.pid, { explicitResume: true }); console.log("WON"); /* stay alive: a dead winner's lock is legitimately stale */ while (Date.now() < ${go} + 3000) {} } catch (e) { console.log("LOST " + e.message); }`;
  const outs = await Promise.all(Array.from({ length: 8 }, () => new Promise((res) => {
    const c = spawn(process.execPath, ["--input-type=module", "-e", script], { cwd: new URL(".", import.meta.url).pathname });
    let o = ""; c.stdout.on("data", d => o += d); c.stderr.on("data", d => o += d); c.on("close", () => res(o.trim()));
  })));
  assert.equal(outs.filter(o => o === "WON").length, 1, outs.join("\n"));
  for (const o of outs.filter(o => o !== "WON")) assert.match(o, /^LOST (mission_locked_by_live_runner|stale_lock_reclaim_in_progress|stale_lock_requires_explicit_resume)$/);
});

test("pid identity: a recorded start time that does not match is never killed", async () => {
  const c = spawn("sleep", ["30"], { detached: true }); await new Promise(r => setTimeout(r, 100));
  const start = A.procStartTime(c.pid);
  assert.ok(start, "/proc start time readable");
  assert.equal(A.sameProcess(c.pid, start), true);
  assert.equal(A.killRecordedGroup(c.pid, String(Number(start) - 1), "SIGKILL"), "identity_mismatch");
  assert.equal(A.pidAlive(c.pid), true, "a reused pid (other start time) survives");
  assert.equal(A.killRecordedGroup(c.pid, null, "SIGKILL"), "identity_unknown");
  assert.equal(A.killRecordedGroup(c.pid, start, "SIGKILL"), "killed");
  await new Promise(r => c.on("exit", r));
  assert.equal(A.killRecordedGroup(c.pid, start, "SIGKILL"), "gone");
});

test("pid identity: a lock whose runner pid was reused (other start time) counts as stale, not live", () => {
  const f = fresh(); writeFileSync(f, JSON.stringify({ ...DEAD, runnerPid: process.pid, runnerStart: "0" }));
  assert.throws(() => A.acquireLockFile(f, "X", { explicitResume: false }), /stale_lock_requires_explicit_resume/);
  assert.equal(A.acquireLockFile(f, "X", { explicitResume: true }).stepId, "X");
});

test("boot reap: orphan CLI child of a dead runner is killed only if its start time matches; lock kept", async () => {
  const { mkdirSync } = await import("node:fs");
  const root = mkdtempSync(join(tmpdir(), "atelier-reap-"));
  const G = "00000000-0000-4000-8000-000000000001", R = "00000000-0000-4000-8000-000000000002";
  const spawnSleep = () => spawn("sleep", ["30"], { detached: true });
  const good = spawnSleep(), reused = spawnSleep(); await new Promise(r => setTimeout(r, 100));
  const put = (id, child, childStart) => { mkdirSync(join(root, id)); writeFileSync(join(root, id, "run.lock"), JSON.stringify({ ...DEAD, childPid: child.pid, childStart })); };
  put(G, good, A.procStartTime(good.pid));
  put(R, reused, String(Number(A.procStartTime(reused.pid)) - 1));
  mkdirSync(join(root, "not-a-mission"));
  const out = A.reapOrphanChildren(root);
  await new Promise(r => good.on("exit", r));
  assert.equal(A.pidAlive(reused.pid), true, "pid whose start time differs is untouched");
  assert.deepEqual(out.map(o => [o.missionId, o.result]).sort(), [[G, "killed"], [R, "identity_mismatch"]].sort());
  assert.ok(existsSync(join(root, G, "run.lock")), "stale lock kept: explicit resume still required");
  assert.match(readFileSync(join(root, G, "events.jsonl"), "utf8"), /orphan_child_reaped/);
  process.kill(-reused.pid, "SIGKILL");
});

test("SENT-412-7: pidAlive treats EPERM (another user's live pid) as alive", () => {
  assert.equal(A.pidAlive(1), true, "pid 1 (init, other user) is alive");
  assert.equal(A.pidAlive(2 ** 22 - 7), false, "a free pid is dead (ESRCH)");
});

test("SENT-412-6: unprovable identity (null start) is neither live nor killable; resume is not blocked", async () => {
  const other = spawn("sleep", ["30"], { detached: true }); await new Promise(r => setTimeout(r, 100));
  const f = fresh(); writeFileSync(f, JSON.stringify({ ...DEAD, runnerPid: other.pid, runnerStart: null, childPid: other.pid, childStart: null }));
  assert.equal(A.sameProcess(other.pid, null), false);
  assert.throws(() => A.acquireLockFile(f, "R", { explicitResume: false }), /stale_lock_requires_explicit_resume/);
  let kill; const lock = A.acquireLockFile(f, "R", { explicitResume: true, onStale: (held) => { kill = A.killRecordedGroup(held.childPid, held.childStart, "SIGKILL"); } });
  assert.equal(lock.stepId, "R");
  assert.equal(kill, "identity_unknown", "never a blind kill");
  assert.equal(A.pidAlive(other.pid), true);
  process.kill(-other.pid, "SIGKILL");
});

test("SENT-412-6: portable fallback via `ps -o etime=,comm=` gives a stable identity (no /proc path)", async () => {
  const c = spawn("sleep", ["30"], { detached: true }); await new Promise(r => setTimeout(r, 100));
  const viaPs = A.procStartTime(c.pid, { proc: false });
  assert.match(String(viaPs), /^ps:\S/);
  assert.equal(A.sameProcess(c.pid, viaPs), true);
  assert.equal(A.killRecordedGroup(c.pid, `ps:${c.pid}:0:sleep`, "SIGKILL"), "identity_mismatch");
  assert.equal(A.killRecordedGroup(c.pid, viaPs, "SIGKILL"), "killed");
  await new Promise(r => c.on("exit", r));
  assert.equal(A.procStartTime(c.pid, { proc: false }), null, "dead pid → null");
  assert.equal(A.procStartTime(process.pid, { proc: false, ps: false }), null, "neither source → null (unprovable)");
});

test("SENT-412-5: reclaim file of a dead owner is broken at once; empty/unreadable one only once older than the grace period", async () => {
  const { utimesSync, readdirSync } = await import("node:fs");
  const { dirname } = await import("node:path");
  // dead owner recorded
  let f = fresh(); writeFileSync(`${f}.reclaim`, JSON.stringify({ runnerPid: 2 ** 22 - 9, runnerStart: "1", stepId: "x", since: "y" }));
  assert.equal(A.acquireLockFile(f, "R1", { explicitResume: true }).stepId, "R1");
  assert.equal(existsSync(`${f}.reclaim`), false);
  // empty, fresh → still in progress (its writer may be mid-way)
  f = fresh(); writeFileSync(`${f}.reclaim`, "");
  assert.throws(() => A.acquireLockFile(f, "R2", { explicitResume: true }), /stale_lock_reclaim_in_progress/);
  // empty, older than the grace period → broken, reclaim succeeds
  const old = (Date.now() - A.ABANDONED_AFTER_MS - 1000) / 1000; utimesSync(`${f}.reclaim`, old, old);
  assert.equal(A.acquireLockFile(f, "R2", { explicitResume: true }).stepId, "R2");
  assert.deepEqual(readdirSync(dirname(f)).sort(), ["run.lock"], "no temp/abandoned/reclaim leftovers");
  // a live owner's reclaim file is never broken
  f = fresh(); writeFileSync(`${f}.reclaim`, JSON.stringify({ runnerPid: process.pid, runnerStart: A.procStartTime(process.pid), stepId: "x", since: "y" }));
  assert.throws(() => A.acquireLockFile(f, "R3", { explicitResume: true }), /stale_lock_reclaim_in_progress/);
  assert.ok(existsSync(`${f}.reclaim`));
});

test("SENT-412-5: lock and reclaim files are never observable empty (published via link)", () => {
  const f = join(mkdtempSync(join(tmpdir(), "atelier-lock-")), "run.lock");
  const l = A.acquireLockFile(f, "N", { explicitResume: false });
  assert.equal(JSON.parse(readFileSync(f, "utf8")).token, l.token);
});

test("SENT-412-10: ps identity is independent of the caller's time zone and locale", async () => {
  const c = spawn("sleep", ["30"]); await new Promise(r => setTimeout(r, 100));
  const saved = { TZ: process.env.TZ, LC_ALL: process.env.LC_ALL };
  try {
    process.env.TZ = "UTC"; process.env.LC_ALL = "C"; const recorded = A.procStartTime(c.pid, { proc: false });
    assert.match(String(recorded), new RegExp(`^ps:${c.pid}:\\d+:sleep$`));
    process.env.TZ = "Pacific/Kiritimati"; process.env.LC_ALL = "fr_CA.UTF-8";
    assert.equal(A.sameProcess(c.pid, recorded), true);
    process.env.TZ = "America/Toronto"; assert.equal(A.sameProcess(c.pid, recorded), true);
  } finally { for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v; c.kill(); }
  assert.equal(A.parseEtime("05"), null); assert.equal(A.parseEtime("01:05"), 65); assert.equal(A.parseEtime("02:01:05"), 7265); assert.equal(A.parseEtime("1-00:00:01"), 86401);
});

test("SENT-412-11: second resolution handled by pid+command token and an explicit tolerance", async () => {
  const a = spawn("sleep", ["30"]), b = spawn("sleep", ["30"]); await new Promise(r => setTimeout(r, 100));
  try {
    const ia = A.procStartTime(a.pid, { proc: false }), ib = A.procStartTime(b.pid, { proc: false });
    assert.notEqual(ia, ib, "same second, different pids → different identities");
    const t = A.PS_START_TOLERANCE_S; const [, pid, sec, comm] = /^ps:(\d+):(\d+):(.+)$/.exec(ia);
    assert.equal(A.samePsIdentity(ia, `ps:${pid}:${Number(sec) + t}:${comm}`), true, "within tolerance");
    assert.equal(A.samePsIdentity(ia, `ps:${pid}:${Number(sec) + t + 1}:${comm}`), false, "beyond tolerance");
    assert.equal(A.samePsIdentity(ia, `ps:${pid}:${sec}:node`), false, "different command = recycled pid");
    assert.equal(A.sameProcess(a.pid, ib), false, "identity of b never matches a");
    // Later start (simulated clock 1 h ahead when re-read) → mismatch
    assert.equal(A.samePsIdentity(ia, A.procStartTime(a.pid, { proc: false, nowMs: Date.now() + 3_600_000 })), false);
  } finally { a.kill(); b.kill(); }
});

test("SENT-412-12: interleaving — a breaker with a stale view never moves or deletes a fresh reclaim file", async () => {
  const { readdirSync } = await import("node:fs"); const { dirname, basename } = await import("node:path");
  const f = `${fresh()}.reclaim`; const dead = JSON.stringify({ runnerPid: 2 ** 22 - 11, runnerStart: "1", stepId: "dead", since: "d" });
  const live = JSON.stringify({ runnerPid: process.pid, runnerStart: A.procStartTime(process.pid), stepId: "A-fresh", since: "a" });
  writeFileSync(f, dead);
  // B judges F1 abandoned; before B acts, A breaks F1 and publishes its fresh F2; then C tries too.
  let cResult;
  const bResult = A.breakAbandoned(f, { afterJudge: () => {
    assert.equal(A.breakAbandoned(f), true, "A breaks F1");
    writeFileSync(`${f}.tmpA`, live); linkSync(`${f}.tmpA`, f); unlinkSync(`${f}.tmpA`);
    cResult = A.breakAbandoned(f); // C sees a live owner
  } });
  assert.equal(bResult, false, "B must not break A's fresh file");
  assert.equal(cResult, false, "C must not break A's fresh file");
  assert.equal(readFileSync(f, "utf8"), live, "A's file intact, never renamed");
  assert.deepEqual(readdirSync(dirname(f)).filter(n => n.startsWith(basename(f) + ".breaking-")), [], "no breaker dirs left");
});

test("SENT-412-12: concurrent breakers of the same instance — exactly one unlinks; a crashed breaker is taken over after the grace period", async () => {
  const { mkdirSync, statSync, utimesSync } = await import("node:fs");
  const f = `${fresh()}.reclaim`; writeFileSync(f, JSON.stringify({ runnerPid: 2 ** 22 - 13, runnerStart: "1", stepId: "dead", since: "d" }));
  const st = statSync(f, { bigint: true }); const crashed = `${f}.breaking-${st.ino}-${st.ctimeNs}-0`;
  mkdirSync(crashed); // a breaker holds this instance
  assert.equal(A.breakAbandoned(f), false, "held by another breaker: wait");
  assert.equal(existsSync(f), true);
  const old = (Date.now() - A.ABANDONED_AFTER_MS - 1000) / 1000; utimesSync(crashed, old, old);
  assert.equal(A.breakAbandoned(f), true, "crashed breaker taken over by next generation");
  assert.equal(existsSync(f), false); assert.equal(existsSync(crashed), false);
});

test("SENT-412-13: workspace repo dirs are lowercased and case-variant ids colliding on one dir are refused", async () => {
  const { mkdirSync } = await import("node:fs"); const { execFileSync } = await import("node:child_process");
  const root = mkdtempSync(join(tmpdir(), "ws-")); const env = { ...process.env, ORIA_ATELIER_REPOS_ROOT: root };
  assert.equal(A.workspaceReposRoot("MichaelHQ", env), join(root, "michaelhq"));
  const repo = join(root, "michaelhq", "r"); mkdirSync(repo, { recursive: true }); execFileSync("git", ["-C", repo, "init", "-q"]);
  assert.ok(A.resolveRepoPath(repo, "MichaelHQ", env).endsWith("/michaelhq/r"));
  assert.equal(readFileSync(join(root, "michaelhq", A.WORKSPACE_CLAIM_FILE), "utf8"), "MichaelHQ");
  assert.throws(() => A.resolveRepoPath(repo, "michaelhq", env), /workspace_path_collision/);
  assert.throws(() => A.resolveRepoPath(repo, "MICHAELHQ", env), /workspace_path_collision/);
  assert.ok(A.resolveRepoPath(repo, "MichaelHQ", env), "the claiming workspace keeps access");
});
