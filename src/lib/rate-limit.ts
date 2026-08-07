// ---------------------------------------------------------------------------
// ADAPTIVE RATE LIMITER
// ---------------------------------------------------------------------------
// Upstash Redis backend when UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
// are set — atomic sliding-window, safe across all server instances.
//
// Falls back to in-memory sliding-window when Upstash is not configured
// (local dev, single-instance deploys). The in-memory fallback is NOT safe
// for horizontally-scaled multi-instance deployments.
//
// The public API is identical in both modes. Callers never need to know which
// backend is active.
//
// Each policy owns its limit and window. rateLimitKey() namespaces subjects by
// policy id, and the Upstash cache and prefix include that same id.
//
// Required env vars for the Upstash backend:
//   UPSTASH_REDIS_REST_URL    — from https://console.upstash.com
//   UPSTASH_REDIS_REST_TOKEN  — from https://console.upstash.com
// ---------------------------------------------------------------------------

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// ---------------------------------------------------------------------------
// Policy registry — one entry per protected surface
// ---------------------------------------------------------------------------

export type RateLimitPolicyId = "contact_form" | "n8n_dispatch";

export type RateLimitPolicy = {
  id: RateLimitPolicyId;
  limit: number;
  windowMs: number;
  /** What this policy protects, and why the numbers are what they are. */
  description: string;
};

export const RATE_LIMIT_POLICIES: Record<RateLimitPolicyId, RateLimitPolicy> = {
  contact_form: {
    id: "contact_form",
    limit: 5,
    windowMs: 60 * 60 * 1000,
    description:
      "Public contact form, per IP. Unauthenticated and reachable by anyone, so the " +
      "window is long and the count is low.",
  },
  n8n_dispatch: {
    id: "n8n_dispatch",
    limit: 30,
    windowMs: 60_000,
    description:
      "Outbound n8n dispatch, per workspace+agent. Owner-authenticated and CEO-approved " +
      "per action; the limit exists so a bug cannot bomb n8n, not to gate humans.",
  },
};

/**
 * The storage key for a subject under a policy.
 *
 * Namespacing by policy id is what makes two policies structurally unable to
 * share a counter, even if their subjects collide (two surfaces keyed by the
 * same IP, say).
 */
export function rateLimitKey(policy: RateLimitPolicy, subject: string): string {
  return `${policy.id}:${subject}`;
}

/** Distinguishes one limiter configuration from another. */
function policySignature(limit: number, windowMs: number): string {
  return `${limit}:${windowMs}`;
}

// ---------------------------------------------------------------------------
// Backend detection
// ---------------------------------------------------------------------------

function hasUpstashConfig(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
  );
}

// ---------------------------------------------------------------------------
// Upstash backend (multi-instance safe)
// ---------------------------------------------------------------------------

type RatelimitLike = { limit: (key: string) => Promise<{ success: boolean }> };

type RateLimitGlobals = typeof globalThis & {
  /** Test seam: replaces Ratelimit construction so no Redis connection is made. */
  __rateLimitLimiterFactoryForTests?:
    | ((limit: number, windowMs: number) => RatelimitLike)
    | null;
};

/**
 * One limiter per policy and configuration, never one per process.
 */
const upstashLimiters = new Map<string, RatelimitLike>();

function buildUpstashLimiter(
  scope: string,
  limit: number,
  windowMs: number,
): RatelimitLike {
  const globals = globalThis as RateLimitGlobals;
  if (globals.__rateLimitLimiterFactoryForTests) {
    return globals.__rateLimitLimiterFactoryForTests(limit, windowMs);
  }
  return new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(limit, `${windowMs} ms`),
    analytics: false,
    prefix: `oria:rl:${scope}:${policySignature(limit, windowMs)}`,
  });
}

function getUpstashLimiter(scope: string, limit: number, windowMs: number): RatelimitLike {
  const signature = `${scope}:${policySignature(limit, windowMs)}`;
  let limiter = upstashLimiters.get(signature);
  if (!limiter) {
    limiter = buildUpstashLimiter(scope, limit, windowMs);
    upstashLimiters.set(signature, limiter);
  }
  return limiter;
}

