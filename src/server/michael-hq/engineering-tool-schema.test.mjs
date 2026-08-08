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

const { engineeringPackagePayloadSchema } = await jiti.import(
  path.join(projectRoot, "src/server/agents/tools/engineering-package-deliver.ts"),
);

test("engineering package payload accepts telemetry-enriched data", () => {
  const parsed = engineeringPackagePayloadSchema.safeParse({
    agentId: "engineering",
    skillId: "infrastructure.generate",
    client: "Acme",
    email: "ceo@acme.test",
    actionType: "infrastructure.code_package",
    missionId: "mission_1",
    data: {
      intentId: "intent_abc",
      packageId: "pkg_abc",
      title: "API stack",
      brief: "Portable docker compose",
      modeId: "hq",
      files: [{ path: "Dockerfile", content: "FROM node:22" }],
      estimated_cost: { totalUsd: 0.01 },
    },
  });
  assert.equal(parsed.success, true);
});

test("engineering package payload rejects path traversal", () => {
  const parsed = engineeringPackagePayloadSchema.safeParse({
    agentId: "engineering",
    skillId: "infrastructure.generate",
    client: "Acme",
    email: "ceo@acme.test",
    actionType: "infrastructure.code_package",
    missionId: "mission_1",
    data: {
      intentId: "intent_abc",
      packageId: "pkg_abc",
      title: "API stack",
      brief: "Portable docker compose",
      modeId: "hq",
      files: [{ path: "../etc/passwd", content: "nope" }],
    },
  });
  assert.equal(parsed.success, false);
});
