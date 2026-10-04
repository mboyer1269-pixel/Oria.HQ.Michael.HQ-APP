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

const gatewayPath = path.join(projectRoot, "src/server/ai/gateway-catalog.ts");
const catalogPath = path.join(projectRoot, "src/server/ai/server-capability-catalog.ts");
const providerPath = path.join(projectRoot, "src/server/ai/llm-json-provider.ts");
const executionPath = path.join(projectRoot, "src/server/ai/execution-models.ts");
const contractPath = path.join(projectRoot, "src/server/agents/models/model-provider-contract.ts");

const {
  normalizeGatewayCatalog,
  usdPerTokenToPerMillion,
  OPENROUTER_BASE_URL,
  OPENROUTER_PUBLIC_MODELS_URL,
  NARA_BASE_URL,
  NARA_PUBLIC_PLANS_URL,
  NARA_ACCOUNT_MODELS_URL,
  NARA_API_KEY_ENV,
} = await jiti.import(gatewayPath);
const { assessServerEmission, TARIFF_MAX_AGE_MS } = await jiti.import(catalogPath);
const { generateStructuredJson, generateHqStructuredJson } = await jiti.import(providerPath);
const { executionTargetForModel } = await jiti.import(executionPath);
const { OPENROUTER_MODELS_API_ENDPOINT, isProvenZeroPricing } = await jiti.import(contractPath);

const NOW = Date.parse("2026-10-02T12:00:00.000Z");
const FRESH = new Date(NOW - 60_000).toISOString();
const WORKSPACE = "ws-catalogue";
const ACCOUNT = "acct-server-1";
const REVISION = "rev-gateway-1";
const SECRET = "synthetic-server-secret";

function zeroModel(id, parameters = ["temperature"]) {
  return {
    id,
    pricing: { prompt: "0", completion: "0", request: "0" },
    supported_parameters: parameters,
    per_request_limits: null,
  };
}

