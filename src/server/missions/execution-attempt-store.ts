import {
  checkIdempotencyRecord,
  checkRateLimit,
  createIdempotencyRecord,
  DEFAULT_RATE_LIMIT_CONFIG,
} from "./idempotency-contract";
import type {
  MissionExecutionAttemptInput,
  MissionIdempotencyKey,
  MissionIdempotencyRecord,
  MissionRateLimitRecord,
} from "./idempotency-contract";

// ---------------------------------------------------------------------------
// Local in-memory enforcement store for idempotency and rate limiting.
//
// Resets on server restart — no persistence across deployments.
// Pattern matches action-ledger-repository local mode: forward-compatible with
// a Supabase-backed implementation once the mission_execution_attempts table
// migration is approved (PR #19C sign-off required).
//
// One store per server process. Concurrent requests within a single Node.js
// event loop are safe — no concurrency issue at the volumes this handles.
// ---------------------------------------------------------------------------

const idempotencyStore = new Map<MissionIdempotencyKey, MissionIdempotencyRecord>();

const rateLimitStore = new Map<string, MissionRateLimitRecord>();

function getOrCreateRateLimitRecord(workspaceId: string): MissionRateLimitRecord {
  const existing = rateLimitStore.get(workspaceId);
  if (existing) return existing;
  const record: MissionRateLimitRecord = {
    workspaceId,
    attemptTimestamps: [],
    windowSeconds: DEFAULT_RATE_LIMIT_CONFIG.windowSeconds,
  };
  rateLimitStore.set(workspaceId, record);
  return record;
}

function pruneExpiredTimestamps(record: MissionRateLimitRecord, now: Date): MissionRateLimitRecord {
  const windowStart = new Date(now.getTime() - record.windowSeconds * 1000);
  const pruned: MissionRateLimitRecord = {
    ...record,
    attemptTimestamps: record.attemptTimestamps.filter((ts) => new Date(ts) >= windowStart),
  };
  rateLimitStore.set(record.workspaceId, pruned);
  return pruned;
}

export type LocalAttemptCheckResult =
  | { allowed: true }
  | { allowed: false; reason: "duplicate_key" | "rate_limit_exceeded" | "missing_idempotency_key" };

/**
 * Checks whether an execution attempt is allowed.
 * Does NOT record the attempt — call recordAttempt() after the plan succeeds.
 */
export function checkExecutionAttempt(input: MissionExecutionAttemptInput): LocalAttemptCheckResult {
  if (!input.idempotencyKey || input.idempotencyKey.trim() === "") {
    return { allowed: false, reason: "missing_idempotency_key" };
  }

  const now = new Date();

  const existingIdempotency = idempotencyStore.get(input.idempotencyKey);
  if (existingIdempotency) {
    const check = checkIdempotencyRecord(existingIdempotency, now);
    if (check.duplicate) return { allowed: false, reason: "duplicate_key" };
    // Expired — clean it up
    idempotencyStore.delete(input.idempotencyKey);
  }

  const rateRecord = pruneExpiredTimestamps(getOrCreateRateLimitRecord(input.workspaceId), now);
  const rateLimitCheck = checkRateLimit(rateRecord, DEFAULT_RATE_LIMIT_CONFIG, now);
  if (!rateLimitCheck.allowed) return { allowed: false, reason: "rate_limit_exceeded" };

  return { allowed: true };
}

/**
 * Records a successful execution attempt.
 * Call this only after the plan has been built and the response is ready to send.
 */
export function recordAttempt(input: MissionExecutionAttemptInput, ttlSeconds = 300): void {
  const record = createIdempotencyRecord(input, ttlSeconds);
  idempotencyStore.set(input.idempotencyKey, record);

  const rateRecord = getOrCreateRateLimitRecord(input.workspaceId);
  rateLimitStore.set(input.workspaceId, {
    ...rateRecord,
    attemptTimestamps: [...rateRecord.attemptTimestamps, new Date().toISOString()],
  });
}
