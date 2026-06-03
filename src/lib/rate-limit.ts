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
  return isAllowedInMemory(key, limit, windowMs);
}
