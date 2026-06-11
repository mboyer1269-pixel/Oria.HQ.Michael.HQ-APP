#!/usr/bin/env node

// src/features/ventures/venture-asset.test.mjs — pure unit tests.

import assert from "node:assert/strict";
import test from "node:test";

const {
  computeVentureReadiness,
  getCloseoutInventory,
  getVentureSendIdentity,
  projectActiveAssets,
} = await import("./venture-asset.ts");

function makeRecord(overrides = {}) {
  return {
    id: "va_1",
    workspaceId: "ws_1",
    ventureId: "v_dropship",
    kind: "dedicated_email",
    label: "Courriel support",
    value: "support@boutique.com",
    sensitive: false,
    status: "active",
    createdAt: "2026-06-10T10:00:00Z",
    ...overrides,
  };
}

test("projectActiveAssets filters retired records", () => {
  const records = [makeRecord(), makeRecord({ id: "va_2", status: "retired" })];
  assert.equal(projectActiveAssets(records).length, 1);
});

test("readiness: early stages require nothing (ratio 1)", () => {
  for (const status of ["discovered", "candidate", "validating"]) {
    const readiness = computeVentureReadiness([], status);
    assert.equal(readiness.ratio, 1, status);
    assert.equal(readiness.missing.length, 0, status);
  }
});

test("readiness: operating recommends email + payment, computes missing", () => {
  const readiness = computeVentureReadiness([makeRecord()], "operating");
  assert.deepEqual(readiness.present, ["dedicated_email"]);
  assert.deepEqual(readiness.missing, ["payment_account"]);
  assert.equal(readiness.ratio, 0.5);
});

test("readiness: retired assets do not count", () => {
  const readiness = computeVentureReadiness([makeRecord({ status: "retired" })], "operating");
  assert.equal(readiness.present.length, 0);
});

test("send identity: most recent active dedicated_email wins", () => {
  const records = [
    makeRecord({ id: "va_1", value: "old@b.com", createdAt: "2026-06-01T00:00:00Z" }),
    makeRecord({ id: "va_2", value: "new@b.com", createdAt: "2026-06-09T00:00:00Z" }),
    makeRecord({ id: "va_3", value: "retired@b.com", createdAt: "2026-06-10T00:00:00Z", status: "retired" }),
  ];
  assert.equal(getVentureSendIdentity(records), "new@b.com");
});

test("send identity: null when no active dedicated_email", () => {
  assert.equal(getVentureSendIdentity([makeRecord({ kind: "domain" })]), null);
});

test("closeout inventory includes accounts/domains, excludes notes and kpis", () => {
  const records = [
    makeRecord(),
    makeRecord({ id: "va_2", kind: "domain", value: "boutique.com" }),
    makeRecord({ id: "va_3", kind: "note", value: "penser au SEO" }),
    makeRecord({ id: "va_4", kind: "kpi_target", value: "MRR 2k" }),
    makeRecord({ id: "va_5", kind: "tool_account", value: "shopify", status: "retired" }),
  ];
  const inventory = getCloseoutInventory(records);
  assert.deepEqual(inventory.map((record) => record.id), ["va_1", "va_2"]);
});
