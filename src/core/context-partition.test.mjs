#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..");

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: { "@": path.join(projectRoot, "src") },
});

const { resolveContextPartition } = await jiti.import(
  path.join(projectRoot, "src/core/context-partition.ts"),
);

describe("resolveContextPartition", () => {
  it("maps personal to Vie", () => {
    assert.equal(resolveContextPartition("personal"), "personal");
  });

  it("maps work modes to Travail", () => {
    for (const mode of ["hq", "suivia", "mcl"]) {
      assert.equal(resolveContextPartition(mode), "work");
    }
  });
});
