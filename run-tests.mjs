/**
 * Cross-platform test runner.
 * Replaces the bare glob in npm test — PowerShell does not expand shell globs.
 * Uses Node 22+ fs.glob (no extra deps).
 *
 * Two disjoint suites, split by filename convention:
 *
 *   *-gap.test.mjs  — WIRING TRIPWIRES. They assert that something already
 *                     built is actually called. Red on purpose while a gap is
 *                     open, and they turn green on their own once it is wired.
 *   everything else — the real suite.
 *
 * They are kept apart so `npm test` stays a trustworthy signal. A suite that is
 * permanently red stops being read, and a genuinely new failure would hide
 * among the known ones — the same "constant signal treated as no information"
 * failure mode the tripwires exist to prevent. `npm run test:gaps` reports open
 * gaps under their own name, where red means one specific, named thing.
 *
 *   node run-tests.mjs          → the real suite (must be green)
 *   node run-tests.mjs --gaps   → tripwires only (red until wired)
 */
import { glob } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const GAP_SUFFIX = '-gap.test.mjs';
const gapsOnly = process.argv.includes('--gaps');

const files = [];
for await (const f of glob('src/**/*.test.mjs')) {
  const isGap = f.replaceAll('\\', '/').endsWith(GAP_SUFFIX);
  if (isGap === gapsOnly) files.push(f);
}

if (files.length === 0) {
  if (gapsOnly) {
    // No tripwires is a legitimate end state: every tracked gap has been wired.
    console.log(`GAP CHECK — no ${GAP_SUFFIX} files. No wiring gaps are tracked.`);
    process.exit(0);
  }
  console.error('No test files found.');
  process.exit(1);
}

if (gapsOnly) {
  console.log(
    `GAP CHECK — ${files.length} tripwire file(s). ` +
      'A red result means a built module still has no caller.\n',
  );
}

const result = spawnSync(
  process.execPath,
  ['--test', ...files],
  { stdio: 'inherit' }
);

process.exit(result.status ?? 1);
