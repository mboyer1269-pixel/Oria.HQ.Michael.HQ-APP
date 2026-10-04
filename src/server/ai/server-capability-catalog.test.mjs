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

const catalogPath = path.join(projectRoot, "src/server/ai/server-capability-catalog.ts");
const providerPath = path.join(projectRoot, "src/server/ai/llm-json-provider.ts");
const routerPath = path.join(projectRoot, "src/server/ai/model-router.ts");

const { assessServerEmission, TARIFF_MAX_AGE_MS } = await jiti.import(catalogPath);
const { generateStructuredJson, generateHqStructuredJson } = await jiti.import(providerPath);
const { chooseModel } = await jiti.import(routerPath);

const NOW = Date.parse("2026-10-02T12:00:00.000Z");
const FRESH = new Date(NOW - 60_000).toISOString();
const HAIKU = "claude-haiku-4-5-20251001";
const WORKSPACE = "ws-catalogue";
const ACCOUNT = "acct-server-1";
const REVISION = "rev-1";

function entry(overrides = {}) {
  return {
    accountId: ACCOUNT,
    modelId: HAIKU,
    provider: "anthropic",
    state: "authorized",
    source: "server-discovery",
    observedAt: FRESH,
    tools: true,
    billingKind: "api",
    tariff: {
      currency: "USD",
      notToExceedCents: 40,
      source: "server-quote",
      observedAt: FRESH,
    },
    workspaceId: WORKSPACE,
    ...overrides,
  };
}

function catalog(entries, revision = REVISION) {
  return { source: "server-discovery", observedAt: FRESH, revision, entries };
}

function approved(overrides = {}) {
  return {
    accountId: ACCOUNT,
    workspaceId: WORKSPACE,
    modelId: HAIKU,
    billingKind: "api",
    catalogRevision: REVISION,
    ...overrides,
  };
}

function closedGate(counters) {
  return {
    async reserve() {
      counters.reserves += 1;
      throw new Error("reserve must not run");
    },
    async markEmitted() {
      counters.marks += 1;
      throw new Error("mark must not run");
    },
    async release() {
      counters.releases += 1;
      throw new Error("release must not run");
    },
    async consume() {
      throw new Error("consume must not run");
    },
  };
}

function assess(overrides = {}, call = {}) {
  return assessServerEmission({
    catalog: catalog([entry(overrides)]),
    modelId: HAIKU,
    workspaceId: WORKSPACE,
    requiresTools: false,
    nowMs: NOW,
    invokedProvider: "anthropic",
    ...call,
  });
}

test("listed, connected, and a foreign workspace grant no send", () => {
  assert.equal(assess({ state: "listed" }).block, "public_catalog_only");
  assert.equal(assess({ state: "connected" }).block, "not_authorized");
  assert.equal(assess({}, { workspaceId: "other-workspace" }).block, "workspace_mismatch");
  assert.equal(assessServerEmission({
    catalog: catalog([entry()]),
    modelId: "openrouter/free",
    workspaceId: WORKSPACE,
    requiresTools: false,
    nowMs: NOW,
  }).block, "not_listed");
});

test("tools, an unknown tariff, and a stale tariff stay explicit", () => {
  assert.equal(assess({ tools: false }, { requiresTools: true }).block, "tools_unavailable");
  assert.equal(assess({ tariff: null }).block, "tariff_unknown");
  assert.equal(assess({
    tariff: {
      currency: "USD",
      notToExceedCents: 40,
      source: "server-quote",
      observedAt: new Date(NOW - TARIFF_MAX_AGE_MS - 1).toISOString(),
    },
  }).block, "tariff_stale");
  assert.equal(assess({
    tariff: {
      currency: "USD",
      notToExceedCents: 40,
      source: "server-quote",
      observedAt: "pas-une-date",
    },
  }).block, "tariff_stale");
  const allowed = assess();
  assert.equal(allowed.emit, true);
  assert.equal(allowed.capability.state, "authorized");
});

