#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("Booster Contract tests", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mod = await jiti.import(
    path.join(__dirname, "booster-contract.ts")
  );

  const { BoosterType, BoosterStatus } = mod;

  await t.test("BoosterType enum exports the expected values", () => {
    assert.equal(BoosterType.MODEL, "model");
    assert.equal(BoosterType.DATASET, "dataset");
    assert.equal(BoosterType.TOOL, "tool");
    assert.equal(BoosterType.INFRA, "infra");
  });

  await t.test("BoosterStatus enum exports the expected values", () => {
    assert.equal(BoosterStatus.ACTIVE, "active");
    assert.equal(BoosterStatus.INACTIVE, "inactive");
    assert.equal(BoosterStatus.EXPIRED, "expired");
  });

  await t.test("a valid Booster object can be constructed at runtime", () => {
    const booster = {
      id: "boost-001",
      name: "GPT-4 Turbo",
      type: BoosterType.MODEL,
      status: BoosterStatus.ACTIVE,
      description: "Provides enhanced language model capabilities",
      meta: { version: "4t", provider: "OpenAI" },
    };

    assert.equal(booster.id, "boost-001");
    assert.equal(booster.type, "model");
    assert.equal(booster.status, "active");
    assert.ok(Object.values(BoosterType).includes(booster.type));
    assert.ok(Object.values(BoosterStatus).includes(booster.status));
  });

  await t.test("optional fields may be omitted", () => {
    const minimal = {
      id: "boost-002",
      name: "Minimal Booster",
      type: BoosterType.TOOL,
      status: BoosterStatus.INACTIVE,
    };

    assert.equal(minimal.description, undefined);
    assert.equal(minimal.meta, undefined);
    assert.equal(minimal.type, "tool");
  });
});
