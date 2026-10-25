// Lot A′ — #409: French accents through a REAL child process (fake CLI fixture,
// real pipes), and a single CLI execution at a time (SENT-409-1).
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(root, 'src'), 'server-only': path.join(root, 'src/__server-only-noop.js') } });
const { runSubscriptionTurn, subscriptionEnvironment } = await jiti.import('../ai/subscription-runtime.ts');
const { subscriptionOptions } = await jiti.import('../ai/subscription-catalog.ts');
const fixture = path.join(here, 'fixtures/fake-codex-cli.mjs');
const catalog = { revision: 'test', entries: [{ runtimeId: 'codex', modelId: 'fixture-codex' }] };
const baseEnv = { PATH: process.env.PATH, HOME: process.env.HOME, ORIA_HQ_SUBSCRIPTION_RUNTIMES: '1', LANG: 'C', LC_ALL: 'POSIX' };
const selection = subscriptionOptions(catalog, baseEnv).find(o => o.runtimeId === 'codex');
function realSpawner(delayMs = 0) {
  const spawned = [];
  return { spawned, spawn(binary, args, options) {
    spawned.push({ binary, args, env: options.env });
    return spawn(process.execPath, [fixture, ...(delayMs ? [`--fake-delay=${delayMs}`] : []), ...args], options);
  } };
}

test('UTF-8: accents survive stdin and a stdout chunk split inside a character', async () => {
  const s = realSpawner();
  const prompt = 'Hélène veut déjeuner à Montréal, ça marche ? Œuvre, naïve, être';
  const r = await runSubscriptionTurn(selection, prompt, catalog, { spawn: s.spawn, env: baseEnv, log: () => {} });
  assert.equal(r.status, 'completed', r.reason);
  assert.equal(r.summary, `Reçu : ${prompt} — éàçô`);
  assert.ok(!r.summary.includes('\uFFFD'));
  for (const c of s.spawned) { assert.equal(c.env.LANG, 'C.UTF-8'); assert.equal(c.env.LC_ALL, 'C.UTF-8'); }
});

test('UTF-8 locale is forced even when the parent locale is not UTF-8', () => {
  const env = subscriptionEnvironment({ PATH: '/x', LANG: 'C', LC_ALL: 'POSIX' });
  assert.equal(env.LANG, 'C.UTF-8');
  assert.equal(env.LC_ALL, 'C.UTF-8');
});

test('one CLI execution at a time: 5 parallel turns → 1 runs, 4 refused runtime_busy', async () => {
  const s = realSpawner(300);
  const turns = await Promise.all(Array.from({ length: 5 }, (_, i) =>
    runSubscriptionTurn(selection, `tour ${i}`, catalog, { spawn: s.spawn, env: baseEnv, log: () => {} })));
  assert.equal(turns.filter(t => t.status === 'completed').length, 1);
  const busy = turns.filter(t => t.reason === 'runtime_busy');
  assert.equal(busy.length, 4);
  for (const b of busy) assert.equal(b.runConfig, null);
  assert.equal(s.spawned.filter(c => c.args[0] === 'exec').length, 1, 'only one CLI process for the turn');
  const after = await runSubscriptionTurn(selection, 'après', catalog, { spawn: s.spawn, env: baseEnv, log: () => {} });
  assert.equal(after.status, 'completed', 'the slot is released after the turn');
});
