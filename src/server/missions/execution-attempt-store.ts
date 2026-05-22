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
import { isLocalPersistenceFallbackAllowed } from "@/lib/server-env";

export class InMemoryExecutionStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InMemoryExecutionStoreError";
  }
}

function assertInMemoryExecutionStoreAllowed() {
  if (!isLocalPersistenceFallbackAllowed()) {
    throw new InMemoryExecutionStoreError(
      "In-memory mission execution attempt store is not allowed in production. " +
        "Configure persistent mission execution storage before enabling this path.",
    );
  }
}

// ---------------------------------------------------------------------------
// Local in-memory enforcement store for idempotency and rate limiting.
//
// Resets on server restart — no persistence across deployments.
// Pattern matches action-ledger-repository local mode: forward-compatible with
// a Supabase-backed implementation once the mission_execution_attempts table
// migration is approved (PR #19C sign-off required).
//
// The check and record operations are NOT atomic — two concurrent requests
// arriving between checkExecutionAttempt() and recordAttempt() could both
// pass the check. The route mitigates this by calling recordAttempt() before
// plan generation (reserve-before-build), but this store remains best-effort
// for development and runtime preview. Production enforcement requires
// Supabase or Redis with atomic insert / unique-key semantics.
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
 * Does NOT record the attempt — call recordAttempt() immediately after if allowed.
 */
export function checkExecutionAttempt(input: MissionExecutionAttemptInput): LocalAttemptCheckResult {
  assertInMemoryExecutionStoreAllowed();

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
 * Reserves and records an execution attempt.
 * Must be called immediately after checkExecutionAttempt() returns allowed,
 * before plan generation, to prevent concurrent requests from both passing
 * the duplicate check.
 */
export function recordAttempt(input: MissionExecutionAttemptInput, ttlSeconds = 300): void {
  assertInMemoryExecutionStoreAllowed();

  const record = createIdempotencyRecord(input, ttlSeconds);
  idempotencyStore.set(input.idempotencyKey, record);

  const rateRecord = getOrCreateRateLimitRecord(input.workspaceId);
  rateLimitStore.set(input.workspaceId, {
    ...rateRecord,
    attemptTimestamps: [...rateRecord.attemptTimestamps, new Date().toISOString()],
  });
}
