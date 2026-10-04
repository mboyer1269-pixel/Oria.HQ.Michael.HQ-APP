#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

process.env.NODE_ENV = "test";
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.OPENROUTER_API_KEY;
delete process.env.NARA_API_KEY;

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
  },
});

const consultationPath = path.join(projectRoot, "src/server/ai/model-catalog-consultation.ts");
const catalogPath = path.join(projectRoot, "src/server/ai/free-model-catalog.ts");
const gatewayPath = path.join(projectRoot, "src/server/ai/gateway-catalog.ts");

const {
  consultHqModelCatalog,
  boundedCatalogFetch,
  nodeCatalogTransport,
} = await jiti.import(consultationPath);
const { chooseModel, readRouterModelCatalog } = await jiti.import(
  path.join(projectRoot, "src/server/ai/model-router.ts"),
);
const { loadFreeModelCatalogSnapshot, resetFreeModelCatalogCache } = await jiti.import(catalogPath);
const {
  OPENROUTER_PUBLIC_MODELS_URL,
  OPENROUTER_ACCOUNT_MODELS_URL,
  NARA_PUBLIC_PLANS_URL,
  NARA_ACCOUNT_MODELS_URL,
} = await jiti.import(gatewayPath);

const NOW = Date.parse("2026-10-02T12:00:00.000Z");
const OBSERVED = new Date(NOW).toISOString();
const SECRET = "synthetic-catalog-secret";
const FILE_DATE = "2026-06-12T10:08:29.7657332-04:00";

const realFetch = globalThis.fetch;
globalThis.fetch = async () => {
  throw new Error("global fetch must not run");
};
after(() => {
  globalThis.fetch = realFetch;
});

function paidModel(id = "openai/gpt-4o-mini") {
  return {
    id,
    pricing: { prompt: "0.000003", completion: "0.000015", request: "0.002" },
    supported_parameters: ["tools"],
  };
}

function feeOnlyModel() {
  return {
    id: "vendor/fee-only",
    pricing: { prompt: "0", completion: "0", request: "0.002" },
    supported_parameters: ["tools"],
  };
}

function unknownModel() {
  return { id: "vendor/mystery", pricing: {} };
}

function zeroModel(id = "poolside/laguna-s.2:free") {
  return {
    id,
    pricing: { prompt: "0", completion: "0", request: "0" },
    supported_parameters: ["tools"],
  };
}

function consult(overrides = {}) {
  return consultHqModelCatalog({
    gateway: "openrouter",
    nowMs: NOW,
    accountId: "acct-server-1",
    workspaceId: "hq",
    readCache: () => null,
    authorize: async () => null,
    readSecret: () => undefined,
    ...overrides,
  });
}

function assertDisplaySafe(value) {
  const json = JSON.stringify(value);
  assert.equal(json.includes(SECRET), false);
  assert.equal(json.includes("authorization"), false);
  assert.equal(json.includes("Bearer"), false);
  assert.equal(json.includes("https://"), false);
  assert.equal(json.includes("notToExceedCents"), false);
  assert.equal(json.includes("billingKind"), false);
  assert.equal(json.includes("OPENROUTER_API_KEY"), false);
  assert.equal(json.includes("NARA_API_KEY"), false);
}

