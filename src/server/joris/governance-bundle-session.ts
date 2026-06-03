// src/server/joris/governance-bundle-session.ts

// ---------------------------------------------------------------------------
// PRODUCTION WARNING — IN-MEMORY SESSION STORE
// ---------------------------------------------------------------------------
// This module uses a module-scope Map to hold pending governance bundles.
// Same limitations as mission-draft-session.ts:
//
//   1. MULTI-INSTANCE / SERVERLESS: State is NOT shared across instances.
//      A governance bundle previewed on instance A is invisible on instance B.
//
//   2. RESTART LOSS: In-progress governance review sessions are lost on restart.
//
// MIGRATION PATH (when multi-instance prod is needed):
//   Replace the Map with a short-TTL Supabase table or Redis/Upstash store.
//   GOVERNANCE_BUNDLE_TTL_MS (30 min) is the correct TTL value for the key.
//
//   Do NOT begin this migration without an explicit mandate.
// ---------------------------------------------------------------------------

/**
 * In-memory pending Governance Bundle store for Joris conversational continuity.
 *
 * This mirrors the mission-draft-session pattern (src/server/missions/
 * mission-draft-session.ts): a per-(workspace, user) in-memory Map with a TTL.
 * It lets a previewed Governance Bundle persist across conversation turns so a
 * subsequent CEO review message can be applied to it — without any database,
 * persistence layer, or runtime dispatch.
 *
 * Strict boundaries:
 *   - In-memory only. No DB, no Supabase, no file I/O.
 *   - Stores a dry-run preview snapshot only. A pending bundle is a planning
 *     artifact — it authorizes nothing.
 *   - This store is DISTINCT from the mission-draft store. It has no confirm or
 *     execute hook. Storing or reading a pending governance bundle never books,
 *     writes a ledger entry, or dispatches anything.
 *   - humanOnTheLoop and noExecutionAuthorized live on the bundle itself and are
 *     enforced by the PR124 validator; this store does not weaken them.
 *
 * All functions are synchronous and side-effect-free beyond the module-local Map.
 */

import type { WorkOrderGovernanceBundle } from "@/server/agents/work-order-governance-bundle";

/** Time-to-live for a pending governance bundle (30 minutes). */
export const GOVERNANCE_BUNDLE_TTL_MS = 30 * 60 * 1000;

export type PendingGovernanceBundle = {
  workspaceId: string;
  userId: string;
  bundleId: string;
  createdAt: string;
  expiresAt: string;
  bundle: WorkOrderGovernanceBundle;
};

const pendingBySessionKey = new Map<string, PendingGovernanceBundle>();

function sessionKey(workspaceId: string, userId: string): string {
  return `${workspaceId}:${userId}`;
}

/**
 * Returns true if the pending bundle is at or past its expiry timestamp.
 */
export function isPendingGovernanceBundleExpired(
  pending: PendingGovernanceBundle,
  now = Date.now(),
): boolean {
  return Date.parse(pending.expiresAt) <= now;
}

/**
 * Returns the active pending governance bundle for the (workspace, user), or
 * undefined when none exists or the pending bundle has expired. Expired entries
 * are evicted lazily on read.
 */
export function getPendingGovernanceBundle(
  workspaceId: string,
  userId: string,
): PendingGovernanceBundle | undefined {
  const key = sessionKey(workspaceId, userId);
  const pending = pendingBySessionKey.get(key);
  if (!pending) return undefined;

  if (isPendingGovernanceBundleExpired(pending)) {
    pendingBySessionKey.delete(key);
    return undefined;
  }

  return pending;
}

/**
 * Stores (or replaces) the pending governance bundle for the (workspace, user).
 * The bundle is stored by reference; callers must pass an already-built,
 * immutable preview bundle. Returns the stored pending record.
 *
 * This does not mutate the bundle and performs no I/O beyond the local Map.
 */
export function setPendingGovernanceBundle(input: {
  workspaceId: string;
  userId: string;
  bundle: WorkOrderGovernanceBundle;
  now?: number;
}): PendingGovernanceBundle {
  const now = input.now ?? Date.now();
  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(now + GOVERNANCE_BUNDLE_TTL_MS).toISOString();

  const pending: PendingGovernanceBundle = {
    workspaceId: input.workspaceId,
    userId: input.userId,
    bundleId: input.bundle.id,
    createdAt,
    expiresAt,
    bundle: input.bundle,
  };

  pendingBySessionKey.set(sessionKey(input.workspaceId, input.userId), pending);
  return pending;
}

/**
 * Clears the pending governance bundle for the (workspace, user).
 * Returns true if an entry was removed.
 */
export function clearPendingGovernanceBundle(workspaceId: string, userId: string): boolean {
  return pendingBySessionKey.delete(sessionKey(workspaceId, userId));
}

/**
 * Test-only helper to reset the in-memory store between test cases.
 */
export function resetGovernanceSessionForTests(): void {
  pendingBySessionKey.clear();
}
