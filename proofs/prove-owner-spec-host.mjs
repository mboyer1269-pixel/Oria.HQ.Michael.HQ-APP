// Local/disposable host qualification only. No provider, authentication, security
// settings or fallback execution. Missing namespaces are a failed prerequisite.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(root, 'src'), 'server-only': path.join(root, 'src/scripts/smoke/server-only-stub.mjs') } });

export async function helperInvocation(work, home, mode, port, outside = '/tmp/oria-synthetic-outside') {
  const { boundSpecInvocation } = await jiti.import('@/server/atelier/atelier-bound-spec');
  const original = boundSpecInvocation({ repo: { worktree: work }, runtime: { requestedModelId: 'qualification-only' } }, home);
  const separator = original.args.indexOf('--');
  assert.ok(separator > 0, 'sandbox_separator_missing');
  // Retain every production sandbox argument. Replace only the model command
  // with a deterministic helper; the helper does not replace bwrap.
  return { binary: original.binary, args: [...original.args.slice(0, separator + 1), process.execPath,
    path.join(work, 'host-helper.mjs'), mode, String(port), outside] };
}

export function validateHelperResult(result) {
  assert.equal(result.code, 0, 'sandbox_helper_failed');
  let observed; try { observed = JSON.parse(result.stdout.trim()); } catch { throw Error('sandbox_assertions_missing'); }
  for (const key of ['specWritten', 'otherWriteDenied', 'renameDenied', 'outsideReadDenied', 'hostNetworkDenied']) {
    assert.equal(observed[key], true, `sandbox_assertions_missing:${key}`);
  }
  return observed;
}

export async function runInvocation(invocation, work, home, timeoutMs, onReady, deps = {}) {
  const { procStartTime, killRecordedGroup } = await jiti.import('@/server/atelier/atelier-mission');
  return new Promise(resolve => {
    const child = (deps.spawnProcess ?? spawn)(invocation.binary, invocation.args, { cwd: work, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { PATH: process.env.PATH, HOME: home, USERPROFILE: home, CODEX_HOME: path.join(home, '.codex'), NODE_ENV: 'test' } });
    let stdout = '', stderr = '', timedOut = false, identity = null, ready = false, settled = false, killResult = null;
    let finalTimer;
    const finish = (code, signal, terminationUnconfirmed = false) => {
      if (settled) return; settled = true; clearTimeout(timer); clearTimeout(finalTimer);
      if (terminationUnconfirmed) { child.stdout.destroy(); child.stderr.destroy(); child.unref(); }
      resolve({ code, signal, stdout, stderr, timedOut, ready, identityVerified: Boolean(identity), killResult, terminationUnconfirmed });
    };
    child.once('spawn', () => { identity = (deps.readStart ?? procStartTime)(child.pid); });
    const stop = () => {
      if (timedOut || settled) return;
      timedOut = true;
      killResult = identity ? (deps.killGroup ?? killRecordedGroup)(child.pid, identity, 'SIGKILL') : 'identity_unknown';
      // A failed or unverifiable kill is never retried through a weaker route.
      // A separate deadline also covers descendants retaining the stdio pipes.
      finalTimer = setTimeout(() => finish(null, null, true), deps.closeGraceMs ?? 2000);
    };
    const timer = setTimeout(stop, timeoutMs);
    child.stdout.on('data', bytes => {
      stdout += bytes.toString();
      if (stdout.length > 32000) stop();
      if (!ready && stdout.includes('HANG_CHILD_STARTED')) { ready = true; if (onReady) onReady(stop); }
    });
    child.stderr.on('data', bytes => { stderr = (stderr + bytes.toString()).slice(0, 32000); });
    child.once('error', error => { stderr += error.code ?? 'spawn_failed'; });
    child.once('close', (code, signal) => finish(code, signal));
  });
}

export async function qualifyHost() {
  const scratch = mkdtempSync(path.join(tmpdir(), 'oria-host-proof-'));
  const work = path.join(scratch, 'work'), home = path.join(scratch, 'home'), outside = path.join(scratch, 'synthetic-private');
  mkdirSync(work); mkdirSync(home); writeFileSync(outside, 'synthetic-only'); writeFileSync(path.join(work, 'SPEC.md'), '');
  copyFileSync(new URL('./owner-spec-host-helper.mjs', import.meta.url), path.join(work, 'host-helper.mjs'));
  let connections = 0, cleanupAllowed = true;
  const server = createServer(socket => { connections++; socket.destroy(); });
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const port = server.address().port;
    const first = await runInvocation(await helperInvocation(work, home, 'check', port, outside), work, home, 6000);
    if (first.terminationUnconfirmed) { cleanupAllowed = false; throw Error(`sandbox_termination_unconfirmed:evidence retained at ${scratch}`); }
    if (first.code !== 0) throw Error(`sandbox_helper_failed:${JSON.stringify(first)}`);
    const boundaries = validateHelperResult(first);
    assert.equal(connections, 0, 'host_network_was_reached');
    assert.equal(readFileSync(outside, 'utf8'), 'synthetic-only');
    const before = readFileSync(path.join(work, 'SPEC.md'), 'utf8');
    const stopped = await runInvocation(await helperInvocation(work, home, 'hang', port, outside), work, home, 6000,
      stop => setTimeout(stop, 100));
    if (stopped.terminationUnconfirmed) { cleanupAllowed = false; throw Error(`sandbox_termination_unconfirmed:evidence retained at ${scratch}`); }
    assert.ok(stopped.ready && stopped.timedOut && stopped.identityVerified && stopped.killResult === 'killed'
      && stopped.signal === 'SIGKILL', 'bounded_group_stop_not_observed');
    await new Promise(resolve => setTimeout(resolve, 2100));
    assert.equal(readFileSync(path.join(work, 'SPEC.md'), 'utf8'), before, 'child_survived_group_stop');
    return { boundaries, boundedGroupStop: true, providerExecuted: false, credentialsUsed: false, hostConnections: connections };
  } finally { server.close(); if (cleanupAllowed) rmSync(scratch, { recursive: true, force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3 || process.argv[2] !== '--run') throw Error('explicit --run required');
  try { console.log(JSON.stringify(await qualifyHost())); console.log('OWNER_SPEC_HOST_BOUNDARIES_PASSED'); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
