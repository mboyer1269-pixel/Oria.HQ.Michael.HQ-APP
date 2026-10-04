/**
 * Server capability catalog consumed by the existing router.
 *
 * Claude fills this object from a server-side discovery module outside
 * src/server/ai. This file does not discover accounts, call a provider, or
 * read a browser payload. A public model list can only be represented as
 * state "listed". Listed and connected grant no send. Prices and
 * authorizations are fields of this server object, never of an HTTP body.
 *
 * Tariff age is the server constant below. The browser cannot extend it.
 */

export const TARIFF_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type CapabilityState = "listed" | "connected" | "authorized";

export type ServerTariff = {
  currency: "USD";
  notToExceedCents: number;
  source: string;
  observedAt: string;
};

/** Metered API, verified free, or an existing subscription. These are not interchangeable. */
export type ServerBillingKind = "api" | "verified_free" | "subscription";

export type ServerCapability = {
  /** Server account. Never a provider name and never a browser label. */
  accountId: string;
  modelId: string;
  provider: string;
  state: CapabilityState;
  source: string;
  observedAt: string;
  tools: boolean;
  billingKind: ServerBillingKind;
  /** Positive USD cents for `api` only. Null for free and subscription. Never a zero-dollar observation. */
  tariff: ServerTariff | null;
  workspaceId: string;
};

export type ServerCapabilityCatalog = {
  source: string;
  observedAt: string;
  /** Server revision the approved binding must repeat. Not a browser cache key. */
  revision: string;
  entries: readonly ServerCapability[];
};

/** Tuple fixed at approval. The strict entry refuses if the call diverges. */
export type ApprovedServerBinding = {
  accountId: string;
  workspaceId: string;
  modelId: string;
  billingKind: ServerBillingKind;
  catalogRevision: string;
};

export type ServerEmissionBlock =
  | "not_listed"
  | "public_catalog_only"
  | "not_authorized"
  | "workspace_mismatch"
  | "provider_mismatch"
  | "capability_stale"
  | "tools_unavailable"
  | "tariff_unknown"
  | "tariff_stale"
  | "catalog_required"
  | "account_mismatch"
  | "account_ambiguous"
  | "binding_required"
  | "binding_mismatch";

export type ServerEmissionAssessment =
  | {
      emit: true;
      capability: ServerCapability;
      billingKind: "api";
      /** Server cap that authorizeCallAttempt must enforce. Not an observed spend. */
      notToExceedCents: number;
    }
  | {
      /** Authorized billing that this JSON path must not execute. */
      emit: false;
      disposition: "non_api";
      capability: ServerCapability;
      billingKind: "verified_free" | "subscription";
      requestedModelId: string;
    }
  | { emit: false; block: ServerEmissionBlock; requestedModelId: string };

