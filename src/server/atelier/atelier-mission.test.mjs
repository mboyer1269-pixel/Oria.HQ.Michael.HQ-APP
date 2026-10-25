import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(root, 'src'), 'server-only': path.join(root, 'src/__server-only-noop.js') } });
const A = await jiti.import('./atelier-mission.ts');
const C = { userId: 'u', workspaceId: 'michael-hq' };
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
  // SENT-412-37: test logs / transcripts → workspace owners only
  assert.equal(H.getAtelierArtifact({ ...C, role: 'member' }, m.id, art.id, { root: store }).status, 403);
  assert.equal(H.getAtelierArtifact(C, m.id, art.id, { root: store }).status, 403, 'no role → refused');
  const res = H.getAtelierArtifact({ ...C, role: 'owner' }, m.id, art.id, { root: store });
  assert.equal(res.headers.get('x-artifact-sha256'), art.sha256);
  assert.match(await res.text(), /ok-42/);
  const view = await H.getAtelierMission(C, m.id, { root: store }).json();
  assert.equal(view.modelProof.requested, 'model-x');
  assert.equal(view.modelProof.matches, false);
  const list = await H.listAtelierMissions(C, { root: store }).json();
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
  assert.throws(() => A.assertSubscriptionOnly('codex', { PATH: process.env.PATH, OPENAI_API_KEY: 'fixture' }), /api_key_present:OPENAI_API_KEY/);
});

test('unknown mission and bad ids return 404', async () => {
  const store = mkdtempSync(path.join(tmpdir(), 'atelier-store-'));
  assert.equal(H.getAtelierMission(C, '../etc', { root: store }).status, 404);
  assert.equal(H.getAtelierMission(C, 'aaaaaaaa-0000', { root: store }).status, 404);
});

test('claude-code: subscription-only gate (API key / non claude.ai auth refused, claude.ai first-party accepted)', () => {
  const ok = () => ({ stdout: '{"loggedIn":true,"authMethod":"claude.ai","apiProvider":"firstParty","subscriptionType":"pro"}' });
  assert.doesNotThrow(() => A.assertSubscriptionOnly('claude-code', { PATH: process.env.PATH }, ok));
  assert.throws(() => A.assertSubscriptionOnly('claude-code', { PATH: process.env.PATH, ANTHROPIC_API_KEY: 'fixture' }, ok), /api_key_present:ANTHROPIC_API_KEY/);
  assert.throws(() => A.assertSubscriptionOnly('claude-code', { PATH: process.env.PATH, CLAUDE_CODE_OAUTH_TOKEN: 'fixture' }, ok), /api_key_present/);
  for (const stdout of ['{"loggedIn":false}', '{"loggedIn":true,"authMethod":"console"}', '{"loggedIn":true,"authMethod":"claude.ai","apiProvider":"vertex"}', 'not json'])
    assert.throws(() => A.assertSubscriptionOnly('claude-code', { PATH: process.env.PATH }, () => ({ stdout })), /subscription_auth_required/);
});

test('claude-code: command builder (same phases as codex; resume = --resume <session>)', () => {
  const fresh = A.agentInvocation('claude-code', 'claude-haiku-4-5-20251001', null);
  assert.equal(fresh.binary, 'claude');
  assert.deepEqual(fresh.args.slice(0, 5), ['-p', '--model', 'claude-haiku-4-5-20251001', '--output-format', 'stream-json']);
  assert.ok(!fresh.args.includes('--resume'));
  assert.ok(fresh.args.includes('--strict-mcp-config'));
  const ss = fresh.args.indexOf('--setting-sources'); assert.ok(ss > 0, 'SENT-412-17: user/project settings never loaded'); assert.equal(fresh.args[ss + 1], '');
  const resumed = A.agentInvocation('claude-code', 'm', 'sid-1').args;
  assert.deepEqual(resumed.slice(-2), ['--resume', 'sid-1']);
});

test('claude-code: observed model from the real stream shape (claude 2.1.283), quota detection', () => {
  // Shape copied from a real `claude -p --output-format stream-json --verbose` run (2026-10-25): init echoes the request alias,
  // the assistant message carries the API model id, modelUsage is keyed by the alias.
  const real = [
    { type: 'system', subtype: 'init', session_id: '5bb5fe86-80b1-4d47-b761-2470d25b7784', model: 'claude-haiku-4-5' },
    { type: 'assistant', session_id: '5bb5fe86-80b1-4d47-b761-2470d25b7784', message: { model: 'claude-haiku-4-5-20251001', content: [{ type: 'text', text: 'OK' }] } },
    { type: 'rate_limit_event', session_id: '5bb5fe86-80b1-4d47-b761-2470d25b7784', rate_limit_info: { status: 'allowed', rateLimitType: 'five_hour' } },
    { type: 'result', subtype: 'success', is_error: false, session_id: '5bb5fe86-80b1-4d47-b761-2470d25b7784', modelUsage: { 'claude-haiku-4-5': {} } },
  ].map(e => JSON.stringify(e)).join('\n');
  const p = A.parseTranscript('claude-code', real);
  assert.equal(p.sessionId, '5bb5fe86-80b1-4d47-b761-2470d25b7784');
  assert.equal(p.streamModel, 'claude-haiku-4-5-20251001');
  assert.equal(A.observedModel('claude-code', p.sessionId, real), 'claude-haiku-4-5-20251001');
  assert.equal(p.completed, true); assert.equal(p.quota, false);
  const limited = [{ type: 'system', subtype: 'init', session_id: 's', model: 'm' }, { type: 'rate_limit_event', rate_limit_info: { status: 'rejected' } },
    { type: 'result', subtype: 'success', is_error: true, result: 'Claude AI usage limit reached' }].map(e => JSON.stringify(e)).join('\n');
  const q = A.parseTranscript('claude-code', limited);
  assert.equal(q.quota, true); assert.equal(q.completed, false); assert.equal(q.streamModel, null);
});

