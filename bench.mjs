import { performance } from 'node:perf_hooks';
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname);

import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
  },
});
const mod = await jiti.import(path.join(projectRoot, "src/server/decision-spine/collect-decision-signals.ts"));
const { collectDecisionSignalSnapshot } = mod;

async function runBench() {
  const numCandidates = 100;
  const candidates = Array.from({ length: numCandidates }, (_, i) => ({
    action: { id: `action_${i}`, idempotencyKey: `key_${i}` }
  }));

  const deps = {
    loadPipeline: () => null,
    listCandidates: () => candidates,
    getOutcome: async (key) => {
      // Simulate network delay
      await new Promise(r => setTimeout(r, 10));
      return { status: "pending" };
    },
    listLedger: async () => ({ entries: [] }),
    now: () => new Date().toISOString(),
  };

  const start = performance.now();
  await collectDecisionSignalSnapshot({ workspaceId: "ws1", deps });
  const end = performance.now();

  console.log(`Execution time for ${numCandidates} candidates: ${end - start} ms`);
}

runBench().catch(console.error);
