#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..", "..");

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
  },
});

const mod = await jiti.import(path.join(__dirname, "marketplace-catalog.ts"));
const { browseMarketplaceCatalog, MARKETPLACE_CATALOG_SEED } = mod;

test("marketplace-catalog browse dry-run", async (t) => {
  await t.test("returns static seed with read-only invariants", () => {
    const snap = browseMarketplaceCatalog({ nowIso: "2026-07-11T12:00:00.000Z" });
    assert.equal(snap.source, "static_seed");
    assert.equal(snap.browseIsReadOnly, true);
    assert.equal(snap.liveOAuthAttached, false);
    assert.ok(snap.entries.length > 0);
    assert.ok(snap.entries.length < MARKETPLACE_CATALOG_SEED.length);
    assert.ok(snap.entries.every((e) => e.canSpend === false));
  });

  await t.test("filters by query", () => {
    const snap = browseMarketplaceCatalog({ query: "calendar", excludeSpend: false });
    assert.equal(snap.entries.length, 1);
    assert.equal(snap.entries[0].toolId, "calendar.read_events");
  });

  await t.test("readOnlyOnly excludes mutators", () => {
    const snap = browseMarketplaceCatalog({ readOnlyOnly: true, excludeSpend: false });
    assert.ok(snap.entries.every((e) => e.mutatesExternalState === false));
  });
});