test("a catalog block emits nothing and does not reserve", async () => {
  let fetches = 0;
  let reserves = 0;
  process.env.ANTHROPIC_API_KEY = "synthetic";
  process.env.HQ_CALL_RESERVATION = "1";
  const result = await generateStructuredJson({
    providerPreference: "auto",
    modelId: HAIKU,
    workspaceId: WORKSPACE,
    callSubjectId: "subject-blocked",
    systemPrompt: "sys",
    userPrompt: "user",
    nowMs: NOW,
    serverCatalog: catalog([entry({ state: "listed", source: "openrouter-public" })]),
    reservationGate: {
      async reserve() {
        reserves += 1;
        throw new Error("reserve must not run");
      },
      async markEmitted() {
        throw new Error("mark must not run");
      },
      async release() {
        throw new Error("release must not run");
      },
      async consume() {
        throw new Error("consume must not run");
      },
    },
    fetchFns: {
      anthropic: async () => {
        fetches += 1;
        throw new Error("fetch must not run");
      },
      openai: async () => {
        fetches += 1;
        throw new Error("fetch must not run");
      },
    },
  });
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.HQ_CALL_RESERVATION;
  assert.equal(fetches, 0);
  assert.equal(reserves, 0);
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "capability_blocked");
  assert.equal(result.fallbackReason, "public_catalog_only");
  assert.equal(result.attempts.length, 0);
  assert.equal(result.requestedModelId, HAIKU);
  assert.equal(result.executedModelId, null);
  assert.equal(result.provider, null);
  assert.equal(result.usage, null);
  assert.equal(result.costSource, "refused");
  assert.equal(result.cost.kind, "refused");
  assert.equal(result.cost.networkRequestSent, false);
  assert.equal(result.cost.monetaryUsd, null);
});

test("an authorized free id with no client is not replaced by a paid provider", async () => {
  let fetches = 0;
  process.env.ANTHROPIC_API_KEY = "synthetic";
  process.env.OPENAI_API_KEY = "synthetic";
  const freeId = "google/gemma-4-31b-it:free";
  const result = await generateStructuredJson({
    providerPreference: "auto",
    modelId: freeId,
    workspaceId: WORKSPACE,
    systemPrompt: "sys",
    userPrompt: "user",
    nowMs: NOW,
    requiresTools: true,
    paidFallback: { authorized: true, workspaceId: WORKSPACE },
    serverCatalog: catalog([entry({
      modelId: freeId,
      provider: "openrouter",
      tools: true,
    })]),
    fetchFns: {
      anthropic: async () => {
        fetches += 1;
        throw new Error("anthropic must not run");
      },
      openai: async () => {
        fetches += 1;
        throw new Error("openai must not run");
      },
    },
  });
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  assert.equal(fetches, 0);
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "model_unsupported");
  assert.equal(result.attempts.length, 0);
  assert.equal(result.requestedModelId, freeId);
  assert.equal(result.executedModelId, null);
  assert.equal(result.cost.networkRequestSent, false);
});

test("a present catalog still blocks a static api id that is not authorized", async () => {
  let fetches = 0;
  process.env.ANTHROPIC_API_KEY = "synthetic";
  const result = await generateStructuredJson({
    providerPreference: "anthropic",
    modelId: HAIKU,
    workspaceId: WORKSPACE,
    systemPrompt: "sys",
    userPrompt: "user",
    nowMs: NOW,
    serverCatalog: catalog([]),
    fetchFns: {
      anthropic: async () => {
        fetches += 1;
        throw new Error("fetch must not run");
      },
    },
  });
  delete process.env.ANTHROPIC_API_KEY;
  assert.equal(fetches, 0);
  assert.equal(result.errorCode, "capability_blocked");
  assert.equal(result.fallbackReason, "not_listed");
});

function holdingGate(cents) {
  return {
    async reserve() {
      return {
        configured: true,
        status: "held",
        currency: "USD",
        reservedCents: cents,
        networkEmitted: false,
        reconciliationRequired: false,
      };
    },
    async markEmitted() {
      return {
        configured: true,
        status: "emitted_unknown",
        currency: "USD",
        reservedCents: cents,
        networkEmitted: true,
        reconciliationRequired: true,
      };
    },
    async release() {
      return {
        configured: true,
        status: "released",
        currency: null,
        reservedCents: null,
        networkEmitted: false,
        reconciliationRequired: false,
      };
    },
    async consume() {
      return {
        configured: true,
        status: "consumed",
        currency: "USD",
        reservedCents: cents,
        networkEmitted: true,
        reconciliationRequired: false,
      };
    },
  };
}

