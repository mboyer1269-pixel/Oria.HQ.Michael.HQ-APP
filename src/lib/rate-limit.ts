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
// The public API (isAllowed) is identical in both modes.
// Callers never need to know which backend is active.
//
// Required env vars for Upstash backend:
//   UPSTASH_REDIS_REST_URL    — from https://console.upstash.com
//   UPSTASH_REDIS_REST_TOKEN  — from https://console.upstash.com
// ---------------------------------------------------------------------------

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

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

let upstashLimiter: Ratelimit | null = null;

function getUpstashLimiter(limit: number, windowMs: number): Ratelimit {
  // Cache a single limiter instance per process. If limit/window differ per
  // call site, instantiate a named limiter per use case instead.
  if (!upstashLimiter) {
    upstashLimiter = new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(limit, `${windowMs} ms`),
      analytics: false,
      prefix: "oria:rl",
    });
  }
  return upstashLimiter;
}

async function isAllowedUpstash(
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  const limiter = getUpstashLimiter(limit, windowMs);
  const { success } = await limiter.limit(key);
  return success;
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
 * Uses Upstash Redis when UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 * are set; falls back to in-memory sliding-window otherwise.
 *
 * @param key      Unique identifier for the client (e.g. IP address)
 * @param limit    Maximum number of requests permitted within the window
 * @param windowMs Rolling window duration in milliseconds
 */
export async function isAllowed(
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  if (hasUpstashConfig()) {
    return isAllowedUpstash(key, limit, windowMs);
  }
  warnOnInsecureProductionFallback();
  return isAllowedInMemory(key, limit, windowMs);
}
