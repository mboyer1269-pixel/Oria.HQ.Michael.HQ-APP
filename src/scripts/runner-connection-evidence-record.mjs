#!/usr/bin/env node
/** Operator-host only. Thin wrapper around recordFromLiveRunnerProbe, which
 * owns the real logic (single binding read, canonical runner/policy
 * resolution, checked-before-probe timestamp, persistence). Must never run
 * on HQ's own public server process. Inherits whatever SSH identity,
 * ORIA_OPENHANDS_LAUNCH_CONFIG, and Supabase admin environment this host
 * already has configured.
 *
 * Usage:
 *   ORIA_OPENHANDS_RUNNER_PROBE_CONFIG_FILE=/path/to/binding.json \
 *   ORIA_OPENHANDS_LAUNCH_CONFIG='{...}' \
 *   node src/scripts/runner-connection-evidence-record.mjs <workspaceId> <recordedBy>
 */
import path from 'node:path';
import { createJiti } from 'jiti';

try {
  if (process.argv.length !== 4) throw new Error('usage: runner-connection-evidence-record.mjs <workspaceId> <recordedBy>');
  const [, , workspaceId, recordedBy] = process.argv;

  const root = path.resolve(import.meta.dirname, '..', '..');
  const jiti = createJiti(import.meta.url, {
    alias: { '@': path.join(root, 'src'), 'server-only': path.join(root, 'src/scripts/smoke/server-only-stub.mjs') },
  });

  const { recordFromLiveRunnerProbe } = await jiti.import('../server/agents/models/runner-connection-evidence.ts');
  const result = await recordFromLiveRunnerProbe(workspaceId, recordedBy);
  process.stdout.write(JSON.stringify(result) + '\n');
  if (result.status !== 'recorded') process.exitCode = 3;
} catch (error) {
  process.stdout.write(JSON.stringify({ status: 'rejected', reason: 'unexpected failure' }) + '\n');
  process.exitCode = 2;
  void error;
}
