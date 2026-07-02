// src/server/agents/models/model-provider-contract.ts
//
// Pure contracts for the Agent/Model Provider Registry foundation.
//
// Doctrine: Oria = GOVERN. Memex = ORIENT. Hermes/Joris = ACT.
// Providers are interchangeable engines — adapters, never core. No agent is
// "the Claude agent" or "the OpenAI agent"; agents bind to routes resolved
// through this registry.
//
// Rule chain introduced by this contract:
//   Intent -> Agent Profile -> Model Policy -> Provider Registry
//     -> Runtime Adapter -> Sentinelle -> Ledger
//
// Invariants encoded here:
//   - An API key is referenced by environment variable NAME, never by value.
//   - A model is "free" only when the catalog proves zero pricing; unknown
//     pricing is never assumed free.
//   - CLI subscription runtimes (Claude Code, Gemini CLI, ChatGPT desktop)
//     are runtime adapters, not model providers.
//   - The OpenRouter model list is a catalog SOURCE (official JSON API,
//     cached snapshots) — never HTML scraping, never core logic.
//   - Every runtime adapter carries Sentinelle gate metadata and an
//     irrevocable Ledger requirement.
//
// No side effects, no I/O, no network, no process.env reads, no persistence.

import type { ExecutionZone } from "@/core/types";

// ---------------------------------------------------------------------------
// Cost, trust, and runtime vocabulary
// ---------------------------------------------------------------------------

/** Cost tier vocabulary — aligned with the Cost Ladder's CostRung values. */
export type ProviderCostTier = "free" | "economy" | "premium";

/**
 * Trust ladder for providers and the MCP servers / runtimes they expose.
 * "untrusted" is the default for anything new; tool execution requires at
 * least "reviewed", and unrestricted tool-use requires "allowlisted".
 */
export type ProviderTrustLevel = "untrusted" | "reviewed" | "allowlisted";

/**
 * What kind of thing a model provider is. Deliberately excludes CLI
 * subscription runtimes: those are RuntimeAdapterDescriptor territory.
 */
export type ProviderKind = "api" | "router" | "local-runtime";

/** How a runtime adapter reaches its provider. */
export type RuntimeAdapterKind = "http-api" | "mcp-client" | "cli-subscription" | "local-process";

// ---------------------------------------------------------------------------
// Catalog sources & provenance
// ---------------------------------------------------------------------------

/**
 * The only sanctioned OpenRouter model-list source. Scraping openrouter.ai
 * HTML pages is forbidden; a future PR may add a cached refresh against this
 * endpoint. This contract never fetches it.
 */
export const OPENROUTER_MODELS_API_ENDPOINT = "https://openrouter.ai/api/v1/models";

export type CatalogSourceKind = "static-file" | "openrouter-models-api" | "manual";

export type CatalogRefreshPolicy = "cached-only" | "manual-refresh";

export type CatalogSourceDescriptor = {
  kind: CatalogSourceKind;
  /** Required for "openrouter-models-api": must target the official JSON API. */
  endpoint?: string;
  /** Live refresh is a future PR; today only cached/manual snapshots exist. */
  refreshPolicy: CatalogRefreshPolicy;
};

/** Where a model entry came from, so stale or hand-edited data stays auditable. */
export type CatalogProvenance = {
  source: CatalogSourceKind;
  retrievedAtIso?: string;
};

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

/**
 * Catalog pricing snapshot. `null` means UNKNOWN — and unknown is never free.
 * Units: USD per million tokens (prompt/completion) and USD per request.
 */
export type ModelPricingDescriptor = {
  promptUsdPerMTok: number | null;
  completionUsdPerMTok: number | null;
  perRequestUsd: number | null;
};

// ---------------------------------------------------------------------------
// Sentinelle gate metadata
// ---------------------------------------------------------------------------

/**
 * Gate metadata a runtime adapter declares. This is INPUT to Sentinelle's
 * policy engine, never a bypass: the authoritative verdict always comes from
 * evaluateLiveExecution at dispatch time.
 */
export type SentinelleGateMetadata = {
  /** Zone the adapter's dispatches are evaluated in by default. */
  defaultZone: ExecutionZone;
  /** When true, tool-use through this adapter always requires CEO approval. */
  requiresApprovalForToolUse: boolean;
};

// ---------------------------------------------------------------------------
// Core descriptors
// ---------------------------------------------------------------------------

