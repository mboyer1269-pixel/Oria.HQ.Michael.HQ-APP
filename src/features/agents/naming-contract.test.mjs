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
  const councilMod = await jiti.import(
    path.join(projectRoot, "src/server/agents/agent-council-run-contract.ts"),
  );
  const { agentRegistry } = seedMod;
  const { getAgentDisplayName, resolveAgentId, LEGACY_AGENT_NAME_TO_ID } = namingMod;
  const {
    COUNCIL_ROLE_TO_AGENT,
    SYNTHETIC_COUNCIL_ROLES,
    resolveCouncilRoleToAgentId,
    getCouncilRoleDisplayName,
  } = namingMod;
  const { AGENT_COUNCIL_ROLE_IDS } = councilMod;

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

  // --- Council role resolution (P1: single agent-vocabulary resolver) -------

  await t.test("every council roleId is classified exactly once (agent XOR synthetic)", () => {
    for (const roleId of AGENT_COUNCIL_ROLE_IDS) {
      const isAgent = Object.prototype.hasOwnProperty.call(COUNCIL_ROLE_TO_AGENT, roleId);
      const isSynthetic = Object.prototype.hasOwnProperty.call(SYNTHETIC_COUNCIL_ROLES, roleId);
      assert.ok(
        isAgent !== isSynthetic,
        `council roleId "${roleId}" must be agent-backed XOR synthetic (was agent=${isAgent}, synthetic=${isSynthetic})`,
      );
    }
    // No map key may reference a roleId the council contract does not declare.
    const known = new Set(AGENT_COUNCIL_ROLE_IDS);
    for (const key of [
      ...Object.keys(COUNCIL_ROLE_TO_AGENT),
      ...Object.keys(SYNTHETIC_COUNCIL_ROLES),
    ]) {
      assert.ok(known.has(key), `map key "${key}" is not a canonical council roleId`);
    }
  });

  await t.test("agent-backed council roles resolve to a frozen registry agent + product name", () => {
    for (const [roleId, agentId] of Object.entries(COUNCIL_ROLE_TO_AGENT)) {
      assert.ok(FROZEN_AGENT_IDS.includes(agentId), `${roleId} → ${agentId} must be a frozen registry id`);
      assert.equal(resolveCouncilRoleToAgentId(roleId), agentId);
      const name = getCouncilRoleDisplayName(roleId);
      assert.ok(typeof name === "string" && name.trim().length > 0);
      assert.notEqual(name, roleId); // resolved to a product name, not the raw token
    }
    // The locked mappings from the P1 decision.
    assert.equal(getCouncilRoleDisplayName("auditor"), "Sentinel");
    assert.equal(getCouncilRoleDisplayName("hermes"), "Relay");
  });

  await t.test("synthetic council lenses carry a label and resolve to no agent", () => {
    for (const [roleId, def] of Object.entries(SYNTHETIC_COUNCIL_ROLES)) {
      assert.equal(resolveCouncilRoleToAgentId(roleId), null);
      assert.ok(def.label.trim().length > 0);
      assert.equal(getCouncilRoleDisplayName(roleId), def.label);
    }
  });

  await t.test("the live cash-run role sequence yields a display name for every role", () => {
    // Mirrors ROLE_SEQUENCE in venture-council-cash-run-composer.ts — no raw
    // token may leak to the UI.
    for (const roleId of ["orient", "t_gravity", "hermes", "auditor", "operator"]) {
      const name = getCouncilRoleDisplayName(roleId);
      assert.ok(typeof name === "string" && name.trim().length > 0);
    }
  });
});
