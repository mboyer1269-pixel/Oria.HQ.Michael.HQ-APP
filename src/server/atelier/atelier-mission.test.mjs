import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(root, 'src'), 'server-only': path.join(root, 'src/__server-only-noop.js') } });
const A = await jiti.import('./atelier-mission.ts');
const H = await jiti.import('../../app/api/atelier/missions/handlers.ts');

function repo() {
  const dir = mkdtempSync(path.join(tmpdir(), 'atelier-repo-'));
  execFileSync('git', ['init', '-q', '-b', 'main', dir]);
  writeFileSync(path.join(dir, 'README.md'), 'x\n');
  execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qam', 'seed', '--allow-empty']);
  execFileSync('git', ['-C', dir, 'add', '-A']); execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'seed2']);
  return dir;
}

test('create mission puts work on its own branch with the requested model recorded', () => {
  const store = mkdtempSync(path.join(tmpdir(), 'atelier-store-'));
  const m = A.createMission({ title: 't', need: 'n', repoPath: repo(), modelId: 'model-x' }, store);
  assert.equal(m.contract, 'atelier-mission/v1');
  assert.match(m.repo.branch, /^atelier\//);
  assert.equal(m.runtime.requestedModelId, 'model-x');
  assert.equal(m.runtime.consumptionMode, 'subscription');
});

test('runner-executed test step stores a hashed log artifact readable through the API handler', async () => {
  const store = mkdtempSync(path.join(tmpdir(), 'atelier-store-'));
  const m = A.createMission({ title: 't', need: 'n', repoPath: repo(), modelId: 'model-x' }, store);
  const after = A.runCommandStep(m.id, 'test', ['node', '-e', 'console.log("ok-42")'], { root: store });
  assert.equal(after.steps[0].status, 'succeeded');
  const art = after.artifacts.find(a => a.kind === 'test_log');
  assert.ok(art && art.sha256.length === 64);
  const res = H.getAtelierArtifact(m.id, art.id, store);
  assert.equal(res.headers.get('x-artifact-sha256'), art.sha256);
  assert.match(await res.text(), /ok-42/);
  const view = await H.getAtelierMission(m.id, store).json();
  assert.equal(view.modelProof.requested, 'model-x');
  assert.equal(view.modelProof.matches, false);
  const list = await H.listAtelierMissions(store).json();
  assert.equal(list.missions.length, 1);
});

test('failed command marks the mission failed', () => {
  const store = mkdtempSync(path.join(tmpdir(), 'atelier-store-'));
  const m = A.createMission({ title: 't', need: 'n', repoPath: repo(), modelId: 'm' }, store);
  assert.equal(A.runCommandStep(m.id, 'test', ['node', '-e', 'process.exit(3)'], { root: store }).status, 'failed');
});

test('stale lock from a dead runner blocks any non-resume step', () => {
  const store = mkdtempSync(path.join(tmpdir(), 'atelier-store-'));
  const m = A.createMission({ title: 't', need: 'n', repoPath: repo(), modelId: 'm' }, store);
  writeFileSync(path.join(store, m.id, 'run.lock'), JSON.stringify({ runnerPid: 2 ** 22 + 7, childPid: null, stepId: 'dead', since: 'x' }));
  assert.throws(() => A.runCommandStep(m.id, 'test', ['true'], { root: store }), /stale_lock_requires_explicit_resume/);
});

test('API key in environment refuses execution', () => {
  assert.throws(() => A.assertSubscriptionOnly({ PATH: process.env.PATH, OPENAI_API_KEY: 'fixture' }), /api_key_present:OPENAI_API_KEY/);
});

test('unknown mission and bad ids return 404', async () => {
  const store = mkdtempSync(path.join(tmpdir(), 'atelier-store-'));
  assert.equal(H.getAtelierMission('../etc', store).status, 404);
  assert.equal(H.getAtelierMission('aaaaaaaa-0000', store).status, 404);
});
