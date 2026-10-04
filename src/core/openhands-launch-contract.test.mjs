#!/usr/bin/env node

// providerProfileSchema: one explicit variant per supported provider, never a
// single shared shape with `provider` loosened to an open enum. These tests
// prove each variant is independently strict (a weak field is refused under
// its own provider, not just under Claude's) and that no provider can be
// satisfied by a value some other string names. No network, no model call.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..");

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: { "@": path.join(projectRoot, "src") },
});

const { providerProfileSchema, launchConfigSchema } = await jiti.import(
  path.join(projectRoot, "src/core/openhands-launch-contract.ts"),
);

const hash = (seed) => seed.repeat(64).slice(0, 64);

const claudeProfile = {
  id: "claude-default",
  policySha256: hash("a"),
  provider: "claude",
  authentication: "subscription",
  network: "restricted-proxy",
  accountConnectors: "disabled",
};

const codexProfile = {
  ...claudeProfile,
  id: "codex-default",
  policySha256: hash("b"),
  provider: "codex",
};

test("the Claude and Codex provider profiles each parse under their own variant", () => {
  assert.equal(providerProfileSchema.parse(claudeProfile).provider, "claude");
  assert.equal(providerProfileSchema.parse(codexProfile).provider, "codex");
});

test("an unlisted provider is refused, not silently widened in", () => {
  for (const provider of ["gemini", "antigravity", "Claude", "codex ", ""]) {
    assert.throws(() => providerProfileSchema.parse({ ...claudeProfile, provider }));
  }
});

test("each provider variant is independently strict: a weak field fails under its own provider too", () => {
  for (const base of [claudeProfile, codexProfile]) {
    for (const change of [
      { authentication: "api-key" },
      { network: "open" },
      { network: "host" },
      { accountConnectors: "enabled" },
    ]) {
      assert.throws(
        () => providerProfileSchema.parse({ ...base, ...change }),
        undefined,
        `expected ${base.provider} profile to reject ${JSON.stringify(change)}`,
      );
    }
  }
});

test("no profile can satisfy a provider other than the one it declares", () => {
  // Every field a Claude profile carries is otherwise identical to a Codex
  // profile's — only `provider` differs. Flipping just that one field must
  // still select (and be checked against) the other variant, never silently
  // accepted as whichever variant the caller "meant".
  const claudeShapedCodex = { ...claudeProfile, provider: "codex" };
  const parsed = providerProfileSchema.parse(claudeShapedCodex);
  assert.equal(parsed.provider, "codex");
  assert.equal(parsed.id, claudeProfile.id);
});

test("unknown or missing fields are refused under either variant", () => {
  assert.throws(() => providerProfileSchema.parse({ ...claudeProfile, extra: "nope" }));
  assert.throws(() => providerProfileSchema.parse({ ...codexProfile, extra: "nope" }));
  const { authentication: _drop, ...incomplete } = claudeProfile;
  assert.throws(() => providerProfileSchema.parse(incomplete));
});

test("launchConfigSchema still accepts no providerProfile at all (unchanged legacy path)", () => {
  const base = {
    imageDigest: `sha256:${hash("c")}`,
    executorVersion: "1.50.0",
    runnerId: "runner-1",
    permissionPolicy: "deny",
    maxCostCents: 100,
    maxTokens: 1000,
    maxIterations: 5,
    timeoutSeconds: 60,
    hardTokenLimitEnforced: false,
  };
  assert.equal(launchConfigSchema.parse(base).providerProfile, undefined);
  assert.equal(
    launchConfigSchema.parse({ ...base, providerProfile: codexProfile }).providerProfile.provider,
    "codex",
  );
});

test("launchConfigSchema accepts ACP default only as an explicit approved model identity", () => {
  const base = {
    imageDigest: `sha256:${hash("c")}`,
    executorVersion: "1.50.0",
    runnerId: "runner-1",
    permissionPolicy: "deny",
    maxCostCents: 100,
    maxTokens: 1000,
    maxIterations: 5,
    timeoutSeconds: 60,
    hardTokenLimitEnforced: false,
  };
  assert.equal(launchConfigSchema.parse({ ...base, foundationModelId: "default" }).foundationModelId, "default");
  for (const foundationModelId of ["sonnet", "claude-latest-4", "claude-4:latest", " model-4", "model-4\n"]) {
    assert.throws(() => launchConfigSchema.parse({ ...base, foundationModelId }));
  }
});