test("observed execution is the response model, and estimation stays on chooseModel", async () => {
  process.env.ANTHROPIC_API_KEY = "synthetic";
  process.env.HQ_CALL_RESERVATION = "1";
  const observed = "claude-haiku-4-5-20251001-observed";
  const result = await generateStructuredJson({
    providerPreference: "anthropic",
    modelId: HAIKU,
    workspaceId: WORKSPACE,
    callSubjectId: "subject-observed",
    systemPrompt: "sys",
    userPrompt: "user",
    nowMs: NOW,
    serverCatalog: catalog([entry()]),
    reservationGate: holdingGate(40),
    fetchFns: {
      anthropic: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          model: observed,
          content: [{ type: "text", text: JSON.stringify({ reply: "ok" }) }],
          usage: { input_tokens: 2, output_tokens: 3 },
        }),
      }),
    },
  });
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.HQ_CALL_RESERVATION;
  assert.equal(result.ok, true);
  assert.equal(result.requestedModelId, HAIKU);
  assert.equal(result.modelId, HAIKU);
  assert.equal(result.executedModelId, observed);
  assert.notEqual(result.executedModelId, result.requestedModelId);
  assert.equal(result.provider, "anthropic");
  assert.deepEqual(result.usage, { input: 2, output: 3 });
  assert.equal(result.costSource, "provider_usage");
  assert.equal(result.cost.kind, "observed_usage");
  assert.equal(result.cost.monetaryUsd, null);

  const route = chooseModel({
    message: "bonjour",
    requestedMode: "economy",
    nowMs: NOW,
    workspaceId: WORKSPACE,
    serverCatalog: catalog([entry({ modelId: "gpt-4o-mini", provider: "openai" })]),
  });
  assert.equal(route.estimate.kind, "estimation");
  assert.equal(route.executedModelId, null);
  assert.equal(route.execution, "callable");
  assert.equal(route.accountingEffect, "none");
});

test("a lost provider response is followed by a single emission", async () => {
  process.env.HQ_CALL_RESERVATION = "1";
  process.env.ANTHROPIC_API_KEY = "synthetic";
  delete process.env.OPENAI_API_KEY;
  let sockets = 0;
  let marked = false;
  const gate = {
    async reserve() {
      if (marked) {
        return {
          configured: true,
          status: "lost",
          reason: "emit_right_held",
          currency: null,
          reservedCents: null,
          networkEmitted: false,
          reconciliationRequired: false,
        };
      }
      return {
        configured: true,
        status: "held",
        currency: "USD",
        reservedCents: 40,
        networkEmitted: false,
        reconciliationRequired: false,
      };
    },
    async markEmitted() {
      marked = true;
      return {
        configured: true,
        status: "emitted_unknown",
        currency: "USD",
        reservedCents: 40,
        networkEmitted: true,
        reconciliationRequired: true,
      };
    },
    async release() {
      return {
        configured: true,
        status: "emitted_unknown",
        reason: "release_refused",
        currency: "USD",
        reservedCents: 40,
        networkEmitted: true,
        reconciliationRequired: true,
      };
    },
    async consume() {
      throw new Error("consume must not run after a lost response");
    },
  };
  const input = {
    providerPreference: "anthropic",
    modelId: HAIKU,
    workspaceId: WORKSPACE,
    callSubjectId: "subject-lost-response",
    systemPrompt: "sys",
    userPrompt: "user",
    reservationGate: gate,
    fetchFns: {
      anthropic: async () => {
        sockets += 1;
        const error = new Error("response lost");
        error.name = "AbortError";
        throw error;
      },
      openai: async () => {
        sockets += 1;
        throw new Error("openai must not run");
      },
    },
  };
  try {
    const first = await generateStructuredJson(input);
    assert.equal(sockets, 1);
    assert.equal(first.ok, false);
    assert.equal(first.reservation.status, "emitted_unknown");
    assert.equal(first.reservation.reservedCents, 40);
    assert.equal(first.reservation.reconciliationRequired, true);
    assert.equal(first.executedModelId, null);
    assert.equal(first.cost.monetaryUsd, null);

    const second = await generateStructuredJson(input);
    assert.equal(sockets, 1);
    assert.equal(second.ok, false);
    assert.equal(second.reservation.status, "lost");
    assert.equal(second.cost.networkRequestSent, false);
    assert.equal(second.executedModelId, null);
  } finally {
    delete process.env.HQ_CALL_RESERVATION;
    delete process.env.ANTHROPIC_API_KEY;
  }
});

