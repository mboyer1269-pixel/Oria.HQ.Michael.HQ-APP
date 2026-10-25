// SENT-412-30..35: runner test step guard + sandbox, worktree hygiene, quarantine without refs/stash, symlink escape.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, symlinkSync, readdirSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';
const root0 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(root0, 'src'), 'server-only': path.join(root0, 'src/__server-only-noop.js') } });
const A = await jiti.import('./atelier-mission.ts');
function setup(pkg = { scripts: { test: 'node -e 0' } }) {
  const root = mkdtempSync(path.join(tmpdir(), 'atelier-h-')); const repo = path.join(root, 'r');
  execFileSync('git', ['init', '-q', '-b', 'main', repo]); writeFileSync(path.join(repo, 'package.json'), JSON.stringify(pkg));
  execFileSync('git', ['-C', repo, 'add', '-A']); execFileSync('git', ['-C', repo, '-c', 'user.email=a@b', '-c', 'user.name=a', 'commit', '-q', '-m', 'i']);
  return { root, repo, m: A.createMission({ title: 'T', need: 'n', repoPath: repo, modelId: 'm' }, root) };
}
const last = m => m.steps.at(-1);

test('SENT-412-30a: diff touches package.json → test step refused (needs_human_review / test_harness_changed), command NOT run', () => {
  const { root, m } = setup();
  writeFileSync(path.join(m.repo.worktree, 'package.json'), JSON.stringify({ scripts: { test: 'node -e "require(\'fs\').writeFileSync(\'ran.txt\',\'1\')"' } }));
  const r = A.runCommandStep(m.id, 'test', ['npm', 'test'], { root });
  assert.equal(last(r).status, 'needs_human_review'); assert.equal(last(r).reason, 'test_harness_changed');
  assert.equal(r.status, 'needs_human_review'); assert.ok(!existsSync(path.join(m.repo.worktree, 'ran.txt')), 'not executed');
  assert.deepEqual(last(r).harnessFiles, ['package.json']);
  const ok = A.runCommandStep(m.id, 'test', ['npm', 'test'], { root, approveHarnessChange: { by: 'owner-1' } });
  assert.equal(last(ok).status, 'succeeded'); assert.equal(last(ok).harnessApprovedBy, 'owner-1');
});

test('SENT-412-30a: lockfile, .npmrc, test config, hooks also count; ordinary source does not', () => {
  for (const f of ['package-lock.json', '.npmrc', 'vitest.config.ts', 'jest.config.js', '.mocharc.json', '.husky/pre-commit', 'sub/package.json', 'node_modules/x/index.js']) {
    const { root, m } = setup(); mkdirSync(path.dirname(path.join(m.repo.worktree, f)), { recursive: true }); writeFileSync(path.join(m.repo.worktree, f), 'x');
    assert.equal(last(A.runCommandStep(m.id, 'test', ['true'], { root })).reason, 'test_harness_changed', f);
  }
  const { root, m } = setup(); writeFileSync(path.join(m.repo.worktree, 'sum.js'), 'x');
  assert.equal(last(A.runCommandStep(m.id, 'test', ['true'], { root })).status, 'succeeded');
});

