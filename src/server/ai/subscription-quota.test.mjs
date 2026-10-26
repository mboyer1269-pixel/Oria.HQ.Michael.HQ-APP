import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(root, 'src'), 'server-only': path.join(root, 'src/__server-only-noop.js') } });
const Q = await jiti.import('./subscription-quota.ts');
const R = await jiti.import('../../app/api/hq/subscription-quota/handler.ts');

const now = Date.now();
const iso = msAgo => new Date(now - msAgo).toISOString();
const H = 3_600_000;
function fixtures() {
  const base = mkdtempSync(path.join(tmpdir(), 'quota-fx-'));
  const claudeDir = path.join(base, 'claude/projects'); const codexDir = path.join(base, 'codex/sessions');
  mkdirSync(path.join(claudeDir, 'proj-a/sub'), { recursive: true }); mkdirSync(path.join(codexDir, '2026/10/25'), { recursive: true });
  const a = (ts, u, model = 'claude-sonnet') => JSON.stringify({ type: 'assistant', timestamp: ts, message: { model, usage: u } });
  writeFileSync(path.join(claudeDir, 'proj-a/s1.jsonl'), [
    a(iso(1 * H), { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 10, cache_read_input_tokens: 9999 }),
    a(iso(30 * H), { input_tokens: 1000, output_tokens: 0 }),
    '{not json "usage"', JSON.stringify({ type: 'user', timestamp: iso(1), message: { usage: { input_tokens: 5 } } }), '',
  ].join('\n'));
  writeFileSync(path.join(claudeDir, 'proj-a/sub/s2.jsonl'), a(iso(2 * H), { input_tokens: 1, output_tokens: 1 }));
  writeFileSync(path.join(claudeDir, 'proj-a/notes.txt'), a(iso(1), { input_tokens: 777 }));
  const tc = (ts, input, output, rl) => JSON.stringify({ timestamp: ts, type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: input, cached_input_tokens: 0, output_tokens: output } }, rate_limits: rl } });
  writeFileSync(path.join(codexDir, '2026/10/25/rollout-1.jsonl'), [
    JSON.stringify({ timestamp: iso(3 * H), type: 'session_meta', payload: { cwd: '/x' } }),
    tc(iso(3 * H), 100, 10, { primary: { used_percent: 10, window_minutes: 300, resets_at: 2000000000 }, secondary: { used_percent: 5, window_minutes: 10080 } }),
    tc(iso(1 * H), 300, 30, { primary: { used_percent: 42.5, window_minutes: 300, resets_at: 2000000000 }, secondary: { used_percent: 61, window_minutes: 10080 } }),
    'garbage token_count',
  ].join('\n'));
  return { claudeDir, codexDir, base };
}

test('Claude: burn per window from **/*.jsonl, cache reads excluded, corrupt lines skipped, no official gauge', () => {
  const fx = fixtures();
  const c = Q.readClaudeQuota({ ...fx, now });
  assert.equal(c.available, true); assert.equal(c.filesRead, 2);
  assert.deepEqual(c.tokens, { last5h: 162, last7d: 1162 });
  assert.equal(c.remainingPercent, null); assert.equal(c.primary, null); assert.equal(c.skipped, 1);
});

test('Codex: cumulative deltas and latest rate_limits → remaining = min of windows', () => {
  const x = Q.readCodexQuota({ ...fixtures(), now });
  assert.deepEqual(x.tokens, { last5h: 330, last7d: 330 });
  assert.equal(x.primary.usedPercent, 42.5); assert.equal(x.primary.remainingPercent, 57.5);
  assert.equal(x.secondary.remainingPercent, 39); assert.equal(x.remainingPercent, 39);
  assert.equal(x.primary.resetsAt, new Date(2000000000 * 1000).toISOString());
  assert.equal(x.skipped, 1);
});

test('missing dirs → unavailable, no throw; paths via env', () => {
  const env = { ORIA_CLAUDE_PROJECTS_DIR: path.join(tmpdir(), 'nope-c-' + now), ORIA_CODEX_SESSIONS_DIR: path.join(tmpdir(), 'nope-x-' + now) };
  const r = Q.readSubscriptionQuota({ env, now });
  assert.equal(r.providers.length, 2);
  for (const p of r.providers) { assert.equal(p.available, false); assert.equal(p.remainingPercent, null); }
  assert.equal(Q.claudeProjectsDir(env), env.ORIA_CLAUDE_PROJECTS_DIR);
});

test('never opens files outside the log roots (credential files beside them are ignored)', () => {
  const fx = fixtures();
  writeFileSync(path.join(fx.base, 'codex/auth.json'), '{"secret":"x"}');
  writeFileSync(path.join(fx.base, 'claude/.credentials.json'), '{"secret":"x"}');
  writeFileSync(path.join(fx.codexDir, 'auth.json'), 'token_count');
  const r = Q.readSubscriptionQuota({ ...fx, now });
  assert.ok(!JSON.stringify(r).includes('secret'));
  assert.equal(r.providers[1].filesRead, 1);
});

test('oversized and stale files are skipped', () => {
  const fx = fixtures();
  assert.equal(Q.readClaudeQuota({ ...fx, now, maxFileBytes: 10 }).filesRead, 0);
  assert.equal(Q.readClaudeQuota({ ...fx, now: now + 30 * 86_400_000 }).filesRead, 0);
});

test('route handler: owner + subscription owner only', async () => {
  const fx = fixtures(); const env = { ORIA_SUBSCRIPTION_OWNERS: 'u1' };
  assert.equal(R.subscriptionQuotaResponse({ userId: 'u1', role: 'member' }, fx, env).status, 403);
  const notHolder = R.subscriptionQuotaResponse({ userId: 'u2', role: 'owner' }, fx, env);
  assert.equal(notHolder.status, 403); assert.equal((await notHolder.json()).code, 'subscription_owner_only');
  assert.equal(R.subscriptionQuotaResponse({ userId: 'u1', role: 'owner' }, fx, {}).status, 403);
  const ok = R.subscriptionQuotaResponse({ userId: 'u1', role: 'owner' }, { ...fx, now }, env);
  assert.equal(ok.status, 200);
  const body = await ok.json(); assert.equal(body.providers[1].remainingPercent, 39);
});

test('quota reader has no network capability', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(path.join(root, 'src/server/ai/subscription-quota.ts'), 'utf8');
  assert.doesNotMatch(src, /fetch\(|node:https?|node:net|node:dgram|node:child_process/);
});