test('SENT-412-18: runner test step env is minimal (no secrets, private HOME/TMPDIR)', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'atelier-env-'));
  const e = A.commandStepEnvironment('0b7e8d2a-1c3f-4e5a-9b6d-7f8e9a0b1c2d', root, { PATH: '/bin', HOME: '/home/real', SUPABASE_SERVICE_ROLE_KEY: 's', OPENAI_API_KEY: 'k', GITHUB_TOKEN: 'g', LANG: 'C' });
  assert.deepEqual(Object.keys(e).sort(), ['CI', 'HOME', 'LANG', 'NODE_ENV', 'PATH', 'TEMP', 'TMP', 'TMPDIR', 'USERPROFILE', 'npm_config_cache']);
  assert.notEqual(e.HOME, '/home/real'); assert.ok(e.HOME.startsWith(root));
});

test('SENT-412-20: one git worktree per mission — B never moves A off its branch; HEAD/branch checked', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'atelier-wt-')); const repo = path.join(root, 'r');
  const g = (...a) => execFileSync('git', ['-C', repo, '-c', 'user.email=a@b', '-c', 'user.name=a', ...a], { encoding: 'utf8' }).trim();
  execFileSync('git', ['init', '-q', '-b', 'main', repo]); g('commit', '-q', '--allow-empty', '-m', 'i');
  const ma = A.createMission({ title: 'A', need: 'a', repoPath: repo, modelId: 'm' }, root);
  assert.ok(ma.repo.worktree && ma.repo.worktree !== repo, 'dedicated worktree');
  writeFileSync(path.join(ma.repo.worktree, 'travail-de-A.txt'), 'A');
  const mb = A.createMission({ title: 'B', need: 'b', repoPath: repo, modelId: 'm' }, root);
  assert.equal(g('rev-parse', '--abbrev-ref', 'HEAD'), 'main', 'shared checkout untouched');
  const wa = (...a) => execFileSync('git', ['-C', ma.repo.worktree, ...a], { encoding: 'utf8' }).trim();
  assert.equal(wa('rev-parse', '--abbrev-ref', 'HEAD'), ma.repo.branch);
  assert.match(wa('status', '--porcelain'), /travail-de-A\.txt/);
  assert.equal(execFileSync('git', ['-C', mb.repo.worktree, 'status', '--porcelain'], { encoding: 'utf8' }), '');
  assert.doesNotThrow(() => A.assertRepoHead(ma));
  wa('switch', '-q', '-c', 'other');
  assert.throws(() => A.assertRepoHead(ma), /repo_head_mismatch/);
});

test('SENT-412-21: agent env strips ANTHROPIC_*/OPENAI_*/base URLs/tokens/keys', () => {
  const e = A.agentEnvironment({ PATH: '/bin', HOME: '/h', ANTHROPIC_BASE_URL: 'http://x', ANTHROPIC_MODEL: 'm', OPENAI_BASE_URL: 'u', GH_TOKEN: 't', LANG: 'C' });
  // MERGE-4: #409's subscriptionEnvironment may add locale vars (LC_ALL…); assert only what matters.
  const keys = Object.keys(e).filter(k => !/^LC_/.test(k)).sort();
  assert.deepEqual(keys, ['HOME', 'LANG', 'NODE_ENV', 'PATH']);
  for (const k of Object.keys(e)) assert.doesNotMatch(k, /^(ANTHROPIC_|OPENAI_|CODEX_|CLAUDE_CODE_)|BASE_URL|TOKEN|_KEY$/i);
});

test('SENT-412-23: the Claude agent gets no Bash, and credential dirs are denied to its file tools', () => {
  const a = A.agentInvocation('claude-code', 'm', null).args;
  const allowed = a[a.indexOf('--allowedTools') + 1];
  assert.ok(!/Bash/.test(allowed), allowed);
  const denied = a[a.indexOf('--disallowedTools') + 1] ?? '';
  for (const d of ['Bash', 'Read(~/.claude/**)', 'Read(~/.codex/**)', 'Read(~/.ssh/**)']) assert.ok(denied.split(',').includes(d), d);
});

test('412-24: codex base URL pinned on the command line (HOME config openai_base_url ignored)', () => {
  for (const r of [null, '11111111-2222-3333-4444-555555555555']) {
    const a = A.agentInvocation('codex', 'gpt', r).args; const i = a.indexOf('openai_base_url="https://chatgpt.com/backend-api/codex"');
    assert.ok(i > 0 && a[i - 1] === '-c', a.join(' '));
  }
});

test('412-29: runner test step timeout kills the whole process group (no orphan grandchild)', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'atelier-to-')); const repo = path.join(root, 'r');
  execFileSync('git', ['init', '-q', '-b', 'main', repo]); execFileSync('git', ['-C', repo, '-c', 'user.email=a@b', '-c', 'user.name=a', 'commit', '-q', '--allow-empty', '-m', 'i']);
  const m = A.createMission({ title: 'T', need: 'n', repoPath: repo, modelId: 'm' }, root);
  const r = A.runCommandStep(m.id, 'test', ['sh', '-c', 'sleep 31.4159 & wait'], { root, timeoutMs: 500 });
  assert.equal(r.steps.at(-1).status, 'failed');
  const alive = spawnSync('pgrep', ['-f', 'sleep 31.4159']).status === 0;
  if (alive) spawnSync('pkill', ['-f', 'sleep 31.4159']);
  assert.equal(alive, false, 'grandchild killed with the group');
});