test('SENT-412-30b: test step runs under bwrap — no real HOME, no network, only the work tree writable', { skip: !A.sandboxAvailable() && 'bwrap unavailable' }, async () => {
  const srv = createServer(s => s.end('hi')); await new Promise(r => srv.listen(0, '127.0.0.1', r)); const port = srv.address().port;
  const { root, m } = setup({ scripts: { test: 'node probe.js' } });
  writeFileSync(path.join(m.repo.worktree, 'probe.js'), `const os=require("os"),fs=require("fs"),net=require("net");
console.log("REALHOME", fs.existsSync(os.userInfo().homedir + "/.codex") ? "VISIBLE" : "hidden");
try { fs.writeFileSync("${path.join(root, 'outside.txt')}", "x"); console.log("OUTSIDE written"); } catch { console.log("OUTSIDE denied"); }
const s = net.connect(${port}, "127.0.0.1"); s.on("data", () => { console.log("NET open"); process.exit(0); }); s.on("error", () => { console.log("NET closed"); process.exit(0); });`);
  execFileSync('git', ['-C', m.repo.worktree, 'add', '-A']); execFileSync('git', ['-C', m.repo.worktree, '-c', 'user.email=a@b', '-c', 'user.name=a', 'commit', '-qm', 'probe']);
  const mm = A.loadMission(m.id, root); mm.repo.headSha = execFileSync('git', ['-C', m.repo.worktree, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); mm.repo.baseSha = mm.repo.headSha;
  writeFileSync(path.join(A.missionDir(m.id, root), 'mission.json'), JSON.stringify(mm));
  const r = A.runCommandStep(m.id, 'test', ['npm', 'test'], { root }); srv.close();
  const log = A.readArtifact(m.id, r.artifacts.at(-1).id, root).content.toString();
  assert.equal(last(r).sandbox, 'bwrap', log);
  assert.match(log, /REALHOME hidden/); assert.match(log, /NET closed/); assert.ok(!existsSync(path.join(root, 'outside.txt')), 'host file outside the work tree not written');
  assert.equal(last(r).status, 'succeeded', log);
});

test('412-32/33: branch already taken → branch_in_use, no mission dir left; prune keeps the repo clean', () => {
  const { root, repo, m } = setup();
  const before = readdirSync(root).length;
  execFileSync('git', ['-C', repo, 'branch', 'atelier/fixed000']);
  assert.throws(() => A.createMission({ title: 'T', need: 'n', repoPath: repo, modelId: 'm' }, root, { branch: 'atelier/fixed000' }), /branch_in_use/);
  assert.equal(readdirSync(root).length, before, 'no leftover mission dir');
  A.closeMission(m.id, root);
  assert.ok(!existsSync(m.repo.worktree)); assert.equal(execFileSync('git', ['-C', repo, 'worktree', 'list', '--porcelain'], { encoding: 'utf8' }).match(/^worktree /gm).length, 1);
});

test('412-34: quarantine never touches refs/stash (git stash create + named ref)', async () => {
  const { root, repo, m } = setup();
  writeFileSync(path.join(m.repo.worktree, 'new.txt'), 'n'); writeFileSync(path.join(m.repo.worktree, 'package.json'), '{}');
  const s = { id: '00000000-0000-4000-8000-000000000001' };
  A.quarantine(m, s);
  assert.equal(spawnSync('git', ['-C', repo, 'rev-parse', '-q', '--verify', 'refs/stash']).status, 1, 'refs/stash untouched');
  assert.equal(s.quarantineRef, `refs/atelier/quarantine/${m.id}/${s.id}`);
  assert.equal(execFileSync('git', ['-C', m.repo.worktree, 'status', '--porcelain'], { encoding: 'utf8' }), '');
  assert.equal(execFileSync('git', ['-C', repo, 'show', `${s.quarantineRef}:new.txt`], { encoding: 'utf8' }), 'n');
  assert.equal(execFileSync('git', ['-C', repo, 'show', `${s.quarantineRef}:package.json`], { encoding: 'utf8' }), '{}');
});

test('412-35: a symlink leaving the work tree → refused before any step', () => {
  const { root, m } = setup();
  symlinkSync(tmpdir(), path.join(m.repo.worktree, 'escape'));
  assert.throws(() => A.assertNoEscapingSymlink(A.workPath(m)), /repo_symlink_escape/);
  assert.throws(() => A.runCommandStep(m.id, 'test', ['true'], { root }), /repo_symlink_escape/);
});

test('412-35: Grep/Glob are denied on credential dirs too', () => {
  const a = A.agentInvocation('claude-code', 'm', null).args; const denied = a[a.indexOf('--disallowedTools') + 1].split(',');
  for (const d of ['Grep(~/.claude/**)', 'Glob(~/.claude/**)', 'Grep(~/.codex/**)', 'Glob(~/.codex/**)']) assert.ok(denied.includes(d), d);
});

test('412-30 (Ronny): agent denied Edit/Write on package.json, lockfiles, .npmrc; test step env holds no real credentials', () => {
  const deny = A.agentInvocation('claude-code', 'm', null).args.at(A.agentInvocation('claude-code', 'm', null).args.indexOf('--disallowedTools') + 1).split(',');
  for (const f of ['package.json', '**/package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', '.npmrc', '**/.npmrc'])
    for (const t of ['Edit', 'Write']) assert.ok(deny.includes(`${t}(${f})`), `${t}(${f})`);
  const root = mkdtempSync(path.join(tmpdir(), 'h-env-'));
  const e = A.commandStepEnvironment('11111111-1111-4111-8111-111111111111', root, { PATH: '/bin', HOME: '/home/real', ANTHROPIC_API_KEY: 'k', OPENAI_API_KEY: 'k', GH_TOKEN: 't', AWS_SECRET_ACCESS_KEY: 's', NPM_TOKEN: 'n' });
  assert.notEqual(e.HOME, '/home/real');
  assert.deepEqual(Object.keys(e).filter(k => /KEY|TOKEN|SECRET/i.test(k)), []);
});

test('412-31 (Ronny): pre-launch refusal = API key / paid switch in env, or apiKeyHelper in loaded settings — not auth status', () => {
  const never = () => { throw new Error('auth status must not decide'); };
  assert.throws(() => A.assertSubscriptionOnly('claude-code', { PATH: '/bin', ANTHROPIC_API_KEY: 'k' }, never), /api_key_present/);
  assert.throws(() => A.assertSubscriptionOnly('claude-code', { PATH: '/bin', CLAUDE_CODE_USE_BEDROCK: '1' }, never), /api_key_present/);
  assert.doesNotThrow(() => A.assertClaudeLoadedSettings(A.agentInvocation('claude-code', 'm', null).args));
  assert.throws(() => A.assertClaudeLoadedSettings(['--setting-sources', '', '--settings', '{"apiKeyHelper":"/bin/echo sk"}']), /subscription_auth_required/);
  assert.throws(() => A.assertClaudeLoadedSettings(['--settings', '{}']), /subscription_auth_required/, 'user/project settings not disabled');
});
