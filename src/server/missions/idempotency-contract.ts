// ---------------------------------------------------------------------------
// Idempotency + rate limit contract for mission execution attempts.
//
// Pure types and pure functions — no I/O, no writes, no timers, no state.
// The enforcement layer (in-memory or Redis TTL window) is the caller's
// responsibility and is out of scope until PR #19D (dry-run endpoint).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Idempotency key — a caller-supplied token that uniquely identifies a single
// execution attempt. Two calls with the same key within the TTL window are
// considered duplicates; the second must be rejected.
//
// Recommended format: `<workspaceId>:<missionId>:<requestId>`
// Example:            "michael-hq:msn_1:req_abc123"
// ---------------------------------------------------------------------------

export type MissionIdempotencyKey = string;

export type MissionIdempotencyRecord = {
  key: MissionIdempotencyKey;
  missionId: string;
  workspaceId: string;
  /** ISO timestamp when this key was first seen. */
  firstSeenAt: string;
  /** ISO timestamp after which this key may be reused (TTL expiry). */
  expiresAt: string;
};

export type MissionIdempotencyCheckResult =
  | { duplicate: false }
  | { duplicate: true; firstSeenAt: string; expiresAt: string };

// ---------------------------------------------------------------------------
// Rate limit contract — controls execution attempt frequency per workspace.
//
// Default: max 10 attempts per workspace per 60-second rolling window.
// The window and limit are configurable at call time; the defaults are
// conservative and may be relaxed once the live executor is validated.
// ---------------------------------------------------------------------------

export type MissionRateLimitConfig = {
  /** Max execution attempts allowed within windowSeconds. Default: 10. */
  maxAttempts: number;
  /** Rolling window duration in seconds. Default: 60. */
  windowSeconds: number;
};

export const DEFAULT_RATE_LIMIT_CONFIG: MissionRateLimitConfig = {
  maxAttempts: 10,
  windowSeconds: 60,
};

export type MissionRateLimitRecord = {
  workspaceId: string;
  /** ISO timestamps of all attempts within the current window. */
  attemptTimestamps: string[];
  /** Rolling window duration in seconds (matches config used at write time). */
  windowSeconds: number;
};

export type MissionRateLimitCheckResult =
  | { allowed: true; attemptsInWindow: number; remainingAttempts: number }
  | { allowed: false; attemptsInWindow: number; retryAfterSeconds: number };

// ---------------------------------------------------------------------------
// MissionExecutionAttemptInput — what a caller must supply before execution.
// The executor must reject any attempt missing idempotencyKey.
// ---------------------------------------------------------------------------

export type MissionExecutionAttemptInput = {
  missionId: string;
  workspaceId: string;
  idempotencyKey: MissionIdempotencyKey;
};

// ---------------------------------------------------------------------------
// createIdempotencyRecord
//
// Pure function — no I/O.
// Shapes a new idempotency record for a first-seen key.
// The caller is responsible for persisting it and checking for duplicates
// before calling this function.
// ---------------------------------------------------------------------------

export function createIdempotencyRecord(
  input: MissionExecutionAttemptInput,
  ttlSeconds = 300,
): MissionIdempotencyRecord {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

  return {
    key: input.idempotencyKey,
    missionId: input.missionId,
    workspaceId: input.workspaceId,
    firstSeenAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// checkIdempotencyRecord
//
// Pure function — no I/O.
// Given an existing record from the store, determines whether the incoming
// key is a duplicate within the TTL window.
//
// If the record has expired, the caller should delete it and treat the
// incoming key as a new attempt (not a duplicate).
// ---------------------------------------------------------------------------

export function checkIdempotencyRecord(
  record: MissionIdempotencyRecord,
  now = new Date(),
): MissionIdempotencyCheckResult {
  const expiry = new Date(record.expiresAt);

  if (now >= expiry) {
    // Record has expired — key may be reused
    return { duplicate: false };
  }

  return {
    duplicate: true,
    firstSeenAt: record.firstSeenAt,
    expiresAt: record.expiresAt,
  };
}

// ---------------------------------------------------------------------------
// checkRateLimit
//
// Pure function — no I/O.
// Given the attempt timestamps stored for a workspace, determines whether a
// new attempt is within the allowed rate.
//
// Callers must filter out timestamps outside the rolling window before
// passing them; this function trusts the list it receives.
// ---------------------------------------------------------------------------

export function checkRateLimit(
  record: MissionRateLimitRecord,
  config: MissionRateLimitConfig = DEFAULT_RATE_LIMIT_CONFIG,
  now = new Date(),
): MissionRateLimitCheckResult {
  const windowStart = new Date(now.getTime() - config.windowSeconds * 1000);

  const attemptsInWindow = record.attemptTimestamps.filter(
    (ts) => new Date(ts) >= windowStart,
  ).length;

  if (attemptsInWindow < config.maxAttempts) {
    return {
      allowed: true,
      attemptsInWindow,
      remainingAttempts: config.maxAttempts - attemptsInWindow,
    };
  }

  // Find the oldest timestamp in the window to compute retry delay
  const oldestInWindow = record.attemptTimestamps
    .map((ts) => new Date(ts).getTime())
    .filter((t) => t >= windowStart.getTime())
    .sort((a, b) => a - b)[0];

  const retryAfterMs = oldestInWindow
    ? oldestInWindow + config.windowSeconds * 1000 - now.getTime()
    : config.windowSeconds * 1000;

  return {
    allowed: false,
    attemptsInWindow,
    retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
  };
}

// ---------------------------------------------------------------------------
// validateExecutionAttempt
//
// Pure function — no I/O.
// Runs both the idempotency check and rate limit check in a single call.
// Returns a combined result that the executor can act on directly.
// ---------------------------------------------------------------------------

export type MissionExecutionAttemptValidation =
  | { valid: true }
  | {
      valid: false;
      reason: "duplicate_key" | "rate_limit_exceeded" | "missing_idempotency_key";
      detail: MissionIdempotencyCheckResult | MissionRateLimitCheckResult | null;
    };

export function validateExecutionAttempt(
  input: Partial<MissionExecutionAttemptInput>,
  existingIdempotencyRecord: MissionIdempotencyRecord | null | undefined,
  rateLimitRecord: MissionRateLimitRecord,
  config: MissionRateLimitConfig = DEFAULT_RATE_LIMIT_CONFIG,
  now = new Date(),
): MissionExecutionAttemptValidation {
  // Gate 1: idempotency key must be present
  if (!input.idempotencyKey || input.idempotencyKey.trim() === "") {
    return { valid: false, reason: "missing_idempotency_key", detail: null };
  }

  // Gate 2: idempotency — reject duplicates within TTL window
  if (existingIdempotencyRecord) {
    const idempotencyCheck = checkIdempotencyRecord(existingIdempotencyRecord, now);
    if (idempotencyCheck.duplicate) {
      return { valid: false, reason: "duplicate_key", detail: idempotencyCheck };
    }
  }

  // Gate 3: rate limit — reject if workspace exceeded allowed frequency
  const rateLimitCheck = checkRateLimit(rateLimitRecord, config, now);
  if (!rateLimitCheck.allowed) {
    return { valid: false, reason: "rate_limit_exceeded", detail: rateLimitCheck };
  }

  return { valid: true };
}
