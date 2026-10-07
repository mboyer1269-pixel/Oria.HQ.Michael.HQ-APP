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

const surfacePath = path.join(projectRoot, "src/server/ai/hq-model-catalog.ts");
const pagePath = path.join(projectRoot, "src/app/hq/runtime/page.tsx");
const { loadHqModelCatalog } = await jiti.import(surfacePath);
const { chooseModel } = await jiti.import(path.join(projectRoot, "src/server/ai/model-router.ts"));
const { resolveModelProfile } = await jiti.import(path.join(projectRoot, "src/server/ai/model-config.ts"));
const { getCostLadderSnapshot, getLadderCostLog } = await jiti.import(
  path.join(projectRoot, "src/server/ai/cost-ladder.ts"),
);
const { getCallAccountingLog } = await jiti.import(
  path.join(projectRoot, "src/server/ai/call-accounting.ts"),
);
const {
  OPENROUTER_PUBLIC_MODELS_URL,
  OPENROUTER_ACCOUNT_MODELS_URL,
  NARA_PUBLIC_PLANS_URL,
  NARA_ACCOUNT_MODELS_URL,
} = await jiti.import(path.join(projectRoot, "src/server/ai/gateway-catalog.ts"));

const NOW = Date.parse("2026-10-02T12:00:00.000Z");
const FILE_DATE = "2026-06-12T10:08:29.7657332-04:00";
const SECRET = "synthetic-catalog-secret";
const FRESH_AT = new Date(NOW - 1000).toISOString();

const realFetch = globalThis.fetch;
globalThis.fetch = async () => {
  throw new Error("global fetch must not run");
};
after(() => {
  globalThis.fetch = realFetch;
  delete globalThis.__ownerApiSessionTestResult;
});

function paidModel(id = "openai/live") {
  return {
    id,
    pricing: { prompt: "0.000003", completion: "0.000015", request: "0.002" },
    supported_parameters: ["tools"],
  };
}

function naraPlans() {
  return {
    status: 200,
    body: { data: [{ code: "free", token_cap_daily: 7000000, rpm_limit: 15, models: ["auto/bynara"] }] },
  };
}

function catalogBody(url, models) {
  if (url === NARA_PUBLIC_PLANS_URL) return naraPlans();
  if (url === NARA_ACCOUNT_MODELS_URL || url === OPENROUTER_ACCOUNT_MODELS_URL) {
    return { status: 503, body: null };
  }
  return { status: 200, body: { data: models } };
}

function assertViewSafe(value) {
  const json = JSON.stringify(value);
  assert.equal(json.includes(SECRET), false);
  assert.equal(json.includes("Bearer"), false);
  assert.equal(json.includes("https://"), false);
  assert.equal(json.includes("7000000"), false);
  assert.equal(json.includes("notToExceedCents"), false);
  assert.equal(value.accountAccess, "unknown");
  assert.equal(value.executionAuthorized, false);
  assert.equal(value.access.verified, false);
  assert.equal(value.access.executionAuthorized, false);
}

test("owner refusal happens before any catalog request", async () => {
  let calls = 0;
  const transport = async () => {
    calls += 1;
    throw new Error("network must not run");
  };
  try {
    globalThis.__ownerApiSessionTestResult = new Response(null, { status: 401 });
    const unauthenticated = await loadHqModelCatalog({ nowMs: NOW, transport });
    assert.equal(unauthenticated.ok, false);
    assert.equal(unauthenticated.reason, "unauthenticated");
    assert.deepEqual(unauthenticated.lines, []);
    assert.equal(calls, 0);

    globalThis.__ownerApiSessionTestResult = new Response(null, { status: 403 });
    const forbidden = await loadHqModelCatalog({ nowMs: NOW, transport });
    assert.equal(forbidden.ok, false);
    assert.equal(forbidden.reason, "forbidden");
    assert.equal(calls, 0);
    assertViewSafe(unauthenticated);
    assertViewSafe(forbidden);
  } finally {
    delete globalThis.__ownerApiSessionTestResult;
  }
});