test("zero cents is not verified free, and free or subscription invents no zero cost", async () => {
  const zero = {
    currency: "USD",
    notToExceedCents: 0,
    source: "server-quote",
    observedAt: FRESH,
  };
  assert.equal(assess({ tariff: zero }).block, "tariff_unknown");
  assert.equal(assess({ billingKind: "verified_free", tariff: zero }).block, "tariff_unknown");
  assert.equal(assess({ billingKind: "subscription", tariff: zero }).block, "tariff_unknown");
  const free = assess({ billingKind: "verified_free", tariff: null });
  const subscription = assess({ billingKind: "subscription", tariff: null });
  assert.equal(free.emit, false);
  assert.equal(free.disposition, "non_api");
  assert.equal(free.billingKind, "verified_free");
  assert.equal(free.capability.tariff, null);
  assert.equal(subscription.emit, false);
  assert.equal(subscription.disposition, "non_api");
  assert.equal(subscription.billingKind, "subscription");

  let fetches = 0;
  process.env.ANTHROPIC_API_KEY = "synthetic";
  const sent = await generateHqStructuredJson({
    providerPreference: "anthropic",
    modelId: HAIKU,
    workspaceId: WORKSPACE,
    systemPrompt: "sys",
    userPrompt: "user",
    nowMs: NOW,
    serverCatalog: catalog([entry({ billingKind: "verified_free", tariff: null })]),
    approved: approved({ billingKind: "verified_free" }),
    fetchFns: {
      anthropic: async () => {
        fetches += 1;
        throw new Error("free must not open the api adapter");
      },
    },
  });
  delete process.env.ANTHROPIC_API_KEY;
  assert.equal(fetches, 0);
  assert.equal(sent.ok, false);
  assert.equal(sent.errorCode, "non_api_authorized");
  assert.equal(sent.fallbackReason, "verified_free");
  assert.equal(sent.executedModelId, null);
  assert.equal(sent.cost.monetaryUsd, null);
  assert.notEqual(sent.cost.monetaryUsd, 0);
  assert.equal(sent.cost.networkRequestSent, false);
});

test("a catalog ceiling above the server hold does not emit", async () => {
  process.env.HQ_CALL_RESERVATION = "1";
  process.env.ANTHROPIC_API_KEY = "synthetic";
  let fetches = 0;
  let marks = 0;
  let releases = 0;
  const over = await generateHqStructuredJson({
    providerPreference: "anthropic",
    modelId: HAIKU,
    workspaceId: WORKSPACE,
    callSubjectId: "subject-ceiling",
    systemPrompt: "sys",
    userPrompt: "user",
    nowMs: NOW,
    serverCatalog: catalog([entry()]),
    approved: approved(),
    reservationGate: {
      ...holdingGate(41),
      async markEmitted() {
        marks += 1;
        throw new Error("mark must not run above the catalog ceiling");
      },
      async release() {
        releases += 1;
        return {
          configured: true,
          status: "released",
          currency: null,
          reservedCents: null,
          networkEmitted: false,
          reconciliationRequired: false,
        };
      },
    },
    fetchFns: {
      anthropic: async () => {
        fetches += 1;
        throw new Error("fetch must not run");
      },
    },
  });
  assert.equal(fetches, 0);
  assert.equal(marks, 0);
  assert.equal(releases, 1);
  assert.equal(over.ok, false);
  assert.equal(over.reservation.reason, "catalog_ceiling");
  assert.equal(over.cost.networkRequestSent, false);
  assert.equal(over.cost.monetaryUsd, null);

  const within = await generateHqStructuredJson({
    providerPreference: "anthropic",
    modelId: HAIKU,
    workspaceId: WORKSPACE,
    callSubjectId: "subject-ceiling-ok",
    systemPrompt: "sys",
    userPrompt: "user",
    nowMs: NOW,
    serverCatalog: catalog([entry()]),
    approved: approved(),
    reservationGate: holdingGate(40),
    fetchFns: {
      anthropic: async () => {
        fetches += 1;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            model: HAIKU,
            content: [{ type: "text", text: JSON.stringify({ reply: "ok" }) }],
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
        };
      },
    },
  });
  delete process.env.HQ_CALL_RESERVATION;
  delete process.env.ANTHROPIC_API_KEY;
  assert.equal(fetches, 1);
  assert.equal(within.ok, true);
  assert.equal(within.accountId, ACCOUNT);
  assert.equal(within.executedModelId, HAIKU);
  assert.equal(within.cost.monetaryUsd, null);
});

