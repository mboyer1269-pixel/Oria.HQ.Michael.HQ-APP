import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';
import { z } from 'zod';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(root, 'src'), 'server-only': path.join(root, 'src/__server-only-noop.js') } });
const L = await jiti.import('./claude-json-launcher.ts');
const FAKE = path.join(here, 'test-fixtures/fake-claude-json');
const schema = z.object({ answer: z.number() });

function home(files = {}) {
  const h = mkdtempSync(path.join(tmpdir(), 'claude-json-home-'));
  for (const [k, v] of Object.entries(files)) writeFileSync(path.join(h, k), v);
  return h;
}
const envFor = (h, extra = {}) => ({ PATH: process.env.PATH, HOME: h, ORIA_HQ_SUBSCRIPTION_RUNTIMES: '1', ...extra });
const calls = h => existsSync(path.join(h, 'calls')) ? Number(readFileSync(path.join(h, 'calls'), 'utf8')) : 0;

test('valid strict JSON on first try, through the subscription guards', async () => {
  const h = home();
  const r = await L.claudeJson('q', schema, { binary: FAKE, env: envFor(h) });
  assert.deepEqual(r, { ok: true, data: { answer: 42 }, model: 'claude-sonnet-test', attempts: 1 });
  const args = readFileSync(path.join(h, 'args.1'), 'utf8');
  assert.match(args, /--setting-sources {2}--settings/);
  assert.match(args, /--output-format stream-json/);
});

test('one retry on malformed output, error fed back', async () => {
  const h = home({ 'reply.1': JSON.stringify('not json at all') });
  const r = await L.claudeJson('q', schema, { binary: FAKE, env: envFor(h) });
  assert.equal(r.ok, true); assert.equal(r.attempts, 2);
  assert.match(readFileSync(path.join(h, 'input.2'), 'utf8'), /refusée par le validateur/);
});

test('fenced JSON accepted; schema mismatch twice → invalid_output after exactly 2 calls', async () => {
  const ok = await L.claudeJson('q', schema, { binary: FAKE, env: envFor(home({ reply: JSON.stringify('```json\n{"answer":1}\n```') })) });
  assert.equal(ok.ok, true);
  const h = home({ reply: JSON.stringify('{"answer":"x"}') });
  const r = await L.claudeJson('q', schema, { binary: FAKE, env: envFor(h) });
  assert.equal(r.ok, false); assert.equal(r.reason, 'invalid_output'); assert.equal(calls(h), 2);
});

test('missing binary → { ok:false, reason:"unavailable" }, no throw', async () => {
  const r = await L.claudeJson('q', schema, { binary: path.join(tmpdir(), 'no-such-claude-bin'), env: envFor(home()) });
  assert.equal(r.ok, false); assert.equal(r.reason, 'unavailable');
});

test('runtime flag off → disabled, nothing spawned', async () => {
  const h = home();
  const r = await L.claudeJson('q', schema, { binary: FAKE, env: { PATH: process.env.PATH, HOME: h } });
  assert.equal(r.reason, 'disabled'); assert.equal(calls(h), 0);
});

test('API key in env → refused before spawn', async () => {
  for (const k of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_BASE_URL']) {
    const h = home();
    const r = await L.claudeJson('q', schema, { binary: FAKE, env: envFor(h, { [k]: 'x' }) });
    assert.equal(r.reason, 'api_key_present'); assert.equal(calls(h), 0);
  }
});

test('non subscription auth status → subscription_auth_required', async () => {
  const h = home({ 'fake.env': `FAKE_AUTH='{"loggedIn":true,"authMethod":"api_key"}'\n` });
  const r = await L.claudeJson('q', schema, { binary: FAKE, env: envFor(h) });
  assert.equal(r.reason, 'subscription_auth_required'); assert.equal(calls(h), 0);
});

test('init apiKeySource != none → run killed as paid_session, no retry', async () => {
  const h = home({ 'fake.env': 'FAKE_API_KEY_SOURCE=ANTHROPIC_API_KEY\n' });
  const t0 = Date.now();
  const r = await L.claudeJson('q', schema, { binary: FAKE, env: envFor(h) });
  assert.equal(r.reason, 'paid_session'); assert.equal(calls(h), 1); assert.ok(Date.now() - t0 < 4000);
});

test('parseClaudeJsonTranscript refuses a transcript without subscription init', () => {
  const t = '{"type":"result","is_error":false,"result":"{\\"answer\\":1}"}';
  assert.equal(L.parseClaudeJsonTranscript(t, schema).ok, false);
});

test('418-4: unsafe model ids refused before any spawn', async () => {
  for (const model of ['--dangerously-skip-permissions', '-x', 'Sonnet', 'a b', 'a;b', '', 'x'.repeat(65)]) {
    const h = home();
    const r = await L.claudeJson('q', schema, { binary: FAKE, env: envFor(h), model });
    assert.equal(r.ok, false); assert.equal(r.error, 'model_refused'); assert.equal(calls(h), 0);
  }
  assert.equal(L.isSafeModelId('claude-sonnet-4.5'), true);
});

test('validation errors never echo model output', async () => {
  const h = home({ reply: JSON.stringify('voici sk-ant-api03-FAUX') });
  const r = await L.claudeJson('q', schema, { binary: FAKE, env: envFor(h) });
  assert.equal(r.reason, 'invalid_output'); assert.doesNotMatch(String(r.error), /sk-ant|voici/);
  assert.doesNotMatch(readFileSync(path.join(h, 'input.2'), 'utf8'), /sk-ant/);
});
