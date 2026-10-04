/**
 * Server consultation of the gateway catalog for the existing HQ model surfaces.
 *
 * There is no AI-model HTTP route. Inventory `/api/inventory/vehicle-catalog`
 * is a vehicle make/model list and is not this catalog. This function is the
 * connection point: the existing owner gate, the existing provider registry,
 * the existing free-catalog cache, and `normalizeGatewayCatalog`.
 *
 * It does not add a route, a router, or an execution right. Paid rows and
 * unknown prices are returned for display and stay non-executable.
 * The free-model file belongs to OpenRouter only. A stale snapshot can be
 * refreshed by one bounded catalog GET. If that GET fails, the original
 * timestamp is kept and the rows stay stale. A failed account GET does not
 * discard a public catalog that already succeeded: access and quota stay
 * unknown, and nothing is authorized by default.
 */

import "server-only";

import { requireOwnerApiSession } from "@/server/auth/owner";
import {
  createStaticProviderRegistry,
  type ProviderRegistry,
} from "@/server/agents/models/provider-registry-contract";
import {
  OPENROUTER_MODELS_API_ENDPOINT,
  type ModelProviderDescriptor,
  type RuntimeAdapterDescriptor,
} from "@/server/agents/models/model-provider-contract";
import { TARIFF_MAX_AGE_MS } from "@/server/ai/server-capability-catalog";
import { loadFreeModelCatalogSnapshot } from "@/server/ai/free-model-catalog";
import {
  NARA_ACCOUNT_MODELS_URL,
  NARA_API_KEY_ENV,
  NARA_BASE_URL,
  NARA_PUBLIC_PLANS_URL,
  OPENROUTER_ACCOUNT_MODELS_URL,
  OPENROUTER_API_KEY_ENV,
  OPENROUTER_BASE_URL,
  OPENROUTER_PUBLIC_MODELS_URL,
  normalizeGatewayCatalog,
  type GatewayCatalogRequest,
  type GatewayFetch,
  type GatewayId,
  type GatewayModelObservation,
  type PriceObservation,
} from "@/server/ai/gateway-catalog";

export type CatalogConsultationRow = {
  provider: string;
  modelId: string;
  label: string;
  price: PriceObservation;
  /** Prompt and completion are USD per million tokens. The request fee is USD per request. */
  units: CatalogPriceUnits;
  observedAt: string | null;
  quota: { kind: "unknown" };
  announcedQuotas: readonly { amount: number; unit: string; source: string }[];
  unavailableReason: string;
  /** public list, configured secret, or verified account observation. Never execution. */
  access: "public" | "configured" | "verified";
  executable: false;
  executionAuthorized: false;
  stale: boolean;
};

export type CatalogConsultation =
  | {
      ok: true;
      rows: readonly CatalogConsultationRow[];
      access: {
        public: true;
        configured: boolean;
        verified: boolean;
        executionAuthorized: false;
      };
      stale: boolean;
      source: "cache" | "catalog_get";
      /** Fresh cache is not refetched. A failed refresh keeps the previous rows. */
      refresh: "not_needed" | "cache_only" | "refreshed" | "failed";
      /** Account entitlement was not proven. Never an execution right. */
      accountAccess: "unknown" | "observed";
      fetchCount: number;
    }
  | {
      ok: false;
      reason: "unauthenticated" | "forbidden" | "unknown_provider" | "timeout" | "redirect_refused" | "unreadable" | "source_rejected";
      rows: readonly [];
      fetchCount: number;
    };

export type CatalogTransport = (
  url: string,
  init: {
    method: "GET";
    redirect: "manual";
    headers: Readonly<Record<string, string>>;
    signal: AbortSignal;
  },
) => Promise<{ status: number; body: unknown; redirected?: boolean }>;

export type CatalogPriceUnits = {
  prompt: "usd_per_million_tokens" | "unknown";
  completion: "usd_per_million_tokens" | "unknown";
  request: "usd_per_request" | "unknown";
};

const KNOWN_PRICE_UNITS: CatalogPriceUnits = {
  prompt: "usd_per_million_tokens",
  completion: "usd_per_million_tokens",
  request: "usd_per_request",
};

const UNKNOWN_PRICE_UNITS: CatalogPriceUnits = {
  prompt: "unknown",
  completion: "unknown",
  request: "unknown",
};

type CacheView = {
  provider: GatewayId;
  generatedAt: string | null;
  entries: readonly { id: string; name?: string }[];
};

export type CatalogRefreshPolicy = "if-stale" | "cache-only" | "now";