test("a stale or future capability and a foreign provider do not emit", async () => {
  const staleAt = new Date(NOW - TARIFF_MAX_AGE_MS - 1).toISOString();
  const futureAt = new Date(NOW + 60_000).toISOString();
  assert.equal(assess({ observedAt: staleAt }).block, "capability_stale");
  assert.equal(assess({ observedAt: futureAt }).block, "capability_stale");

  let fetches = 0;
  process.env.ANTHROPIC_API_KEY = "synthetic";
  process.env.OPENAI_API_KEY = "synthetic";
  process.env.HQ_CALL_RESERVATION = "1";
  const collided = await generateHqStructuredJson({
    providerPreference: "auto",
    modelId: HAIKU,
    workspaceId: WORKSPACE,
    callSubjectId: "subject-collision",
    systemPrompt: "sys",
    userPrompt: "user",
    nowMs: NOW,
    approved: approved(),
    paidFallback: { authorized: true, workspaceId: WORKSPACE },
    serverCatalog: catalog([
      entry({ provider: "openai" }),
      entry({ provider: "anthropic", state: "listed" }),
    ]),
    reservationGate: holdingGate(40),
    fetchFns: {
      anthropic: async () => {
        fetches += 1;
        throw new Error("anthropic must not run on a listed adapter");
      },
      openai: async () => {
        fetches += 1;
        throw new Error("openai authorization must not be reused");
      },
    },
  });
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.HQ_CALL_RESERVATION;
  assert.equal(fetches, 0);
  assert.equal(collided.ok, false);
  assert.equal(collided.fallbackReason, "public_catalog_only");
  assert.equal(collided.attempts.length, 0);
  assert.equal(collided.cost.networkRequestSent, false);

  const mismatch = assess({ provider: "openai" });
  assert.equal(mismatch.block, "provider_mismatch");
});

test("the strict HQ entry refuses a missing catalog, and legacy absence is not a proof", async () => {
  let strictFetches = 0;
  let legacyFetches = 0;
  process.env.ANTHROPIC_API_KEY = "synthetic";
  const strict = await generateHqStructuredJson({
    providerPreference: "anthropic",
    modelId: HAIKU,
    workspaceId: WORKSPACE,
    systemPrompt: "sys",
    userPrompt: "user",
    nowMs: NOW,
    fetchFns: {
      anthropic: async () => {
        strictFetches += 1;
        throw new Error("strict path must not fetch");
      },
    },
  });
  const legacy = await generateStructuredJson({
    providerPreference: "anthropic",
    modelId: HAIKU,
    workspaceId: WORKSPACE,
    systemPrompt: "sys",
    userPrompt: "user",
    fetchFns: {
      anthropic: async () => {
        legacyFetches += 1;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            model: HAIKU,
            content: [{ type: "text", text: JSON.stringify({ reply: "legacy" }) }],
          }),
        };
      },
    },
  });
  delete process.env.ANTHROPIC_API_KEY;
  assert.equal(strictFetches, 0);
  assert.equal(strict.errorCode, "capability_blocked");
  assert.equal(strict.fallbackReason, "catalog_required");
  assert.equal(strict.cost.networkRequestSent, false);
  assert.equal(legacyFetches, 1);
  assert.equal(legacy.ok, true);
  assert.equal(legacy.accountId, null);
  assert.equal(legacy.executedModelId, HAIKU);
});

