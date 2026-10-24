import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STAGING_REF, validateQualificationPreview, runQualificationPreview } from './qualification-preview.mjs';
const safe = { NEXT_PUBLIC_SUPABASE_URL: `https://${STAGING_REF}.supabase.co`, VERCEL_ENV: 'preview' };
const inspect = { exists: () => false };
const providerKeys = [
  'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY',
  'ELEVENLABS_API_KEY', 'OPENROUTER_API_KEY', 'RESEND_API_KEY', 'NARA_API_KEY',
];

test('provider regression table covers API keys declared by server-env without importing it', () => {
  // Read source declarations only: importing server-env parses real process.env.
  const source = readFileSync(new URL('../src/lib/server-env.ts', import.meta.url), 'utf8');
  const schema = source.split('const serverEnvSchema = z.object({')[1]?.split('\n});')[0];
  assert.ok(schema, 'server environment schema must be identifiable');
  const declared = [...schema.matchAll(/^\s+([A-Z_]+_API_KEY):/gm)].map(match => match[1]);
  assert.deepEqual(declared.sort(), [...providerKeys].sort());
});

for (const key of providerKeys) {
  test(`declared provider ${key} refuses before build and redacts its value`, () => {
    let called = false;
    const value = `synthetic-private-value-for-${key}`;
    const result = runQualificationPreview({
      mode: '--build', env: { ...safe, [key]: value }, inspect,
      spawn: () => { called = true; return { status: 0 }; },
    });
    assert.equal(result.status, 1);
    assert.equal(called, false);
    assert.deepEqual(result.failures, [`Remove integration setting ${key} from the qualification build environment.`]);
    assert.ok(!JSON.stringify(result).includes(value));
  });
}

test('valid staging and checked-in closed flags pass without credentials', () => {
  assert.deepEqual(validateQualificationPreview(safe, inspect), []);
});
for (const [name, extra] of [
  ['missing URL', { NEXT_PUBLIC_SUPABASE_URL: undefined }],
  ['production URL', { NEXT_PUBLIC_SUPABASE_URL: 'https://cpwerynafcszwagroeek.supabase.co' }],
  ['lookalike host', { NEXT_PUBLIC_SUPABASE_URL: `https://${STAGING_REF}.supabase.co.attacker.invalid` }],
  ['URL credentials', { NEXT_PUBLIC_SUPABASE_URL: `https://someone@${STAGING_REF}.supabase.co` }],
  ['conflicting URL', { SUPABASE_URL: 'https://cpwerynafcszwagroeek.supabase.co' }],
  ['conflicting reference', { SUPABASE_PROJECT_REF: 'cpwerynafcszwagroeek' }],
  ['production target', { VERCEL_ENV: 'production' }],
  ['custom target', { VERCEL_TARGET_ENV: 'production' }],
  ['provider configuration', { ANTHROPIC_API_KEY: 'synthetic-not-a-key' }],
  ['direct database connection', { DATABASE_URL: 'synthetic-not-a-connection' }],
]) {
  test(`${name} refuses before spawning build`, () => {
    let called = false;
    const result = runQualificationPreview({ mode: '--build', env: { ...safe, ...extra }, inspect, spawn: () => { called = true; } });
    assert.equal(result.status, 1); assert.equal(called, false);
    assert.equal(result.failures.join('\n').includes('synthetic-not'), false);
  });
}
test('dotenv presence refused without reading its contents', () => {
  const reads = [];
  const result = validateQualificationPreview(safe, { exists: () => true, read: (p) => { reads.push(p); return ''; } });
  assert.equal(result.filter(x => x.includes('Next-loadable')).length, 4);
  assert.ok(reads.every(x => x.endsWith('/flag.ts')));
});
test('changed feature flag refuses', () => {
  assert.ok(validateQualificationPreview(safe, { ...inspect, read: () => 'export const EMPLOYEE_DIRECTORY_LIVE = true;' }).length);
});
test('explicit check never builds; implicit mode refused', () => {
  const spawn = () => { throw Error('unexpected build'); };
  assert.equal(runQualificationPreview({ mode: '--check', env: safe, inspect, spawn }).status, 0);
  assert.equal(runQualificationPreview({ env: safe, inspect, spawn }).status, 2);
});
test('explicit build invokes existing build once and preserves its failure', () => {
  let count = 0;
  const result = runQualificationPreview({ mode: '--build', env: safe, inspect, spawn: (command, args, options) => {
    count++; assert.ok(command.startsWith('npm')); assert.deepEqual(args, ['run', 'build']);
    assert.equal(options.shell, false); assert.equal(options.env.NODE_ENV, 'production');
    return { status: 7 };
  } });
  assert.equal(count, 1); assert.equal(result.status, 7);
});
test('interrupted build fails closed', () => {
  assert.equal(runQualificationPreview({ mode: '--build', env: safe, inspect, spawn: () => ({ status: null, signal: 'SIGTERM' }) }).status, 1);
});