export function assessServerEmission(input: {
  catalog: ServerCapabilityCatalog;
  modelId: string;
  workspaceId: string;
  requiresTools: boolean;
  nowMs: number;
  /** Adapter that would actually be called. A different catalog provider is not a match. */
  invokedProvider?: string;
  /** When set, only this server account matches. When omitted, two accounts are ambiguous. */
  accountId?: string;
}): ServerEmissionAssessment {
  const requestedModelId = input.modelId;
  const entries = Array.isArray(input.catalog?.entries) ? input.catalog.entries : [];
  const sameModel = entries.filter(
    (entry) => entry?.modelId === input.modelId && verifiedEntry(entry),
  );
  if (sameModel.length === 0) {
    return { emit: false, block: "not_listed", requestedModelId };
  }

  const workspaceId = input.workspaceId;
  const sameWorkspace = sameModel.filter(
    (entry) => workspaceId.length > 0 && entry.workspaceId === workspaceId,
  );
  if (sameWorkspace.length === 0) {
    return { emit: false, block: "workspace_mismatch", requestedModelId };
  }

  const invoked = input.invokedProvider;
  const matchingProvider = invoked
    ? sameWorkspace.filter((entry) => entry.provider === invoked)
    : sameWorkspace;
  if (invoked && matchingProvider.length === 0) {
    return { emit: false, block: "provider_mismatch", requestedModelId };
  }

  const accountId = input.accountId ?? "";
  const forAccount = accountId.length > 0
    ? matchingProvider.filter((entry) => entry.accountId === accountId)
    : matchingProvider;
  if (accountId.length > 0 && forAccount.length === 0) {
    return { emit: false, block: "account_mismatch", requestedModelId };
  }
  const accounts = new Set(forAccount.map((entry) => entry.accountId));
  const billings = new Set(forAccount.map((entry) => entry.billingKind));
  if (accounts.size !== 1 || billings.size !== 1) {
    return { emit: false, block: "account_ambiguous", requestedModelId };
  }

  const entry = forAccount[0];
  if (readObservedAt(entry.observedAt, input.nowMs)) {
    return { emit: false, block: "capability_stale", requestedModelId };
  }
  if (entry.state === "listed") {
    return { emit: false, block: "public_catalog_only", requestedModelId };
  }
  if (entry.state === "connected") {
    return { emit: false, block: "not_authorized", requestedModelId };
  }
  if (entry.state !== "authorized") {
    return { emit: false, block: "not_listed", requestedModelId };
  }
  if (input.requiresTools && entry.tools !== true) {
    return { emit: false, block: "tools_unavailable", requestedModelId };
  }

  if (entry.billingKind === "verified_free" || entry.billingKind === "subscription") {
    if (entry.tariff !== null) {
      return { emit: false, block: "tariff_unknown", requestedModelId };
    }
    return {
      emit: false,
      disposition: "non_api",
      capability: entry,
      billingKind: entry.billingKind,
      requestedModelId,
    };
  }
  if (entry.billingKind !== "api") {
    return { emit: false, block: "tariff_unknown", requestedModelId };
  }

  const tariffBlock = readTariff(entry.tariff, input.nowMs);
  if (tariffBlock) {
    return { emit: false, block: tariffBlock, requestedModelId };
  }
  return {
    emit: true,
    capability: entry,
    billingKind: "api",
    notToExceedCents: entry.tariff!.notToExceedCents,
  };
}

function verifiedEntry(entry: ServerCapability): boolean {
  return (
    typeof entry.accountId === "string"
    && entry.accountId.length > 0
    && typeof entry.provider === "string"
    && entry.provider.length > 0
    && entry.accountId !== entry.provider
    && typeof entry.modelId === "string"
    && entry.modelId.length > 0
    && (entry.state === "listed" || entry.state === "connected" || entry.state === "authorized")
    && (entry.billingKind === "api" || entry.billingKind === "verified_free" || entry.billingKind === "subscription")
    && typeof entry.source === "string"
    && entry.source.length > 0
    && Number.isFinite(Date.parse(entry.observedAt))
    && typeof entry.tools === "boolean"
    && typeof entry.workspaceId === "string"
  );
}

function readObservedAt(observedAt: string, nowMs: number): "capability_stale" | null {
  const parsed = Date.parse(observedAt);
  if (!Number.isFinite(parsed) || parsed > nowMs) return "capability_stale";
  if (nowMs - parsed > TARIFF_MAX_AGE_MS) return "capability_stale";
  return null;
}

function readTariff(
  tariff: ServerTariff | null,
  nowMs: number,
): "tariff_unknown" | "tariff_stale" | null {
  if (!tariff || typeof tariff !== "object") return "tariff_unknown";
  if (tariff.currency !== "USD") return "tariff_unknown";
  if (
    typeof tariff.notToExceedCents !== "number"
    || !Number.isSafeInteger(tariff.notToExceedCents)
    || tariff.notToExceedCents <= 0
  ) {
    return "tariff_unknown";
  }
  if (typeof tariff.source !== "string" || tariff.source.length === 0) return "tariff_unknown";
  const observedAt = Date.parse(tariff.observedAt);
  if (!Number.isFinite(observedAt) || observedAt > nowMs) return "tariff_stale";
  if (nowMs - observedAt > TARIFF_MAX_AGE_MS) return "tariff_stale";
  return null;
}
