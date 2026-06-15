import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseFreeModelCatalogText,
  type FreeModelEntry,
} from "@/server/ai/cost-ladder";

// ---------------------------------------------------------------------------
// Free-model catalog loader (server-only). Reads the config snapshot produced
// by the Model Market Watch and parses it into a typed catalog the Cost Ladder
// can consume. Kept out of cost-ladder.ts and model-router.ts so those stay
// pure / node-free. Resilient: a missing or malformed file yields [], which
// simply disables the free rung (the ladder degrades to economy).
// ---------------------------------------------------------------------------

const CONFIG_RELATIVE_PATH = "config/openrouter.free-models.json";

let cached: FreeModelEntry[] | null = null;

/** Reads + parses the free-model catalog from disk. Cached after first read. */
export function loadFreeModelCatalog(): FreeModelEntry[] {
  if (cached) return cached;
  cached = readFreeModelCatalog();
  return cached;
}

/** Uncached read — used by the doctor organ to validate the live file. */
export function readFreeModelCatalog(): FreeModelEntry[] {
  try {
    const raw = readFileSync(join(process.cwd(), CONFIG_RELATIVE_PATH), "utf-8");
    return parseFreeModelCatalogText(raw);
  } catch {
    return [];
  }
}

/** Clears the cache (tests / after a Market Watch refresh). */
export function resetFreeModelCatalogCache(): void {
  cached = null;
}