async function isAllowedUpstash(
  scope: string,
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  const { success } = await getUpstashLimiter(scope, limit, windowMs).limit(key);
  return success;
}

/** Test-only: drops the per-configuration limiter cache. */
export function __resetRateLimitersForTests(): void {
  upstashLimiters.clear();
}

// ---------------------------------------------------------------------------
// In-memory backend (single-instance / dev fallback)
// ---------------------------------------------------------------------------

const store = new Map<string, number[]>();

function isAllowedInMemory(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;

  const timestamps = (store.get(key) ?? []).filter((t) => t > cutoff);
  timestamps.push(now);
  store.set(key, timestamps);

  return timestamps.length <= limit;
}

// ---------------------------------------------------------------------------
// Production-safety diagnostics
// ---------------------------------------------------------------------------

export type RateLimitBackend = "upstash" | "memory";

/** Which backend isAllowed() will use given the current environment. */
export function getRateLimitBackend(): RateLimitBackend {
  return hasUpstashConfig() ? "upstash" : "memory";
}

/**
 * Pure diagnostics for the active rate-limit backend (no Redis I/O). Safe to
 * call at startup or from a health check.
 *
 * `productionFallbackRisk` is true when running in production on the in-memory
 * fallback: that store is per-instance, so behind multiple instances the limit
 * under-counts and the protection weakens. Surfacing this lets ops catch a
 * missing UPSTASH_REDIS_REST_URL/TOKEN before it matters.
 */
export function getRateLimitDiagnostics(): {
  backend: RateLimitBackend;
  multiInstanceSafe: boolean;
  productionFallbackRisk: boolean;
} {
  const backend = getRateLimitBackend();
  return {
    backend,
    multiInstanceSafe: backend === "upstash",
    productionFallbackRisk:
      backend === "memory" && process.env.NODE_ENV === "production",
  };
}

let warnedProductionFallback = false;

/**
 * Emits a one-time warning when production is running on the in-memory
 * fallback. Deliberately does NOT throw: rate limiting must stay fail-open so a
 * misconfiguration never takes the public contact form offline — but the
 * degradation is no longer silent.
 */
function warnOnInsecureProductionFallback(): void {
  if (warnedProductionFallback) return;
  if (getRateLimitDiagnostics().productionFallbackRisk) {
    warnedProductionFallback = true;
    console.warn(
      "[rate-limit] Production is running WITHOUT Upstash Redis " +
        "(UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN unset). Falling back " +
        "to the in-memory sliding-window, which is per-instance and NOT " +
        "multi-instance safe — limits under-count behind multiple instances. " +
        "Configure Upstash for reliable production rate limiting.",
    );
  }
}

// ---------------------------------------------------------------------------
// Public API — same signature in both modes
// ---------------------------------------------------------------------------

/**
 * Returns true when the request is ALLOWED, false when it should be BLOCKED.
 *
 * Low-level surface: prefer isAllowedForPolicy, which namespaces the subject and
 * makes the numbers a declared policy rather than two literals at a call site.
 *
 * @param key      Unique identifier for the client (e.g. IP address)
 * @param limit    Maximum number of requests permitted within the window
 * @param windowMs Rolling window duration in milliseconds
 */
async function isAllowedInScope(
  scope: string,
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  if (hasUpstashConfig()) {
    return isAllowedUpstash(scope, key, limit, windowMs);
  }
  warnOnInsecureProductionFallback();
  return isAllowedInMemory(key, limit, windowMs);
}

export async function isAllowed(
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  return isAllowedInScope("adhoc", key, limit, windowMs);
}

/**
 * Rate-limits a subject under a declared policy.
 *
 * The policy supplies both the numbers and the key namespace, so no call site
 * can drift from the registry and no two policies can share a counter.
 */
export async function isAllowedForPolicy(
  policy: RateLimitPolicy,
  subject: string,
): Promise<boolean> {
  return isAllowedInScope(
    policy.id,
    rateLimitKey(policy, subject),
    policy.limit,
    policy.windowMs,
  );
}
