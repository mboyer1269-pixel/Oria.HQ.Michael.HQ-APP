// ---------------------------------------------------------------------------
// PRODUCTION WARNING -- IN-MEMORY RATE LIMITER
// ---------------------------------------------------------------------------
// This rate limiter stores timestamps in a module-scope Map. Limitations:
//
//   1. MULTI-INSTANCE / SERVERLESS: Each instance maintains its own counter.
//      A client can exceed the limit by hitting different instances, making
//      the rate limiter bypassable on horizontally-scaled deployments.
//
//   2. RESTART RESET: Counters reset on server restart (cold start, deploy).
//
// MIGRATION PATH (when multi-instance prod is needed):
//   Replace the Map with an atomic Redis/Upstash sliding-window counter
//   (e.g. Upstash Ratelimit). The function signature can stay identical --
//   only the store backend changes.
//
//   Do NOT begin this migration without an explicit mandate.
// ---------------------------------------------------------------------------

/**
 * In-memory sliding-window rate limiter.
 * Keyed by any string (typically client IP).
 * State lives in module scope -- not shared across server instances.
 */

const store = new Map<string, number[]>();

/**
 * Returns true when the request is ALLOWED, false when it should be BLOCKED.
 *
 * @param key      Unique identifier for the client (e.g. IP address)
 * @param limit    Maximum number of requests permitted within the window
 * @param windowMs Rolling window duration in milliseconds
 */
export function isAllowed(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;

  // Keep only timestamps within the current window, then record this request.
  const timestamps = (store.get(key) ?? []).filter((t) => t > cutoff);
  timestamps.push(now);
  store.set(key, timestamps);

  return timestamps.length <= limit;
}