export type ModelProviderDescriptor = {
  /** Stable kebab-case id, e.g. "openrouter", "anthropic", "ollama-local". */
  id: string;
  label: string;
  kind: ProviderKind;
  trustLevel: ProviderTrustLevel;
  /**
   * Environment variable NAME holding the API key (e.g. "OPENROUTER_API_KEY").
   * Never a key value. Absent for keyless runtimes (e.g. local Ollama).
   */
  apiKeyEnvVar?: string;
  baseUrl?: string;
  /** Present when the provider doubles as a model-catalog source. */
  catalogSource?: CatalogSourceDescriptor;
  supportsMcp: boolean;
  supportsToolUse: boolean;
};

export type ModelCapabilityDescriptor = {
  /** Canonical model id, e.g. "meta-llama/llama-3.3-70b-instruct:free". */
  id: string;
  /** Must reference a registered ModelProviderDescriptor.id. */
  providerId: string;
  label: string;
  contextLength?: number;
  pricing: ModelPricingDescriptor;
  costTier: ProviderCostTier;
  supportsToolUse: boolean;
  supportsStructuredJson: boolean;
  supportsMcp: boolean;
  provenance: CatalogProvenance;
};

export type RuntimeAdapterDescriptor = {
  /** Stable kebab-case id, e.g. "openrouter-http", "ollama-local-process". */
  id: string;
  label: string;
  kind: RuntimeAdapterKind;
  /** Must reference a registered ModelProviderDescriptor.id. */
  providerId: string;
  sentinelle: SentinelleGateMetadata;
  /** Every runtime decision is ledgered. The type forbids opting out. */
  ledgerRequired: true;
};

/**
 * A local runtime (e.g. Ollama) can be PREFERRED but never ASSUMED available.
 * The literal `assumeAvailable: false` makes the assumption inexpressible.
 */
export type LocalRuntimePreference = {
  preferLocal: boolean;
  assumeAvailable: false;
  /** Adapter to prefer when it exists in the registry (e.g. "ollama-local"). */
  runtimeAdapterId?: string;
};

// ---------------------------------------------------------------------------
// Validation — pure, no throw, no I/O
// ---------------------------------------------------------------------------

export type ContractValidation = { ok: true } | { ok: false; errors: readonly string[] };

const ENV_VAR_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const MAX_ENV_VAR_NAME_LENGTH = 64;

/** True when the string is a plausible environment variable NAME, not a value. */
export function isValidEnvVarName(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= MAX_ENV_VAR_NAME_LENGTH &&
    ENV_VAR_NAME_PATTERN.test(value)
  );
}

const EXECUTION_ZONES: readonly ExecutionZone[] = ["green", "yellow", "red"];
const PROVIDER_KINDS: readonly ProviderKind[] = ["api", "router", "local-runtime"];
const TRUST_LEVELS: readonly ProviderTrustLevel[] = ["untrusted", "reviewed", "allowlisted"];
const COST_TIERS: readonly ProviderCostTier[] = ["free", "economy", "premium"];
const ADAPTER_KINDS: readonly RuntimeAdapterKind[] = [
  "http-api",
  "mcp-client",
  "cli-subscription",
  "local-process",
];

function isStableId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !/\s/.test(value);
}

/** True when every pricing dimension is a known, exact zero. */
export function isProvenZeroPricing(pricing: ModelPricingDescriptor): boolean {
  return (
    pricing.promptUsdPerMTok === 0 &&
    pricing.completionUsdPerMTok === 0 &&
    pricing.perRequestUsd === 0
  );
}

/**
 * A model is eligible as free only when the catalog PROVES zero pricing, or
 * the caller's policy explicitly opts into treating trial/unknown pricing as
 * free. Unknown pricing (null) is never free by default.
 */
export function isEligibleAsFree(
  pricing: ModelPricingDescriptor,
  policy?: { allowTrialOrUnknown?: boolean },
): boolean {
  if (isProvenZeroPricing(pricing)) return true;
  return policy?.allowTrialOrUnknown === true;
}

