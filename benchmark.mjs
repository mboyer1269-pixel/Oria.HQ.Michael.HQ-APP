import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = __dirname;

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
  },
});

const surfacePath = path.join(projectRoot, "src/server/ai/hq-model-catalog.ts");
const { loadHqModelCatalog } = await jiti.import(surfacePath);

const NOW = Date.now();
let delay = 100;
async function runBenchmark() {
    const start = performance.now();
    await loadHqModelCatalog({
        nowMs: NOW,
        authorize: async () => null,
        readCache: () => null,
        transport: async (url) => {
            // delay to simulate network latency
            await new Promise(resolve => setTimeout(resolve, delay));
            return { status: 200, body: { data: [] } };
        }
    });
    const end = performance.now();
    console.log(`Time taken: ${end - start} ms`);
}
runBenchmark();
