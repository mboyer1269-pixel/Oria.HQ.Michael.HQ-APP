import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
let proof = {};
try { proof = await import('./prove-owner-spec-host.mjs'); } catch {}

test('qualification reuses the exact bound-spec sandbox before a deterministic helper', async () => {
  assert.equal(typeof proof.helperInvocation, 'function');
  const invocation = await proof.helperInvocation('/tmp/oria-host-test/work', '/tmp/oria-host-test/home', 'check', '1234');
  assert.equal(invocation.binary, 'bwrap');
  assert.ok(invocation.args.includes('--unshare-net'));
  const separator = invocation.args.indexOf('--');
  assert.ok(separator > 0);
  assert.equal(invocation.args[separator + 1], process.execPath);
  assert.equal(invocation.args[separator + 2], '/tmp/oria-host-test/work/host-helper.mjs');
  assert.ok(!invocation.args.includes('codex'));
  assert.ok(!invocation.args.some(arg => /auth\.json|\.ssh/.test(arg)));
  const mounts = invocation.args.slice(0, separator);
  assert.ok(mounts.some((arg, index) => arg === '--ro-bind' && mounts[index + 1] === '/tmp/oria-host-test/work'));
  assert.ok(mounts.some((arg, index) => arg === '--bind' && mounts[index + 1] === '/tmp/oria-host-test/work/SPEC.md'));
});

test('missing namespace setup is never classified as confinement success', () => {
  assert.equal(typeof proof.validateHelperResult, 'function');
  assert.throws(() => proof.validateHelperResult({ code: 1, stdout: '', stderr: 'NETLINK_ROUTE Operation not permitted' }), /sandbox_helper_failed/);
  assert.throws(() => proof.validateHelperResult({ code: 0, stdout: '{}', stderr: '' }), /sandbox_assertions_missing/);
});

test('every required boundary must be explicitly observed, not inferred from exit zero', () => {
  assert.equal(typeof proof.validateHelperResult, 'function');
  const result = { specWritten: true, otherWriteDenied: true, renameDenied: true, outsideReadDenied: true, hostNetworkDenied: true };
  assert.deepEqual(proof.validateHelperResult({ code: 0, stdout: JSON.stringify(result), stderr: '' }), result);
  for (const key of Object.keys(result)) {
    assert.throws(() => proof.validateHelperResult({ code: 0, stdout: JSON.stringify({ ...result, [key]: false }), stderr: '' }), /sandbox_assertions_missing/);
  }
});

test('negative control: the real helper detects an unconfined synthetic directory and host network', async () => {
  const scratch = mkdtempSync(path.join(tmpdir(), 'oria-helper-control-'));
  const outside = path.join(scratch, 'synthetic-private');
  writeFileSync(outside, 'synthetic-only');
  let connections = 0;
  const server = createServer(socket => { connections++; socket.destroy(); });
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const result = await new Promise(resolve => {
      const child = spawn(process.execPath, [fileURLToPath(new URL('./owner-spec-host-helper.mjs', import.meta.url)), 'check', String(server.address().port), outside],
        { cwd: scratch, stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: process.env.PATH } });
      let stdout = ''; child.stdout.on('data', bytes => { stdout += bytes; });
      child.once('close', code => resolve({ code, stdout }));
    });
    assert.equal(result.code, 1);
    const observed = JSON.parse(result.stdout);
    assert.equal(observed.specWritten, true);
    for (const key of ['otherWriteDenied', 'renameDenied', 'outsideReadDenied', 'hostNetworkDenied']) assert.equal(observed[key], false, key);
    assert.equal(connections, 1);
    assert.throws(() => proof.validateHelperResult(result), /sandbox_helper_failed/);
  } finally { server.close(); rmSync(scratch, { recursive: true, force: true }); }
});

test('a refused group kill has a final deadline and never claims successful termination', async () => {
  assert.equal(typeof proof.runInvocation, 'function');
  let child;
  const started = Date.now();
  try {
    const result = await proof.runInvocation({ binary: process.execPath, args: ['-e', 'setInterval(()=>{},1000)'] }, tmpdir(), tmpdir(), 40, undefined, {
      spawnProcess: (...args) => { child = spawn(...args); return child; },
      readStart: () => 'synthetic-identity', killGroup: () => 'identity_mismatch', closeGraceMs: 80,
    });
    assert.ok(Date.now() - started < 2000);
    assert.equal(result.terminationUnconfirmed, true);
    assert.equal(result.killResult, 'identity_mismatch');
    assert.equal(result.code, null);
  } finally { child?.kill('SIGKILL'); }
});

test('negative control: the actual descendant writes after its own readiness if not stopped early', async () => {
  const scratch = mkdtempSync(path.join(tmpdir(), 'oria-descendant-control-'));
  const spec = path.join(scratch, 'SPEC.md'); writeFileSync(spec, 'before');
  try {
    const result = await proof.runInvocation({ binary: process.execPath,
      args: [fileURLToPath(new URL('./owner-spec-host-helper.mjs', import.meta.url)), 'hang'] }, scratch, scratch, 3000,
      stop => setTimeout(stop, 2200));
    assert.equal(result.ready, true);
    assert.equal(result.killResult, 'killed');
    assert.equal(result.signal, 'SIGKILL');
    assert.equal(result.terminationUnconfirmed, false);
    assert.equal(readFileSync(spec, 'utf8'), 'beforeLATE_CHILD_WRITE');
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});

test('existing CI executes real sandbox assertions with bounded fail-closed marker verification', () => {
  const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  const start = workflow.indexOf('- name: Qualify owner-spec host boundaries (no model)');
  assert.ok(start > workflow.indexOf('- name: Install bubblewrap'), 'host proof must follow existing bwrap setup');
  const block = workflow.slice(start, workflow.indexOf('- name: Typecheck', start));
  assert.match(block, /timeout-minutes: 2/);
  assert.match(block, /set -o pipefail/);
  assert.match(block, /node --test proofs\/owner-spec-host-proof\.test\.mjs/);
  assert.match(block, /node proofs\/prove-owner-spec-host\.mjs --run/);
  assert.match(block, /grep -Fx 'OWNER_SPEC_HOST_BOUNDARIES_PASSED'/);
  assert.doesNotMatch(block, /continue-on-error|\|\| true|sudo|sysctl|apt-get/);
});
