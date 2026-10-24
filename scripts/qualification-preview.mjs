#!/usr/bin/env node
/** Opt-in build preflight. No network, deployment, credential validation or activation. */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const STAGING_REF = 'teatqbtzgzcygpefnfbh';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FLAGS = [
  ['src/server/agents/display-names/flag.ts', 'AGENT_DISPLAY_NAMES_LIVE'],
  ['src/server/employees/flag.ts', 'EMPLOYEE_DIRECTORY_LIVE'],
];
const DOTENV = ['.env', '.env.local', '.env.production', '.env.production.local'];
const FORBIDDEN = /^(?:ANTHROPIC_|OPENAI_|OPENROUTER_|GEMINI_|GOOGLE_API_KEY$|GOOGLE_GENERATIVE_AI_API_KEY$|ELEVENLABS_API_KEY$|RESEND_|STRIPE_|INNGEST_|UPSTASH_|OPENHANDS_|MEMEX_|ORIA_ENABLE_|HQ_MISSION_|MISSION_DURABLE_|N8N_|NARA_|AGENTMEMORY_|AGENT_WEBHOOK_|GATEWAY_|DATABASE_URL$|DIRECT_URL$|SUPABASE_DB_URL$|CRON_SECRET$)/;

export function validateQualificationPreview(env, { root = ROOT, exists = existsSync, read = readFileSync } = {}) {
  const failures = [];
  // Values are never included in diagnostics. These checks do not authenticate keys.
  if (env.VERCEL_ENV && env.VERCEL_ENV !== 'preview') failures.push('Vercel target must be preview.');
  if (env.VERCEL_TARGET_ENV && env.VERCEL_TARGET_ENV !== 'preview') failures.push('Vercel target environment must be preview.');
  const expected = `https://${STAGING_REF}.supabase.co`;
  if (env.NEXT_PUBLIC_SUPABASE_URL !== expected) failures.push('NEXT_PUBLIC_SUPABASE_URL must match the qualification staging URL exactly.');
  for (const key of ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PROJECT_URL']) {
    if (env[key] !== undefined && env[key] !== expected) failures.push(`${key} conflicts with staging.`);
  }
  for (const key of ['SUPABASE_PROJECT_REF', 'SUPABASE_PROJECT_ID', 'NEXT_PUBLIC_SUPABASE_PROJECT_REF']) {
    if (env[key] !== undefined && env[key] !== STAGING_REF) failures.push(`${key} conflicts with staging.`);
  }
  for (const key of Object.keys(env)) {
    if (FORBIDDEN.test(key) && env[key]) failures.push(`Remove integration setting ${key} from the qualification build environment.`);
  }
  for (const file of DOTENV) {
    // Do not open dotenv files: Next could load unvalidated configuration from them.
    if (exists(resolve(root, file))) failures.push(`Next-loadable ${file} must be absent; its contents were not read.`);
  }
  for (const [file, name] of FLAGS) {
    try {
      const source = read(resolve(root, file), 'utf8');
      // Reject any executable additions as well as a simple false -> true change.
      const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '').trim();
      const expectedSource = name === 'AGENT_DISPLAY_NAMES_LIVE'
        ? `export const ${name} = false;\nexport function isAgentDisplayNameStorageEnabled(): boolean {\n  return ${name};\n}`
        : `export const ${name} = false;`;
      if (stripped.replace(/\s+/g, '') !== expectedSource.replace(/\s+/g, '')) failures.push(`${name} must retain its reviewed closed implementation.`);
    } catch {
      failures.push(`Cannot verify ${name}; refusing qualification build.`);
    }
  }
  return failures;
}

export function runQualificationPreview({ mode, env, root = ROOT, spawn = spawnSync, inspect } = {}) {
  if (!['--check', '--build'].includes(mode)) return { status: 2, failures: ['Use --check or --build explicitly.'] };
  const failures = validateQualificationPreview(env, { root, ...inspect });
  if (failures.length) return { status: 1, failures };
  if (mode === '--check') return { status: 0, failures: [] };
  const result = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
    cwd: root, env: { ...env, NODE_ENV: 'production' }, stdio: 'inherit', shell: false,
  });
  return { status: Number.isInteger(result.status) ? result.status : 1, failures: result.error || result.signal ? ['Build did not complete successfully.'] : [] };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = process.argv.length === 3
    ? runQualificationPreview({ mode: process.argv[2], env: process.env })
    : { status: 2, failures: ['Use exactly one argument: --check or --build.'] };
  for (const failure of result.failures) console.error(failure);
  if (result.status === 0) console.log('Qualification build guard passed; no persistence, authentication or deployment is qualified.');
  process.exitCode = result.status;
}
