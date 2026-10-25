// Explicit operator smoke only. Never invoked by npm test or smoke:joris.
import { createJiti } from 'jiti';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(root, 'src'), 'server-only': path.join(root, 'src/__server-only-noop.js') } });
const { runSubscriptionTurn, subscriptionEnvironment } = await jiti.import('../../server/ai/subscription-runtime.ts');
const { loadSubscriptionCatalog, subscriptionOptions } = await jiti.import('../../server/ai/subscription-catalog.ts');
const runtimeId = process.argv[2];
if (!['codex', 'claude-code'].includes(runtimeId)) throw new Error('Usage: node src/scripts/smoke/subscription-runtime-turn.mjs codex|claude-code [modelId|--check-help]');
if (process.argv[3] === '--check-help') {
  const result = spawnSync(runtimeId === 'codex' ? 'codex' : 'claude', runtimeId === 'codex' ? ['exec', '--help'] : ['--help'], { env: subscriptionEnvironment(process.env), encoding: 'utf8', timeout: 10000 });
  console.log(result.stdout || 'CLI help unavailable');
  process.exit(result.status === 0 ? 0 : 1);
}
const catalog = await loadSubscriptionCatalog();
const selection = subscriptionOptions(catalog).find(option => option.runtimeId === runtimeId && (!process.argv[3] || option.modelId === process.argv[3]));
if (!selection) throw new Error('Runtime/model absent from catalog');
const result = await runSubscriptionTurn(selection, 'Réponds seulement OK.', catalog);
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.status === 'completed' ? 0 : 1;