test("a failed account read keeps fresh public rows with unknown access", async () => {
  const calls = [];
  const view = await loadHqModelCatalog({
    nowMs: NOW,
    authorize: async () => null,
    readSecret: (envName) => {
      assert.equal(envName === "OPENROUTER_API_KEY" || envName === "NARA_API_KEY", true);
      return SECRET;
    },
    readCache: (gateway) => gateway === "openrouter"
      ? { provider: "openrouter", generatedAt: FILE_DATE, entries: [{ id: "openrouter/old", name: "Old" }] }
      : null,
    transport: async (url, init) => {
      calls.push({ url, method: init.method, redirect: init.redirect });
      assert.equal(init.headers.authorization === undefined || init.headers.authorization === `Bearer ${SECRET}`, true);
      return catalogBody(url, [paidModel("openai/live")]);
    },
  });
  assert.equal(view.ok, true);
  assert.deepEqual(calls.map((call) => call.url).sort(), [
    OPENROUTER_PUBLIC_MODELS_URL,
    OPENROUTER_ACCOUNT_MODELS_URL,
    NARA_PUBLIC_PLANS_URL,
    NARA_ACCOUNT_MODELS_URL,
  ].sort());
  assert.equal(calls.every((call) => call.method === "GET" && call.redirect === "manual"), true);
  const live = view.lines.find((line) => line.modelId === "openai/live");
  const nara = view.lines.find((line) => line.modelId === "auto/bynara");
  assert.ok(live && nara);
  assert.equal(live.provider, "openrouter");
  assert.equal(live.tariff, "3 / 15 / 0.002");
  assert.deepEqual(live.units, {
    prompt: "usd_per_million_tokens",
    completion: "usd_per_million_tokens",
    request: "usd_per_request",
  });
  assert.equal(live.observedAt, new Date(NOW).toISOString());
  assert.equal(live.status, "indisponible");
  assert.equal(live.executable, false);
  assert.equal(live.executionAuthorized, false);
  assert.equal(nara.provider, "nara");
  assert.equal(nara.status, "inconnu");
  assert.equal(nara.tariff, "inconnu");
  assert.deepEqual(nara.units, { prompt: "unknown", completion: "unknown", request: "unknown" });
  assert.equal(view.lines.some((line) => line.modelId === "openrouter/old"), false);
  assert.equal(view.access.configured, true);
  assert.equal(view.stale, false);
  assertViewSafe(view);
});

test("opening refreshes a stale cache once and leaves a fresh cache untouched", async () => {
  const staleCalls = [];
  const stale = await loadHqModelCatalog({
    nowMs: NOW,
    authorize: async () => null,
    readCache: (gateway) => ({
      provider: gateway,
      generatedAt: FILE_DATE,
      entries: [{ id: `${gateway}/old`, name: "Old" }],
    }),
    transport: async (url, init) => {
      staleCalls.push({ url, method: init.method, redirect: init.redirect });
      assert.equal(init.method, "GET");
      assert.equal(init.redirect, "manual");
      return catalogBody(url, [paidModel("openai/live")]);
    },
  });
  assert.deepEqual(staleCalls.map((call) => call.url), [OPENROUTER_PUBLIC_MODELS_URL, NARA_PUBLIC_PLANS_URL]);
  assert.equal(stale.ok, true);
  assert.equal(stale.stale, false);
  assert.equal(stale.lines.some((line) => line.modelId.endsWith("/old")), false);
  assert.equal(stale.lines.some((line) => line.modelId === "openai/live"), true);

  let freshCalls = 0;
  const fresh = await loadHqModelCatalog({
    nowMs: NOW,
    authorize: async () => null,
    readCache: (gateway) => ({
      provider: gateway,
      generatedAt: FRESH_AT,
      entries: [{ id: `${gateway}/fresh`, name: "Fresh" }],
    }),
    transport: async () => {
      freshCalls += 1;
      throw new Error("fresh cache must not fetch");
    },
  });
  assert.equal(freshCalls, 0);
  assert.equal(fresh.ok, true);
  assert.equal(fresh.stale, false);
  assert.deepEqual(fresh.lines.map((line) => line.modelId), ["openrouter/fresh", "nara/fresh"]);
  assert.equal(fresh.lines.every((line) => line.status === "inconnu" && line.observedAt === FRESH_AT), true);
  assertViewSafe(fresh);
});

test("Actualiser forces one bounded pass even when the cache is fresh", async () => {
  const calls = [];
  const view = await loadHqModelCatalog({
    nowMs: NOW,
    refresh: "now",
    authorize: async () => null,
    readCache: (gateway) => ({
      provider: gateway,
      generatedAt: FRESH_AT,
      entries: [{ id: `${gateway}/fresh`, name: "Fresh" }],
    }),
    transport: async (url) => {
      calls.push(url);
      return catalogBody(url, [paidModel("openai/live")]);
    },
  });
  assert.deepEqual(calls, [OPENROUTER_PUBLIC_MODELS_URL, NARA_PUBLIC_PLANS_URL]);
  assert.equal(view.ok, true);
  assert.equal(view.lines.some((line) => line.modelId.endsWith("/fresh")), false);
  assert.equal(view.lines.find((line) => line.modelId === "openai/live").tariff, "3 / 15 / 0.002");
  assert.equal(view.lines.every((line) => line.executionAuthorized === false), true);
});

