import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(__dirname, "src"),
  },
});
const { syncPublicInventory } = await jiti.import("./src/server/inventory/public-inventory-sync.ts");
const { checkPublicInventoryUrl } = await jiti.import("./src/server/inventory/public-inventory-allowlist.ts");

async function run() {
  const urls = Array.from({ length: 20 }, (_, i) => `https://www.buckinghamgm.com/neufs/inventaire/recherche.html?page=${i}`);

  // mock fetchImpl to simulate network delay
  const mockFetch = async (url) => {
    await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay
    return new Response(
      `<html><body><div class="vehicle-card" data-stock="STOCK${url}"><span class="make">Make</span><span class="model">Model</span><span class="year">2024</span><span class="price">20000</span></div></body></html>`,
      { status: 200, headers: { "content-type": "text/html" } }
    );
  };

  const start = performance.now();
  const res = await syncPublicInventory({
    workspaceId: "ws_benchmark",
    urls,
    nowIso: new Date().toISOString(),
    fetchImpl: mockFetch,
  });
  const end = performance.now();

  console.log(`Time taken: ${end - start}ms`);
}

run().catch(console.error);
