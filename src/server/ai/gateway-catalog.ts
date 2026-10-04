/**
 * Server normalization of OpenRouter and NaraRouter catalog payloads.
 *
 * The injected fetch is the only reader. This module never calls global
 * fetch, never opens a model socket, and never reserves a budget.
 * A models or plans body is not an authorization, a subscription, or a quota.
 *
 * ServerCapability cannot represent an unknown price, an unknown tool flag,
 * or a public announcement. Those stay on GatewayModelObservation, which is
 * not executable. A capability is emitted only for a proven-zero price with
 * a known tools flag, and only as "listed" (public) or "connected" (account).
 * State "authorized" and billingKind "api" are never produced here.
 *
 * prompt and completion are USD per token and are stored as USD per million.
 * pricing.request is already USD per request and is stored unchanged.
 * Each of prompt, completion, and request may be absent. An absent measure
 * stays unknown and is never stored as zero. A partial quote is not free
 * and does not become a capability.
 * A present optional surcharge does not erase known prompt or completion.
 * Each surcharge keeps its own amount and unit. Nothing here sums them into
 * a total. proven_zero reuses isProvenZeroPricing and also requires every
 * present surcharge to be a known exact zero. web_search is USD per request.
 * Cache and internal_reasoning follow the per-token conversion. image is the
 * raw USD decimal with unit unknown. pricing.overrides still withhold the
 * whole quote.
 * This module does not choose a model. The existing router remains the selector.
 * Nothing here becomes notToExceedCents.
 *
 * Public Nara token_cap_daily, including 7000000, is announcedQuota only.
 */

import { isProvenZeroPricing } from "@/server/agents/models/model-provider-contract";
import type { ServerCapability, ServerCapabilityCatalog } from "@/server/ai/server-capability-catalog";

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const OPENROUTER_PUBLIC_MODELS_URL = "https://openrouter.ai/api/v1/models";
export const OPENROUTER_ACCOUNT_MODELS_URL = "https://openrouter.ai/api/v1/models/user";
export const OPENROUTER_ACCOUNT_KEY_URL = "https://openrouter.ai/api/v1/key";

export const NARA_BASE_URL = "https://router.bynara.id/v1";
export const NARA_PUBLIC_PLANS_URL = "https://router.bynara.id/api/plans";
export const NARA_ACCOUNT_MODELS_URL = "https://router.bynara.id/v1/models";

/** Proposed server env name. The value is never copied into a result. */
export const NARA_API_KEY_ENV = "NARA_API_KEY";
export const OPENROUTER_API_KEY_ENV = "OPENROUTER_API_KEY";

const ENV_VAR_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const SURCHARGE_KEYS = [
  "image",
  "web_search",
  "internal_reasoning",
  "input_cache_read",
  "input_cache_write",
] as const;

export type GatewayId = "openrouter" | "nara";
export type CatalogObservationClass = "public_list" | "account_entitlement";

export type PriceComponent = {
  key: (typeof SURCHARGE_KEYS)[number];
  /** Null means the field is present but unreadable. It is not zero. */
  amount: number | null;
  unit: "usd_per_million_tokens" | "usd_per_request" | "unknown";
};

type PriceSurcharges = {
  /** Present surcharge fields only. Absent keys are omitted, not stored as zero. */
  surcharges?: readonly PriceComponent[];
};

export type PriceObservation =
  | { kind: "unknown" }
  | ({ kind: "proven_zero" } & PriceSurcharges)
  | ({
      kind: "positive_quote";
      promptUsdPerMTok: number;
      completionUsdPerMTok: number;
      perRequestUsd: number;
    } & PriceSurcharges)
  | ({
      /** Null is an absent or unreadable measure. It is not zero. */
      kind: "partial_quote";
      promptUsdPerMTok: number | null;
      completionUsdPerMTok: number | null;
      perRequestUsd: number | null;
    } & PriceSurcharges);

export type QuotaObservation =
  | { kind: "unknown" }
  | {
      kind: "observed";
      unit: "tokens_per_day" | "requests_per_minute" | "requests_per_day";
      amount: number;
      scope: string;
    };