function request(overrides = {}) {
  return {
    gateway: "openrouter",
    baseUrl: OPENROUTER_BASE_URL,
    sourceUrl: OPENROUTER_PUBLIC_MODELS_URL,
    apiKeyEnvVar: "OPENROUTER_API_KEY",
    observationClass: "public_list",
    accountId: ACCOUNT,
    workspaceId: WORKSPACE,
    catalogRevision: REVISION,
    observedAt: FRESH,
    timeoutMs: 1000,
    fetch: async () => ({ status: 200, body: { data: [] } }),
    readSecret: () => SECRET,
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

function noCents(value) {
  assert.equal(JSON.stringify(value).includes("notToExceedCents"), false);
  assert.equal(JSON.stringify(value).includes(SECRET), false);
}

test("1 client base URL, Nara image host, and combo host yield no capability", async () => {
  let fetches = 0;
  const fetch = async () => {
    fetches += 1;
    throw new Error("fetch must not run");
  };
  const cases = [
    request({ gateway: "nara", baseUrl: "https://evil.example/v1", sourceUrl: NARA_PUBLIC_PLANS_URL, fetch }),
    request({ gateway: "nara", baseUrl: "https://api-images.bynara.id/v1", sourceUrl: NARA_PUBLIC_PLANS_URL, fetch }),
    request({ gateway: "nara", baseUrl: "https://router.bynara.web.id/v1", sourceUrl: NARA_PUBLIC_PLANS_URL, fetch }),
  ];
  for (const input of cases) {
    const result = await normalizeGatewayCatalog(input);
    assert.equal(result.ok, false);
    assert.equal(result.reason, "base_url_rejected");
    assert.equal(result.capabilities.length, 0);
    assert.equal(result.catalog, null);
    noCents(result);
  }
  assert.equal(fetches, 0);
  assert.equal(OPENROUTER_PUBLIC_MODELS_URL, OPENROUTER_MODELS_API_ENDPOINT);
});

test("2 a secret value is rejected and NARA_API_KEY is only a name", async () => {
  let fetches = 0;
  const fetch = async () => {
    fetches += 1;
    return { status: 200, body: { data: [] } };
  };
  const rejected = await normalizeGatewayCatalog(request({
    apiKeyEnvVar: "sk-nry-xxxxxxxx",
    fetch,
  }));
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, "secret_name_rejected");
  assert.equal(rejected.capabilities.length, 0);
  const accepted = await normalizeGatewayCatalog(request({
    gateway: "nara",
    baseUrl: NARA_BASE_URL,
    sourceUrl: NARA_PUBLIC_PLANS_URL,
    apiKeyEnvVar: NARA_API_KEY_ENV,
    fetch,
  }));
  assert.equal(accepted.ok, true);
  assert.equal(JSON.stringify(accepted).includes(NARA_API_KEY_ENV), false);
  assert.equal(JSON.stringify(accepted).includes(SECRET), false);
  assert.equal(fetches, 1);
});

test("3 a public OpenRouter list is listed and does not reserve or fetch a model", async () => {
  const normalized = await normalizeGatewayCatalog(request({
    fetch: async () => ({ status: 200, body: { data: [zeroModel("listed-zero")] } }),
  }));
  assert.equal(normalized.ok, true);
  assert.equal(normalized.catalog.entries.length, 1);
  assert.equal(normalized.catalog.entries[0].state, "listed");
  assert.equal(normalized.catalog.entries[0].billingKind, "verified_free");
  assert.equal(normalized.catalog.entries[0].tariff, null);
  assert.notEqual(normalized.catalog.entries[0].state, "authorized");
  const assessed = assessServerEmission({
    catalog: normalized.catalog,
    modelId: "listed-zero",
    workspaceId: WORKSPACE,
    requiresTools: false,
    nowMs: NOW,
    invokedProvider: "openrouter",
    accountId: ACCOUNT,
  });
  assert.equal(assessed.emit, false);
  assert.equal(assessed.block, "public_catalog_only");
  const counters = { reserves: 0, marks: 0, releases: 0 };
  let fetches = 0;
  process.env.HQ_CALL_RESERVATION = "1";
  const result = await generateHqStructuredJson({
    providerPreference: "auto",
    modelId: "listed-zero",
    workspaceId: WORKSPACE,
    callSubjectId: "subject-public-list",
    systemPrompt: "sys",
    userPrompt: "user",
    nowMs: NOW,
    approved: {
      accountId: ACCOUNT,
      workspaceId: WORKSPACE,
      modelId: "listed-zero",
      billingKind: "verified_free",
      catalogRevision: REVISION,
    },
    serverCatalog: normalized.catalog,
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
  assert.equal(fetches, 0);
  assert.equal(counters.reserves, 0);
  assert.equal(result.executedModelId, null);
  assert.equal(result.cost.monetaryUsd, null);
  assert.equal(result.fallbackReason, "public_catalog_only");
});

test("4 a Nara account models body without an account is not authorized, and two accounts are ambiguous", async () => {
  const body = { data: [zeroModel("deepseek-v4-flash")] };
  const missing = await normalizeGatewayCatalog(request({
    gateway: "nara",
    baseUrl: NARA_BASE_URL,
    sourceUrl: NARA_ACCOUNT_MODELS_URL,
    apiKeyEnvVar: NARA_API_KEY_ENV,
    observationClass: "account_entitlement",
    accountId: null,
    fetch: async () => ({ status: 200, body }),
  }));
  assert.equal(missing.ok, true);
  assert.equal(missing.catalog.entries.length, 0);
  assert.equal(missing.observations[0].executable, false);
  assert.equal(missing.observations[0].state, null);
  assert.equal(assessServerEmission({
    catalog: missing.catalog,
    modelId: "deepseek-v4-flash",
    workspaceId: WORKSPACE,
    requiresTools: false,
    nowMs: NOW,
    invokedProvider: "nara",
  }).block, "not_listed");

  async function connected(accountId) {
    const normalized = await normalizeGatewayCatalog(request({
      gateway: "nara",
      baseUrl: NARA_BASE_URL,
      sourceUrl: NARA_ACCOUNT_MODELS_URL,
      apiKeyEnvVar: NARA_API_KEY_ENV,
      observationClass: "account_entitlement",
      accountId,
      fetch: async (_url, init) => {
        assert.equal(init.headers.authorization, `Bearer ${SECRET}`);
        return { status: 200, body };
      },
    }));
    assert.equal(JSON.stringify(normalized).includes(SECRET), false);
    assert.equal(normalized.catalog.entries.length, 1);
    assert.equal(normalized.catalog.entries[0].state, "connected");
    assert.notEqual(normalized.catalog.entries[0].state, "authorized");
    assert.equal(normalized.catalog.entries[0].billingKind, "verified_free");
    return normalized.catalog.entries[0];
  }
  const merged = {
    source: NARA_ACCOUNT_MODELS_URL,
    observedAt: FRESH,
    revision: REVISION,
    entries: [await connected("acct-a"), await connected("acct-b")],
  };
  const ambiguous = assessServerEmission({
    catalog: merged,
    modelId: "deepseek-v4-flash",
    workspaceId: WORKSPACE,
    requiresTools: false,
    nowMs: NOW,
    invokedProvider: "nara",
  });
  assert.equal(ambiguous.emit, false);
  assert.equal(ambiguous.block, "account_ambiguous");
  const one = assessServerEmission({
    catalog: { ...merged, entries: [merged.entries[0]] },
    modelId: "deepseek-v4-flash",
    workspaceId: WORKSPACE,
    requiresTools: false,
    nowMs: NOW,
    invokedProvider: "nara",
    accountId: "acct-a",
  });
  assert.equal(one.emit, false);
  assert.equal(one.block, "not_authorized");
});

test("5 an account id equal to the gateway is not a verified entry", async () => {
  const body = { data: [zeroModel("listed-zero")] };
  for (const [gateway, baseUrl, sourceUrl, envName] of [
    ["openrouter", OPENROUTER_BASE_URL, OPENROUTER_PUBLIC_MODELS_URL, "OPENROUTER_API_KEY"],
    ["nara", NARA_BASE_URL, NARA_ACCOUNT_MODELS_URL, NARA_API_KEY_ENV],
  ]) {
    const normalized = await normalizeGatewayCatalog(request({
      gateway,
      baseUrl,
      sourceUrl,
      apiKeyEnvVar: envName,
      observationClass: gateway === "nara" ? "account_entitlement" : "public_list",
      accountId: gateway,
      fetch: async () => ({ status: 200, body }),
    }));
    assert.equal(normalized.ok, true);
    assert.equal(normalized.catalog.entries.length, 0);
    assert.equal(normalized.observations[0].withheld, "account_unverified");
    assert.equal(normalized.observations[0].executable, false);
  }
});

test("6 a stale or future observation is capability_stale", async () => {
  const ages = [
    new Date(NOW - TARIFF_MAX_AGE_MS - 1).toISOString(),
    new Date(NOW + 60_000).toISOString(),
  ];
  for (const observedAt of ages) {
    const normalized = await normalizeGatewayCatalog(request({
      observedAt,
      fetch: async () => ({ status: 200, body: { data: [zeroModel("listed-zero")] } }),
    }));
    const assessed = assessServerEmission({
      catalog: normalized.catalog,
      modelId: "listed-zero",
      workspaceId: WORKSPACE,
      requiresTools: false,
      nowMs: NOW,
      invokedProvider: "openrouter",
      accountId: ACCOUNT,
    });
    assert.equal(assessed.emit, false);
    assert.equal(assessed.block, "capability_stale");
  }
});

test("7 a per-token price becomes USD per million and an absent price stays unknown", async () => {
  assert.equal(usdPerTokenToPerMillion("0.00003"), 30);
  assert.notEqual(usdPerTokenToPerMillion("0.00003"), 0.00003);
  assert.equal(usdPerTokenToPerMillion("0.00006"), 60);
  const normalized = await normalizeGatewayCatalog(request({
    fetch: async () => ({
      status: 200,
      body: {
        data: [
          {
            id: "openai/gpt-4",
            pricing: { prompt: "0.00003", completion: "0.00006", request: "0" },
            supported_parameters: ["temperature"],
          },
          { id: "no-price", supported_parameters: ["temperature"] },
        ],
      },
    }),
  }));
  const priced = normalized.observations.find((row) => row.modelId === "openai/gpt-4");
  const missing = normalized.observations.find((row) => row.modelId === "no-price");
  assert.equal(priced.price.kind, "positive_quote");
  assert.equal(priced.price.promptUsdPerMTok, 30);
  assert.notEqual(priced.price.promptUsdPerMTok, 0.00003);
  assert.equal(priced.executable, false);
  assert.equal(priced.withheld, "price_not_a_capability");
  assert.equal(missing.price.kind, "unknown");
  assert.equal(missing.withheld, "price_unknown");
  assert.equal(normalized.catalog.entries.length, 0);
  noCents(normalized);
  assert.equal(normalized.accountQuota.kind, "unknown");
  const counters = { reserves: 0, marks: 0, releases: 0 };
  process.env.HQ_CALL_RESERVATION = "1";
  const result = await generateHqStructuredJson({
    providerPreference: "auto",
    modelId: "no-price",
    workspaceId: WORKSPACE,
    callSubjectId: "subject-unknown-price",
    systemPrompt: "sys",
    userPrompt: "user",
    nowMs: NOW,
    approved: {
      accountId: ACCOUNT,
      workspaceId: WORKSPACE,
      modelId: "no-price",
      billingKind: "verified_free",
      catalogRevision: REVISION,
    },
    serverCatalog: normalized.catalog,
    reservationGate: closedGate(counters),
    fetchFns: {
      anthropic: async () => {
        throw new Error("fetch must not run");
      },
      openai: async () => {
        throw new Error("fetch must not run");
      },
    },
  });
  delete process.env.HQ_CALL_RESERVATION;
  assert.equal(counters.reserves, 0);
  assert.equal(result.executedModelId, null);
  assert.equal(result.cost.monetaryUsd, null);
  assert.notEqual(result.cost.monetaryUsd, 0);
});

test("8 proven zero does not emit and does not become a zero dollar cost", async () => {
  const normalized = await normalizeGatewayCatalog(request({
    fetch: async () => ({ status: 200, body: { data: [zeroModel("proven-zero-model")] } }),
  }));
  assert.equal(normalized.observations[0].price.kind, "proven_zero");
  assert.equal(normalized.catalog.entries[0].state, "listed");
  assert.equal(normalized.catalog.entries[0].billingKind, "verified_free");
  assert.equal(normalized.catalog.entries[0].tariff, null);
  const assessed = assessServerEmission({
    catalog: normalized.catalog,
    modelId: "proven-zero-model",
    workspaceId: WORKSPACE,
    requiresTools: false,
    nowMs: NOW,
    invokedProvider: "openrouter",
    accountId: ACCOUNT,
  });
  assert.equal(assessed.emit, false);
  const counters = { reserves: 0, marks: 0, releases: 0 };
  let fetches = 0;
  process.env.HQ_CALL_RESERVATION = "1";
  const result = await generateHqStructuredJson({
    providerPreference: "auto",
    modelId: "proven-zero-model",
    workspaceId: WORKSPACE,
    callSubjectId: "subject-proven-zero",
    systemPrompt: "sys",
    userPrompt: "user",
    nowMs: NOW,
    approved: {
      accountId: ACCOUNT,
      workspaceId: WORKSPACE,
      modelId: "proven-zero-model",
      billingKind: "verified_free",
      catalogRevision: REVISION,
    },
    serverCatalog: normalized.catalog,
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
  assert.equal(assessed.emit, false);
  assert.equal(fetches, 0);
  assert.equal(counters.reserves, 0);
  assert.equal(result.executedModelId, null);
  assert.equal(result.cost.monetaryUsd, null);
  assert.notEqual(result.cost.monetaryUsd, 0);
});

test("9 a public 7M plan cap stays announced and never becomes an account quota", async () => {
  const normalized = await normalizeGatewayCatalog(request({
    gateway: "nara",
    baseUrl: NARA_BASE_URL,
    sourceUrl: NARA_PUBLIC_PLANS_URL,
    apiKeyEnvVar: NARA_API_KEY_ENV,
    fetch: async () => ({
      status: 200,
      body: {
        data: [{
          code: "free",
          token_cap_daily: 7000000,
          rpm_limit: 15,
          models: ["agnes-2.5-flash"],
        }],
      },
    }),
  }));
  assert.equal(normalized.ok, true);
  assert.equal(normalized.catalog.entries.length, 0);
  assert.equal(normalized.accountQuota.kind, "unknown");
  assert.equal(normalized.observations[0].quota.kind, "unknown");
  assert.equal(normalized.observations[0].executable, false);
  assert.ok(normalized.observations[0].announcedQuotas.some((quota) => (
    quota.amount === 7000000 && quota.unit === "tokens_per_day" && quota.source === "public-plan:free"
  )));
  noCents(normalized);
  assert.equal(JSON.stringify(normalized.observations[0].quota).includes("7000000"), false);
});

test("10 a null per_request_limits leaves quota unknown", async () => {
  const normalized = await normalizeGatewayCatalog(request({
    fetch: async () => ({
      status: 200,
      body: { data: [{ ...zeroModel("capped"), per_request_limits: null }] },
    }),
  }));
  assert.equal(normalized.observations[0].quota.kind, "unknown");
  assert.equal(normalized.accountQuota.kind, "unknown");
  assert.equal(normalized.observations[0].announcedQuotas.length, 0);
});

test("11 a non-zero per-request fee stays in USD and is not free", async () => {
  const normalized = await normalizeGatewayCatalog(request({
    fetch: async () => ({
      status: 200,
      body: {
        data: [{
          id: "request-fee",
          pricing: { prompt: "0", completion: "0", request: "0.002" },
          supported_parameters: ["temperature"],
        }, {
          id: "token-and-request",
          pricing: { prompt: "0.00003", completion: "0.00006", request: "0.002" },
          supported_parameters: ["temperature"],
        }],
      },
    }),
  }));
  const fee = normalized.observations.find((row) => row.modelId === "request-fee");
  const both = normalized.observations.find((row) => row.modelId === "token-and-request");
  assert.equal(fee.price.kind, "positive_quote");
  assert.equal(fee.price.perRequestUsd, 0.002);
  assert.notEqual(fee.price.perRequestUsd, 2000);
  assert.equal(fee.price.promptUsdPerMTok, 0);
  assert.equal(fee.price.completionUsdPerMTok, 0);
  assert.notEqual(fee.price.kind, "proven_zero");
  assert.equal(fee.withheld, "price_not_a_capability");
  assert.equal(both.price.promptUsdPerMTok, 30);
  assert.equal(both.price.completionUsdPerMTok, 60);
  assert.equal(both.price.perRequestUsd, 0.002);
  assert.equal(normalized.catalog.entries.length, 0);
  assert.equal(normalized.catalog.entries.some((entry) => entry.billingKind === "verified_free"), false);
  noCents(normalized);
});

test("12 an unknown price is not free and is not a capability", async () => {
  const normalized = await normalizeGatewayCatalog(request({
    fetch: async () => ({
      status: 200,
      body: {
        data: [
          { id: "absent", supported_parameters: ["temperature"] },
          { id: "empty", pricing: {}, supported_parameters: ["temperature"] },
          { id: "partial", pricing: { prompt: "0", completion: "0" }, supported_parameters: ["temperature"] },
        ],
      },
    }),
  }));
  assert.equal(normalized.catalog.entries.length, 0);
  const absent = normalized.observations.find((row) => row.modelId === "absent");
  const empty = normalized.observations.find((row) => row.modelId === "empty");
  const partial = normalized.observations.find((row) => row.modelId === "partial");
  assert.equal(absent.price.kind, "unknown");
  assert.equal(empty.price.kind, "unknown");
  assert.equal(partial.price.kind, "partial_quote");
  assert.equal(partial.price.promptUsdPerMTok, 0);
  assert.equal(partial.price.completionUsdPerMTok, 0);
  assert.equal(partial.price.perRequestUsd, null);
  assert.notEqual(partial.price.kind, "proven_zero");
  for (const row of normalized.observations) {
    assert.equal(row.executable, false);
    assert.notEqual(row.price.kind, "proven_zero");
  }
  assert.equal(absent.withheld, "price_unknown");
  assert.equal(partial.withheld, "price_not_a_capability");
  const assessed = assessServerEmission({
    catalog: normalized.catalog,
    modelId: "absent",
    workspaceId: WORKSPACE,
    requiresTools: false,
    nowMs: NOW,
    invokedProvider: "openrouter",
    accountId: ACCOUNT,
  });
  assert.equal(assessed.emit, false);
  assert.equal(assessed.block, "not_listed");
});

test("13 a malformed source is rejected before fetch", async () => {
  let fetches = 0;
  const fetch = async () => {
    fetches += 1;
    throw new Error("fetch must not run");
  };
  const sources = [
    "https://openrouter.ai/api/v1/chat/completions",
    "https://openrouter.ai/api/v1/models/extra",
    "not a url",
    "https://router.bynara.web.id/v1/models",
  ];
  for (const sourceUrl of sources) {
    const result = await normalizeGatewayCatalog(request({ sourceUrl, fetch }));
    assert.equal(result.ok, false);
    assert.equal(result.reason, "source_rejected");
    assert.equal(result.capabilities.length, 0);
    assert.equal(result.catalog, null);
    assert.equal(result.fetchCount, 0);
  }
  assert.equal(fetches, 0);
});

test("14 a synchronous fetch or readSecret failure returns a closed result", async () => {
  const fetched = await normalizeGatewayCatalog(request({
    fetch: () => {
      throw new Error("sync fetch");
    },
  }));
  assert.equal(fetched.ok, false);
  assert.equal(fetched.reason, "unreadable");
  assert.equal(fetched.capabilities.length, 0);
  assert.equal(fetched.catalog, null);
  assert.equal(fetched.fetchCount, 1);

  let fetches = 0;
  const secret = await normalizeGatewayCatalog(request({
    observationClass: "account_entitlement",
    sourceUrl: "https://openrouter.ai/api/v1/models/user",
    readSecret: () => {
      throw new Error("sync secret");
    },
    fetch: () => {
      fetches += 1;
      throw new Error("fetch must not run");
    },
  }));
  assert.equal(secret.ok, false);
  assert.equal(secret.reason, "unreadable");
  assert.equal(secret.fetchCount, 0);
  assert.equal(secret.catalog, null);
  assert.equal(fetches, 0);
});

test("15 manual divergence from the approved model does not reserve or fetch", async () => {
  const normalized = await normalizeGatewayCatalog(request({
    fetch: async () => ({ status: 200, body: { data: [zeroModel("listed-zero")] } }),
  }));
  const counters = { reserves: 0, marks: 0, releases: 0 };
  let fetches = 0;
  process.env.HQ_CALL_RESERVATION = "1";
  const result = await generateHqStructuredJson({
    providerPreference: "auto",
    modelId: "listed-zero",
    workspaceId: WORKSPACE,
    callSubjectId: "subject-manual",
    systemPrompt: "sys",
    userPrompt: "user",
    nowMs: NOW,
    approved: {
      accountId: ACCOUNT,
      workspaceId: WORKSPACE,
      modelId: "other-model",
      billingKind: "verified_free",
      catalogRevision: REVISION,
    },
    serverCatalog: normalized.catalog,
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
  assert.equal(result.fallbackReason, "binding_mismatch");
  assert.equal(fetches, 0);
  assert.equal(counters.reserves, 0);
  assert.equal(result.executedModelId, null);
  assert.equal(result.cost.monetaryUsd, null);
});

test("16 openrouter/free, a :free id, and auto/bynara stay unsupported", async () => {
  for (const modelId of ["openrouter/free", "poolside/laguna-s-2.1:free", "auto/bynara"]) {
    assert.equal(executionTargetForModel(modelId).callable, false);
    let fetches = 0;
    const result = await generateStructuredJson({
      providerPreference: "auto",
      modelId,
      workspaceId: WORKSPACE,
      callSubjectId: `subject-${modelId}`,
      systemPrompt: "sys",
      userPrompt: "user",
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
    assert.equal(fetches, 0);
    assert.equal(result.errorCode, "model_unsupported");
    assert.equal(result.executedModelId, null);
    assert.equal(result.cost.monetaryUsd, null);
  }
});

test("17 normalization uses the injected fetch and does not call global fetch", async () => {
  const original = globalThis.fetch;
  let globalCalls = 0;
  globalThis.fetch = async () => {
    globalCalls += 1;
    throw new Error("global fetch must not run");
  };
  let injected = 0;
  try {
    const normalized = await normalizeGatewayCatalog(request({
      fetch: async (url, init) => {
        injected += 1;
        assert.equal(url, OPENROUTER_PUBLIC_MODELS_URL);
        assert.equal(init.method, "GET");
        assert.equal(init.headers.authorization, undefined);
        return { status: 200, body: { data: [zeroModel("listed-zero")] } };
      },
    }));
    assert.equal(normalized.ok, true);
    assert.equal(normalized.fetchCount, 1);
    assert.equal(injected, 1);
    assert.equal(globalCalls, 0);
  } finally {
    globalThis.fetch = original;
  }
});

test("timeouts, http errors, and missing account auth produce no capability", async () => {
  const hung = await normalizeGatewayCatalog(request({
    timeoutMs: 20,
    fetch: (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => {
        reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      });
    }),
  }));
  assert.equal(hung.ok, false);
  assert.equal(hung.reason, "timeout");
  assert.equal(hung.capabilities.length, 0);
  assert.equal(hung.fetchCount, 1);

  const denied = await normalizeGatewayCatalog(request({
    observationClass: "account_entitlement",
    sourceUrl: "https://openrouter.ai/api/v1/models/user",
    fetch: async () => ({ status: 401, body: { error: { message: "no" } } }),
  }));
  assert.equal(denied.ok, false);
  assert.equal(denied.reason, "http_error");
  assert.equal(denied.catalog, null);

  let fetches = 0;
  const missing = await normalizeGatewayCatalog(request({
    observationClass: "account_entitlement",
    sourceUrl: "https://openrouter.ai/api/v1/models/user",
    readSecret: () => undefined,
    fetch: async () => {
      fetches += 1;
      throw new Error("fetch must not run");
    },
  }));
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, "auth_missing");
  assert.equal(missing.fetchCount, 0);
  assert.equal(fetches, 0);
});

test("19 an absent request keeps prompt and completion and does not invent zero", async () => {
  const normalized = await normalizeGatewayCatalog(request({
    fetch: async () => ({
      status: 200,
      body: {
        data: [
          { id: "inclusionai/ling-3.1-flash", pricing: { prompt: "0", completion: "0" } },
          { id: "vendor/paid-no-request", pricing: { prompt: "0.000003", completion: "0.000015" } },
          { id: "vendor/prompt-only", pricing: { prompt: "0.000003" } },
          { id: "typesafe/jev-router", pricing: { prompt: "-1", completion: "-1" } },
          { id: "vendor/web-search", pricing: { prompt: "0.000003", completion: "0.000015", web_search: "0.01" } },
        ],
      },
    }),
  }));
  const freeShape = normalized.observations.find((row) => row.modelId === "inclusionai/ling-3.1-flash");
  const paid = normalized.observations.find((row) => row.modelId === "vendor/paid-no-request");
  const promptOnly = normalized.observations.find((row) => row.modelId === "vendor/prompt-only");
  const negative = normalized.observations.find((row) => row.modelId === "typesafe/jev-router");
  const searched = normalized.observations.find((row) => row.modelId === "vendor/web-search");
  assert.equal(freeShape.price.kind, "partial_quote");
  assert.equal(freeShape.price.promptUsdPerMTok, 0);
  assert.equal(freeShape.price.completionUsdPerMTok, 0);
  assert.equal(freeShape.price.perRequestUsd, null);
  assert.notEqual(freeShape.price.kind, "proven_zero");
  assert.equal(paid.price.kind, "partial_quote");
  assert.equal(paid.price.promptUsdPerMTok, 3);
  assert.equal(paid.price.completionUsdPerMTok, 15);
  assert.equal(paid.price.perRequestUsd, null);
  assert.equal(promptOnly.price.kind, "partial_quote");
  assert.equal(promptOnly.price.promptUsdPerMTok, 3);
  assert.equal(promptOnly.price.completionUsdPerMTok, null);
  assert.notEqual(promptOnly.price.completionUsdPerMTok, 0);
  assert.equal(promptOnly.price.perRequestUsd, null);
  assert.equal(negative.price.kind, "unknown");
  assert.equal(searched.price.kind, "partial_quote");
  assert.equal(searched.price.promptUsdPerMTok, 3);
  assert.equal(searched.price.completionUsdPerMTok, 15);
  assert.equal(searched.price.perRequestUsd, null);
  assert.deepEqual(searched.price.surcharges, [
    { key: "web_search", amount: 0.01, unit: "usd_per_request" },
  ]);
  assert.notEqual(searched.price.surcharges[0].amount, 10000);
  assert.equal(normalized.catalog.entries.length, 0);
  assert.equal(normalized.observations.every((row) => row.executable === false), true);
  noCents(normalized);
});

test("20 repeated Nara plan models stay one row and keep each plan", async () => {
  const normalized = await normalizeGatewayCatalog(request({
    gateway: "nara",
    baseUrl: NARA_BASE_URL,
    sourceUrl: NARA_PUBLIC_PLANS_URL,
    apiKeyEnvVar: NARA_API_KEY_ENV,
    fetch: async () => ({
      status: 200,
      body: {
        data: [
          { code: "free", token_cap_daily: 7000000, rpm_limit: 15, models: ["agnes-2.5-flash", "only-free"] },
          { code: "freemium", token_cap_daily: 25000000, rpm_limit: 50, models: ["agnes-2.5-flash", "agnes-2.5-flash"] },
        ],
      },
    }),
  }));
  assert.deepEqual(normalized.observations.map((row) => row.modelId), ["agnes-2.5-flash", "only-free"]);
  const shared = normalized.observations[0];
  assert.equal(shared.price.kind, "unknown");
  assert.equal(shared.executable, false);
  assert.deepEqual(shared.announcedQuotas.map((quota) => `${quota.source}:${quota.unit}:${quota.amount}`), [
    "public-plan:free:tokens_per_day:7000000",
    "public-plan:free:requests_per_minute:15",
    "public-plan:freemium:tokens_per_day:25000000",
    "public-plan:freemium:requests_per_minute:50",
  ]);
  assert.equal(normalized.catalog.entries.length, 0);
  assert.equal(normalized.accountQuota.kind, "unknown");
  noCents(normalized);
});

test("21 a non-zero surcharge keeps known components and does not invent a total or a free price", async () => {
  const normalized = await normalizeGatewayCatalog(request({
    fetch: async () => ({
      status: 200,
      body: {
        data: [
          {
            id: "vendor/cache",
            pricing: { prompt: "0.0000008", completion: "0.0000032", input_cache_read: "0.00000003" },
          },
          {
            id: "vendor/complete-plus-search",
            pricing: { prompt: "0.000003", completion: "0.000015", request: "0.002", web_search: "0.01" },
          },
          {
            id: "vendor/true-zero",
            pricing: { prompt: "0", completion: "0", request: "0", web_search: "0", input_cache_read: "0" },
          },
          {
            id: "vendor/zero-plus-search",
            pricing: { prompt: "0", completion: "0", request: "0", web_search: "0.01" },
          },
          { id: "vendor/missing" },
          { id: "vendor/empty", pricing: {} },
          { id: "vendor/bad", pricing: { prompt: "-1", completion: "-1" } },
          {
            id: "vendor/unreadable-surcharge",
            pricing: { prompt: "0.000003", completion: "0.000015", web_search: "-1" },
          },
          {
            id: "vendor/image",
            pricing: { prompt: "0.00000075", completion: "0.00000375", image: "0.00000075" },
          },
          {
            id: "vendor/overrides",
            pricing: { prompt: "0.000003", completion: "0.000015", overrides: ["tier"] },
          },
        ],
      },
    }),
  }));
  const cache = normalized.observations.find((row) => row.modelId === "vendor/cache");
  const complete = normalized.observations.find((row) => row.modelId === "vendor/complete-plus-search");
  const zero = normalized.observations.find((row) => row.modelId === "vendor/true-zero");
  const zeroPlus = normalized.observations.find((row) => row.modelId === "vendor/zero-plus-search");
  const missing = normalized.observations.find((row) => row.modelId === "vendor/missing");
  const empty = normalized.observations.find((row) => row.modelId === "vendor/empty");
  const bad = normalized.observations.find((row) => row.modelId === "vendor/bad");
  const unreadable = normalized.observations.find((row) => row.modelId === "vendor/unreadable-surcharge");
  const image = normalized.observations.find((row) => row.modelId === "vendor/image");
  const overrides = normalized.observations.find((row) => row.modelId === "vendor/overrides");

  assert.equal(cache.price.kind, "partial_quote");
  assert.equal(cache.price.promptUsdPerMTok, 0.8);
  assert.equal(cache.price.completionUsdPerMTok, 3.2);
  assert.equal(cache.price.perRequestUsd, null);
  assert.deepEqual(cache.price.surcharges, [
    { key: "input_cache_read", amount: 0.03, unit: "usd_per_million_tokens" },
  ]);
  assert.equal(cache.withheld, "price_not_a_capability");

  assert.equal(complete.price.kind, "partial_quote");
  assert.equal(complete.price.promptUsdPerMTok, 3);
  assert.equal(complete.price.completionUsdPerMTok, 15);
  assert.equal(complete.price.perRequestUsd, 0.002);
  assert.deepEqual(complete.price.surcharges, [
    { key: "web_search", amount: 0.01, unit: "usd_per_request" },
  ]);
  assert.equal("total" in complete.price, false);
  assert.notEqual(complete.price.kind, "positive_quote");
  assert.notEqual(complete.price.kind, "proven_zero");

  assert.equal(isProvenZeroPricing({ promptUsdPerMTok: 0, completionUsdPerMTok: 0, perRequestUsd: 0 }), true);
  assert.equal(zero.price.kind, "proven_zero");
  assert.deepEqual(zero.price.surcharges.map((item) => item.amount), [0, 0]);
  assert.equal(isProvenZeroPricing({ promptUsdPerMTok: 0, completionUsdPerMTok: 0, perRequestUsd: null }), false);
  assert.equal(zeroPlus.price.kind, "partial_quote");
  assert.equal(zeroPlus.price.promptUsdPerMTok, 0);
  assert.equal(zeroPlus.price.completionUsdPerMTok, 0);
  assert.equal(zeroPlus.price.perRequestUsd, 0);
  assert.equal(zeroPlus.price.surcharges[0].amount, 0.01);
  assert.notEqual(zeroPlus.price.kind, "proven_zero");

  assert.equal(missing.price.kind, "unknown");
  assert.equal(empty.price.kind, "unknown");
  assert.equal(bad.price.kind, "unknown");
  assert.equal(unreadable.price.kind, "partial_quote");
  assert.equal(unreadable.price.promptUsdPerMTok, 3);
  assert.equal(unreadable.price.completionUsdPerMTok, 15);
  assert.equal(unreadable.price.perRequestUsd, null);
  assert.deepEqual(unreadable.price.surcharges, [
    { key: "web_search", amount: null, unit: "unknown" },
  ]);

  assert.equal(image.price.promptUsdPerMTok, 0.75);
  assert.deepEqual(image.price.surcharges, [
    { key: "image", amount: 0.00000075, unit: "unknown" },
  ]);
  assert.notEqual(image.price.surcharges[0].amount, 0.75);

  assert.equal(overrides.price.kind, "unknown");
  assert.equal(normalized.catalog.entries.length, 0);
  assert.equal(normalized.observations.every((row) => row.executable === false), true);
  assert.equal(JSON.stringify(normalized).includes("gratuit"), false);
  noCents(normalized);
});
