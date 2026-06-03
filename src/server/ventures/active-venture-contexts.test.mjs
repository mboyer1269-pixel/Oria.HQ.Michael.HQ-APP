#!/usr/bin/env node

// src/server/ventures/active-venture-contexts.test.mjs

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

test("Active venture contexts (CEO-driven sourcing)", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mod = await jiti.import(path.join(__dirname, "active-venture-contexts.ts"));
  const {
    ACTIVE_VENTURE_STATUSES,
    isActiveVenture,
    ventureCardToContext,
    selectActiveVentureContexts,
    listActiveVentureContextsForWorkspace,
  } = mod;

  function card(overrides = {}) {
    return {
      id: overrides.id ?? "venture-1",
      name: overrides.name ?? "Suivia",
      description: overrides.description ?? "AI weekly briefings for aesthetic clinics.",
      source: "human_created",
      status: overrides.status ?? "operating",
      targetCustomer: overrides.targetCustomer ?? "Aesthetic clinic owners in QC/ON",
      problem: "Manual patient follow-up loses revenue.",
      offer: "Done-for-you weekly briefing.",
      primaryChannel: "email",
      autonomyProfile: { rules: [] },
      assignedAgents: [],
      decisions: [],
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    };
  }

  await t.test("active status set excludes terminal/early states", () => {
    assert.ok(ACTIVE_VENTURE_STATUSES.has("operating"));
    assert.ok(ACTIVE_VENTURE_STATUSES.has("validating"));
    assert.equal(ACTIVE_VENTURE_STATUSES.has("killed"), false);
    assert.equal(ACTIVE_VENTURE_STATUSES.has("archived"), false);
    assert.equal(ACTIVE_VENTURE_STATUSES.has("paused"), false);
    assert.equal(ACTIVE_VENTURE_STATUSES.has("discovered"), false);
  });

  await t.test("isActiveVenture reflects status", () => {
    assert.equal(isActiveVenture(card({ status: "operating" })), true);
    assert.equal(isActiveVenture(card({ status: "killed" })), false);
  });

  await t.test("maps a card to a non-sensitive context", () => {
    const ctx = ventureCardToContext(card({ id: "suivia", status: "validating" }));
    assert.equal(ctx.ventureId, "suivia");
    assert.equal(ctx.name, "Suivia");
    assert.equal(ctx.targetMarket, "Aesthetic clinic owners in QC/ON");
    assert.equal(ctx.currentStage, "validating");
    // No secrets / scores leak into the context.
    assert.equal("score" in ctx, false);
    assert.equal("autonomyProfile" in ctx, false);
  });

  await t.test("selects + projects only active ventures, preserving order", () => {
    const cards = [
      card({ id: "a", status: "operating" }),
      card({ id: "b", status: "killed" }),
      card({ id: "c", status: "validating" }),
    ];
    assert.deepEqual(selectActiveVentureContexts(cards).map((c) => c.ventureId), ["a", "c"]);
  });

  await t.test("resolver prefers the ventures repo when active ventures exist", async () => {
    const result = await listActiveVentureContextsForWorkspace("ws1", {
      listVentures: async () => [card({ id: "live-1", status: "operating" })],
    });
    assert.equal(result.source, "ventures_repo");
    assert.equal(result.contexts.length, 1);
    assert.equal(result.contexts[0].ventureId, "live-1");
  });

  await t.test("resolver falls back to the seed when no active ventures", async () => {
    const result = await listActiveVentureContextsForWorkspace("ws1", {
      listVentures: async () => [card({ id: "dead", status: "killed" })],
    });
    assert.equal(result.source, "seed");
    assert.ok(result.contexts.length > 0, "seed is non-empty");
  });

  await t.test("resolver falls back to the seed on repository error (never throws)", async () => {
    const result = await listActiveVentureContextsForWorkspace("ws1", {
      listVentures: async () => { throw new Error("ventures table missing"); },
    });
    assert.equal(result.source, "seed");
    assert.ok(result.contexts.length > 0);
  });

  await t.test("resolver falls back to the seed when repo returns empty", async () => {
    const result = await listActiveVentureContextsForWorkspace("ws1", {
      listVentures: async () => [],
    });
    assert.equal(result.source, "seed");
  });
});
