/**
 * Compact catalog read for the existing HQ runtime surface.
 *
 * Calls `readRouterModelCatalog` for the allowlisted gateways only.
 * Secrets stay in server env names. A catalog row is not an execution right.
 */

import "server-only";

import { requireOwnerApiSession } from "@/server/auth/owner";
import {
  NARA_API_KEY_ENV,
  OPENROUTER_API_KEY_ENV,
  type GatewayFetch,
} from "@/server/ai/gateway-catalog";
import {
  nodeCatalogTransport,
  type CatalogConsultation,
  type CatalogConsultationRow,
  type CatalogRefreshPolicy,
  type CatalogTransport,
} from "@/server/ai/model-catalog-consultation";
import { readRouterModelCatalog } from "@/server/ai/model-router";
import { TARIFF_MAX_AGE_MS } from "@/server/ai/server-capability-catalog";

const PROVIDERS = ["openrouter", "nara"] as const;
const DISPLAY_CAP = 24;

type ProviderId = (typeof PROVIDERS)[number];
const SERVER_SECRET_NAMES = new Set<string>([OPENROUTER_API_KEY_ENV, NARA_API_KEY_ENV]);

export type HqCatalogLine = {
  provider: string;
  modelId: string;
  tariff: string;
  units: CatalogConsultationRow["units"];
  observedAt: string | null;
  status: "périmé" | "indisponible" | "inconnu";
  executable: false;
  executionAuthorized: false;
};

export type HqCatalogFailure = {
  provider: string;
  reason: string;
};

export type HqCatalogSection = {
  provider: ProviderId;
  lines: readonly HqCatalogLine[];
  page: number;
  pageCount: number;
  total: number;
};

type ClosedReason = Extract<CatalogConsultation, { ok: false }>["reason"];

type ViewBase = {
  lines: readonly HqCatalogLine[];
  /** First page of each provider, or one provider page. A long OpenRouter list cannot hide Nara. */
  sections: readonly HqCatalogSection[];
  hiddenCount: number;
  stale: boolean;
  accountAccess: "unknown";
  executionAuthorized: false;
  access: {
    public: true;
    configured: boolean;
    verified: false;
    executionAuthorized: false;
  };
  failures: readonly HqCatalogFailure[];
};

export type HqModelCatalogView =
  | (ViewBase & { ok: true; reason: null })
  | (ViewBase & { ok: false; reason: ClosedReason; lines: readonly []; hiddenCount: 0 });

export type HqModelCatalogLoad = {
  nowMs: number;
  refresh?: "if-stale" | "now";
  authorize?: () => Promise<{ status: number } | null>;
  transport?: CatalogTransport;
  fetch?: GatewayFetch;
  readSecret?: (envName: string) => string | undefined;
  readCache?: (gateway: string) => {
    provider: "openrouter" | "nara";
    generatedAt: string | null;
    entries: readonly { id: string; name?: string }[];
  } | null;
  /** Allowlisted provider. Any other value shows both. */
  provider?: ProviderId;
  /** Used only when `provider` is set. Values below 1 show the first page. */
  page?: number;
};

type HeldGateway = {
  observedAtMs: number;
  consultation: Extract<CatalogConsultation, { ok: true }>;
};

const held = new Map<string, HeldGateway>();
type LoadedCatalog =
  | { ok: true; parts: readonly { provider: ProviderId; result: CatalogConsultation }[] }
  | { ok: false; view: HqModelCatalogView };

const inflight = new Map<string, Promise<LoadedCatalog>>();
const identities = new WeakMap<object, number>();
let identitySeq = 0;

function identity(value: object | undefined): string {
  if (!value) return "-";
  let token = identities.get(value);
  if (token === undefined) {
    token = ++identitySeq;
    identities.set(value, token);
  }
  return String(token);
}

function closed(reason: ClosedReason, configured = false): HqModelCatalogView {
  return {
    ok: false,
    reason,
    lines: [],
    sections: [],
    hiddenCount: 0,
    stale: true,
    accountAccess: "unknown",
    executionAuthorized: false,
    access: { public: true, configured, verified: false, executionAuthorized: false },
    failures: [],
  };
}

