import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createJiti } from 'jiti';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, symlinkSync, unlinkSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
let fetches = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = () => { fetches++; throw new Error('No network allowed in bound-spec tests'); };
after(() => { globalThis.fetch = originalFetch; assert.equal(fetches, 0); });
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(repoRoot, 'src'), 'server-only': path.join(repoRoot, 'src/__server-only-noop.js') } });
const E = await jiti.import('./atelier-bound-spec.ts');
const A = await jiti.import('./atelier-mission.ts');
const C = await jiti.import('../missions/atelier-owner-spec-contract.ts');
const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();
function fixture({ existingSpec, ignored = false } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'bound-spec-test-'));
  const root = path.join(dir, 'missions'), repos = path.join(dir, 'repos'), workspaceId = 'workspace-a';
  const repo = path.join(repos, workspaceId, 'sample'); mkdirSync(repo, { recursive: true });
  git(repo, 'init', '-q', '-b', 'main'); writeFileSync(path.join(repo, 'README.md'), 'test-only\n');
  if (existingSpec !== undefined) writeFileSync(path.join(repo, 'SPEC.md'), existingSpec);
  if (ignored) writeFileSync(path.join(repo, '.gitignore'), 'hidden.txt\n');
  git(repo, 'add', '-A'); git(repo, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture');
  const baseSha = git(repo, 'rev-parse', 'HEAD');
  const actorId = randomUUID(), missionId = randomUUID();
  const body = { version: 1, workspaceId, modeId: 'development', missionId, actorId,
    missionVersion: new Date().toISOString(), developmentPayloadHash: 'a'.repeat(64), missionRiskLevel: 'low',
    specialist: { agentId: 'builder', skillId: 'spec.draft', purpose: 'instruction_profile_only' },
    repository: { relativePath: 'sample', baseSha }, selection: { runtimeId: 'codex', modelId: 'test-model', catalogRevision: 'test-revision' },
    limits: { timeoutMs: 1000, maxNewAgentSteps: 1, paidApiAllowed: false, externalEffectsAllowed: false, missionCostBudgetCents: null }, output: 'SPEC.md' };
  const text = 'Write only SPEC.md. Frozen owner-reviewed fixture instructions. No commands or commit.';
  const payload = C.ownerSpecPayloadSchema.parse({ version: 2, operation: 'atelier.spec.start', workspaceId,
    actorId, missionId, modeId: 'development', runId: randomUUID(), installationId: randomUUID(), reviewId: randomUUID(),
    reviewExpiresAt: new Date(Date.now() + 60_000).toISOString(), binding: { ...body, bindingHash: C.sha256(JSON.stringify(body)) },
    instructions: { version: 'owner-spec/v1', text, sha256: C.sha256(text) },
    effects: { maxNewSteps: 1, output: 'SPEC.md', automaticCommitAllowed: false, paidApiAllowed: false, externalToolsAllowed: false } });
  const payloadHash = C.sha256(JSON.stringify(payload)), attemptId = randomUUID();
  const receipt = { version: 2, state: 'admitted', workspaceId, actorId, missionId, runId: payload.runId,
    installationId: payload.installationId, attemptId, decisionId: randomUUID(), payloadHash,
    bindingHash: payload.binding.bindingHash, ledgerId: attemptId, admittedAt: new Date().toISOString() };
  return { dir, root, repo, baseSha, input: { payload, payloadHash, receipt },
    env: { PATH: process.env.PATH, HOME: path.join(dir, 'unused-home'), ORIA_ATELIER_REPOS_ROOT: repos } };
}
function fakeProvider(f, overrides = {}) {
  const calls = [];
  const provider = { assertSubscription() {}, sandboxAvailable: () => true,
    spawn(binary, args, options) {
      calls.push({ binary, args, options });
      const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
      child.stdin = new Writable({ write(chunk, _encoding, cb) { calls.at(-1).prompt = String(chunk); cb(); }, final(cb) {
        queueMicrotask(() => {
          try {
            const work = options.cwd, home = options.env.HOME;
            const sessionId = 'fake-session'; mkdirSync(path.join(home, '.codex/sessions'), { recursive: true });
            writeFileSync(path.join(home, '.codex/sessions', `${sessionId}.jsonl`), [
              { type: 'session_meta', payload: { id: sessionId } },
              { type: 'turn_context', payload: { model: overrides.model ?? 'test-model' } },
            ].map(x => JSON.stringify(x)).join('\n'));
            if (overrides.edit) overrides.edit(work, home); else writeFileSync(path.join(work, 'SPEC.md'), '# Bound fixture specification\n');
            if (overrides.hang) return;
            child.stdout.write(overrides.transcript ?? `${JSON.stringify({ type: 'thread.started', thread_id: sessionId })}\n${JSON.stringify({ type: 'turn.completed' })}\n`);
            child.emit('close', overrides.exit ?? 0, overrides.signal ?? null);
          } catch (error) { child.emit('error', error); }
        }); cb();
      } });
      return child;
    }, ...overrides.provider };
  return { provider, calls };
}
const engine = (f, provider = null) => E.createBoundSpecEngine({ root: f.root, env: f.env, provider });
const local = f => path.join(f.root, f.input.payload.runId);

