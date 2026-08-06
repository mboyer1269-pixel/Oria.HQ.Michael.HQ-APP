#!/usr/bin/env node

// Tenancy access contract — adversarial tests.
//
// This module decides whether a user may act in a workspace, so the tests are
// written from the attacker's side: wrong workspace, revoked membership,
// invited-but-not-active, unknown role, empty set. Every one of them must land
// on "no access" — never on a default workspace, never on a partial grant.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("workspace membership contract", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const {
    capabilitiesForRole,
    roleGrants,
    findActiveMembership,
    activeMembershipsOf,
    hasWorkspaceAccess,
    memberCan,
    resolveActiveWorkspace,
    seedOwnerMembership,
  } = await jiti.import(path.join(projectRoot, "src/core/workspaces/membership.ts"));

  const alice = "user-alice";
  const bob = "user-bob";
  const wsA = "ws-alpha";
  const wsB = "ws-beta";

  /** Alice owns alpha; Bob is an operator in beta only. */
  const memberships = [
    { workspaceId: wsA, userId: alice, role: "owner", status: "active" },
    { workspaceId: wsB, userId: bob, role: "operator", status: "active" },
  ];

  await t.test("owner holds every capability", () => {
    const caps = capabilitiesForRole("owner");
    for (const capability of [
      "workspace.read",
      "workspace.manage",
      "members.manage",
      "missions.write",
      "agents.run",
      "execution.approve",
    ]) {
      assert.ok(caps.includes(capability), `owner must grant ${capability}`);
    }
  });

  await t.test("execution.approve is owner-only (governance seal)", () => {
    assert.equal(roleGrants("owner", "execution.approve"), true);
    for (const role of ["admin", "operator", "viewer"]) {
      assert.equal(
        roleGrants(role, "execution.approve"),
        false,
        `${role} must never approve an execution intent`,
      );
    }
  });

  await t.test("roles are strictly nested in privilege", () => {
    const owner = new Set(capabilitiesForRole("owner"));
    const admin = new Set(capabilitiesForRole("admin"));
    const operator = new Set(capabilitiesForRole("operator"));
    const viewer = new Set(capabilitiesForRole("viewer"));

    for (const capability of viewer) assert.ok(operator.has(capability));
    for (const capability of operator) assert.ok(admin.has(capability));
    for (const capability of admin) assert.ok(owner.has(capability));

    assert.ok(owner.size > admin.size);
    assert.ok(admin.size > operator.size);
    assert.ok(operator.size > viewer.size);
  });

  await t.test("an unknown role grants nothing", () => {
    assert.deepEqual(capabilitiesForRole("superuser"), []);
    assert.equal(roleGrants("superuser", "workspace.read"), false);
  });

  await t.test("a member is found only in their own workspace", () => {
    assert.notEqual(findActiveMembership(memberships, alice, wsA), null);
    assert.equal(findActiveMembership(memberships, alice, wsB), null);
    assert.equal(findActiveMembership(memberships, bob, wsA), null);
  });

  await t.test("revoked and invited memberships never grant access", () => {
    for (const status of ["revoked", "invited"]) {
      const set = [{ workspaceId: wsA, userId: alice, role: "owner", status }];
      assert.equal(findActiveMembership(set, alice, wsA), null, `status=${status}`);
      assert.equal(hasWorkspaceAccess(set, alice, wsA), false, `status=${status}`);
      assert.equal(memberCan(set, alice, wsA, "workspace.read"), false, `status=${status}`);
      assert.deepEqual(activeMembershipsOf(set, alice), [], `status=${status}`);
    }
  });

  await t.test("a non-member can do nothing in a foreign workspace", () => {
    assert.equal(hasWorkspaceAccess(memberships, bob, wsA), false);
    for (const capability of [
      "workspace.read",
      "workspace.manage",
      "members.manage",
      "missions.write",
      "agents.run",
      "execution.approve",
    ]) {
      assert.equal(memberCan(memberships, bob, wsA, capability), false, capability);
    }
  });

  await t.test("capabilities follow the role held in THAT workspace", () => {
    assert.equal(memberCan(memberships, bob, wsB, "missions.write"), true);
    assert.equal(memberCan(memberships, bob, wsB, "members.manage"), false);
    assert.equal(memberCan(memberships, alice, wsA, "members.manage"), true);
  });

  await t.test("a requested workspace is honoured only for active members", () => {
    const resolved = resolveActiveWorkspace(memberships, alice, wsA);
    assert.deepEqual(resolved, { ok: true, workspaceId: wsA, role: "owner" });
  });

  await t.test("requesting a foreign workspace FAILS instead of falling back", () => {
    const resolved = resolveActiveWorkspace(memberships, bob, wsA);
    assert.deepEqual(resolved, { ok: false, reason: "not_a_member" });
  });

  await t.test("requesting an unknown workspace fails closed", () => {
    const resolved = resolveActiveWorkspace(memberships, alice, "ws-does-not-exist");
    assert.deepEqual(resolved, { ok: false, reason: "not_a_member" });
  });

  await t.test("without a request the first active membership wins", () => {
    const resolved = resolveActiveWorkspace(memberships, bob);
    assert.deepEqual(resolved, { ok: true, workspaceId: wsB, role: "operator" });
  });

  await t.test("a user with no membership resolves to nothing", () => {
    assert.deepEqual(resolveActiveWorkspace(memberships, "user-nobody"), {
      ok: false,
      reason: "no_membership",
    });
    assert.deepEqual(resolveActiveWorkspace([], alice), { ok: false, reason: "no_membership" });
  });

  await t.test("a revoked sole membership resolves to nothing", () => {
    const set = [{ workspaceId: wsA, userId: alice, role: "owner", status: "revoked" }];
    assert.deepEqual(resolveActiveWorkspace(set, alice), { ok: false, reason: "no_membership" });
  });

  await t.test("a new workspace seeds its creator as sole active owner", () => {
    const seeded = seedOwnerMembership(wsA, alice);
    assert.deepEqual(seeded, {
      workspaceId: wsA,
      userId: alice,
      role: "owner",
      status: "active",
    });
    assert.equal(memberCan([seeded], alice, wsA, "execution.approve"), true);
  });

  await t.test("resolution never mutates the membership list", () => {
    const snapshot = JSON.stringify(memberships);
    resolveActiveWorkspace(memberships, alice, wsA);
    activeMembershipsOf(memberships, alice);
    memberCan(memberships, alice, wsA, "workspace.read");
    assert.equal(JSON.stringify(memberships), snapshot);
  });
});
