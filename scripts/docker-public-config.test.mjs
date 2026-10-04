import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validatePublicBuildConfig } from './check-docker-public-env.mjs';
const config = { NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_synthetic' };
const jwt = role => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({role})).toString('base64url')}.synthetic`;
test('accepts explicit public configuration and legacy anon role', () => {
  assert.doesNotThrow(() => validatePublicBuildConfig(config));
  assert.doesNotThrow(() => validatePublicBuildConfig({...config, NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt('anon')}));
});
test('rejects missing, stub and privileged build credentials', () => {
  for (const key of ['', 'stub', 'sb_secret_synthetic', jwt('service_role')]) {
    assert.throws(() => validatePublicBuildConfig({...config, NEXT_PUBLIC_SUPABASE_ANON_KEY:key}));
  }
  for (const url of ['', 'http://localhost', 'https://localhost', 'https://user:pass@example.com', 'https://example.com?secret=x']) {
    assert.throws(() => validatePublicBuildConfig({...config, NEXT_PUBLIC_SUPABASE_URL:url}));
  }
});
test('Docker checks build arguments before Next and excludes environment files', () => {
  const docker = fs.readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');
  assert.match(docker, /ARG NEXT_PUBLIC_SUPABASE_URL\r?\nARG NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  assert.match(docker, /node scripts\/check-docker-public-env.mjs && npm run build/);
  assert.ok(!docker.includes('ANON_KEY=stub'));
  const ignore = fs.readFileSync(new URL('../.dockerignore', import.meta.url), 'utf8').split(/\r?\n/);
  assert.ok(ignore.includes('.env*') && ignore.includes('**/.env*'));
});