test('offline fake-process: exact reviewed recipe, one SPEC artifact, no commit, durable replay', async () => {
  const f = fixture(), { provider, calls } = fakeProvider(f), e = engine(f, provider);
  const result = await e.execute(f.input);
  assert.equal(result.status, 'succeeded'); assert.ok(C.validateOwnerSpecResult(result, f.input));
  assert.equal(calls.length, 1); assert.equal(calls[0].prompt, f.input.payload.instructions.text);
  assert.equal(calls[0].binary, 'bwrap'); assert.ok(calls[0].args.includes('--unshare-net'));
  const work = path.join(local(f), 'worktree'), args = calls[0].args;
  assert.ok(args.some((v, i) => v === '--ro-bind' && args[i + 1] === work));
  assert.ok(args.some((v, i) => v === '--bind' && args[i + 1] === path.join(work, 'SPEC.md')));
  assert.ok(!args.some((v, i) => v === '--bind' && args[i + 1] === work));
  for (const flag of ['shell_tool', 'unified_exec', 'hooks', 'multi_agent']) assert.ok(args.includes(`features.${flag}=false`));
  assert.ok(!args.some(v => v.includes('auth.json'))); assert.ok(!args.includes('resume'));
  assert.equal(git(work, 'rev-parse', 'HEAD'), f.baseSha); assert.equal(git(f.repo, 'rev-parse', 'HEAD'), f.baseSha);
  const m = A.loadMission(f.input.payload.runId, f.root);
  assert.equal(m.steps.length, 1); assert.equal(m.steps[0].commitSha, null); assert.equal(m.artifacts.length, 1);
  assert.equal(result.evidence.manifest.stepId, f.input.receipt.attemptId);
  assert.equal(result.evidence.manifest.headSha, f.baseSha);
  assert.deepEqual(await e.execute(f.input), result); assert.deepEqual(engine(f).recover(f.input), result);
  assert.equal(calls.length, 1); assert.equal(existsSync(path.join(local(f), 'run.lock')), false);
});
test('default provider closed, persisted refusal cannot become a launch on retry', async () => {
  const f = fixture(); assert.equal((await engine(f).execute(f.input)).status, 'blocked');
  const { provider, calls } = fakeProvider(f);
  assert.equal((await engine(f, provider).execute(f.input)).status, 'blocked'); assert.equal(calls.length, 0);
});
for (const [name, mutate] of [
  ['v1 receipt', x => { x.receipt.version = 1; }], ['foreign workspace', x => { x.receipt.workspaceId = 'foreign'; }],
  ['foreign actor', x => { x.receipt.actorId = randomUUID(); }], ['foreign mission', x => { x.receipt.missionId = randomUUID(); }],
  ['foreign run', x => { x.receipt.runId = randomUUID(); }], ['foreign installation', x => { x.receipt.installationId = randomUUID(); }],
  ['wrong ledger', x => { x.receipt.ledgerId = randomUUID(); }], ['prompt drift', x => { x.payload.instructions.text += 'extra'; }],
  ['payload hash', x => { x.payloadHash = 'b'.repeat(64); }], ['extra authority', x => { x.payload.approved = true; }],
  ['commit allowed', x => { x.payload.effects.automaticCommitAllowed = true; }],
]) test(`reject ${name} before provider or file effects`, async () => {
  const f = fixture(), { provider, calls } = fakeProvider(f); mutate(f.input);
  assert.equal((await engine(f, provider).execute(f.input)).status, 'blocked'); assert.equal(calls.length, 0); assert.equal(existsSync(f.root), false);
});
test('sandbox missing is refusal, not unsandboxed fallback', async () => {
  const f = fixture(), { provider, calls } = fakeProvider(f, { provider: { sandboxAvailable: () => false } });
  assert.equal((await engine(f, provider).execute(f.input)).status, 'blocked'); assert.equal(calls.length, 0);
  assert.equal(existsSync(path.join(local(f), 'worktree')), false);
});
test('expiry, paid configuration and repository SHA drift never spawn', async () => {
  for (const condition of ['expiry', 'paid', 'head']) {
    const f = fixture(), { provider, calls } = fakeProvider(f);
    if (condition === 'expiry') {
      f.input.payload.reviewExpiresAt = new Date(Date.now() - 1000).toISOString();
      f.input.payloadHash = C.sha256(JSON.stringify(f.input.payload)); f.input.receipt.payloadHash = f.input.payloadHash;
    } else if (condition === 'paid') f.env.OPENAI_API_KEY = 'fixture-only-not-a-secret';
    else { writeFileSync(path.join(f.repo, 'README.md'), 'new'); git(f.repo, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qam', 'new'); }
    assert.equal((await engine(f, provider).execute(f.input)).status, 'blocked'); assert.equal(calls.length, 0);
  }
});
test('different receipt or incomplete local attempt reconciles without launch', async () => {
  const f = fixture(), { provider, calls } = fakeProvider(f);
  mkdirSync(local(f), { recursive: true }); writeFileSync(path.join(local(f), 'execution.json'), JSON.stringify(f.input));
  assert.equal((await engine(f, provider).execute(f.input)).status, 'reconciliation_required');
  f.input.receipt.decisionId = randomUUID();
  assert.equal((await engine(f, provider).execute(f.input)).status, 'reconciliation_required'); assert.equal(calls.length, 0);
});
for (const [name, changes] of [
  ['wrong model', { model: 'other-model' }], ['nonzero', { exit: 1 }],
  ['missing completion', { transcript: '{"type":"thread.started","thread_id":"fake-session"}\n' }],
  ['empty spec', { edit: w => writeFileSync(path.join(w, 'SPEC.md'), '') }],
  ['large spec', { edit: w => writeFileSync(path.join(w, 'SPEC.md'), 'a'.repeat(64_001)) }],
  ['invalid UTF8', { edit: w => writeFileSync(path.join(w, 'SPEC.md'), Buffer.from([0xff])) }],
  ['extra file', { edit: w => { writeFileSync(path.join(w, 'SPEC.md'), '# spec'); writeFileSync(path.join(w, 'extra.txt'), 'outside scope'); } }],
  ['ignored file', { edit: w => { writeFileSync(path.join(w, 'SPEC.md'), '# spec'); writeFileSync(path.join(w, 'hidden.txt'), 'outside scope'); } }],
  ['secret', { edit: w => writeFileSync(path.join(w, 'SPEC.md'), '++ sk-' + 'A'.repeat(30)) }],
  ['replaced spec', { edit: w => { unlinkSync(path.join(w, 'SPEC.md')); symlinkSync('README.md', path.join(w, 'SPEC.md')); } }],
]) test(`fake-process ${name} cannot publish a successful artifact`, async () => {
  const f = fixture({ ignored: true }), { provider } = fakeProvider(f, changes);
  const result = await engine(f, provider).execute(f.input); assert.equal(result.status, 'failed'); assert.equal(result.evidence, undefined);
  assert.equal(A.loadMission(f.input.payload.runId, f.root).artifacts.length, 0);
  assert.equal(git(f.repo, 'rev-parse', 'HEAD'), f.baseSha);
});
test('pre-existing unchanged spec is not a new deliverable', async () => {
  const f = fixture({ existingSpec: '# old' }), { provider } = fakeProvider(f, { edit() {} });
  assert.equal((await engine(f, provider).execute(f.input)).status, 'failed');
});
test('timeout leaves uncertain lock and never starts another fake child', async () => {
  const f = fixture(), { provider, calls } = fakeProvider(f, { hang: true }), e = engine(f, provider);
  assert.equal((await e.execute(f.input)).status, 'reconciliation_required');
  assert.equal(existsSync(path.join(local(f), 'run.lock')), true);
  assert.equal((await e.execute(f.input)).status, 'reconciliation_required'); assert.equal(calls.length, 1);
});
test('transcript cap fails closed, preserving uncertain child lock', async () => {
  const f = fixture(), { provider } = fakeProvider(f, { transcript: 'x'.repeat(256_001), hang: false });
  assert.equal((await engine(f, provider).execute(f.input)).status, 'reconciliation_required');
});
test('all legacy mutations reject even malformed boundSpec before auth, git, cleanup or resume', () => {
  const f = fixture(), id = f.input.payload.runId; mkdirSync(local(f), { recursive: true });
  const m = { id, workspaceId: 'workspace-a', boundSpec: null };
  writeFileSync(path.join(local(f), 'mission.json'), JSON.stringify(m));
  for (const operation of [() => A.startAgentStep(id, 'code', 'x', { root: f.root }),
    () => A.startAgentStep(id, null, 'x', { root: f.root, resume: true }),
    () => A.runCommandStep(id, 'test', ['not-executed'], { root: f.root, approveUnsandboxed: { by: 'owner' } }),
    () => A.commitIfChanged(m, {}, f.root), () => A.quarantine(m, {}), () => A.closeMission(id, f.root)]) {
    assert.throws(operation, /bound_spec_requires_governed_engine/);
  }
});
test('concurrent calls share one durable attempt, not two child spawns', async () => {
  const f = fixture(), { provider, calls } = fakeProvider(f), e = engine(f, provider);
  const [first, concurrent] = await Promise.all([e.execute(f.input), e.execute(f.input)]);
  assert.equal(first.status, 'succeeded'); assert.equal(concurrent.status, 'reconciliation_required'); assert.equal(calls.length, 1);
  assert.equal(e.recover(f.input).status, 'succeeded');
});
test('repository checkout programs and indirect config are refused before checkout', async () => {
  for (const key of ['filter.fixture.smudge', 'include.path', 'extensions.worktreeconfig']) {
    const f = fixture(), { provider, calls } = fakeProvider(f);
    git(f.repo, 'config', key, key === 'extensions.worktreeconfig' ? 'true' : 'not-executed');
    assert.equal((await engine(f, provider).execute(f.input)).status, 'blocked'); assert.equal(calls.length, 0);
    assert.equal(existsSync(path.join(local(f), 'worktree')), false);
  }
});
test('production remains closed with an explicitly injected fake provider', async () => {
  const f = fixture(), { provider, calls } = fakeProvider(f); f.env.NODE_ENV = 'production';
  assert.equal((await engine(f, provider).execute(f.input)).status, 'blocked'); assert.equal(calls.length, 0);
});
test('controlled local Node child produces bound result; no model, credentials or real sandbox claim', async () => {
  const { createFakeBoundSpecProvider } = await import('./atelier-bound-spec.test-fixture.mjs');
  const f = fixture();
  const { provider, calls } = createFakeBoundSpecProvider({ instructionHash: f.input.payload.instructions.sha256,
    model: f.input.payload.binding.selection.modelId });
  const result = await engine(f, provider).execute(f.input);
  assert.equal(result.status, 'succeeded'); assert.equal(result.sessionId, 'fake-node-session');
  assert.equal(calls.length, 1); assert.ok(calls[0].pid > 0);
  assert.equal(result.evidence.specText, '# Offline Node fixture\n');
  assert.equal(existsSync(path.join(local(f), 'run.lock')), false);
  assert.equal(git(f.repo, 'rev-parse', 'HEAD'), f.baseSha);
});

test('local fsmonitor program cannot run before sandbox or provider', async () => {
  const f = fixture(), { provider, calls } = fakeProvider(f);
  const marker = path.join(f.dir, 'fsmonitor-ran'), hook = path.join(f.dir, 'fsmonitor-hook');
  writeFileSync(hook, '#!/bin/sh\nprintf invoked > "' + marker + '"\n'); chmodSync(hook, 0o700);
  git(f.repo, 'config', 'core.fsmonitor', hook);
  assert.equal((await engine(f, provider).execute(f.input)).status, 'blocked');
  assert.equal(calls.length, 0); assert.equal(existsSync(marker), false);
  assert.equal(existsSync(path.join(local(f), 'worktree')), false);
});

test('post-spawn log failure stops the real fixture child under supervision and never relaunches', async () => {
  const { createFakeBoundSpecProvider } = await import('./atelier-bound-spec.test-fixture.mjs');
  const f = fixture();
  const { provider, calls } = createFakeBoundSpecProvider({ instructionHash: f.input.payload.instructions.sha256,
    model: f.input.payload.binding.selection.modelId });
  const originalSpawn = provider.spawn; let closed;
  provider.spawn = (...args) => {
    const child = originalSpawn(...args);
    closed = new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })));
    mkdirSync(path.join(local(f), 'events.jsonl'));
    return child;
  };
  const e = engine(f, provider), result = await e.execute(f.input);
  assert.equal(result.status, 'reconciliation_required');
  assert.equal((await closed).signal, 'SIGKILL');
  assert.equal((await e.execute(f.input)).status, 'reconciliation_required'); assert.equal(calls.length, 1);
  assert.equal(existsSync(path.join(local(f), 'artifacts/SPEC.md')), false);
});
