import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const jiti = createJiti(import.meta.url, { alias: {
  "@": path.join(root, "src"), "server-only": path.join(root, "src/__server-only-noop.js"),
} });
const { resolveChatModelBinding } = await jiti.import("./chat-model-binding.ts");
const { runJorisCommand } = await jiti.import("./brain.ts");
const { setBrainRouteSink, resetBrainRouteSink } = await jiti.import("../ai/model-router.ts");
const { getActiveWorkspaceContext } = await jiti.import(path.join(root, "src/core/workspace-context.ts"));
const accountId = "6f1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d";
const ctx = getActiveWorkspaceContext();
function fixture(provider, modelId, billingKind = "api") {
  const now = Date.now(), observedAt = new Date(now).toISOString();
  const catalog = { source: "test-qualification", observedAt, revision: "p1-fixture", entries: [{
    accountId, modelId, provider, state: "authorized", source: "fixture", observedAt,
    workspaceId: ctx.workspace.id, tools: false, billingKind,
    tariff: billingKind === "api" ? { currency: "USD", notToExceedCents: 10, source: "fixture", observedAt } : null,
  }] };
  return resolveChatModelBinding(catalog, ctx.workspace.id, { accountId, modelId, catalogRevision: catalog.revision }, now, true, ctx.activeAgentProfile.id);
}

test("qualified chat policy pins all four existing API models without a second legacy decision", async () => {
  const message = "Analyse ce long document et consulte le board sur sa stratégie.";
  for (const [provider, modelId] of [["openai", "gpt-4o-mini"], ["openai", "gpt-4o"],
    ["anthropic", "claude-sonnet-4-6"], ["anthropic", "claude-haiku-4-5-20251001"]]) {
    const resolution = fixture(provider, modelId);
    assert.equal(resolution.status, "ready");
    assert.equal(resolution.binding.selection.modelId, modelId);
    assert.equal(resolution.binding.selection.providerId, provider);
    assert.equal(resolution.binding.selection.runtimeAdapterId, `${provider}-http-json`);
    assert.equal(resolution.binding.selection.pinned, true);
    let legacyDecisions = 0, emissions = 0;
    setBrainRouteSink(() => { legacyDecisions++; });
    try {
      const result = await runJorisCommand(message, ctx, {
        readVerifiedVault: () => ({ entries: [] }),
        generateReply: async input => {
          emissions++;
          assert.equal(input.chosenModelId, modelId);
          assert.equal(input.hqBinding.approved.modelId, modelId);
          return { ok: true, text: "fixture reply", modelId: `${modelId}-observed` };
        },
      }, resolution);
      assert.equal(emissions, 1);
      assert.equal(legacyDecisions, 0);
      assert.equal(result.chosenModelId, modelId);
      assert.equal(result.executedModelId, `${modelId}-observed`);
    } finally { resetBrainRouteSink(); }
  }
});

test("external routers, subscriptions, local and unsupported API models stay refused", async () => {
  for (const [provider, modelId, kind] of [["openrouter", "openrouter/free", "verified_free"],
    ["nara", "nara/model", "verified_free"], ["antigravity", "google/model", "subscription"],
    ["codex", "codex/model", "subscription"], ["anthropic", "claude-sonnet-4-6", "subscription"],
    ["local", "local/model", "verified_free"], ["openai", "unsupported-api-model", "api"]]) {
    const resolution = fixture(provider, modelId, kind);
    assert.equal(resolution.status, "blocked");
    const result = await runJorisCommand("Bonjour", ctx, {
      readVerifiedVault: () => ({ entries: [] }),
      generateReply: async () => { throw Error("Refused corridor reached emission"); },
    }, resolution);
    assert.equal(result.generation, "fallback");
    assert.equal(result.executedModelId, null);
    assert.equal(result.costAccounting.networkRequestSent, false);
  }
});

test("binding divergence is refused, and failed generation never selects a paid fallback", async () => {
  const resolution = fixture("openai", "gpt-4o-mini");
  let calls = 0;
  const deps = { readVerifiedVault: () => ({ entries: [] }),
    generateReply: async () => { calls++; return { ok: false, reason: "fixture unavailable" }; } };
  const result = await runJorisCommand("Bonjour", ctx, deps, resolution);
  assert.equal(calls, 1);
  assert.equal(result.chosenModelId, "gpt-4o-mini");
  assert.equal(result.executedModelId, null);
  assert.equal(result.generation, "fallback");
  const divergent = { ...resolution, binding: { ...resolution.binding,
    approved: { ...resolution.binding.approved, modelId: "claude-sonnet-4-6" } } };
  await runJorisCommand("Bonjour", ctx, deps, divergent);
  assert.equal(calls, 1);
});

test("production chat resolver calls the existing Model Policy and clients remain unchanged", async () => {
  const policy = await readFile(path.join(root, "src/server/joris/chat-model-policy.ts"), "utf8");
  const route = await readFile(path.join(root, "src/app/api/joris/chat/route.ts"), "utf8");
  assert.match(policy, /return selectModel\(result\.registry,/);
  assert.match(route, /resolveChatModelBinding\(/);
  assert.doesNotMatch(policy, /chooseModel|fetch\(|process\.env|spawn\(/);
});
