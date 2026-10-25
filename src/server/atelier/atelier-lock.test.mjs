// SENT-412-2 / SENT-412-3: stale-lock reclaim race and pid-reuse kill.
import { test } from "node:test";
import assert from "node:assert/strict";
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, unlinkSync, writeFileSync, writeSync } from "node:fs";
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
    try { A.acquireLockFile(${JSON.stringify(f)}, "p" + process.pid, { explicitResume: true }); console.log("WON"); } catch (e) { console.log("LOST " + e.message); }`;
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