test("two subscription accounts of one provider do not collapse, and the bound account is named", async () => {
  const two = catalog([
    entry({ accountId: "acct-a", billingKind: "subscription", tariff: null }),
    entry({ accountId: "acct-b", billingKind: "subscription", tariff: null }),
  ]);
  const ambiguous = assessServerEmission({
    catalog: two,
    modelId: HAIKU,
    workspaceId: WORKSPACE,
    requiresTools: false,
    nowMs: NOW,
    invokedProvider: "anthropic",
  });
  assert.equal(ambiguous.emit, false);
  assert.equal(ambiguous.block, "account_ambiguous");
  assert.equal(assess({ accountId: "anthropic" }).block, "not_listed");

  const counters = { reserves: 0, marks: 0, releases: 0 };
  let fetches = 0;
  process.env.HQ_CALL_RESERVATION = "1";
  process.env.ANTHROPIC_API_KEY = "synthetic";
  const sent = await generateHqStructuredJson({
    providerPreference: "anthropic",
    modelId: HAIKU,
    workspaceId: WORKSPACE,
    callSubjectId: "subject-two-accounts",
    systemPrompt: "sys",
    userPrompt: "user",
    nowMs: NOW,
    serverCatalog: two,
    approved: approved({ accountId: "acct-b", billingKind: "subscription" }),
    reservationGate: closedGate(counters),
    fetchFns: {
      anthropic: async () => {
        fetches += 1;
        throw new Error("fetch must not run");
      },
      openai: async () => {
        fetches += 1;
        throw new Error("fetch must not run");
      },
    },
  });
  delete process.env.HQ_CALL_RESERVATION;
  delete process.env.ANTHROPIC_API_KEY;
  assert.equal(fetches, 0);
  assert.equal(counters.reserves, 0);
  assert.equal(counters.marks, 0);
  assert.equal(sent.ok, false);
  assert.equal(sent.errorCode, "non_api_authorized");
  assert.equal(sent.fallbackReason, "subscription");
  assert.equal(sent.accountId, "acct-b");
  assert.notEqual(sent.accountId, "acct-a");
  assert.equal(sent.reservation.accessClass, "subscription");
  assert.notEqual(sent.reservation.accessClass, "api");
  assert.equal(sent.executedModelId, null);
  assert.equal(sent.cost.monetaryUsd, null);
  assert.notEqual(sent.cost.monetaryUsd, 0);
  assert.equal(sent.cost.networkRequestSent, false);
  assert.equal(sent.reservation.networkEmitted, false);

  const unnamed = chooseModel({
    message: "bonjour",
    requestedMode: "economy",
    nowMs: NOW,
    workspaceId: WORKSPACE,
    serverCatalog: catalog([
      entry({ accountId: "acct-a", modelId: "gpt-4o-mini", provider: "openai", billingKind: "subscription", tariff: null }),
      entry({ accountId: "acct-b", modelId: "gpt-4o-mini", provider: "openai", billingKind: "subscription", tariff: null }),
    ]),
  });
  assert.equal(unnamed.execution, "refused");
  assert.equal(unnamed.refusalReason, "account_ambiguous");
  assert.equal(unnamed.executedModelId, null);
  const named = chooseModel({
    message: "bonjour",
    requestedMode: "economy",
    nowMs: NOW,
    workspaceId: WORKSPACE,
    accountId: "acct-b",
    serverCatalog: catalog([
      entry({ accountId: "acct-a", modelId: "gpt-4o-mini", provider: "openai", billingKind: "subscription", tariff: null }),
      entry({ accountId: "acct-b", modelId: "gpt-4o-mini", provider: "openai", billingKind: "subscription", tariff: null }),
    ]),
  });
  assert.equal(named.execution, "refused");
  assert.equal(named.refusalReason, "subscription");
  assert.equal(named.executedModelId, null);
});