export type AnnouncedQuota = {
  amount: number;
  unit: "tokens_per_day" | "requests_per_minute";
  source: string;
};

export type GatewayModelObservation = {
  modelId: string;
  observationClass: CatalogObservationClass;
  /** Public list is "listed". Account access is "connected" only when an account id is filed. Never "authorized". */
  state: "listed" | "connected" | null;
  executable: false;
  tools: boolean | null;
  structuredJson: boolean | null;
  inputModalities: string[] | null;
  outputModalities: string[] | null;
  price: PriceObservation;
  quota: QuotaObservation;
  announcedQuotas: readonly AnnouncedQuota[];
  withheld: string | null;
};

export type GatewayFetch = (
  url: string,
  init: { method: "GET"; headers: Readonly<Record<string, string>>; signal: AbortSignal },
) => Promise<{ status: number; body: unknown }>;

export type GatewayCatalogRequest = {
  gateway: GatewayId;
  baseUrl: string;
  sourceUrl: string;
  apiKeyEnvVar: string;
  observationClass: CatalogObservationClass;
  accountId: string | null;
  workspaceId: string;
  catalogRevision: string;
  observedAt: string;
  timeoutMs: number;
  fetch: GatewayFetch;
  readSecret?: (envName: string) => string | undefined;
};

export type GatewayNormalizationFailure = {
  ok: false;
  reason: "base_url_rejected" | "source_rejected" | "secret_name_rejected" | "auth_missing" | "timeout" | "http_error" | "unreadable";
  capabilities: readonly [];
  observations: readonly [];
  catalog: null;
  accountQuota: { kind: "unknown" };
  fetchCount: number;
};

export type GatewayNormalizationSuccess = {
  ok: true;
  catalog: ServerCapabilityCatalog;
  observations: readonly GatewayModelObservation[];
  accountQuota: QuotaObservation;
  fetchCount: number;
};

export type GatewayNormalization = GatewayNormalizationFailure | GatewayNormalizationSuccess;

type AllowlistHit = "models" | "plans" | "key";

function isEnvName(value: string): boolean {
  return value.length > 0 && value.length <= 64 && ENV_VAR_NAME_PATTERN.test(value);
}

function fixedUrl(url: string, origin: string, pathname: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.origin !== origin || parsed.pathname !== pathname) return false;
  if (parsed.username !== "" || parsed.password !== "") return false;
  return true;
}

function allowlist(request: GatewayCatalogRequest): AllowlistHit | null {
  if (request.gateway === "openrouter") {
    if (request.baseUrl !== OPENROUTER_BASE_URL) return null;
    if (request.observationClass === "public_list") {
      return fixedUrl(request.sourceUrl, "https://openrouter.ai", "/api/v1/models") ? "models" : null;
    }
    if (fixedUrl(request.sourceUrl, "https://openrouter.ai", "/api/v1/models/user")) return "models";
    if (fixedUrl(request.sourceUrl, "https://openrouter.ai", "/api/v1/key")) return "key";
    return null;
  }
  if (request.baseUrl !== NARA_BASE_URL) return null;
  if (request.observationClass === "public_list") {
    return fixedUrl(request.sourceUrl, "https://router.bynara.id", "/api/plans") ? "plans" : null;
  }
  return fixedUrl(request.sourceUrl, "https://router.bynara.id", "/v1/models") ? "models" : null;
}

function baseRejected(request: GatewayCatalogRequest): boolean {
  return request.gateway === "openrouter"
    ? request.baseUrl !== OPENROUTER_BASE_URL
    : request.baseUrl !== NARA_BASE_URL;
}

function failure(
  reason: GatewayNormalizationFailure["reason"],
  fetchCount: number,
): GatewayNormalizationFailure {
  return {
    ok: false,
    reason,
    capabilities: [],
    observations: [],
    catalog: null,
    accountQuota: { kind: "unknown" },
    fetchCount,
  };
}