const OPENROUTER_CONNECTOR: ModelProviderDescriptor = {
  id: "openrouter",
  label: "OpenRouter",
  kind: "router",
  trustLevel: "allowlisted",
  apiKeyEnvVar: OPENROUTER_API_KEY_ENV,
  baseUrl: OPENROUTER_BASE_URL,
  catalogSource: {
    kind: "openrouter-models-api",
    endpoint: OPENROUTER_MODELS_API_ENDPOINT,
    refreshPolicy: "manual-refresh",
  },
  supportsMcp: false,
  supportsToolUse: true,
};

const NARA_CONNECTOR: ModelProviderDescriptor = {
  id: "nara",
  label: "NaraRouter",
  kind: "router",
  trustLevel: "allowlisted",
  apiKeyEnvVar: NARA_API_KEY_ENV,
  baseUrl: NARA_BASE_URL,
  catalogSource: {
    kind: "manual",
    refreshPolicy: "manual-refresh",
  },
  supportsMcp: false,
  supportsToolUse: false,
};

/** Existing HTTP adapter shape. Registered for lookup only — consult never invokes it. Nara has no execution adapter. */
const OPENROUTER_ADAPTER: RuntimeAdapterDescriptor = {
  id: "openrouter-http",
  label: "OpenRouter HTTP",
  kind: "http-api",
  providerId: "openrouter",
  sentinelle: { defaultZone: "green", requiresApprovalForToolUse: false },
  ledgerRequired: true,
};

function catalogRegistry(): ProviderRegistry | null {
  const created = createStaticProviderRegistry({
    providers: [OPENROUTER_CONNECTOR, NARA_CONNECTOR],
    models: [],
    adapters: [OPENROUTER_ADAPTER],
  });
  return created.ok ? created.registry : null;
}

function failure(reason: Extract<CatalogConsultation, { ok: false }>["reason"], fetchCount: number): CatalogConsultation {
  return { ok: false, reason, rows: [], fetchCount };
}

function isStale(observedAt: string | null, nowMs: number): boolean {
  if (!observedAt) return true;
  const parsed = Date.parse(observedAt);
  if (!Number.isFinite(parsed) || parsed > nowMs) return true;
  return nowMs - parsed > TARIFF_MAX_AGE_MS;
}

function unitsFor(price: PriceObservation): CatalogPriceUnits {
  if (price.kind === "partial_quote") {
    return {
      prompt: price.promptUsdPerMTok === null ? "unknown" : "usd_per_million_tokens",
      completion: price.completionUsdPerMTok === null ? "unknown" : "usd_per_million_tokens",
      request: price.perRequestUsd === null ? "unknown" : "usd_per_request",
    };
  }
  return price.kind === "unknown" ? UNKNOWN_PRICE_UNITS : KNOWN_PRICE_UNITS;
}

function unavailableReason(observation: GatewayModelObservation): string {
  if (observation.price.kind === "unknown") return "price_unknown";
  if (observation.price.kind === "positive_quote" || observation.price.kind === "partial_quote") return "price_not_a_capability";
  if (observation.state === "listed") return "public_catalog_only";
  if (observation.state === "connected") return "not_authorized";
  return observation.withheld ?? "not_executable";
}

function rowFromObservation(
  observation: GatewayModelObservation,
  provider: string,
  observedAt: string,
  access: CatalogConsultationRow["access"],
  stale: boolean,
): CatalogConsultationRow {
  return {
    provider,
    modelId: observation.modelId,
    label: observation.modelId,
    price: observation.price,
    units: unitsFor(observation.price),
    observedAt,
    quota: { kind: "unknown" },
    announcedQuotas: observation.announcedQuotas,
    unavailableReason: unavailableReason(observation),
    access,
    executable: false,
    executionAuthorized: false,
    stale,
  };
}

function allowlisted(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.username !== "" || parsed.password !== "") return false;
    const path = `${parsed.origin}${parsed.pathname}`;
    return path === OPENROUTER_PUBLIC_MODELS_URL
      || path === OPENROUTER_ACCOUNT_MODELS_URL
      || path === NARA_PUBLIC_PLANS_URL
      || path === NARA_ACCOUNT_MODELS_URL;
  } catch {
    return false;
  }
}

/**
 * GET catalog transport. Redirects are not followed. The URL must already be
 * on the server allowlist. Tests inject the transport; this does not run by itself.
 */
export function boundedCatalogFetch(transport: CatalogTransport): GatewayFetch {
  return async (url, init) => {
    if (init.method !== "GET" || !allowlisted(url)) {
      return { status: 400, body: null };
    }
    const response = await transport(url, {
      method: "GET",
      redirect: "manual",
      headers: init.headers,
      signal: init.signal,
    });
    if (response.redirected || (response.status >= 300 && response.status < 400)) {
      return { status: 302, body: null };
    }
    return { status: response.status, body: response.body };
  };
}

