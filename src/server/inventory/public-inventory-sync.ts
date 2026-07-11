// src/server/inventory/public-inventory-sync.ts
//
// Fetch allowlisted public inventory HTML → parse → replace in-memory snapshot.
// No credentials. Failures surface as structured errors (manual ingest remains available).

import type { InventorySnapshot, VehicleStock } from "@/features/inventory/vehicle-stock";
import {
  BUCKINGHAM_DEFAULT_INVENTORY_URLS,
  checkPublicInventoryUrl,
} from "./public-inventory-allowlist";
import { parseBuckinghamInventoryHtml } from "./buckingham-html-parser";
import { setInventorySnapshot } from "./inventory-store";

export type PublicInventorySyncInput = {
  workspaceId: string;
  urls?: string[];
  nowIso?: string;
  fetchImpl?: typeof fetch;
  userAgent?: string;
};

export type PublicInventorySyncResult =
  | {
      ok: true;
      snapshot: InventorySnapshot;
      fetchedUrls: string[];
      vehicleCount: number;
      warnings: string[];
    }
  | { ok: false; errors: string[]; warnings: string[] };

const DEFAULT_UA = "OriaHQ-InventorySync/1.0 (+https://oria.local; public-read-only)";

async function fetchHtml(
  url: string,
  fetchImpl: typeof fetch,
  userAgent: string,
): Promise<{ ok: true; html: string } | { ok: false; error: string }> {
  try {
    const res = await fetchImpl(url, {
      method: "GET",
      headers: {
        "user-agent": userAgent,
        accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status} for ${url}` };
    }
    const html = await res.text();
    if (!html || html.length < 200) {
      return { ok: false, error: `empty/short body for ${url}` };
    }
    return { ok: true, html };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `fetch failed for ${url}: ${message}` };
  }
}

function mergeVehicles(batches: VehicleStock[][]): VehicleStock[] {
  const byId = new Map<string, VehicleStock>();
  for (const batch of batches) {
    for (const v of batch) {
      const prior = byId.get(v.stockId);
      if (!prior) {
        byId.set(v.stockId, v);
        continue;
      }
      byId.set(v.stockId, {
        ...prior,
        ...v,
        photoUrls: [...new Set([...prior.photoUrls, ...v.photoUrls])],
        notes: [prior.notes, v.notes].filter(Boolean).join(" | ") || undefined,
      });
    }
  }
  return [...byId.values()];
}

/**
 * Sync public inventory pages into the in-memory snapshot.
 */
export async function syncPublicInventory(
  input: PublicInventorySyncInput,
): Promise<PublicInventorySyncResult> {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const fetchImpl = input.fetchImpl ?? fetch;
  const userAgent = input.userAgent ?? DEFAULT_UA;
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!input.workspaceId?.trim()) {
    return { ok: false, errors: ["workspaceId must be non-empty"], warnings };
  }

  const rawUrls = input.urls?.length ? input.urls : [...BUCKINGHAM_DEFAULT_INVENTORY_URLS];
  const urls: string[] = [];
  for (const raw of rawUrls) {
    const check = checkPublicInventoryUrl(raw);
    if (!check.ok || !check.normalizedUrl) {
      errors.push(`URL rejected: ${raw} (${check.reason})`);
      continue;
    }
    urls.push(check.normalizedUrl);
  }

  if (urls.length === 0) {
    return { ok: false, errors: errors.length ? errors : ["no URLs to fetch"], warnings };
  }

  const batches: VehicleStock[][] = [];
  const fetchedUrls: string[] = [];

  for (const url of urls) {
    const fetched = await fetchHtml(url, fetchImpl, userAgent);
    if (!fetched.ok) {
      errors.push(fetched.error);
      continue;
    }
    fetchedUrls.push(url);
    const parsed = parseBuckinghamInventoryHtml(fetched.html, url);
    warnings.push(...parsed.parseWarnings.map((w) => `${url}: ${w}`));
    if (parsed.vehicles.length === 0) {
      warnings.push(`${url}: 0 vehicles parsed (cards=${parsed.cardCount})`);
    }
    batches.push(parsed.vehicles);
  }

  const vehicles = mergeVehicles(batches);
  if (vehicles.length === 0) {
    return {
      ok: false,
      errors: [...errors, "no vehicles parsed from allowlisted pages"],
      warnings,
    };
  }

  const snapshot: InventorySnapshot = {
    snapshotId: `inv_public_${input.workspaceId}_${nowIso.replace(/[:.]/g, "")}`,
    workspaceId: input.workspaceId.trim(),
    source: "public_fetch",
    capturedAt: nowIso,
    vehicles,
  };

  setInventorySnapshot(snapshot);

  return {
    ok: true,
    snapshot,
    fetchedUrls,
    vehicleCount: vehicles.length,
    warnings: [...warnings, ...errors.map((e) => `non-fatal: ${e}`)].filter(Boolean),
  };
}
