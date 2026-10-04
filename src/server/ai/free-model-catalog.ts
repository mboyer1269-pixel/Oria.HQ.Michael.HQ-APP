import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseFreeModelCatalog,
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

export type FreeModelCatalogSnapshot = {
  /** File timestamp. Never rewritten to "now". */
  generatedAt: string | null;
  /** Gateway that owns this file. Absent means the snapshot must not be attributed. */
  provider: string | null;
  entries: FreeModelEntry[];
};

let cachedSnapshot: FreeModelCatalogSnapshot | null = null;

function readSnapshotFromDisk(): FreeModelCatalogSnapshot {
  try {
    const raw = readFileSync(join(process.cwd(), CONFIG_RELATIVE_PATH), "utf-8");
    const withoutBom = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
    const json = JSON.parse(withoutBom) as { generated_at?: unknown; provider?: unknown };
    const generatedAt = typeof json.generated_at === "string" ? json.generated_at : null;
    const provider = typeof json.provider === "string" && json.provider.length > 0 ? json.provider : null;
    return { generatedAt, provider, entries: parseFreeModelCatalog(json) };
  } catch {
    return { generatedAt: null, provider: null, entries: [] };
  }
}

/** Cached snapshot, including the original generated_at. A later read does not refresh that date. */
export function loadFreeModelCatalogSnapshot(): FreeModelCatalogSnapshot {
  if (cachedSnapshot) return cachedSnapshot;
  cachedSnapshot = readSnapshotFromDisk();
  return cachedSnapshot;
}

/** Reads + parses the free-model catalog from disk. Cached after first read. */
export function loadFreeModelCatalog(): FreeModelEntry[] {
  return loadFreeModelCatalogSnapshot().entries;
}

/** Uncached read — used by the doctor organ to validate the live file. */
export function readFreeModelCatalog(): FreeModelEntry[] {
  return readSnapshotFromDisk().entries;
}

/** Clears the cache (tests / after a Market Watch refresh). */
export function resetFreeModelCatalogCache(): void {
  cachedSnapshot = null;
}
