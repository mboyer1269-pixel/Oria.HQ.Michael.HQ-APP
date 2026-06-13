#!/usr/bin/env node

// HQ capability status contract — see docs/HQ_CAPABILITY_STATUS.md (audit P4a).
//
// Pins the registry's shape and, crucially, its HONESTY: the ledger hash-chain
// entry is tied to the real write flag, so the registry cannot claim a status
// that contradicts the actual runtime toggle. Flip the flag without updating
// the registry and this test fails.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

const VALID_STATUSES = ["live", "display_only", "shadow", "contract_only", "planned"];

test("HQ capability status contract (P4a)", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mod = await jiti.import(path.join(__dirname, "capability-status.ts"));
  const flagMod = await jiti.import(
    path.join(projectRoot, "src/server/ledger/hash-chain-write-flag.ts"),
  );
  const {
    HQ_CAPABILITIES,
    capabilityStatusLabel,
    getCapability,
    capabilitiesByStatus,
    capabilityStatusCounts,
  } = mod;
  const { isHashChainWriteEnabled } = flagMod;

  await t.test("every record is well-formed and ids are unique", () => {
    const ids = new Set();
    for (const c of HQ_CAPABILITIES) {
      assert.ok(typeof c.id === "string" && c.id.trim().length > 0, "id required");
      assert.ok(!ids.has(c.id), `duplicate capability id: ${c.id}`);
      ids.add(c.id);
      assert.ok(typeof c.label === "string" && c.label.trim().length > 0, `${c.id}: label required`);
      assert.ok(VALID_STATUSES.includes(c.status), `${c.id}: invalid status "${c.status}"`);
      assert.ok(typeof c.evidence === "string" && c.evidence.trim().length > 0, `${c.id}: evidence required`);
      assert.ok(typeof c.note === "string" && c.note.trim().length > 0, `${c.id}: note required`);
      assert.ok(c.surface === null || (typeof c.surface === "string" && c.surface.length > 0), `${c.id}: bad surface`);
    }
  });

  await t.test("status labels cover all five statuses", () => {
    for (const status of VALID_STATUSES) {
      assert.ok(capabilityStatusLabel(status).trim().length > 0, `no label for ${status}`);
    }
  });

  await t.test("counts sum to the registry size", () => {
    const counts = capabilityStatusCounts();
    const total = VALID_STATUSES.reduce((sum, s) => sum + counts[s], 0);
    assert.equal(total, HQ_CAPABILITIES.length);
    for (const status of VALID_STATUSES) {
      assert.equal(capabilitiesByStatus(status).length, counts[status], `byStatus mismatch for ${status}`);
    }
  });

  await t.test("HONESTY GUARD — ledger hash-chain status matches the real write flag", () => {
    const chain = getCapability("ledger_hash_chain");
    assert.ok(chain, "ledger_hash_chain capability must exist");
    const flagOn = isHashChainWriteEnabled(process.env);
    // The registry may only claim "live" when the write path is actually on.
    assert.equal(
      chain.status === "live",
      flagOn,
      `registry says "${chain.status}" but LEDGER_HASH_CHAIN_WRITE on=${flagOn} — update the registry`,
    );
    // Current reality: flag off by default → shadow.
    if (!flagOn) assert.equal(chain.status, "shadow");
  });

  await t.test("locked capabilities stay declared as planned", () => {
    const supabase = getCapability("memory_vault_supabase");
    assert.ok(supabase, "memory_vault_supabase must exist");
    assert.equal(supabase.status, "planned");
    assert.equal(supabase.surface, null);
  });
});