test("concurrent loads share one pass across the two allowlisted providers", async () => {
  const calls = [];
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const authorize = async () => null;
  const readCache = () => null;
  const transport = async (url) => {
    calls.push(url);
    await gate;
    return catalogBody(url, [paidModel("openai/live")]);
  };
  const first = loadHqModelCatalog({ nowMs: NOW, authorize, readCache, transport });
  const second = loadHqModelCatalog({ nowMs: NOW, authorize, readCache, transport });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(calls.length, 2);
  release();
  const [left, right] = await Promise.all([first, second]);
  assert.deepEqual(calls.slice().sort(), [OPENROUTER_PUBLIC_MODELS_URL, NARA_PUBLIC_PLANS_URL].sort());
  assert.equal(left.ok, true);
  assert.equal(right.ok, true);
  assert.deepEqual(left.lines, right.lines);
  assert.equal(left.lines.filter((line) => line.modelId === "openai/live").length, 1);
});

test("client endpoint and provider hints are ignored", async () => {
  const calls = [];
  const view = await loadHqModelCatalog({
    nowMs: NOW,
    authorize: async () => null,
    readCache: () => null,
    accountId: "client-forged",
    sourceUrl: "https://evil.example/models",
    gateway: "anthropic",
    transport: async (url) => {
      calls.push(url);
      return catalogBody(url, [paidModel("openai/live")]);
    },
  });
  assert.deepEqual(calls, [OPENROUTER_PUBLIC_MODELS_URL, NARA_PUBLIC_PLANS_URL]);
  const json = JSON.stringify(view);
  assert.equal(json.includes("client-forged"), false);
  assert.equal(json.includes("evil.example"), false);
  assert.equal(json.includes("anthropic"), false);
  assert.equal(view.lines.every((line) => line.provider === "openrouter" || line.provider === "nara"), true);
  assertViewSafe(view);
});

test("each provider has its own page so Nara is not hidden by OpenRouter", async () => {
  const models = Array.from({ length: 30 }, (_item, index) => ({ id: `vendor/m${index}` }));
  const shared = {
    nowMs: NOW,
    authorize: async () => null,
    readCache: () => null,
    transport: async (url) => catalogBody(url, models),
  };
  const view = await loadHqModelCatalog(shared);
  assert.equal(view.ok, true);
  const openrouter = view.sections.find((section) => section.provider === "openrouter");
  const nara = view.sections.find((section) => section.provider === "nara");
  assert.equal(openrouter.total, 30);
  assert.equal(openrouter.page, 1);
  assert.equal(openrouter.pageCount, 2);
  assert.equal(openrouter.lines.length, 24);
  assert.equal(openrouter.lines[0].modelId, "vendor/m0");
  assert.equal(openrouter.lines.at(-1).modelId, "vendor/m23");
  assert.equal(nara.total, 1);
  assert.equal(nara.pageCount, 1);
  assert.equal(nara.lines[0].modelId, "auto/bynara");
  assert.equal(view.lines.some((line) => line.modelId === "auto/bynara"), true);
  assert.equal(view.hiddenCount, 6);
  assert.equal(view.lines.every((line) => line.status === "inconnu" && line.executable === false), true);

  const page2 = await loadHqModelCatalog({ ...shared, provider: "openrouter", page: 2 });
  assert.deepEqual(page2.lines.map((line) => line.modelId), [
    "vendor/m24", "vendor/m25", "vendor/m26", "vendor/m27", "vendor/m28", "vendor/m29",
  ]);
  assert.equal(page2.sections.length, 1);
  assert.equal(page2.sections[0].page, 2);
  assert.equal(page2.lines.some((line) => line.provider === "nara"), false);

  const onlyNara = await loadHqModelCatalog({ ...shared, provider: "nara", page: 9 });
  assert.deepEqual(onlyNara.lines.map((line) => line.modelId), ["auto/bynara"]);
  assert.equal(onlyNara.sections[0].page, 1);
  assert.equal(onlyNara.lines.some((line) => line.provider === "openrouter"), false);

  const ignored = await loadHqModelCatalog({ ...shared, provider: "anthropic", page: 0 });
  assert.equal(ignored.sections.map((section) => section.provider).join(), "openrouter,nara");
  assert.equal(ignored.lines.some((line) => line.modelId === "auto/bynara"), true);
  assert.equal(ignored.sections[0].page, 1);
});

