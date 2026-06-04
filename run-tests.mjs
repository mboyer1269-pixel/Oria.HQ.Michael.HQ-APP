/**
 * Cross-platform test runner.
 * Replaces the bare glob in npm test — PowerShell does not expand shell globs.
 * Uses Node 22+ fs.glob (no extra deps).
 */
import { glob } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const files = [];
for await (const f of glob('src/**/*.test.mjs')) {
  files.push(f);
}

if (files.length === 0) {
  console.error('No test files found.');
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  ['--test', ...files],
  { stdio: 'inherit' }
);

process.exit(result.status ?? 1);
