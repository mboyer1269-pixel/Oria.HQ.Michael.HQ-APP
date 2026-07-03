#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..", "..");

test("Agent Model Profile Contract tests", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const { validateAgentModelProfile, validateModelRouteBinding } = await jiti.import(
    path.join(__dirname, "agent-model-profile-contract.ts"),
  );

  const validProfile = {
    agentId: "joris",
    displayName: "Joris",
    routes: {
      conversation: {
        candidateModelIds: ["vendor/free-model:free", "anthropic/claude-sonnet-4-6"],
        bindingMode: "auto",
      },
    },
  };

  await t.test("a well-formed profile validates", () => {
    assert.deepEqual(validateAgentModelProfile(validProfile), { ok: true });
  });

  await t.test("invariant: an auto route with a single candidate is a hidden vendor pin", () => {
    const result = validateModelRouteBinding("conversation", {
      candidateModelIds: ["anthropic/claude-sonnet-4-6"],
      bindingMode: "auto",
    });
    assert.equal(result.ok, false);
    assert.match(result.errors.join(" "), /vendor hardcode in disguise/);
  });

  await t.test("invariant: pinning a vendor requires an explicit written reason", () => {
    const withReason = validateModelRouteBinding("client-audit", {
      candidateModelIds: ["anthropic/claude-sonnet-4-6"],
      bindingMode: "pinned",
      pinnedReason: "CEO mandate: client audits stay on the premium brain",
    });
    assert.deepEqual(withReason, { ok: true });

    const withoutReason = validateModelRouteBinding("client-audit", {
      candidateModelIds: ["anthropic/claude-sonnet-4-6"],
      bindingMode: "pinned",
    });
    assert.equal(withoutReason.ok, false);
    assert.match(withoutReason.errors.join(" "), /pinnedReason/);
  });

  await t.test("a profile without routes or with empty candidates is invalid", () => {
    const noRoutes = validateAgentModelProfile({ ...validProfile, routes: {} });
    assert.equal(noRoutes.ok, false);

    const emptyCandidates = validateAgentModelProfile({
      ...validProfile,
      routes: { conversation: { candidateModelIds: [], bindingMode: "auto" } },
    });
    assert.equal(emptyCandidates.ok, false);
  });

  await t.test("a local runtime preference that assumes availability is rejected", () => {
    const result = validateAgentModelProfile({
      ...validProfile,
      localRuntime: { preferLocal: true, assumeAvailable: true, runtimeAdapterId: "ollama-local" },
    });
    assert.equal(result.ok, false);
    assert.match(result.errors.join(" "), /never assumed/);
  });
});