test("a public OpenRouter row without request shows the known components and Nara models stay unique", async () => {
  const view = await loadHqModelCatalog({
    nowMs: NOW,
    authorize: async () => null,
    readCache: () => null,
    transport: async (url) => {
      if (url === NARA_PUBLIC_PLANS_URL) {
        return {
          status: 200,
          body: {
            data: [
              { code: "free", token_cap_daily: 7000000, rpm_limit: 15, models: ["agnes-2.5-flash"] },
              { code: "freemium", token_cap_daily: 25000000, rpm_limit: 50, models: ["agnes-2.5-flash"] },
            ],
          },
        };
      }
      return {
        status: 200,
        body: {
          data: [{ id: "vendor/paid-no-request", pricing: { prompt: "0.000003", completion: "0.000015" } }],
        },
      };
    },
  });
  const paid = view.lines.find((line) => line.modelId === "vendor/paid-no-request");
  const nara = view.lines.filter((line) => line.modelId === "agnes-2.5-flash");
  assert.equal(paid.tariff, "3 / 15 / inconnu");
  assert.deepEqual(paid.units, {
    prompt: "usd_per_million_tokens",
    completion: "usd_per_million_tokens",
    request: "unknown",
  });
  assert.equal(paid.status, "indisponible");
  assert.equal(paid.executable, false);
  assert.equal(paid.executionAuthorized, false);
  assert.equal(nara.length, 1);
  assert.equal(nara[0].tariff, "inconnu");
  assert.equal(view.executionAuthorized, false);
  assert.equal(JSON.stringify(view).includes("7000000"), false);
  assertViewSafe(view);
});

test("a non-zero surcharge stays beside the known tariff and is not labeled free", async () => {
  const view = await loadHqModelCatalog({
    nowMs: NOW,
    authorize: async () => null,
    readCache: () => null,
    transport: async (url) => catalogBody(url, [
      {
        id: "vendor/surcharge",
        pricing: {
          prompt: "0.000003",
          completion: "0.000015",
          web_search: "0.01",
          input_cache_read: "0.00000003",
        },
      },
      { id: "vendor/true-zero", pricing: { prompt: "0", completion: "0", request: "0" } },
      { id: "vendor/missing", pricing: {} },
    ]),
  });
  const paid = view.lines.find((line) => line.modelId === "vendor/surcharge");
  const zero = view.lines.find((line) => line.modelId === "vendor/true-zero");
  const missing = view.lines.find((line) => line.modelId === "vendor/missing");
  assert.equal(
    paid.tariff,
    "3 / 15 / inconnu ; Recherche web : 0.01 USD / requête ; Lecture du cache : 0.03 USD / million de tokens",
  );
  assert.equal(paid.tariff.includes("10000"), false);
  assert.equal(paid.tariff.includes("18.03"), false);
  assert.equal(paid.tariff.includes("gratuit"), false);
  assert.deepEqual(paid.units, {
    prompt: "usd_per_million_tokens",
    completion: "usd_per_million_tokens",
    request: "unknown",
  });
  assert.equal(paid.status, "indisponible");
  assert.equal(paid.executable, false);
  assert.equal(paid.executionAuthorized, false);
  assert.equal(zero.tariff, "0 / 0 / 0");
  assert.equal(zero.status, "indisponible");
  assert.equal(missing.tariff, "inconnu");
  assert.deepEqual(missing.units, { prompt: "unknown", completion: "unknown", request: "unknown" });
  assert.equal(view.executionAuthorized, false);
  assertViewSafe(view);
});

