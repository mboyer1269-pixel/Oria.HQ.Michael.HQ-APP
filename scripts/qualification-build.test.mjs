import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(join(root, 'vercel.qualification.json'), 'utf8'));
// Execute the actual selected config command and real guard in an isolated copy.
// Only npm's final build subprocess is replaced: no Vercel, DB or credentials.
function invoke(overrides = {}, { exitCode = 0, openFlag = false } = {}) {
  assert.deepEqual(config, {
    $schema: 'https://openapi.vercel.sh/vercel.json',
    framework: 'nextjs',
    buildCommand: 'node scripts/qualification-preview.mjs --build',
  });
  const directory = mkdtempSync(join(tmpdir(), 'oria-qualification-build-'));
  try {
    for (const file of ['scripts/qualification-preview.mjs', 'src/server/agents/display-names/flag.ts', 'src/server/employees/flag.ts']) {
      mkdirSync(dirname(join(directory, file)), { recursive: true });
      copyFileSync(join(root, file), join(directory, file));
    }
    if (openFlag) writeFileSync(join(directory, 'src/server/employees/flag.ts'), 'export const EMPLOYEE_DIRECTORY_LIVE = true;');
    const bin = join(directory, 'bin');
    mkdirSync(bin);
    const marker = join(directory, 'build-called.json');
    writeFileSync(join(bin, 'npm'), `#!${process.execPath}\nimport fs from 'node:fs';\nfs.writeFileSync(${JSON.stringify(marker)}, JSON.stringify({args:process.argv.slice(2), mode:process.env.NODE_ENV}));\nprocess.exit(${exitCode});\n`, { mode: 0o700 });
    // No inheritance of caller secrets, dotenv files, proxy or cloud configuration.
    const env = { PATH: `${bin}:${dirname(process.execPath)}`, NEXT_PUBLIC_SUPABASE_URL: 'https://teatqbtzgzcygpefnfbh.supabase.co', VERCEL_ENV: 'preview', ...overrides };
    const [, ...args] = config.buildCommand.split(' ');
    const result = spawnSync(process.execPath, args, { cwd: directory, env, encoding: 'utf8', timeout: 5000 });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr, called: existsSync(marker) ? JSON.parse(readFileSync(marker, 'utf8')) : null };
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

test('selected qualification config runs real guard before the existing npm build', () => {
  const result = invoke();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.called, { args: ['run', 'build'], mode: 'production' });
});
test('selected qualification build rejects production target before npm starts', () => {
  for (const patch of [{ VERCEL_ENV: 'production' }, { VERCEL_TARGET_ENV: 'production' }, { NEXT_PUBLIC_SUPABASE_URL: 'https://cpwerynafcszwagroeek.supabase.co' }]) {
    const result = invoke(patch);
    assert.equal(result.status, 1);
    assert.equal(result.called, null);
  }
});
test('missing staging reference, integration credential or open feature flag prevents build', () => {
  for (const patch of [{ NEXT_PUBLIC_SUPABASE_URL: '' }, { OPENAI_API_KEY: 'synthetic-not-a-key' }]) {
    const result = invoke(patch);
    assert.equal(result.status, 1);
    assert.equal(result.called, null);
    assert.ok(!result.stderr.includes('synthetic-not-a-key'));
  }
  const opened = invoke({}, { openFlag: true });
  assert.equal(opened.status, 1);
  assert.equal(opened.called, null);
});
test('failure of admitted build remains a failure through the configured command', () => {
  const result = invoke({}, { exitCode: 7 });
  assert.equal(result.status, 7);
  assert.deepEqual(result.called, { args: ['run', 'build'], mode: 'production' });
});

for (const key of [
  'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY',
  'ELEVENLABS_API_KEY', 'OPENROUTER_API_KEY', 'RESEND_API_KEY', 'NARA_API_KEY',
]) {
  test(`configured build refuses ${key} before npm and redacts output`, () => {
    const value = `synthetic-private-value-for-${key}`;
    const result = invoke({ [key]: value });
    assert.equal(result.status, 1);
    assert.equal(result.called, null);
    assert.equal(result.stderr.trim(), `Remove integration setting ${key} from the qualification build environment.`);
    assert.ok(!`${result.stdout}${result.stderr}`.includes(value));
  });
}
