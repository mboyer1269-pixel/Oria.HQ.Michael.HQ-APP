// src/server/runtime/staging-runtime-diagnostic.ts
//
// Read-only runtime diagnostic for confirming which Supabase project a deployed
// Vercel Preview/Staging build actually points to. Pure functions over an env
// record — NO DB reads, NO user data, NO service_role usage, and NEVER returns
// a secret value (only booleans, presence flags, and safe fingerprints).
//
// Security posture is enforced by the route (src/app/api/health/staging-runtime),
// but the gate logic lives here so it can be unit-tested without a server:
//   - fail-closed in production (VERCEL_ENV === "production", or NODE_ENV
//     production with no VERCEL_ENV)
//   - explicit opt-in via ENABLE_STAGING_RUNTIME_DIAGNOSTIC (fail-safe OFF)
//
// The two feature flags are read through the SAME helpers the app uses, so the
// diagnostic reflects real runtime behavior rather than a re-implementation.

import { isDurableMissionDraftEnabled } from "../missions/mission-persistence-flag.ts";
import { isHashChainWriteEnabled } from "../ledger/hash-chain-write-flag.ts";

/** Env toggle that must be explicitly truthy for the endpoint to respond. */
export const STAGING_RUNTIME_DIAGNOSTIC_ENV = "ENABLE_STAGING_RUNTIME_DIAGNOSTIC";

/** The Supabase project ref the Preview/Staging deployment is expected to use. */
export const EXPECTED_STAGING_REF = "teatqbtzgzcygpefnfbh";

/** The production Supabase project ref Preview/Staging must NEVER point to. */
export const KNOWN_PROD_REF = "cpwerynafcszwagroeek";

/** Warning surfaced when the deployment is pointed at the production project. */
export const WARN_POINTS_TO_PROD = "STOP_PREVIEW_POINTS_TO_PROD";

/** Warning surfaced when the deployment is NOT pointed at the staging project. */
export const WARN_NOT_STAGING = "PREVIEW_NOT_POINTING_TO_STAGING";

/** Warning surfaced when no Supabase URL is configured at all. */
export const WARN_URL_MISSING = "SUPABASE_URL_MISSING";

const TRUTHY = new Set(["1", "true", "on", "yes"]);

type Env = Record<string, string | undefined>;

/** Whether an env var holds a non-empty string. Presence only — never the value. */
function isPresent(env: Env, key: string): boolean {
  const raw = env[key];
  return typeof raw === "string" && raw.trim().length > 0;
}

/**
 * Whether the diagnostic endpoint is explicitly enabled. Defaults to FALSE for
 * any absent, empty, or unrecognized value — fail-safe OFF.
 */
export function isStagingRuntimeDiagnosticEnabled(env: Env = process.env): boolean {
  const raw = env[STAGING_RUNTIME_DIAGNOSTIC_ENV];
  if (typeof raw !== "string") return false;
  return TRUTHY.has(raw.trim().toLowerCase());
}

/**
 * Whether this runtime should be treated as production for the purpose of
 * fail-closing the diagnostic. True when Vercel reports a production env, or —
 * absent a Vercel env — when NODE_ENV is production (covers non-Vercel prod).
 */
export function isProductionRuntime(env: Env = process.env): boolean {
  const vercelEnv = env.VERCEL_ENV?.trim().toLowerCase();
  if (vercelEnv) return vercelEnv === "production";
  return env.NODE_ENV?.trim().toLowerCase() === "production";
}

/**
 * Extract the Supabase project ref (the leftmost host label) from a Supabase
 * URL, e.g. "https://teatqbtzgzcygpefnfbh.supabase.co" -> "teatqbtzgzcygpefnfbh".
 * Returns null for an absent, malformed, or non-Supabase URL.
 */
export function extractSupabaseProjectRef(rawUrl: string | undefined): string | null {
  if (typeof rawUrl !== "string" || rawUrl.trim().length === 0) return null;
  let host: string;
  try {
    host = new URL(rawUrl.trim()).hostname;
  } catch {
    return null;
  }
  if (!host.endsWith(".supabase.co")) return null;
  const ref = host.split(".")[0];
  return ref.length > 0 ? ref : null;
}