test("loading the catalog does not change the approved model choice or the budget logs", async () => {
  const beforeProfile = resolveModelProfile("claude-sonnet-4-6");
  const before = chooseModel({
    message: "Reformule cette phrase simplement.",
    requestedMode: "economy",
  });
  const costBefore = JSON.stringify(getCostLadderSnapshot());
  const ladderBefore = getLadderCostLog().length;
  const journalBefore = getCallAccountingLog().length;
  assert.ok(journalBefore >= 1);
  await loadHqModelCatalog({
    nowMs: NOW,
    authorize: async () => null,
    readCache: () => null,
    transport: async (url) => catalogBody(url, [paidModel("openai/live")]),
  });
  assert.equal(JSON.stringify(getCostLadderSnapshot()), costBefore);
  assert.equal(getLadderCostLog().length, ladderBefore);
  assert.equal(getCallAccountingLog().length, journalBefore);
  const after = chooseModel({
    message: "Reformule cette phrase simplement.",
    requestedMode: "economy",
  });
  const afterProfile = resolveModelProfile("claude-sonnet-4-6");
  assert.equal(before.modelId, "gpt-4o-mini");
  assert.equal(after.modelId, "gpt-4o-mini");
  assert.equal(before.executedModelId, null);
  assert.equal(after.executedModelId, null);
  assert.equal(before.accountingEffect, "none");
  assert.equal(after.accountingEffect, "none");
  assert.equal(before.estimate.monetaryUsd, null);
  assert.equal(after.estimate.monetaryUsd, null);
  assert.equal(after.chosenModelId, before.chosenModelId);
  assert.equal(after.mode, before.mode);
  assert.equal(beforeProfile.id, "claude-sonnet-4-6");
  assert.equal(beforeProfile.provider, "anthropic");
  assert.equal(afterProfile.id, beforeProfile.id);
  assert.equal(afterProfile.provider, beforeProfile.provider);
  assert.equal(afterProfile.label, beforeProfile.label);
});

test("a stale server snapshot refreshes on open and a fresh one does not call again", async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init.method, redirect: init.redirect });
    if (String(url) === OPENROUTER_PUBLIC_MODELS_URL) {
      return new Response(JSON.stringify({ data: [paidModel("openai/live")] }), { status: 200 });
    }
    if (String(url) === NARA_PUBLIC_PLANS_URL) {
      return new Response(JSON.stringify(naraPlans().body), { status: 200 });
    }
    return new Response("no", { status: 404 });
  };
  try {
    const authorize = async () => null;
    const first = await loadHqModelCatalog({ nowMs: NOW, authorize });
    assert.equal(first.ok, true);
    assert.deepEqual(calls.map((call) => call.url), [OPENROUTER_PUBLIC_MODELS_URL, NARA_PUBLIC_PLANS_URL]);
    assert.equal(calls.every((call) => call.method === "GET" && call.redirect === "manual"), true);
    const live = first.lines.find((line) => line.modelId === "openai/live");
    assert.equal(live.tariff, "3 / 15 / 0.002");
    assert.equal(live.status, "indisponible");
    assertViewSafe(first);

    const second = await loadHqModelCatalog({ nowMs: NOW + 1000, authorize });
    assert.equal(calls.length, 2);
    assert.equal(second.lines.find((line) => line.modelId === "openai/live").observedAt, live.observedAt);

    const forced = await loadHqModelCatalog({ nowMs: NOW + 5000, refresh: "now", authorize });
    assert.equal(calls.length, 4);
    assert.equal(forced.lines.find((line) => line.modelId === "openai/live").observedAt, new Date(NOW + 5000).toISOString());
    assert.equal(forced.executionAuthorized, false);
  } finally {
    globalThis.fetch = async () => {
      throw new Error("global fetch must not run");
    };
  }
});

test("the runtime page is the catalog consumer and does not select a model", () => {
  const page = readFileSync(pagePath, "utf8");
  const surface = readFileSync(surfacePath, "utf8");
  assert.equal(page.includes("loadHqModelCatalog"), true);
  assert.equal(page.includes('"catalog", "refresh"'), true);
  assert.equal(page.includes("fournisseur"), true);
  assert.equal(page.includes("Suite"), true);
  assert.equal(page.includes("Actualiser"), true);
  assert.equal(page.includes("chooseModel"), false);
  assert.equal(page.includes("accountId"), false);
  assert.equal(page.includes("sourceUrl"), false);
  assert.equal(page.includes("setInterval"), false);
  assert.equal(page.includes("process.env"), false);
  assert.ok(page.indexOf('access.status === "forbidden"') < page.indexOf("loadHqModelCatalog({"));
  assert.equal(surface.includes("readRouterModelCatalog"), true);
  assert.equal(surface.includes("accountId"), false);
  assert.equal(surface.includes("sourceUrl"), false);
  assert.equal(surface.includes("setInterval"), false);
  assert.equal(surface.includes("chat/completions"), false);
  assert.equal(surface.includes("chooseModel"), false);
});