function accessFor(
  observation: GatewayModelObservation,
  account: boolean,
): CatalogConsultationRow["access"] {
  if (!account) return "public";
  return observation.state === "connected" ? "verified" : "configured";
}

async function authorizeOwner(): Promise<{ status: number } | null> {
  const response = await requireOwnerApiSession();
  if (!response) return null;
  return { status: typeof response.status === "number" ? response.status : 401 };
}

/**
 * Real catalog GET. Redirects are not followed: opaque redirects and 3xx
 * become a refused redirect with no second request. Callers must pass this
 * transport explicitly. Consultation does not call it on its own.
 */
export function nodeCatalogTransport(fetchImpl: typeof fetch = globalThis.fetch): CatalogTransport {
  return async (url, init) => {
    const response = await fetchImpl(url, {
      method: "GET",
      redirect: "manual",
      headers: { ...init.headers },
      signal: init.signal,
    });
    const redirected = response.redirected
      || response.type === "opaqueredirect"
      || response.status === 0
      || (response.status >= 300 && response.status < 400);
    if (redirected) return { status: 302, body: null, redirected: true };
    const text = await response.text();
    let body: unknown = null;
    if (text.length > 0) {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }
    return { status: response.status, body, redirected: false };
  };
}

function sourceUrl(gateway: GatewayId, account: boolean): string {
  if (gateway === "openrouter") {
    return account ? OPENROUTER_ACCOUNT_MODELS_URL : OPENROUTER_PUBLIC_MODELS_URL;
  }
  return account ? NARA_ACCOUNT_MODELS_URL : NARA_PUBLIC_PLANS_URL;
}

export async function consultHqModelCatalog(input: {
  gateway: string;
  nowMs: number;
  accountId?: string | null;
  workspaceId?: string;
  fetch?: GatewayFetch;
  transport?: CatalogTransport;
  readSecret?: (envName: string) => string | undefined;
  /** Scoped by gateway. A snapshot for another provider is ignored. */
  readCache?: (gateway: string) => CacheView | null;
  /**
   * `if-stale` performs one bounded catalog GET when the scoped cache is missing or older than 24h.
   * `now` performs that GET even when the cache is fresh. `cache-only` never fetches.
   * The default is `if-stale` when a transport is supplied, otherwise `cache-only`.
   */
  refresh?: CatalogRefreshPolicy;
  authorize?: () => Promise<{ status: number } | null>;
}): Promise<CatalogConsultation> {
  const authorize = input.authorize ?? authorizeOwner;
  let auth: { status: number } | null;
  try {
    auth = await authorize();
  } catch {
    return failure("unreadable", 0);
  }
  if (auth) return failure(auth.status === 403 ? "forbidden" : "unauthenticated", 0);

  const registry = catalogRegistry();
  const provider = registry?.getProvider(input.gateway);
  if (!provider || (provider.id !== "openrouter" && provider.id !== "nara")) {
    return failure("unknown_provider", 0);
  }
  if (provider.baseUrl !== (provider.id === "openrouter" ? OPENROUTER_BASE_URL : NARA_BASE_URL)) {
    return failure("source_rejected", 0);
  }
  if (!Number.isFinite(input.nowMs)) return failure("unreadable", 0);
  const gateway = provider.id === "nara" ? "nara" : "openrouter";

  let secret: string | undefined;
  try {
    secret = input.readSecret?.(provider.apiKeyEnvVar ?? "");
  } catch {
    return failure("unreadable", 0);
  }
  const configured = typeof secret === "string" && secret.length > 0;

  let cache: CacheView | null;
  try {
    const readCache = input.readCache ?? defaultCache;
    cache = scopedCache(gateway, readCache(gateway));
  } catch {
    return failure("unreadable", 0);
  }
  const cacheIsFresh = cache !== null && !isStale(cache.generatedAt, input.nowMs);
  const canRefresh = input.transport !== undefined || input.fetch !== undefined;
  const refresh = input.refresh ?? (canRefresh ? "if-stale" : "cache-only");
  if (refresh !== "now" && cache && cacheIsFresh) {
    return cacheConsultation(cache, configured, false, "not_executable", 0, "not_needed");
  }
  if (refresh === "cache-only" || !canRefresh) {
    if (cache) {
      return cacheConsultation(
        cache,
        configured,
        !cacheIsFresh,
        cacheIsFresh ? "not_executable" : "stale_cache",
        0,
        cacheIsFresh ? "not_needed" : "cache_only",
      );
    }
    return failure("unreadable", 0);
  }

  const injected = input.fetch;
  const inner: CatalogTransport | null = input.transport
    ?? (injected
      ? async (url, init) => injected(url, { method: "GET", headers: init.headers, signal: init.signal })
      : null);
  if (!inner) return failure("unreadable", 0);
  const catalogFetch = boundedCatalogFetch(inner);

  let redirectSeen = false;
  const guarded: GatewayFetch = async (url, init) => {
    const response = await catalogFetch(url, init);
    if (response.status >= 300 && response.status < 400) redirectSeen = true;
    return response;
  };

  const observedAt = new Date(input.nowMs).toISOString();
  const common: Omit<GatewayCatalogRequest, "sourceUrl" | "observationClass"> = {
    gateway,
    baseUrl: provider.baseUrl ?? "",
    apiKeyEnvVar: provider.apiKeyEnvVar ?? OPENROUTER_API_KEY_ENV,
    accountId: input.accountId ?? null,
    workspaceId: input.workspaceId ?? "hq",
    catalogRevision: "consultation",
    observedAt,
    timeoutMs: 1000,
    fetch: guarded,
    readSecret: input.readSecret,
  };

  const pub = await normalizeGatewayCatalog({
    ...common,
    sourceUrl: sourceUrl(gateway, false),
    observationClass: "public_list",
  });
  if (!pub.ok) {
    const reason = redirectSeen
      ? "redirect_refused"
      : pub.reason === "timeout"
        ? "timeout"
        : pub.reason === "source_rejected"
          ? "source_rejected"
          : "unreadable";
    if (cache) return cacheConsultation(cache, configured, true, "refresh_failed", pub.fetchCount, "failed");
    return failure(reason, pub.fetchCount);
  }

  let fetchCount = pub.fetchCount;
  let verified = false;
  const rows = pub.observations.map((observation) =>
    rowFromObservation(observation, gateway, observedAt, "public", false));

  if (configured) {
    const account = await normalizeGatewayCatalog({
      ...common,
      sourceUrl: sourceUrl(gateway, true),
      observationClass: "account_entitlement",
    });
    fetchCount += account.fetchCount;
    if (!account.ok) {
      return {
        ok: true,
        rows,
        access: { public: true, configured, verified: false, executionAuthorized: false },
        stale: false,
        source: "catalog_get",
        refresh: "refreshed",
        accountAccess: "unknown",
        fetchCount,
      };
    }
    verified = account.observations.some((observation) => observation.state === "connected");
    for (const observation of account.observations) {
      rows.push(rowFromObservation(
        observation,
        gateway,
        observedAt,
        accessFor(observation, true),
        false,
      ));
    }
  }

  return {
    ok: true,
    rows,
    access: { public: true, configured, verified, executionAuthorized: false },
    stale: false,
    source: "catalog_get",
    refresh: "refreshed",
    accountAccess: verified ? "observed" : "unknown",
    fetchCount,
  };
}