export function validateModelProviderDescriptor(
  descriptor: ModelProviderDescriptor,
): ContractValidation {
  const errors: string[] = [];

  if (!isStableId(descriptor.id)) {
    errors.push("provider id must be a non-empty identifier without whitespace");
  }
  if (typeof descriptor.label !== "string" || descriptor.label.trim().length === 0) {
    errors.push(`provider "${descriptor.id}": label must be non-empty`);
  }
  if (!PROVIDER_KINDS.includes(descriptor.kind)) {
    // Explicit message for the classic mistake: a CLI subscription is a
    // runtime adapter, never a model provider.
    if ((descriptor.kind as string) === "cli-subscription") {
      errors.push(
        `provider "${descriptor.id}": CLI subscription runtimes are runtime adapters, not model providers`,
      );
    } else {
      errors.push(`provider "${descriptor.id}": unknown provider kind "${descriptor.kind}"`);
    }
  }
  if (!TRUST_LEVELS.includes(descriptor.trustLevel)) {
    errors.push(`provider "${descriptor.id}": unknown trust level "${descriptor.trustLevel}"`);
  }
  if (descriptor.apiKeyEnvVar !== undefined && !isValidEnvVarName(descriptor.apiKeyEnvVar)) {
    errors.push(
      `provider "${descriptor.id}": apiKeyEnvVar must be an environment variable NAME ` +
        `(e.g. "OPENROUTER_API_KEY"), never a secret value`,
    );
  }
  if (descriptor.catalogSource) {
    const source = descriptor.catalogSource;
    if (source.kind === "openrouter-models-api") {
      if (
        typeof source.endpoint !== "string" ||
        !source.endpoint.startsWith("https://openrouter.ai/api/")
      ) {
        errors.push(
          `provider "${descriptor.id}": OpenRouter catalog source must target the official ` +
            `JSON API (${OPENROUTER_MODELS_API_ENDPOINT}); HTML scraping is forbidden`,
        );
      }
    }
    if (source.refreshPolicy !== "cached-only" && source.refreshPolicy !== "manual-refresh") {
      errors.push(
        `provider "${descriptor.id}": catalog refreshPolicy must be "cached-only" or ` +
          `"manual-refresh" (live refresh is a future PR)`,
      );
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

export function validateModelCapabilityDescriptor(
  descriptor: ModelCapabilityDescriptor,
): ContractValidation {
  const errors: string[] = [];

  if (!isStableId(descriptor.id)) {
    errors.push("model id must be a non-empty identifier without whitespace");
  }
  if (!isStableId(descriptor.providerId)) {
    errors.push(`model "${descriptor.id}": providerId must be a non-empty identifier`);
  }
  if (!COST_TIERS.includes(descriptor.costTier)) {
    errors.push(`model "${descriptor.id}": unknown cost tier "${descriptor.costTier}"`);
  }
  if (descriptor.costTier === "free" && !isProvenZeroPricing(descriptor.pricing)) {
    errors.push(
      `model "${descriptor.id}": costTier "free" requires catalog-proven zero pricing ` +
        `(prompt, completion, and per-request all exactly 0); unknown pricing is not free`,
    );
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

export function validateRuntimeAdapterDescriptor(
  descriptor: RuntimeAdapterDescriptor,
): ContractValidation {
  const errors: string[] = [];

  if (!isStableId(descriptor.id)) {
    errors.push("adapter id must be a non-empty identifier without whitespace");
  }
  if (!isStableId(descriptor.providerId)) {
    errors.push(`adapter "${descriptor.id}": providerId must be a non-empty identifier`);
  }
  if (!ADAPTER_KINDS.includes(descriptor.kind)) {
    errors.push(`adapter "${descriptor.id}": unknown adapter kind "${descriptor.kind}"`);
  }
  if (!descriptor.sentinelle || !EXECUTION_ZONES.includes(descriptor.sentinelle.defaultZone)) {
    errors.push(`adapter "${descriptor.id}": sentinelle.defaultZone must be green, yellow, or red`);
  }
  // The type already forbids false; this guards untyped data (JSON snapshots).
  if ((descriptor.ledgerRequired as boolean) !== true) {
    errors.push(`adapter "${descriptor.id}": ledgerRequired must be true — Ledger has no opt-out`);
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

export function validateLocalRuntimePreference(
  preference: LocalRuntimePreference,
): ContractValidation {
  const errors: string[] = [];

  // The type already forbids true; this guards untyped data.
  if ((preference.assumeAvailable as boolean) !== false) {
    errors.push(
      "localRuntime.assumeAvailable must be false — a local runtime can be preferred, never assumed",
    );
  }
  if (preference.runtimeAdapterId !== undefined && !isStableId(preference.runtimeAdapterId)) {
    errors.push("localRuntime.runtimeAdapterId must be a non-empty identifier when present");
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