/** Extract just the host of a URL (no protocol/path/query). Null if unparseable. */
export function extractHost(rawUrl: string | undefined): string | null {
  if (typeof rawUrl !== "string" || rawUrl.trim().length === 0) return null;
  try {
    return new URL(rawUrl.trim()).hostname;
  } catch {
    return null;
  }
}

/** Access decision for the route. Fail-closed: allowed only when explicitly safe. */
export type StagingRuntimeAccess = {
  allowed: boolean;
  /** HTTP status the route should use when blocked. */
  status: number;
  /** Machine-readable reason; never leaks env values. */
  reason: "ok" | "blocked_production" | "blocked_disabled";
};

/**
 * Decide whether the diagnostic may respond. Production is checked FIRST so the
 * endpoint stays dark in production even if the enable flag is mistakenly set.
 */
export function evaluateStagingRuntimeAccess(env: Env = process.env): StagingRuntimeAccess {
  if (isProductionRuntime(env)) {
    return { allowed: false, status: 404, reason: "blocked_production" };
  }
  if (!isStagingRuntimeDiagnosticEnabled(env)) {
    return { allowed: false, status: 404, reason: "blocked_disabled" };
  }
  return { allowed: true, status: 200, reason: "ok" };
}

/** The safe JSON shape returned by the endpoint. Booleans + fingerprints only. */
export type StagingRuntimeDiagnostic = {
  ok: true;
  diagnostic: "staging-runtime";
  envName: string | null;
  gitBranch: string | null;
  supabaseUrlHost: string | null;
  supabaseProjectRef: string | null;
  expectedStagingRef: string;
  knownProdRef: string;
  pointsToExpectedStaging: boolean;
  pointsToKnownProd: boolean;
  missionDurableDraftsEnabled: boolean;
  ledgerHashChainWriteEnabled: boolean;
  ledgerHmacKeyPresent: boolean;
  serviceRolePresent: boolean;
  anonKeyPresent: boolean;
  warnings: string[];
};

/**
 * Build the safe diagnostic payload from the environment. This NEVER returns a
 * secret: keys are reported as presence booleans only, and the Supabase URL is
 * reduced to its host plus the derived (non-secret, public) project ref.
 */
export function buildStagingRuntimeDiagnostic(env: Env = process.env): StagingRuntimeDiagnostic {
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseUrlHost = extractHost(supabaseUrl);
  const supabaseProjectRef = extractSupabaseProjectRef(supabaseUrl);

  const pointsToExpectedStaging = supabaseProjectRef === EXPECTED_STAGING_REF;
  const pointsToKnownProd = supabaseProjectRef === KNOWN_PROD_REF;

  const warnings: string[] = [];
  if (!isPresent(env, "NEXT_PUBLIC_SUPABASE_URL")) {
    warnings.push(WARN_URL_MISSING);
  }
  if (pointsToKnownProd) {
    warnings.push(WARN_POINTS_TO_PROD);
  }
  if (!pointsToExpectedStaging) {
    warnings.push(WARN_NOT_STAGING);
  }

  return {
    ok: true,
    diagnostic: "staging-runtime",
    envName: env.VERCEL_ENV?.trim() || env.NODE_ENV?.trim() || null,
    gitBranch: env.VERCEL_GIT_COMMIT_REF?.trim() || null,
    supabaseUrlHost,
    supabaseProjectRef,
    expectedStagingRef: EXPECTED_STAGING_REF,
    knownProdRef: KNOWN_PROD_REF,
    pointsToExpectedStaging,
    pointsToKnownProd,
    missionDurableDraftsEnabled: isDurableMissionDraftEnabled(env),
    ledgerHashChainWriteEnabled: isHashChainWriteEnabled(env),
    ledgerHmacKeyPresent: isPresent(env, "LEDGER_HMAC_KEY"),
    serviceRolePresent: isPresent(env, "SUPABASE_SERVICE_ROLE_KEY"),
    anonKeyPresent: isPresent(env, "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    warnings,
  };
}