test("a call that diverges from the approved binding does not reserve or fetch", async () => {
  const sub = catalog([
    entry({ accountId: "acct-a", billingKind: "subscription", tariff: null }),
  ]);
  const counters = { reserves: 0, marks: 0, releases: 0 };
  let fetches = 0;
  process.env.HQ_CALL_RESERVATION = "1";
  process.env.ANTHROPIC_API_KEY = "synthetic";
  const fetchFns = {
    anthropic: async () => {
      fetches += 1;
      throw new Error("fetch must not run");
    },
    openai: async () => {
      fetches += 1;
      throw new Error("fetch must not run");
    },
  };
  const held = approved({ accountId: "acct-a", billingKind: "subscription" });
  const first = await generateHqStructuredJson({
    providerPreference: "anthropic",
    modelId: HAIKU,
    workspaceId: WORKSPACE,
    callSubjectId: "subject-binding",
    systemPrompt: "sys",
    userPrompt: "user",
    nowMs: NOW,
    serverCatalog: sub,
    approved: held,
    reservationGate: closedGate(counters),
    fetchFns,
  });
  assert.equal(first.errorCode, "non_api_authorized");
  assert.equal(first.accountId, "acct-a");
  assert.equal(first.reservation.accessClass, "subscription");

  const cases = [
    {
      name: "model",
      call: {
        modelId: "gpt-4o-mini",
        serverCatalog: sub,
        approved: held,
      },
      reason: "binding_mismatch",
    },
    {
      name: "account",
      call: {
        modelId: HAIKU,
        serverCatalog: sub,
        approved: approved({ accountId: "acct-b", billingKind: "subscription" }),
      },
      reason: "account_mismatch",
    },
    {
      name: "revision",
      call: {
        modelId: HAIKU,
        serverCatalog: catalog(sub.entries, "rev-2"),
        approved: held,
      },
      reason: "binding_mismatch",
    },
    {
      name: "billing",
      call: {
        modelId: HAIKU,
        serverCatalog: sub,
        approved: approved({ accountId: "acct-a", billingKind: "api" }),
      },
      reason: "binding_mismatch",
    },
  ];
  for (const item of cases) {
    const result = await generateHqStructuredJson({
      providerPreference: "anthropic",
      workspaceId: WORKSPACE,
      callSubjectId: "subject-binding",
      systemPrompt: "sys",
      userPrompt: "user",
      nowMs: NOW,
      reservationGate: closedGate(counters),
      fetchFns,
      ...item.call,
    });
    assert.equal(result.ok, false, item.name);
    assert.equal(result.errorCode, "capability_blocked", item.name);
    assert.equal(result.fallbackReason, item.reason, item.name);
    assert.equal(result.executedModelId, null, item.name);
    assert.equal(result.cost.monetaryUsd, null, item.name);
    assert.notEqual(result.cost.monetaryUsd, 0, item.name);
    assert.equal(result.cost.networkRequestSent, false, item.name);
    assert.equal(result.reservation.networkEmitted, false, item.name);
  }

  const missing = await generateHqStructuredJson({
    providerPreference: "anthropic",
    modelId: HAIKU,
    workspaceId: WORKSPACE,
    callSubjectId: "subject-binding",
    systemPrompt: "sys",
    userPrompt: "user",
    nowMs: NOW,
    serverCatalog: sub,
    reservationGate: closedGate(counters),
    fetchFns,
  });
  delete process.env.HQ_CALL_RESERVATION;
  delete process.env.ANTHROPIC_API_KEY;
  assert.equal(fetches, 0);
  assert.equal(counters.reserves, 0);
  assert.equal(counters.marks, 0);
  assert.equal(counters.releases, 0);
  assert.equal(missing.fallbackReason, "binding_required");
  assert.equal(missing.executedModelId, null);
  assert.equal(missing.cost.monetaryUsd, null);
});

test("a callable api id billed as subscription is not an api emission", async () => {
  const assessed = assess({ billingKind: "subscription", tariff: null });
  assert.equal(assessed.emit, false);
  assert.equal(assessed.disposition, "non_api");
  assert.equal(assessed.billingKind, "subscription");

  const counters = { reserves: 0, marks: 0, releases: 0 };
  let fetches = 0;
  process.env.HQ_CALL_RESERVATION = "1";
  process.env.ANTHROPIC_API_KEY = "synthetic";
  const sent = await generateHqStructuredJson({
    providerPreference: "anthropic",
    modelId: HAIKU,
    workspaceId: WORKSPACE,
    callSubjectId: "subject-subscription-class",
    systemPrompt: "sys",
    userPrompt: "user",
    nowMs: NOW,
    serverCatalog: catalog([entry({ billingKind: "subscription", tariff: null })]),
    approved: approved({ billingKind: "subscription" }),
    reservationGate: closedGate(counters),
    fetchFns: {
      anthropic: async () => {
        fetches += 1;
        throw new Error("subscription must not fetch");
      },
    },
  });
  delete process.env.HQ_CALL_RESERVATION;
  delete process.env.ANTHROPIC_API_KEY;
  assert.equal(fetches, 0);
  assert.equal(counters.reserves, 0);
  assert.equal(counters.marks, 0);
  assert.equal(sent.errorCode, "non_api_authorized");
  assert.equal(sent.fallbackReason, "subscription");
  assert.equal(sent.reservation.reason, "subscription");
  assert.equal(sent.reservation.accessClass, "subscription");
  assert.notEqual(sent.reservation.accessClass, "api");
  assert.equal(sent.accountId, ACCOUNT);
  assert.equal(sent.executedModelId, null);
  assert.equal(sent.cost.monetaryUsd, null);
  assert.notEqual(sent.cost.monetaryUsd, 0);
  assert.equal(sent.cost.networkRequestSent, false);
});
