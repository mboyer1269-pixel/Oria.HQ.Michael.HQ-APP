#!/usr/bin/env node

// Naming v1 contract guard — see docs/AGENT_NAMING.md.
//
// Locks the two halves of the naming layer:
//   1. Technical agent IDs are frozen (ledger rows, execution licenses,
//      webhook bindings and council roleIds reference them) — renaming one
//      is a breaking change and must fail loudly here first.
//   2. Display names are product names: unique, non-empty, resolved only
//      through naming.ts, and the retired mythological set never returns.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

const FROZEN_AGENT_IDS = [
  "joris",
  "hermes",
  "orion",
  "sentinel",
  "scribe",
  "finops",
  "builder",
  "closer",
  "marketing",
  "inventor",
];

const RETIRED_MYTHOLOGICAL_NAMES = [
  "Hermès",
  "Orion",
  "Thémis",
  "Mnémosyne",
  "Ploutos",
  "Héphaïstos",
  "Peithô",
  "Phémé",
  "Dédale",
];

test("Agent naming contract (naming v1)", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const seedMod = await jiti.import(path.join(__dirname, "seed.ts"));
  const namingMod = await jiti.import(path.join(__dirname, "naming.ts"));
  const { agentRegistry } = seedMod;
  const { getAgentDisplayName, resolveAgentId, LEGACY_AGENT_NAME_TO_ID } = namingMod;

  await t.test("technical agent IDs are frozen", () => {
    const ids = agentRegistry.map((agent) => agent.id).sort();
    assert.deepEqual(ids, [...FROZEN_AGENT_IDS].sort());
  });

  await t.test("display names are unique and non-empty", () => {
    const names = agentRegistry.map((agent) => agent.name);
    assert.ok(names.every((name) => typeof name === "string" && name.trim().length > 0));
    assert.equal(new Set(names).size, names.length);
  });

  await t.test("retired mythological names never return to the registry", () => {
    const names = new Set(agentRegistry.map((agent) => agent.name));
    for (const retired of RETIRED_MYTHOLOGICAL_NAMES) {
      assert.ok(!names.has(retired), `"${retired}" must not be an active display name`);
    }
  });

  await t.test("canonical ids resolve to product names", () => {
    assert.equal(getAgentDisplayName("joris"), "Joris");
    assert.equal(getAgentDisplayName("hermes"), "Relay");
    assert.equal(getAgentDisplayName("orion"), "Radar");
    assert.equal(getAgentDisplayName("sentinel"), "Sentinel");
    assert.equal(getAgentDisplayName("scribe"), "Scribe");
    assert.equal(getAgentDisplayName("finops"), "FinOps");
    assert.equal(getAgentDisplayName("builder"), "Forge");
    assert.equal(getAgentDisplayName("closer"), "Closer");
    assert.equal(getAgentDisplayName("marketing"), "Studio");
    assert.equal(getAgentDisplayName("inventor"), "Lab");
  });

  await t.test("ledger/writer aliases resolve to the canonical agent", () => {
    assert.equal(resolveAgentId("agent_hermes"), "hermes");
    assert.equal(resolveAgentId("joris_orchestrator"), "joris");
    assert.equal(getAgentDisplayName("agent_hermes"), "Relay");
    assert.equal(getAgentDisplayName("joris_orchestrator"), "Joris");
  });

  await t.test("legacy mythological names resolve for stored data", () => {
    for (const [legacyName, expectedId] of Object.entries(LEGACY_AGENT_NAME_TO_ID)) {
      const resolved = resolveAgentId(legacyName);
      assert.equal(resolved, expectedId);
      assert.ok(
        agentRegistry.some((agent) => agent.id === expectedId),
        `legacy name "${legacyName}" must map to a registry agent`,
      );
      assert.notEqual(getAgentDisplayName(legacyName), legacyName);
    }
  });

  await t.test("unknown references fall back to the raw input (stay visible)", () => {
    assert.equal(getAgentDisplayName("not-an-agent"), "not-an-agent");
    assert.equal(resolveAgentId("not-an-agent"), "not-an-agent");
  });
});