async function authorizeOwner(): Promise<{ status: number } | null> {
  const response = await requireOwnerApiSession();
  if (!response) return null;
  return { status: typeof response.status === "number" ? response.status : 401 };
}

function readServerSecret(envName: string): string | undefined {
  if (!SERVER_SECRET_NAMES.has(envName)) return undefined;
  const value = process.env[envName];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function freshHold(observedAtMs: number, nowMs: number): boolean {
  if (!Number.isFinite(observedAtMs) || !Number.isFinite(nowMs)) return false;
  if (observedAtMs > nowMs) return false;
  return nowMs - observedAtMs <= TARIFF_MAX_AGE_MS;
}

function tariffPart(value: number | null): string {
  return value === null ? "inconnu" : String(value);
}

function surchargeSuffix(price: CatalogConsultationRow["price"]): string {
  if (price.kind === "unknown" || !price.surcharges || price.surcharges.length === 0) return "";
  const labels = {
    image: "Image",
    web_search: "Recherche web",
    internal_reasoning: "Raisonnement",
    input_cache_read: "Lecture du cache",
    input_cache_write: "Écriture du cache",
  };
  const units = {
    usd_per_million_tokens: "USD / million de tokens",
    usd_per_request: "USD / requête",
    unknown: "USD (unité inconnue)",
  };
  const text = price.surcharges
    .map((item) => `${labels[item.key]} : ${item.amount === null ? "inconnu" : String(item.amount)} ${units[item.unit]}`)
    .join(" ; ");
  return ` ; ${text}`;
}

function tariffFor(price: CatalogConsultationRow["price"]): string {
  if (price.kind === "unknown") return "inconnu";
  if (price.kind === "proven_zero") return `0 / 0 / 0${surchargeSuffix(price)}`;
  if (price.kind === "partial_quote") {
    return `${tariffPart(price.promptUsdPerMTok)} / ${tariffPart(price.completionUsdPerMTok)} / ${tariffPart(price.perRequestUsd)}${surchargeSuffix(price)}`;
  }
  return `${price.promptUsdPerMTok} / ${price.completionUsdPerMTok} / ${price.perRequestUsd}${surchargeSuffix(price)}`;
}

function statusFor(row: CatalogConsultationRow, consultationStale: boolean): HqCatalogLine["status"] {
  if (row.stale || consultationStale) return "périmé";
  if (row.price.kind === "unknown") return "inconnu";
  return "indisponible";
}

function lineFrom(row: CatalogConsultationRow, consultationStale: boolean): HqCatalogLine {
  return {
    provider: row.provider,
    modelId: row.modelId,
    tariff: tariffFor(row.price),
    units: row.units,
    observedAt: row.observedAt,
    status: statusFor(row, consultationStale),
    executable: false,
    executionAuthorized: false,
  };
}

function selectedProvider(value: HqModelCatalogLoad["provider"]): ProviderId | undefined {
  return value === "openrouter" || value === "nara" ? value : undefined;
}

function present(
  parts: readonly { provider: ProviderId; result: CatalogConsultation }[],
  provider: HqModelCatalogLoad["provider"],
  page: number | undefined,
): HqModelCatalogView {
  const selected = selectedProvider(provider);
  const requested = Number.isSafeInteger(page) && (page ?? 0) > 0 ? (page as number) : 1;
  const failures: HqCatalogFailure[] = [];
  const sections: HqCatalogSection[] = [];
  let stale = false;
  let configured = false;
  for (const part of parts) {
    if (selected && part.provider !== selected) continue;
    const result = part.result;
    if (!result.ok) {
      failures.push({ provider: part.provider, reason: result.reason });
      continue;
    }
    if (result.stale) stale = true;
    if (result.access.configured) configured = true;
    const rows = result.rows.map((row) => lineFrom(row, result.stale));
    const pageCount = Math.max(1, Math.ceil(rows.length / DISPLAY_CAP));
    const current = selected ? Math.min(requested, pageCount) : 1;
    const start = (current - 1) * DISPLAY_CAP;
    sections.push({
      provider: part.provider,
      lines: rows.slice(start, start + DISPLAY_CAP),
      page: current,
      pageCount,
      total: rows.length,
    });
  }
  const lines = sections.flatMap((section) => section.lines);
  const hiddenCount = sections.reduce((sum, section) => sum + (section.total - section.lines.length), 0);
  const access = { public: true as const, configured, verified: false as const, executionAuthorized: false as const };
  if (lines.length === 0 && failures.length > 0) {
    const unique = [...new Set(failures.map((failure) => failure.reason))];
    const reason = unique.length === 1 ? unique[0] : "unreadable";
    const known: ClosedReason[] = [
      "unauthenticated",
      "forbidden",
      "unknown_provider",
      "timeout",
      "redirect_refused",
      "unreadable",
      "source_rejected",
    ];
    const closedReason = known.find((candidate) => candidate === reason) ?? "unreadable";
    return {
      ok: false,
      reason: closedReason,
      lines: [],
      sections: [],
      hiddenCount: 0,
      stale: true,
      accountAccess: "unknown",
      executionAuthorized: false,
      access,
      failures,
    };
  }
  return {
    ok: true,
    reason: null,
    lines,
    sections,
    hiddenCount,
    stale,
    accountAccess: "unknown",
    executionAuthorized: false,
    access,
    failures,
  };
}

function usesServerDefaults(input: HqModelCatalogLoad): boolean {
  return input.transport === undefined
    && input.fetch === undefined
    && input.readCache === undefined
    && input.readSecret === undefined;
}

async function loadProvider(
  provider: (typeof PROVIDERS)[number],
  input: HqModelCatalogLoad,
  refresh: CatalogRefreshPolicy,
  serverDefaults: boolean,
): Promise<CatalogConsultation> {
  if (serverDefaults && refresh !== "now") {
    const cached = held.get(provider);
    if (cached && freshHold(cached.observedAtMs, input.nowMs)) return cached.consultation;
  }
  const result = await readRouterModelCatalog({
    gateway: provider,
    nowMs: input.nowMs,
    refresh,
    authorize: async () => null,
    readSecret: input.readSecret ?? readServerSecret,
    ...(input.readCache ? { readCache: input.readCache } : {}),
    ...(input.transport
      ? { transport: input.transport }
      : input.fetch
        ? { fetch: input.fetch }
        : { transport: nodeCatalogTransport() }),
  });
  if (serverDefaults && result.ok && result.source === "catalog_get" && !result.stale) {
    held.set(provider, { observedAtMs: input.nowMs, consultation: result });
  }
  return result;
}

async function loadAuthorized(
  input: HqModelCatalogLoad,
  refresh: "if-stale" | "now",
): Promise<readonly { provider: ProviderId; result: CatalogConsultation }[]> {
  const serverDefaults = usesServerDefaults(input);
  const parts = [];
  for (const provider of PROVIDERS) {
    parts.push({ provider, result: await loadProvider(provider, input, refresh, serverDefaults) });
  }
  return parts;
}

/**
 * Owner-gated catalog snapshot for the runtime page.
 * One shared pass per refresh mode while a request is already running.
 * Opening the page uses `if-stale`; Actualiser uses `now`. No polling.
 */
export async function loadHqModelCatalog(input: HqModelCatalogLoad): Promise<HqModelCatalogView> {
  const authorize = input.authorize ?? authorizeOwner;
  let auth: { status: number } | null;
  try {
    auth = await authorize();
  } catch {
    return closed("unreadable");
  }
  if (auth) return closed(auth.status === 403 ? "forbidden" : "unauthenticated");

  const refresh = input.refresh === "now" ? "now" : "if-stale";
  const key = [
    refresh,
    identity(input.transport),
    identity(input.fetch),
    identity(input.readCache),
    identity(input.readSecret),
    identity(input.authorize),
  ].join("|");
  let pending = inflight.get(key);
  if (!pending) {
    pending = loadAuthorized(input, refresh)
      .then((parts) => ({ ok: true as const, parts }))
      .catch(() => ({ ok: false as const, view: closed("unreadable") }))
      .finally(() => {
        inflight.delete(key);
      });
    inflight.set(key, pending);
  }
  const loaded = await pending;
  if (!loaded.ok) return loaded.view;
  return present(loaded.parts, input.provider, input.page);
}