test("response contract returns paid and unknown rows without making them executable", async () => {
  const calls = [];
  const result = await consult({
    sourceUrl: "https://evil.example/models",
    baseUrl: "https://evil.example/v1",
    transport: async (url, init) => {
      calls.push({ url, method: init.method, redirect: init.redirect, authorization: init.headers.authorization ?? null });
      assert.equal(init.signal.aborted, false);
      return {
        status: 200,
        body: { data: [paidModel(), feeOnlyModel(), unknownModel(), zeroModel()] },
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.source, "catalog_get");
  assert.equal(result.fetchCount, 1);
  assert.equal(result.stale, false);
  assert.equal(result.accountAccess, "unknown");
  assert.deepEqual(result.access, {
    public: true,
    configured: false,
    verified: false,
    executionAuthorized: false,
  });
  assert.deepEqual(calls.map((call) => call.url), [OPENROUTER_PUBLIC_MODELS_URL]);
  assert.equal(calls[0].method, "GET");
  assert.equal(calls[0].redirect, "manual");
  assert.equal(calls[0].authorization, null);

  const paid = result.rows.find((row) => row.modelId === "openai/gpt-4o-mini");
  const fee = result.rows.find((row) => row.modelId === "vendor/fee-only");
  const unknown = result.rows.find((row) => row.modelId === "vendor/mystery");
  const zero = result.rows.find((row) => row.modelId === "poolside/laguna-s.2:free");
  assert.ok(paid && fee && unknown && zero);

  assert.equal(paid.provider, "openrouter");
  assert.equal(paid.label, "openai/gpt-4o-mini");
  assert.equal(paid.price.kind, "positive_quote");
  assert.equal(paid.price.promptUsdPerMTok, 3);
  assert.equal(paid.price.completionUsdPerMTok, 15);
  assert.equal(paid.price.perRequestUsd, 0.002);
  assert.deepEqual(paid.units, {
    prompt: "usd_per_million_tokens",
    completion: "usd_per_million_tokens",
    request: "usd_per_request",
  });
  assert.equal(paid.observedAt, OBSERVED);
  assert.deepEqual(paid.quota, { kind: "unknown" });
  assert.equal(paid.unavailableReason, "price_not_a_capability");
  assert.equal(paid.access, "public");
  assert.equal(paid.executable, false);
  assert.equal(paid.executionAuthorized, false);
  assert.equal(paid.stale, false);

  assert.equal(fee.price.kind, "positive_quote");
  assert.equal(fee.price.perRequestUsd, 0.002);
  assert.equal(fee.units.request, "usd_per_request");
  assert.equal(fee.units.prompt, "usd_per_million_tokens");
  assert.equal(fee.executable, false);
  assert.equal(fee.unavailableReason, "price_not_a_capability");

  assert.equal(unknown.price.kind, "unknown");
  assert.deepEqual(unknown.units, { prompt: "unknown", completion: "unknown", request: "unknown" });
  assert.equal(unknown.unavailableReason, "price_unknown");
  assert.equal(unknown.executable, false);
  assert.equal(unknown.executionAuthorized, false);

  assert.equal(zero.price.kind, "proven_zero");
  assert.equal(zero.unavailableReason, "public_catalog_only");
  assert.equal(zero.executable, false);
  assert.equal(zero.executionAuthorized, false);
  assertDisplaySafe(result);
});

test("existing owner gate refuses 401 and 403 before any catalog read", async () => {
  let fetches = 0;
  const fetch = async () => {
    fetches += 1;
    throw new Error("fetch must not run");
  };
  try {
    globalThis.__ownerApiSessionTestResult = new Response(null, { status: 401 });
    const unauthenticated = await consultHqModelCatalog({
      gateway: "openrouter",
      nowMs: NOW,
      readCache: () => ({ provider: "openrouter", generatedAt: FILE_DATE, entries: [{ id: "vendor/hidden", name: "Hidden" }] }),
      fetch,
    });
    assert.equal(unauthenticated.ok, false);
    assert.equal(unauthenticated.reason, "unauthenticated");
    assert.equal(unauthenticated.fetchCount, 0);
    assert.deepEqual(unauthenticated.rows, []);

    globalThis.__ownerApiSessionTestResult = new Response(null, { status: 403 });
    const forbidden = await consultHqModelCatalog({
      gateway: "openrouter",
      nowMs: NOW,
      fetch,
    });
    assert.equal(forbidden.ok, false);
    assert.equal(forbidden.reason, "forbidden");
    assert.equal(forbidden.fetchCount, 0);

    globalThis.__ownerApiSessionTestResult = null;
    const authorized = await consultHqModelCatalog({
      gateway: "openrouter",
      nowMs: NOW,
      readCache: () => ({
        provider: "openrouter",
        generatedAt: new Date(NOW - 1000).toISOString(),
        entries: [{ id: "vendor/from-cache", name: "Cache" }],
      }),
      fetch,
    });
    assert.equal(authorized.ok, true);
    assert.equal(authorized.rows[0].modelId, "vendor/from-cache");
    assert.equal(authorized.rows[0].observedAt, new Date(NOW - 1000).toISOString());
    assert.equal(authorized.rows[0].provider, "openrouter");
    assert.equal(fetches, 0);
    assertDisplaySafe(unauthenticated);
    assertDisplaySafe(forbidden);
    assertDisplaySafe(authorized);
  } finally {
    delete globalThis.__ownerApiSessionTestResult;
  }
});

test("absent secret still returns the public catalog and does not call the account URL", async () => {
  const calls = [];
  const result = await consult({
    readSecret: () => undefined,
    transport: async (url, init) => {
      calls.push({ url, authorization: init.headers.authorization ?? null });
      return { status: 200, body: { data: [paidModel(), unknownModel()] } };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.access.configured, false);
  assert.equal(result.access.verified, false);
  assert.equal(result.access.executionAuthorized, false);
  assert.deepEqual(calls.map((call) => call.url), [OPENROUTER_PUBLIC_MODELS_URL]);
  assert.equal(calls[0].authorization, null);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows.every((row) => row.access === "public" && row.executable === false), true);
  assertDisplaySafe(result);
});

test("unknown provider is refused before fetch or secret lookup", async () => {
  let fetches = 0;
  let secrets = 0;
  const fetch = async () => {
    fetches += 1;
    throw new Error("fetch must not run");
  };
  const readSecret = () => {
    secrets += 1;
    return SECRET;
  };
  for (const gateway of ["anthropic", "mystery", ""]) {
    const result = await consult({ gateway, fetch, readSecret });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "unknown_provider");
    assert.equal(result.fetchCount, 0);
    assert.deepEqual(result.rows, []);
    assertDisplaySafe(result);
  }
  assert.equal(fetches, 0);
  assert.equal(secrets, 0);
});

test("timeout closes the consultation without a model call", { timeout: 5_000 }, async () => {
  let calls = 0;
  const result = await consult({
    fetch: (_url, init) => new Promise((_resolve, reject) => {
      calls += 1;
      init.signal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    }),
  });
  assert.equal(calls, 1);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "timeout");
  assert.equal(result.fetchCount, 1);
  assert.deepEqual(result.rows, []);
  assertDisplaySafe(result);
});

test("redirects are refused and not followed", async () => {
  let calls = 0;
  const redirected = await consult({
    transport: async (url, init) => {
      calls += 1;
      assert.equal(url, OPENROUTER_PUBLIC_MODELS_URL);
      assert.equal(init.method, "GET");
      assert.equal(init.redirect, "manual");
      return { status: 302, body: { data: [paidModel()] }, redirected: true };
    },
  });
  assert.equal(calls, 1);
  assert.equal(redirected.ok, false);
  assert.equal(redirected.reason, "redirect_refused");
  assert.deepEqual(redirected.rows, []);

  const fetch = boundedCatalogFetch(async () => {
    calls += 1;
    return { status: 200, body: { data: [paidModel()] } };
  });
  const signal = new AbortController().signal;
  const blocked = await fetch("https://evil.example/models", { method: "GET", headers: {}, signal });
  const posted = await fetch(OPENROUTER_PUBLIC_MODELS_URL, { method: "POST", headers: {}, signal });
  const chat = await fetch("https://openrouter.ai/api/v1/chat/completions", { method: "GET", headers: {}, signal });
  assert.equal(blocked.status, 400);
  assert.equal(posted.status, 400);
  assert.equal(chat.status, 400);
  assert.equal(calls, 1);
});

test("a configured account can be verified without authorizing execution", async () => {
  const calls = [];
  const result = await consult({
    readSecret: (envName) => {
      assert.equal(envName, "OPENROUTER_API_KEY");
      return SECRET;
    },
    transport: async (url, init) => {
      calls.push({ url, authorization: init.headers.authorization ?? null });
      if (url === OPENROUTER_ACCOUNT_MODELS_URL) {
        return { status: 200, body: { data: [zeroModel("acct/zero"), paidModel("acct/paid"), unknownModel()] } };
      }
      return { status: 200, body: { data: [paidModel()] } };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.fetchCount, 2);
  assert.deepEqual(result.access, {
    public: true,
    configured: true,
    verified: true,
    executionAuthorized: false,
  });
  assert.deepEqual(calls.map((call) => call.url), [OPENROUTER_PUBLIC_MODELS_URL, OPENROUTER_ACCOUNT_MODELS_URL]);
  assert.equal(calls[0].authorization, null);
  assert.equal(calls[1].authorization, `Bearer ${SECRET}`);

  const publicPaid = result.rows.find((row) => row.modelId === "openai/gpt-4o-mini");
  const verified = result.rows.find((row) => row.modelId === "acct/zero");
  const configuredPaid = result.rows.find((row) => row.modelId === "acct/paid");
  const configuredUnknown = result.rows.find((row) => row.modelId === "vendor/mystery");
  assert.equal(publicPaid.access, "public");
  assert.equal(verified.access, "verified");
  assert.equal(verified.unavailableReason, "not_authorized");
  assert.equal(verified.executable, false);
  assert.equal(verified.executionAuthorized, false);
  assert.equal(configuredPaid.access, "configured");
  assert.equal(configuredPaid.unavailableReason, "price_not_a_capability");
  assert.equal(configuredPaid.executable, false);
  assert.equal(configuredUnknown.access, "configured");
  assert.equal(configuredUnknown.price.kind, "unknown");
  assert.equal(result.rows.every((row) => row.executionAuthorized === false && row.executable === false), true);
  assert.equal(result.accountAccess, "observed");
  assertDisplaySafe(result);
});

test("a failed account read keeps the fresh public rows and does not authorize", async () => {
  const calls = [];
  const result = await consult({
    readSecret: (envName) => {
      assert.equal(envName, "OPENROUTER_API_KEY");
      return SECRET;
    },
    readCache: () => ({
      provider: "openrouter",
      generatedAt: FILE_DATE,
      entries: [{ id: "openrouter/old", name: "Old" }],
    }),
    transport: async (url, init) => {
      calls.push({ url, method: init.method, redirect: init.redirect, authorization: init.headers.authorization ?? null });
      if (url === OPENROUTER_ACCOUNT_MODELS_URL) return { status: 503, body: null };
      return { status: 200, body: { data: [paidModel("openai/live")] } };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.stale, false);
  assert.equal(result.source, "catalog_get");
  assert.equal(result.refresh, "refreshed");
  assert.equal(result.accountAccess, "unknown");
  assert.equal(result.fetchCount, 2);
  assert.deepEqual(result.access, {
    public: true,
    configured: true,
    verified: false,
    executionAuthorized: false,
  });
  assert.deepEqual(calls.map((call) => call.url), [OPENROUTER_PUBLIC_MODELS_URL, OPENROUTER_ACCOUNT_MODELS_URL]);
  assert.equal(calls[0].authorization, null);
  assert.equal(calls[1].authorization, `Bearer ${SECRET}`);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].modelId, "openai/live");
  assert.equal(result.rows[0].provider, "openrouter");
  assert.equal(result.rows[0].access, "public");
  assert.equal(result.rows[0].observedAt, OBSERVED);
  assert.equal(result.rows[0].price.kind, "positive_quote");
  assert.equal(result.rows[0].price.promptUsdPerMTok, 3);
  assert.equal(result.rows[0].price.completionUsdPerMTok, 15);
  assert.equal(result.rows[0].price.perRequestUsd, 0.002);
  assert.deepEqual(result.rows[0].units, {
    prompt: "usd_per_million_tokens",
    completion: "usd_per_million_tokens",
    request: "usd_per_request",
  });
  assert.deepEqual(result.rows[0].quota, { kind: "unknown" });
  assert.equal(result.rows[0].executable, false);
  assert.equal(result.rows[0].executionAuthorized, false);
  assert.equal(result.rows[0].stale, false);
  assert.equal(result.rows.some((row) => row.modelId === "openrouter/old"), false);
  assert.equal(JSON.stringify(result).includes(FILE_DATE), false);
  assertDisplaySafe(result);
});

test("refresh now performs one GET even when the scoped cache is fresh", async () => {
  const freshAt = new Date(NOW - 1000).toISOString();
  let calls = 0;
  const refreshed = await consult({
    refresh: "now",
    readCache: () => ({
      provider: "openrouter",
      generatedAt: freshAt,
      entries: [{ id: "vendor/fresh", name: "Fresh" }],
    }),
    transport: async (url, init) => {
      calls += 1;
      assert.equal(url, OPENROUTER_PUBLIC_MODELS_URL);
      assert.equal(init.method, "GET");
      assert.equal(init.redirect, "manual");
      return { status: 200, body: { data: [paidModel("openai/live")] } };
    },
  });
  assert.equal(calls, 1);
  assert.equal(refreshed.ok, true);
  assert.equal(refreshed.refresh, "refreshed");
  assert.equal(refreshed.stale, false);
  assert.equal(refreshed.source, "catalog_get");
  assert.equal(refreshed.rows.some((row) => row.modelId === "vendor/fresh"), false);
  assert.equal(refreshed.rows[0].modelId, "openai/live");
  assert.equal(refreshed.rows[0].executable, false);
  assert.equal(refreshed.accountAccess, "unknown");
  assert.equal(refreshed.access.executionAuthorized, false);

  const held = await consult({
    refresh: "now",
    readCache: () => ({
      provider: "openrouter",
      generatedAt: freshAt,
      entries: [{ id: "vendor/fresh", name: "Fresh" }],
    }),
  });
  assert.equal(held.ok, true);
  assert.equal(held.fetchCount, 0);
  assert.equal(held.refresh, "not_needed");
  assert.equal(held.rows[0].modelId, "vendor/fresh");
  assert.equal(held.rows[0].observedAt, freshAt);
});

test("Nara public plan announcement stays unknown quota and is not executable", async () => {
  const calls = [];
  const result = await consult({
    gateway: "nara",
    transport: async (url, init) => {
      calls.push({ url, method: init.method, redirect: init.redirect });
      return {
        status: 200,
        body: {
          data: [{ code: "free", token_cap_daily: 7000000, rpm_limit: 15, models: ["auto/bynara"] }],
        },
      };
    },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [{ url: NARA_PUBLIC_PLANS_URL, method: "GET", redirect: "manual" }]);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].provider, "nara");
  assert.equal(result.rows[0].modelId, "auto/bynara");
  assert.equal(result.rows[0].price.kind, "unknown");
  assert.deepEqual(result.rows[0].units, { prompt: "unknown", completion: "unknown", request: "unknown" });
  assert.equal(result.rows[0].observedAt, OBSERVED);
  assert.deepEqual(result.rows[0].quota, { kind: "unknown" });
  assert.equal(result.rows[0].announcedQuotas.some((quota) => quota.amount === 7000000 && quota.unit === "tokens_per_day" && quota.source === "public-plan:free"), true);
  assert.equal(result.rows[0].unavailableReason, "price_unknown");
  assert.equal(result.rows[0].executable, false);
  assert.equal(result.access.executionAuthorized, false);
  assert.equal(result.access.verified, false);
  assert.equal(JSON.stringify(result).includes(NARA_ACCOUNT_MODELS_URL), false);
  assertDisplaySafe(result);
});

test("the router catalog read keeps providers apart and refreshes only a stale cache", async () => {
  resetFreeModelCatalogCache();
  const snapshot = loadFreeModelCatalogSnapshot();
  assert.equal(snapshot.provider, "openrouter");
  assert.equal(snapshot.generatedAt, FILE_DATE);
  const openRouterIds = new Set(snapshot.entries.map((entry) => entry.id));
  assert.ok(openRouterIds.size > 0);

  let naraCalls = 0;
  const nara = await readRouterModelCatalog({
    gateway: "nara",
    nowMs: NOW,
    authorize: async () => null,
    transport: async (url, init) => {
      naraCalls += 1;
      assert.equal(url, NARA_PUBLIC_PLANS_URL);
      assert.equal(init.method, "GET");
      assert.equal(init.redirect, "manual");
      return {
        status: 200,
        body: { data: [{ code: "free", token_cap_daily: 7000000, rpm_limit: 15, models: ["auto/bynara"] }] },
      };
    },
  });
  assert.equal(naraCalls, 1);
  assert.equal(nara.ok, true);
  assert.equal(nara.refresh, "refreshed");
  assert.equal(nara.rows.length, 1);
  assert.equal(nara.rows[0].provider, "nara");
  assert.equal(nara.rows[0].modelId, "auto/bynara");
  assert.equal(openRouterIds.has(nara.rows[0].modelId), false);
  assert.equal(nara.rows.every((row) => row.provider === "nara"), true);

  const staleCalls = [];
  const refreshed = await readRouterModelCatalog({
    gateway: "openrouter",
    nowMs: NOW,
    authorize: async () => null,
    readCache: () => ({
      provider: "openrouter",
      generatedAt: FILE_DATE,
      entries: [{ id: "openrouter/old", name: "Old" }],
    }),
    transport: async (url, init) => {
      staleCalls.push({ url, method: init.method, redirect: init.redirect });
      return { status: 200, body: { data: [paidModel("openai/live")] } };
    },
  });
  assert.deepEqual(staleCalls, [{ url: OPENROUTER_PUBLIC_MODELS_URL, method: "GET", redirect: "manual" }]);
  assert.equal(refreshed.ok, true);
  assert.equal(refreshed.refresh, "refreshed");
  assert.equal(refreshed.stale, false);
  assert.equal(refreshed.source, "catalog_get");
  assert.equal(refreshed.fetchCount, 1);
  assert.equal(refreshed.rows.some((row) => row.modelId === "openrouter/old"), false);
  assert.equal(refreshed.rows[0].modelId, "openai/live");
  assert.equal(refreshed.rows[0].provider, "openrouter");
  assert.equal(refreshed.rows[0].observedAt, OBSERVED);
  assert.equal(refreshed.rows[0].executable, false);

  let freshCalls = 0;
  const freshAt = new Date(NOW - 1000).toISOString();
  const fresh = await readRouterModelCatalog({
    gateway: "openrouter",
    nowMs: NOW,
    authorize: async () => null,
    readCache: () => ({
      provider: "openrouter",
      generatedAt: freshAt,
      entries: [{ id: "vendor/fresh", name: "Fresh" }],
    }),
    transport: async () => {
      freshCalls += 1;
      throw new Error("fresh cache must not fetch");
    },
  });
  assert.equal(freshCalls, 0);
  assert.equal(fresh.ok, true);
  assert.equal(fresh.refresh, "not_needed");
  assert.equal(fresh.stale, false);
  assert.equal(fresh.fetchCount, 0);
  assert.equal(fresh.rows[0].modelId, "vendor/fresh");
  assert.equal(fresh.rows[0].provider, "openrouter");
  assert.equal(fresh.rows[0].observedAt, freshAt);
  assert.equal(fresh.rows[0].unavailableReason, "not_executable");
  assert.deepEqual(fresh.rows[0].units, { prompt: "unknown", completion: "unknown", request: "unknown" });

  let failedCalls = 0;
  const failed = await readRouterModelCatalog({
    gateway: "openrouter",
    nowMs: NOW,
    authorize: async () => null,
    readSecret: () => SECRET,
    readCache: () => ({
      provider: "openrouter",
      generatedAt: FILE_DATE,
      entries: [{ id: "openrouter/old", name: "Old" }],
    }),
    transport: async (url, init) => {
      failedCalls += 1;
      assert.equal(url, OPENROUTER_PUBLIC_MODELS_URL);
      assert.equal(init.method, "GET");
      assert.equal(init.redirect, "manual");
      return { status: 503, body: { data: [paidModel("openai/live")] } };
    },
  });
  assert.equal(failedCalls, 1);
  assert.equal(failed.ok, true);
  assert.equal(failed.refresh, "failed");
  assert.equal(failed.stale, true);
  assert.equal(failed.source, "cache");
  assert.equal(failed.fetchCount, 1);
  assert.equal(failed.rows.length, 1);
  assert.equal(failed.rows[0].modelId, "openrouter/old");
  assert.equal(failed.rows[0].provider, "openrouter");
  assert.equal(failed.rows[0].observedAt, FILE_DATE);
  assert.equal(failed.rows[0].unavailableReason, "refresh_failed");
  assert.equal(failed.rows[0].executable, false);
  assert.equal(failed.access.verified, false);
  assert.equal(failed.access.executionAuthorized, false);
  assert.equal(JSON.stringify(failed).includes(OBSERVED), false);
  assert.equal(JSON.stringify(failed).includes(SECRET), false);
  assert.equal(loadFreeModelCatalogSnapshot().generatedAt, FILE_DATE);

  const held = chooseModel({
    message: "Reformule cette phrase simplement.",
    requestedMode: "economy",
  });
  assert.equal(held.executedModelId, null);
  assert.equal(held.accountingEffect, "none");
  assert.equal(naraCalls, 1);
});

test("a cache reader exception stays closed and does not fetch", async () => {
  let fetches = 0;
  const result = await consult({
    readCache: () => {
      throw new Error(`cache leaked ${SECRET}`);
    },
    fetch: async () => {
      fetches += 1;
      return { status: 200, body: { data: [paidModel()] } };
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "unreadable");
  assert.equal(result.fetchCount, 0);
  assert.deepEqual(result.rows, []);
  assert.equal(fetches, 0);
  assertDisplaySafe(result);
});

test("synchronous reader and fetch failures stay closed", async () => {
  let fetches = 0;
  const secretFailure = await consult({
    readSecret: () => {
      throw new Error(`reader leaked ${SECRET}`);
    },
    fetch: async () => {
      fetches += 1;
      return { status: 200, body: { data: [paidModel()] } };
    },
  });
  assert.equal(secretFailure.ok, false);
  assert.equal(secretFailure.reason, "unreadable");
  assert.equal(secretFailure.fetchCount, 0);
  assert.equal(fetches, 0);
  assertDisplaySafe(secretFailure);

  const fetchFailure = await consult({
    fetch: () => {
      throw new Error(`fetch leaked ${SECRET}`);
    },
  });
  assert.equal(fetchFailure.ok, false);
  assert.equal(fetchFailure.reason, "unreadable");
  assert.equal(fetchFailure.fetchCount, 1);
  assertDisplaySafe(fetchFailure);

  const clock = await consult({
    nowMs: Number.NaN,
    fetch: async () => {
      fetches += 1;
      return { status: 200, body: { data: [] } };
    },
  });
  assert.equal(clock.ok, false);
  assert.equal(clock.reason, "unreadable");
  assert.equal(fetches, 0);

  const noTransport = await consult({ fetch: undefined, transport: undefined });
  assert.equal(noTransport.ok, false);
  assert.equal(noTransport.reason, "unreadable");
  assert.equal(noTransport.fetchCount, 0);
});

test("the real catalog transport is GET-only and does not follow redirects", async () => {
  let seen = null;
  const transport = nodeCatalogTransport(async (url, init) => {
    seen = { url: String(url), method: init.method, redirect: init.redirect };
    return new Response(JSON.stringify({ data: [unknownModel()] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  const result = await consult({ transport });
  assert.equal(seen.method, "GET");
  assert.equal(seen.redirect, "manual");
  assert.equal(seen.url, OPENROUTER_PUBLIC_MODELS_URL);
  assert.equal(result.ok, true);
  assert.equal(result.rows[0].price.kind, "unknown");
  assert.equal(result.rows[0].executable, false);

  const opaque = nodeCatalogTransport(async () => ({
    status: 0,
    type: "opaqueredirect",
    redirected: false,
    async text() {
      return JSON.stringify({ data: [paidModel()] });
    },
  }));
  const refused = await consult({ transport: opaque });
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, "redirect_refused");
  assert.deepEqual(refused.rows, []);

  const source = readFileSync(consultationPath, "utf8");
  assert.equal(source.includes("process.env"), false);
  assert.equal(source.includes("chat/completions"), false);
  assert.equal(source.includes("/v1/messages"), false);
});
