#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
  },
});

const mod = await jiti.import(path.join(__dirname, "gm-model-knowledge.ts"));
const { lookupModelKnowledge, listKnowledgeForInventory, formatKnowledgeStudySheet } = mod;

test("GM model knowledge pack", async (t) => {
  await t.test("resolves Trax / TrailBlazer / Terrain / Bolt", () => {
    assert.equal(lookupModelKnowledge({ make: "Chevrolet", model: "Trax", year: 2026 })?.id, "chevrolet-trax");
    assert.equal(
      lookupModelKnowledge({ make: "Chevrolet", model: "Trailblazer", year: 2026 })?.id,
      "chevrolet-trailblazer",
    );
    assert.equal(lookupModelKnowledge({ make: "GMC", model: "Terrain", year: 2026 })?.id, "gmc-terrain");
    assert.equal(lookupModelKnowledge({ make: "Chevrolet", model: "Bolt EUV", year: 2027 })?.id, "chevrolet-bolt");
  });

  await t.test("lists knowledge for new inventory only", () => {
    const listed = listKnowledgeForInventory([
      { make: "Chevrolet", model: "Trax", year: 2026, condition: "new" },
      { make: "Chevrolet", model: "Trax", year: 2026, condition: "new" },
      { make: "GMC", model: "Terrain", year: 2026, condition: "new" },
      { make: "Chevrolet", model: "Trax", year: 2017, condition: "used" },
    ]);
    assert.equal(listed.length, 2);
    assert.equal(listed[0].card.model, "Trax");
    assert.equal(listed[0].vehicleCount, 2);
  });

  await t.test("study sheet includes must-know and walkaround", () => {
    const card = lookupModelKnowledge({ make: "Buick", model: "Envista", year: 2026 });
    assert.ok(card);
    const sheet = formatKnowledgeStudySheet(card);
    assert.match(sheet, /FORMATION — Buick Envista/);
    assert.match(sheet, /À maîtriser/);
    assert.match(sheet, /Walkaround/);
  });
});
