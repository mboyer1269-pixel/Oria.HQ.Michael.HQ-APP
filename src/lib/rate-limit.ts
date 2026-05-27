/**
 * In-memory sliding-window rate limiter.
 * Keyed by any string (typically client IP).
 * State lives in module scope — not shared across server instances.
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