/** Plain non-negative USD decimal. Null when the string is not that shape. */
function parseUsdAmount(raw: string): number | null {
  if (!/^\d+(\.\d+)?$/.test(raw)) return null;
  if ((raw.split(".")[1] ?? "").length > 12) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/** USD per token string → USD per million tokens. Does not apply to per-request fees. */
export function usdPerTokenToPerMillion(raw: string): number | null {
  if (!/^\d+(\.\d+)?$/.test(raw)) return null;
  const [whole, frac = ""] = raw.split(".");
  const combined = `${whole}${frac}`.replace(/^0+(?=\d)/, "");
  const shift = 6 - frac.length;
  let text: string;
  if (shift >= 0) {
    text = combined + "0".repeat(shift);
  } else {
    const splitAt = combined.length + shift;
    if (splitAt <= 0) text = `0.${"0".repeat(-splitAt)}${combined}`;
    else text = `${combined.slice(0, splitAt)}.${combined.slice(splitAt)}`;
  }
  text = text.replace(/^0+(?=\d)/, "");
  if (text.startsWith(".")) text = `0${text}`;
  const fraction = text.split(".")[1] ?? "";
  if (fraction.length > 6) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function readMeasure(value: unknown, parse: (raw: string) => number | null): number | null {
  if (typeof value !== "string") return null;
  return parse(value);
}

function readSurcharge(key: (typeof SURCHARGE_KEYS)[number], value: unknown): PriceComponent | null {
  if (value === undefined) return null;
  if (typeof value !== "string") return { key, amount: null, unit: "unknown" };
  if (key === "image") {
    return { key, amount: parseUsdAmount(value), unit: "unknown" };
  }
  if (key === "web_search") {
    const amount = parseUsdAmount(value);
    return { key, amount, unit: amount === null ? "unknown" : "usd_per_request" };
  }
  const amount = usdPerTokenToPerMillion(value);
  return { key, amount, unit: amount === null ? "unknown" : "usd_per_million_tokens" };
}

function readPrice(pricing: unknown): PriceObservation {
  if (!pricing || typeof pricing !== "object") return { kind: "unknown" };
  const record = pricing as Record<string, unknown>;
  if (Array.isArray(record.overrides) && record.overrides.length > 0) return { kind: "unknown" };
  const surcharges = SURCHARGE_KEYS.flatMap((key) => {
    const component = readSurcharge(key, record[key]);
    return component ? [component] : [];
  });
  const promptPerM = readMeasure(record.prompt, usdPerTokenToPerMillion);
  const completionPerM = readMeasure(record.completion, usdPerTokenToPerMillion);
  const perRequestUsd = readMeasure(record.request, parseUsdAmount);
  const descriptor = {
    promptUsdPerMTok: promptPerM,
    completionUsdPerMTok: completionPerM,
    perRequestUsd,
  };
  const listed = surcharges.length > 0 ? { surcharges } : {};
  const surchargesAreZero = surcharges.every((item) => item.amount === 0);
  if (isProvenZeroPricing(descriptor) && surchargesAreZero) return { kind: "proven_zero", ...listed };
  if (promptPerM !== null && completionPerM !== null && perRequestUsd !== null && surchargesAreZero) {
    return {
      kind: "positive_quote",
      promptUsdPerMTok: promptPerM,
      completionUsdPerMTok: completionPerM,
      perRequestUsd,
      ...listed,
    };
  }
  const anyKnown =
    promptPerM !== null ||
    completionPerM !== null ||
    perRequestUsd !== null ||
    surcharges.some((item) => item.amount !== null);
  if (!anyKnown && surcharges.length === 0) return { kind: "unknown" };
  return {
    kind: "partial_quote",
    promptUsdPerMTok: promptPerM,
    completionUsdPerMTok: completionPerM,
    perRequestUsd,
    ...listed,
  };
}

function readFlag(parameters: unknown, names: readonly string[]): boolean | null {
  if (!Array.isArray(parameters)) return null;
  if (!parameters.every((item) => typeof item === "string")) return null;
  return names.some((name) => parameters.includes(name));
}

function readModalities(architecture: unknown): { input: string[] | null; output: string[] | null } {
  if (!architecture || typeof architecture !== "object") return { input: null, output: null };
  const record = architecture as Record<string, unknown>;
  const copy = (value: unknown): string[] | null =>
    Array.isArray(value) && value.every((item) => typeof item === "string") ? [...value] : null;
  return { input: copy(record.input_modalities), output: copy(record.output_modalities) };
}

function blankObservation(
  modelId: string,
  observationClass: CatalogObservationClass,
  price: PriceObservation,
  announcedQuotas: readonly AnnouncedQuota[],
): GatewayModelObservation {
  return {
    modelId,
    observationClass,
    state: observationClass === "public_list" ? "listed" : null,
    executable: false,
    tools: null,
    structuredJson: null,
    inputModalities: null,
    outputModalities: null,
    price,
    quota: { kind: "unknown" },
    announcedQuotas,
    withheld: null,
  };
}

function parseModels(body: unknown, observationClass: CatalogObservationClass): GatewayModelObservation[] {
  if (!body || typeof body !== "object") return [];
  const data = (body as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  const observations: GatewayModelObservation[] = [];
  for (const row of data) {
    if (typeof row === "string") {
      if (row.length === 0 || /\s/.test(row)) continue;
      observations.push(blankObservation(row, observationClass, { kind: "unknown" }, []));
      continue;
    }
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const modelId = record.id;
    if (typeof modelId !== "string" || modelId.length === 0 || /\s/.test(modelId)) continue;
    const modalities = readModalities(record.architecture);
    observations.push({
      ...blankObservation(modelId, observationClass, readPrice(record.pricing), []),
      tools: readFlag(record.supported_parameters, ["tools"]),
      structuredJson: readFlag(record.supported_parameters, ["structured_outputs", "response_format"]),
      inputModalities: modalities.input,
      outputModalities: modalities.output,
    });
  }
  return observations;
}

function positiveInt(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function parsePlans(body: unknown): GatewayModelObservation[] {
  if (!body || typeof body !== "object") return [];
  const data = (body as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  const observations: GatewayModelObservation[] = [];
  for (const plan of data) {
    if (!plan || typeof plan !== "object") continue;
    const record = plan as Record<string, unknown>;
    const code = typeof record.code === "string" && record.code.length > 0 ? record.code : "unknown";
    const announced: AnnouncedQuota[] = [];
    const daily = positiveInt(record.token_cap_daily);
    if (daily !== null) {
      announced.push({ amount: daily, unit: "tokens_per_day", source: `public-plan:${code}` });
    }
    const rpm = positiveInt(record.rpm_limit);
    if (rpm !== null) {
      announced.push({ amount: rpm, unit: "requests_per_minute", source: `public-plan:${code}` });
    }
    if (!Array.isArray(record.models)) continue;
    for (const model of record.models) {
      if (typeof model !== "string" || model.length === 0 || /\s/.test(model)) continue;
      const index = observations.findIndex((row) => row.modelId === model);
      if (index < 0) {
        observations.push(blankObservation(model, "public_list", { kind: "unknown" }, announced));
        continue;
      }
      const existing = observations[index];
      const quotas = [...existing.announcedQuotas];
      for (const quota of announced) {
        const seen = quotas.some((item) => item.amount === quota.amount && item.unit === quota.unit && item.source === quota.source);
        if (!seen) quotas.push(quota);
      }
      observations[index] = { ...existing, announcedQuotas: quotas };
    }
  }
  return observations;
}

function parseKeyQuota(body: unknown): QuotaObservation {
  if (!body || typeof body !== "object") return { kind: "unknown" };
  const data = (body as { data?: unknown }).data;
  if (!data || typeof data !== "object") return { kind: "unknown" };
  const daily = (data as { free_model_daily_requests?: unknown }).free_model_daily_requests;
  if (!daily || typeof daily !== "object") return { kind: "unknown" };
  const limit = positiveInt((daily as { limit?: unknown }).limit);
  if (limit === null) return { kind: "unknown" };
  return { kind: "observed", unit: "requests_per_day", amount: limit, scope: "free_variant" };
}

function filedAccountId(request: GatewayCatalogRequest): string | null {
  const accountId = request.accountId;
  if (accountId === null || accountId.length === 0 || accountId === request.gateway) return null;
  if (request.workspaceId.length === 0 || request.catalogRevision.length === 0) return null;
  if (!Number.isFinite(Date.parse(request.observedAt))) return null;
  return accountId;
}

function projectCapability(
  observation: GatewayModelObservation,
  request: GatewayCatalogRequest,
): ServerCapability | null {
  const accountId = filedAccountId(request);
  if (observation.price.kind !== "proven_zero" || observation.tools === null || accountId === null) return null;
  const state: "listed" | "connected" = request.observationClass === "public_list" ? "listed" : "connected";
  return {
    accountId,
    modelId: observation.modelId,
    provider: request.gateway,
    state,
    source: request.sourceUrl,
    observedAt: request.observedAt,
    tools: observation.tools,
    billingKind: "verified_free",
    tariff: null,
    workspaceId: request.workspaceId,
  };
}

function withholdReason(observation: GatewayModelObservation, request: GatewayCatalogRequest): string | null {
  if (observation.price.kind === "unknown") return "price_unknown";
  if (observation.price.kind === "positive_quote" || observation.price.kind === "partial_quote") return "price_not_a_capability";
  if (observation.tools === null) return "tools_unknown";
  if (filedAccountId(request) === null) return "account_unverified";
  return null;
}

export async function normalizeGatewayCatalog(
  request: GatewayCatalogRequest,
): Promise<GatewayNormalization> {
  if (!isEnvName(request.apiKeyEnvVar)) return failure("secret_name_rejected", 0);
  if (baseRejected(request)) return failure("base_url_rejected", 0);
  const hit = allowlist(request);
  if (!hit) return failure("source_rejected", 0);
  if (!Number.isSafeInteger(request.timeoutMs) || request.timeoutMs <= 0) return failure("timeout", 0);

  let secret: string | undefined;
  if (request.observationClass === "account_entitlement") {
    try {
      secret = request.readSecret?.(request.apiKeyEnvVar);
    } catch {
      return failure("unreadable", 0);
    }
    if (typeof secret !== "string" || secret.length === 0) return failure("auth_missing", 0);
  }

  const headers: Record<string, string> = { accept: "application/json" };
  if (secret) headers.authorization = `Bearer ${secret}`;
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const fetched = Promise.resolve()
    .then(() => request.fetch(request.sourceUrl, {
      method: "GET",
      headers,
      signal: controller.signal,
    }))
    .then(
      (value) => ({ kind: "response" as const, value }),
      (error: unknown) => ({ kind: "error" as const, error }),
    );
  const timeout = new Promise<{ kind: "timeout" }>((resolve) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      resolve({ kind: "timeout" });
    }, request.timeoutMs);
  });
  const settled = await Promise.race([fetched, timeout]);
  if (timeoutId) clearTimeout(timeoutId);
  if (settled.kind === "timeout") return failure("timeout", 1);
  if (settled.kind === "error") {
    const name = settled.error instanceof Error ? settled.error.name : "";
    return failure(name === "AbortError" || name === "TimeoutError" ? "timeout" : "unreadable", 1);
  }
  if (settled.value.status < 200 || settled.value.status >= 300) return failure("http_error", 1);
  if (!settled.value.body || typeof settled.value.body !== "object") return failure("unreadable", 1);

  const observations = hit === "plans"
    ? parsePlans(settled.value.body)
    : hit === "models"
      ? parseModels(settled.value.body, request.observationClass)
      : [];
  const accountQuota = hit === "key" ? parseKeyQuota(settled.value.body) : { kind: "unknown" as const };
  const capabilities: ServerCapability[] = [];
  const filed: GatewayModelObservation[] = [];
  for (const observation of observations) {
    const capability = projectCapability(observation, request);
    const reason = capability ? null : withholdReason(observation, request);
    const state = capability
      ? capability.state === "connected" ? "connected" as const : "listed" as const
      : observation.state;
    filed.push({ ...observation, state, withheld: reason });
    if (capability && capability.state !== "authorized" && capability.billingKind !== "api") {
      capabilities.push(capability);
    }
  }

  return {
    ok: true,
    catalog: {
      source: request.sourceUrl,
      observedAt: request.observedAt,
      revision: request.catalogRevision,
      entries: capabilities,
    },
    observations: filed,
    accountQuota,
    fetchCount: 1,
  };
}