function scopedCache(gateway: GatewayId, cache: CacheView | null): CacheView | null {
  if (!cache || cache.provider !== gateway) return null;
  if (!cache.generatedAt && cache.entries.length === 0) return null;
  return cache;
}

function cacheConsultation(
  cache: CacheView,
  configured: boolean,
  stale: boolean,
  unavailableReason: string,
  fetchCount: number,
  refresh: "not_needed" | "cache_only" | "failed",
): CatalogConsultation {
  const rows = cache.entries.map((entry): CatalogConsultationRow => ({
    provider: cache.provider,
    modelId: entry.id,
    label: entry.name && entry.name.length > 0 ? entry.name : entry.id,
    price: { kind: "unknown" },
    units: UNKNOWN_PRICE_UNITS,
    observedAt: cache.generatedAt,
    quota: { kind: "unknown" },
    announcedQuotas: [],
    unavailableReason,
    access: "public",
    executable: false,
    executionAuthorized: false,
    stale,
  }));
  return {
    ok: true,
    rows,
    access: { public: true, configured, verified: false, executionAuthorized: false },
    stale,
    source: "cache",
    refresh,
    accountAccess: "unknown",
    fetchCount,
  };
}

/** OpenRouter file only. Nara has no snapshot here, so the file is not relabeled. */
function defaultCache(gateway: string): CacheView | null {
  if (gateway !== "openrouter") return null;
  const snapshot = loadFreeModelCatalogSnapshot();
  if (snapshot.provider !== "openrouter") return null;
  if (!snapshot.generatedAt && snapshot.entries.length === 0) return null;
  return {
    provider: "openrouter",
    generatedAt: snapshot.generatedAt,
    entries: snapshot.entries.map((entry) => ({ id: entry.id, name: entry.name })),
  };
}
