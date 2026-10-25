import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createJiti } from 'jiti';
const src = path.resolve('src');
const fixture = path.join(src, 'server/auth/test-fixtures/authz-dependencies.mjs');
const jiti = createJiti(import.meta.url, { alias: { '@/lib/supabase/server': fixture, '@/server/supabase/admin': fixture, '@': src, 'server-only': path.join(src, 'scripts/smoke/server-only-stub.mjs') } });

// Hermetic environment: fake CLI on PATH, temp HOME/stores, no API keys.
const tmp = mkdtempSync(path.join(tmpdir(), 'atelier-api-'));
const bin = path.join(tmp, 'bin'); mkdirSync(bin);
symlinkSync(path.join(src, 'server/atelier/test-fixtures/fake-codex'), path.join(bin, 'codex'));
symlinkSync(path.join(src, 'server/atelier/test-fixtures/fake-claude'), path.join(bin, 'claude'));
for (const k of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CODEX_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN', 'MICHAEL_HQ_OWNER_ID', 'MICHAEL_HQ_OWNER_EMAIL']) delete process.env[k];
Object.assign(process.env, { PATH: `${bin}:${process.env.PATH}`, HOME: path.join(tmp, 'home'), ORIA_ATELIER_ROOT: path.join(tmp, 'store'), ORIA_ATELIER_REPOS_ROOT: path.join(tmp, 'repos'), ORIA_HQ_SUBSCRIPTION_RUNTIMES: '1',
  ORIA_WORKSPACE_MEMBERS: JSON.stringify([{ userId: 'u1', workspaceId: 'ws-a', role: 'owner' }, { userId: 'u2', workspaceId: 'ws-b', role: 'owner' }, { userId: 'u3', workspaceId: 'ws-a', role: 'member' }, { userId: 'u4', workspaceId: 'ws-c', role: 'owner' }]), ORIA_SUBSCRIPTION_OWNERS: 'u1,u2' });
mkdirSync(process.env.HOME); mkdirSync(process.env.ORIA_ATELIER_ROOT); mkdirSync(process.env.ORIA_ATELIER_REPOS_ROOT);
const A = await jiti.import('./atelier-mission.ts');
const H = await jiti.import('../../app/api/atelier/missions/handlers.ts');
const list = await jiti.import('../../app/api/atelier/missions/route.ts');
const one = await jiti.import('../../app/api/atelier/missions/[missionId]/route.ts');
const events = await jiti.import('../../app/api/atelier/missions/[missionId]/events/route.ts');
const steps = await jiti.import('../../app/api/atelier/missions/[missionId]/steps/route.ts');
const resume = await jiti.import('../../app/api/atelier/missions/[missionId]/resume/route.ts');
const interrupt = await jiti.import('../../app/api/atelier/missions/[missionId]/interrupt/route.ts');
const catalog = { revision: 't', entries: [{ runtimeId: 'codex', modelId: 'gpt-test' }, { runtimeId: 'claude-code', modelId: 'claude-test' }] };

function repo(name, ws = 'ws-a') {
  mkdirSync(path.join(process.env.ORIA_ATELIER_REPOS_ROOT, ws), { recursive: true });
  const dir = path.join(process.env.ORIA_ATELIER_REPOS_ROOT, ws, name); mkdirSync(dir);
  execFileSync('git', ['init', '-q', '-b', 'main', dir]); writeFileSync(path.join(dir, 'package.json'), '{"scripts":{"test":"node -e 0"}}');
  execFileSync('git', ['-C', dir, 'add', '-A']); execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'seed']);
  return dir;
}
const req = (url, body, headers = {}) => new Request(`http://local${url}`, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
const params = missionId => ({ params: Promise.resolve({ missionId }) });
const knobs = (v = '') => writeFileSync(path.join(process.env.HOME, 'fake.env'), v);
const as = user => { globalThis.authzTestUser = user; };
async function waitIdle(id) { for (let i = 0; i < 200; i++) { const m = A.loadMission(id); if (m.status !== 'running' && !A.currentLock(id)) return m; await new Promise(r => setTimeout(r, 50)); } throw new Error('timeout'); }
async function sse(res) { const text = await res.text(); return text.split('\n\n').filter(Boolean).map(b => ({ event: /event: (\w+)/.exec(b)?.[1], data: JSON.parse(/data: (.*)/.exec(b)?.[1] ?? 'null') })); }

test('unauthenticated calls are refused (401)', async () => {
  as(null);
  assert.equal((await list.GET(req('/api/atelier/missions'))).status, 401);
});

test('create → spec step streamed over SSE → correction (revision) → model proof', async () => {
  as({ id: 'u1' });
  const created = await H.createAtelierMission({ userId: 'u1', workspaceId: 'ws-a' }, { title: 'T', need: 'N', repoPath: repo('r1'), runtimeId: 'codex', modelId: 'gpt-test' }, { catalog });
  assert.equal(created.status, 202);
  const { missionId } = await created.json();
  const stream = await sse(await events.GET(req(`/api/atelier/missions/${missionId}/events`), params(missionId)));
  assert.equal(stream[0].event, 'snapshot');
  assert.ok(stream.some(e => e.event === 'mission' && e.data.type === 'step_finished' && e.data.data.status === 'succeeded'));
  assert.equal(stream.at(-1).event, 'end');
  const rev = await steps.POST(req(`/x`, { kind: 'revision', prompt: 'en dollars' }), params(missionId));
  assert.equal(rev.status, 202);
  const m = await waitIdle(missionId);
  assert.deepEqual(m.steps.map(s => `${s.kind}:${s.status}`), ['spec:succeeded', 'revision:succeeded']);
  const view = await (await one.GET(req(`/x`), params(missionId))).json();
  assert.deepEqual(view.modelProof, { requested: 'gpt-test', observed: 'gpt-test', matches: true });
  assert.equal(view.workspaceId, 'ws-a'); assert.equal(view.createdBy, 'u1');
});

test('another workspace cannot see or drive the mission (404)', async () => {
  as({ id: 'u1' });
  const created = await H.createAtelierMission({ userId: 'u1', workspaceId: 'ws-a' }, { title: 'T', need: 'N', repoPath: repo('r2'), runtimeId: 'codex', modelId: 'gpt-test' }, { catalog });
  const { missionId } = await created.json(); await waitIdle(missionId);
  as({ id: 'u2' });
  assert.equal((await one.GET(req('/x'), params(missionId))).status, 404);
  assert.equal((await steps.POST(req('/x', { kind: 'code', prompt: 'x' }), params(missionId))).status, 404);
  assert.equal((await one.GET(req('/x', null, { 'x-oria-workspace': 'ws-a' }), params(missionId))).status, 403);
});

test('interrupt a live step, then resume the same CLI session keeping the revision kind', async () => {
  as({ id: 'u1' });
  const created = await H.createAtelierMission({ userId: 'u1', workspaceId: 'ws-a' }, { title: 'T', need: 'N', repoPath: repo('r3'), runtimeId: 'codex', modelId: 'gpt-test' }, { catalog });
  const { missionId } = await created.json(); await waitIdle(missionId);
  knobs('FAKE_SLEEP=5');
  assert.equal((await steps.POST(req('/x', { kind: 'revision', prompt: 'x' }), params(missionId))).status, 202);
  await new Promise(r => setTimeout(r, 300));
  assert.equal((await steps.POST(req('/x', { kind: 'code', prompt: 'x' }), params(missionId))).status, 409);
  assert.equal((await interrupt.POST(req('/x', {}), params(missionId))).status, 202);
  let m = await waitIdle(missionId);
  assert.equal(m.status, 'interrupted'); assert.equal(m.steps.at(-1).kind, 'revision');
  knobs('');
  assert.equal((await resume.POST(req('/x', {}), params(missionId))).status, 202);
  m = await waitIdle(missionId);
  const last = m.steps.at(-1);
  assert.equal(last.kind, 'revision'); assert.equal(last.status, 'succeeded'); assert.equal(last.resumedFrom, m.steps.at(-2).sessionId);
});

test('dead runner (crashed server) leaves a stale lock: new steps refused, explicit resume recovers', async () => {
  as({ id: 'u1' });
  const created = await H.createAtelierMission({ userId: 'u1', workspaceId: 'ws-a' }, { title: 'T', need: 'N', repoPath: repo('r4'), runtimeId: 'codex', modelId: 'gpt-test' }, { catalog });
  const { missionId } = await created.json(); await waitIdle(missionId);
  knobs('FAKE_SLEEP=30\nFAKE_SID=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  // Simulate a crash mid-step: a separate runner process starts a revision and is SIGKILLed.
  const runner = spawn(process.execPath, ['src/scripts/atelier/mission.mjs', 'step', missionId, 'revision', 'x'], { env: process.env, stdio: 'ignore' });
  for (let i = 0; i < 100 && !A.currentLock(missionId)?.childPid; i++) await new Promise(r => setTimeout(r, 50));
  const lock = A.currentLock(missionId);
  await new Promise(r => setTimeout(r, 300));
  runner.kill('SIGKILL'); try { process.kill(-lock.childPid, 'SIGKILL'); } catch {}
  await new Promise(r => setTimeout(r, 200));
  knobs('');
  assert.equal(A.currentLock(missionId).live, false);
  assert.equal((await steps.POST(req('/x', { kind: 'code', prompt: 'x' }), params(missionId))).status, 409);
  const r = await resume.POST(req('/x', {}), params(missionId));
  assert.equal(r.status, 202);
  const m = await waitIdle(missionId);
  const [dead, resumed] = m.steps.slice(-2);
  assert.equal(dead.status, 'interrupted'); assert.equal(dead.reason, 'runner_died'); assert.equal(dead.sessionId, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  assert.equal(resumed.kind, 'revision'); assert.equal(resumed.resumedFrom, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'); assert.equal(resumed.status, 'succeeded');
  assert.ok(A.readEvents(missionId).some(e => e.type === 'stale_lock_reclaimed'));
});

test('refusals: API key present, model outside catalog, repo outside root, runtime disabled', async () => {
  const ctx = { userId: 'u1', workspaceId: 'ws-a' };
  const base = { title: 'T', need: 'N', repoPath: repo('r5'), runtimeId: 'codex', modelId: 'gpt-test' };
  assert.equal((await H.createAtelierMission(ctx, { ...base, modelId: 'nope' }, { catalog })).status, 400);
  assert.equal((await H.createAtelierMission(ctx, { ...base, repoPath: tmp }, { catalog })).status, 400);
  const other = await H.createAtelierMission(ctx, { ...base, repoPath: repo('r5b', 'ws-b') }, { catalog });
  assert.equal(other.status, 400, "a repo of another workspace is refused (repos are per space)");
  assert.equal((await other.json()).code, 'repo_outside_atelier_root');
  assert.equal((await H.createAtelierMission(ctx, base, { catalog, env: {} })).status, 503);
  process.env.ANTHROPIC_API_KEY = 'fixture';
  const r = await H.createAtelierMission(ctx, base, { catalog });
  delete process.env.ANTHROPIC_API_KEY;
  assert.equal(r.status, 503); assert.equal((await r.json()).code, 'api_key_present');
});

test('claude-code runtime: stream-json session; observed model = assistant message.model, never the init echo', () => {
  const t = [JSON.stringify({ type: 'system', subtype: 'init', session_id: 's-1', model: 'claude-test' }),
    JSON.stringify({ type: 'assistant', session_id: 's-1', message: { model: 'claude-test-20990101', content: [] } }),
    JSON.stringify({ type: 'result', subtype: 'success', is_error: false, session_id: 's-1', modelUsage: { 'claude-test': {} } })].join('\n');
  assert.deepEqual(A.parseTranscript('claude-code', t), { sessionId: 's-1', completed: true, streamModel: 'claude-test-20990101', quota: false });
  const echoOnly = [JSON.stringify({ type: 'system', subtype: 'init', session_id: 's-2', model: 'claude-test' })].join('\n');
  assert.equal(A.parseTranscript('claude-code', echoOnly).streamModel, null, 'the request echo is not an observation');
  assert.equal(A.parseTranscript('claude-code', echoOnly).completed, false);
  assert.ok(A.agentInvocation('claude-code', 'claude-test', 's-1').args.join(' ').includes('--resume s-1'));
  assert.throws(() => A.assertSubscriptionOnly('claude-code', { PATH: process.env.PATH }, () => ({ stdout: '{"loggedIn":true,"authMethod":"api_key"}' })), /subscription_auth_required/);
});

test('claude-code through the API: spec → code → test → revision crash (runner SIGKILL) → 409 → --resume same session → test; modelProof from the CLI', async () => {
  as({ id: 'u1' });
  knobs('FAKE_OBSERVED=claude-test');
  const created = await H.createAtelierMission({ userId: 'u1', workspaceId: 'ws-a' }, { title: 'T', need: 'N', repoPath: repo('rc1'), runtimeId: 'claude-code', modelId: 'claude-test' }, { catalog });
  assert.equal(created.status, 202);
  const { missionId, mission } = await created.json();
  assert.equal(mission.runtime.authMode, 'claude_ai_session');
  await waitIdle(missionId);
  assert.equal((await steps.POST(req('/x', { kind: 'code', prompt: 'code' }), params(missionId))).status, 202);
  await waitIdle(missionId);
  assert.equal((await H.verifyAtelierMission({ userId: 'u1', workspaceId: 'ws-a' }, missionId)).status, 200);
  knobs('FAKE_OBSERVED=claude-test\nFAKE_SLEEP=30\nFAKE_SID=cccccccc-1111-2222-3333-444444444444');
  const runner = spawn(process.execPath, ['src/scripts/atelier/mission.mjs', 'step', missionId, 'revision', 'x'], { env: process.env, stdio: 'ignore' });
  for (let i = 0; i < 100 && !A.currentLock(missionId)?.childPid; i++) await new Promise(r => setTimeout(r, 50));
  const lock = A.currentLock(missionId);
  assert.equal(lock.live, true); assert.ok(lock.childPid);
  await new Promise(r => setTimeout(r, 300));
  runner.kill('SIGKILL');
  await new Promise(r => setTimeout(r, 200));
  assert.equal(A.currentLock(missionId).live, false);
  assert.equal(A.pidAlive(lock.childPid), true, 'orphan claude child survives the runner');
  knobs('FAKE_OBSERVED=claude-test');
  const refused = await steps.POST(req('/x', { kind: 'revision', prompt: 'x' }), params(missionId));
  assert.equal(refused.status, 409); assert.equal((await refused.json()).code, 'stale_lock_requires_explicit_resume');
  assert.equal((await resume.POST(req('/x', {}), params(missionId))).status, 202);
  let m = await waitIdle(missionId);
  assert.equal(A.pidAlive(lock.childPid), false, 'orphan reaped');
  assert.equal((await H.verifyAtelierMission({ userId: 'u1', workspaceId: 'ws-a' }, missionId)).status, 200);
  m = A.loadMission(missionId);
  assert.deepEqual(m.steps.map(s => `${s.kind}:${s.status}:${s.executor}`), ['spec:succeeded:claude_code_cli', 'code:succeeded:claude_code_cli', 'test:succeeded:runner',
    'revision:interrupted:claude_code_cli', 'revision:succeeded:claude_code_cli', 'test:succeeded:runner']);
  const [dead, resumed] = m.steps.slice(3, 5);
  assert.equal(dead.reason, 'runner_died'); assert.equal(dead.sessionId, 'cccccccc-1111-2222-3333-444444444444');
  assert.equal(resumed.resumedFrom, 'cccccccc-1111-2222-3333-444444444444'); assert.equal(resumed.sessionId, 'cccccccc-1111-2222-3333-444444444444');
  const view = await (await one.GET(req('/x'), params(missionId))).json();
  assert.deepEqual(view.modelProof, { requested: 'claude-test', observed: 'claude-test', matches: true });
});

test('claude-code: observed model differs from the request → modelProof.matches false (observed comes from the CLI)', async () => {
  as({ id: 'u1' });
  knobs('FAKE_OBSERVED=claude-other-20990101');
  const created = await H.createAtelierMission({ userId: 'u1', workspaceId: 'ws-a' }, { title: 'T', need: 'N', repoPath: repo('rc2'), runtimeId: 'claude-code', modelId: 'claude-test' }, { catalog });
  const { missionId } = await created.json(); await waitIdle(missionId); knobs('');
  const view = await (await one.GET(req('/x'), params(missionId))).json();
  assert.deepEqual(view.modelProof, { requested: 'claude-test', observed: 'claude-other-20990101', matches: false });
});

test('claude-code: subscription limit → step blocked (subscription_quota), never an API fallback', async () => {
  as({ id: 'u1' });
  knobs('FAKE_QUOTA=1');
  const created = await H.createAtelierMission({ userId: 'u1', workspaceId: 'ws-a' }, { title: 'T', need: 'N', repoPath: repo('rc3'), runtimeId: 'claude-code', modelId: 'claude-test' }, { catalog });
  const { missionId } = await created.json(); const m = await waitIdle(missionId); knobs('');
  assert.equal(m.status, 'blocked'); assert.equal(m.steps[0].status, 'blocked'); assert.equal(m.steps[0].reason, 'subscription_quota');
});

test('claude-code SENT-412-17: init.apiKeySource ≠ "none" (paid API key injected by settings) → step killed at once, subscription_auth_required, no work committed', async () => {
  as({ id: 'u1' });
  knobs('FAKE_API_KEY_SOURCE=ANTHROPIC_API_KEY');
  const dir = repo('rc17');
  // SENT-412-28: another mission on the same repo has uncommitted work; the quarantine must never touch it.
  const other = A.createMission({ title: 'B', need: 'b', repoPath: dir, modelId: 'gpt-test', workspaceId: 'ws-a' });
  writeFileSync(path.join(other.repo.worktree ?? dir, 'travail-de-B.txt'), 'B');
  const t0 = Date.now();
  const created = await H.createAtelierMission({ userId: 'u1', workspaceId: 'ws-a' }, { title: 'T', need: 'N', repoPath: dir, runtimeId: 'claude-code', modelId: 'claude-test' }, { catalog });
  assert.equal(created.status, 202);
  const { missionId } = await created.json(); const m = await waitIdle(missionId); knobs('');
  assert.ok(Date.now() - t0 < 4000, 'killed on the init event, not after the paid session ran');
  assert.equal(m.status, 'failed'); assert.equal(m.steps[0].status, 'failed'); assert.equal(m.steps[0].reason, 'subscription_auth_required');
  assert.equal(m.steps[0].commitSha, null);
  assert.equal(execFileSync('git', ['-C', m.repo.worktree ?? dir, 'rev-list', '--count', 'HEAD'], { encoding: 'utf8' }).trim(), '1');
  assert.equal(execFileSync('git', ['-C', m.repo.worktree ?? dir, 'status', '--porcelain'], { encoding: 'utf8' }), '', 'clean mission tree');
  assert.match(execFileSync('git', ['-C', other.repo.worktree ?? dir, 'status', '--porcelain'], { encoding: 'utf8' }), /travail-de-B\.txt/, 'other mission untouched');
  const stash = execFileSync('git', ['-C', m.repo.worktree ?? dir, 'stash', 'list', '--format=%H %s'], { encoding: 'utf8' }).trim();
  assert.ok(stash, 'stash present');
  assert.match(stash, new RegExp(`atelier-quarantine-${missionId}-${m.steps[0].id}`));
  // 412-25/26: named ref (survives gc/expiry), pointing at the stash really produced.
  const ref = `refs/atelier/quarantine/${missionId}/${m.steps[0].id}`;
  assert.equal(m.steps[0].quarantineRef, ref);
  assert.equal(execFileSync('git', ['-C', dir, 'rev-parse', ref], { encoding: 'utf8' }).trim(), stash.split(' ')[0]);
});

test('claude-code SENT-412-21: auth checked in the mission work tree before spawn (project override → refused, no step, no CLI run)', async () => {
  as({ id: 'u1' });
  knobs('FAKE_OBSERVED=claude-test');
  const created = await H.createAtelierMission({ userId: 'u1', workspaceId: 'ws-a' }, { title: 'T', need: 'N', repoPath: repo('rc21'), runtimeId: 'claude-code', modelId: 'claude-test' }, { catalog });
  const { missionId } = await created.json(); let m = await waitIdle(missionId);
  writeFileSync(path.join(A.workPath(m), '.fake-paid-auth'), '1');
  const r = await steps.POST(req('/x', { kind: 'code', prompt: 'code' }), params(missionId));
  assert.equal(r.status, 503); assert.equal((await r.json()).code, 'subscription_auth_required');
  m = A.loadMission(missionId); assert.equal(m.steps.length, 1, 'no step started'); assert.equal(A.currentLock(missionId), null);
});

test('claude-code SENT-412-22: no init event → subscription_auth_required, no commit, quarantined (fail closed)', async () => {
  as({ id: 'u1' });
  knobs('FAKE_NO_INIT=1');
  const created = await H.createAtelierMission({ userId: 'u1', workspaceId: 'ws-a' }, { title: 'T', need: 'N', repoPath: repo('rc22'), runtimeId: 'claude-code', modelId: 'claude-test' }, { catalog });
  const { missionId } = await created.json(); const m = await waitIdle(missionId); knobs('');
  assert.equal(m.steps[0].status, 'failed'); assert.equal(m.steps[0].reason, 'subscription_auth_required'); assert.equal(m.steps[0].commitSha, null);
  assert.ok(m.steps[0].quarantineRef, 'changes set aside');
});

test('claude-code SENT-412-22: init later than the deadline → group killed, subscription_auth_required', async () => {
  as({ id: 'u1' });
  const r = repo('rc22b');
  knobs('FAKE_OBSERVED=claude-test');
  const created = await H.createAtelierMission({ userId: 'u1', workspaceId: 'ws-a' }, { title: 'T', need: 'N', repoPath: r, runtimeId: 'claude-code', modelId: 'claude-test' }, { catalog });
  const { missionId } = await created.json(); await waitIdle(missionId);
  knobs('FAKE_INIT_DELAY=5'); const t0 = Date.now();
  const m = await A.runAgentStep(missionId, 'code', 'x', { initTimeoutMs: 300 }); knobs('');
  assert.ok(Date.now() - t0 < 3000, 'killed at the init deadline');
  const s = m.steps.at(-1); assert.equal(s.status, 'failed'); assert.equal(s.reason, 'subscription_auth_required'); assert.equal(s.commitSha, null);
});

test('SENT-412-20: agent moved the work tree to another branch → no commit (repo_head_mismatch)', async () => {
  as({ id: 'u1' });
  knobs('FAKE_OBSERVED=claude-test\nFAKE_SWITCH_BRANCH=hijack');
  const created = await H.createAtelierMission({ userId: 'u1', workspaceId: 'ws-a' }, { title: 'T', need: 'N', repoPath: repo('rc20'), runtimeId: 'claude-code', modelId: 'claude-test' }, { catalog });
  const { missionId } = await created.json(); const m = await waitIdle(missionId); knobs('');
  assert.equal(m.steps[0].status, 'failed'); assert.equal(m.steps[0].reason, 'repo_head_mismatch'); assert.equal(m.steps[0].commitSha, null);
  assert.equal(execFileSync('git', ['-C', A.workPath(m), 'rev-list', '--count', 'hijack'], { encoding: 'utf8' }).trim(), '1', 'nothing committed on the hijacked branch');
});

test('SENT-412-27: git throws while closing the step → lock released, state saved', async () => {
  as({ id: 'u1' });
  knobs('FAKE_OBSERVED=claude-test\nFAKE_BREAK_GIT=1');
  const created = await H.createAtelierMission({ userId: 'u1', workspaceId: 'ws-a' }, { title: 'T', need: 'N', repoPath: repo('rc27'), runtimeId: 'claude-code', modelId: 'claude-test' }, { catalog });
  const { missionId } = await created.json(); const m = await waitIdle(missionId); knobs('');
  assert.equal(A.currentLock(missionId), null); assert.equal(m.status, 'failed'); assert.equal(m.steps[0].status, 'failed');
});

test('claude-code refusals: ANTHROPIC_API_KEY set, or auth method not claude.ai → 503 before any spawn', async () => {
  const ctx = { userId: 'u1', workspaceId: 'ws-a' };
  const base = { title: 'T', need: 'N', repoPath: repo('rc4'), runtimeId: 'claude-code', modelId: 'claude-test' };
  process.env.ANTHROPIC_API_KEY = 'fixture';
  const r1 = await H.createAtelierMission(ctx, base, { catalog });
  delete process.env.ANTHROPIC_API_KEY;
  assert.equal(r1.status, 503); assert.equal((await r1.json()).code, 'api_key_present');
  knobs(`FAKE_AUTH='{"loggedIn":true,"authMethod":"api_key","apiProvider":"firstParty"}'`);
  const r2 = await H.createAtelierMission(ctx, { ...base, repoPath: repo('rc5') }, { catalog });
  knobs(`FAKE_AUTH='{"loggedIn":true,"authMethod":"claude.ai","apiProvider":"bedrock"}'`);
  const r3 = await H.createAtelierMission(ctx, { ...base, repoPath: repo('rc6') }, { catalog });
  knobs('');
  assert.equal(r2.status, 503); assert.equal((await r2.json()).code, 'subscription_auth_required');
  assert.equal(r3.status, 503); assert.equal((await r3.json()).code, 'subscription_auth_required');
});

test('a workspace member can read but never launch on the owner subscription (403 atelier_owner_only)', async () => {
  as({ id: 'u3' });
  const res = await list.POST(req('/api/atelier/missions', { title: 'T', need: 'N', repoPath: '/nope', runtimeId: 'codex', modelId: 'gpt-test' }, { 'x-oria-workspace': 'ws-a' }));
  assert.equal(res.status, 403);
  assert.equal((await res.json()).code, 'atelier_owner_only');
  assert.equal((await list.GET(req('/api/atelier/missions', null, { 'x-oria-workspace': 'ws-a' }))).status, 200);
});

test('SENT-412-8: owner of another workspace who is not the subscription owner → 403 subscription_owner_only', async () => {
  as({ id: 'u4' });
  const res = await list.POST(req('/api/atelier/missions', { title: 'T', need: 'N', repoPath: '/nope', runtimeId: 'codex', modelId: 'gpt-test' }, { 'x-oria-workspace': 'ws-c' }));
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.code, 'subscription_owner_only'); assert.equal(typeof body.error, 'string');
  assert.equal((await list.GET(req('/api/atelier/missions', null, { 'x-oria-workspace': 'ws-c' }))).status, 200, 'reads stay allowed');
});

test('SENT-412-9: orphan reap never runs on a read or a refused mutation, only on an authorised owner action', async () => {
  const id = '00000000-0000-4000-8000-0000000000aa';
  const dir = path.join(process.env.ORIA_ATELIER_ROOT, id); mkdirSync(dir);
  const child = spawn('sleep', ['30'], { detached: true }); await new Promise(r => setTimeout(r, 100));
  writeFileSync(path.join(dir, 'run.lock'), JSON.stringify({ runnerPid: 2 ** 22 - 7, runnerStart: '1', childPid: child.pid, childStart: A.procStartTime(child.pid), stepId: 's', since: 'x', token: 't' }));
  as({ id: 'u3' }); // member
  await list.GET(req('/api/atelier/missions', null, { 'x-oria-workspace': 'ws-a' }));
  await list.POST(req('/api/atelier/missions', {}, { 'x-oria-workspace': 'ws-a' }));
  as({ id: 'u4' }); // owner, not subscription owner
  await list.POST(req('/api/atelier/missions', {}, { 'x-oria-workspace': 'ws-c' }));
  as({ id: 'u1' }); // authorised owner, read only
  await list.GET(req('/api/atelier/missions', null, { 'x-oria-workspace': 'ws-a' }));
  assert.equal(A.pidAlive(child.pid), true, 'no reap on reads or refused mutations');
  await list.POST(req('/api/atelier/missions', {}, { 'x-oria-workspace': 'ws-a' })); // authorised owner action (400 body, after authz)
  await new Promise(r => child.on('exit', r));
  assert.equal(A.pidAlive(child.pid), false, 'reaped on the authorised owner action');
});
