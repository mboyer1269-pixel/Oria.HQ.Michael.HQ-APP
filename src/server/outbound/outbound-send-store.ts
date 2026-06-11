// ---------------------------------------------------------------------------
// Outbound Send Store — in-memory, workspace-scoped backing store for the
// Send Desk (`ceo_single_send`).
// ---------------------------------------------------------------------------
// v1 persistence model: in-memory only (dev/local), mirroring
// mission-draft-session.ts. A Supabase dual-mode upgrade is a later,
// mandate-gated step (same path as prepared_actions / 0013).
//
// Responsibilities:
//   * hold send candidates (batch + action + recipient) registered by the
//     prep layer (Hermès) or a dev seed;
//   * record outcomes per idempotencyKey (the idempotency source of truth);
//   * count daily sends per workspace + channel (hard-cap input);
//   * hold the cross-channel suppression list.
//
// This module NEVER sends anything. It is storage only.
// ---------------------------------------------------------------------------

import type { OutboundAction, OutboundBatch } from "./outbound-types.ts";
import type { LiveSendResult } from "./outbound-executor-live.ts";
import type { OutboundChannelId } from "./outbound-channel.ts";

export type OutboundSendCandidate = {
  batch: OutboundBatch;
  action: OutboundAction;
  /** Resolved recipient identity (email address or E.164 phone). */
  recipient: string;
  channelId: OutboundChannelId;
  /** Recipient local hour provider input; null = unknown (fail-safe on sms). */
  recipientLocalHour: number | null;
};

type OutboundSendStoreState = {
  candidates: Map<string, OutboundSendCandidate>; // key: `${workspaceId}:${actionId}`
  outcomes: Map<string, LiveSendResult>; // key: idempotencyKey
  dailyCounts: Map<string, number>; // key: `${workspaceId}:${channelId}:${YYYY-MM-DD}`
  suppression: Map<string, string>; // key: `${workspaceId}:${recipient.toLowerCase()}` → reason
};

type OutboundSendStoreGlobals = typeof globalThis & {
  __outboundSendStoreState?: OutboundSendStoreState;
};

function getState(): OutboundSendStoreState {
  const globals = globalThis as OutboundSendStoreGlobals;
  if (!globals.__outboundSendStoreState) {
    globals.__outboundSendStoreState = {
      candidates: new Map(),
      outcomes: new Map(),
      dailyCounts: new Map(),
      suppression: new Map(),
    };
  }
  return globals.__outboundSendStoreState;
}

function candidateKey(workspaceId: string, actionId: string): string {
  return `${workspaceId}:${actionId}`;
}

function dayKey(workspaceId: string, channelId: OutboundChannelId, when: Date): string {
  return `${workspaceId}:${channelId}:${when.toISOString().slice(0, 10)}`;
}

function suppressionKey(workspaceId: string, recipient: string): string {
  return `${workspaceId}:${recipient.trim().toLowerCase()}`;
}

// ---------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------

export function registerOutboundSendCandidate(candidate: OutboundSendCandidate): void {
  if (candidate.batch.workspaceId !== candidate.action.workspaceId) {
    throw new Error("Candidate batch and action must share the same workspaceId.");
  }
  getState().candidates.set(
    candidateKey(candidate.action.workspaceId, candidate.action.id),
    candidate,
  );
}

export function getOutboundSendCandidate(
  workspaceId: string,
  actionId: string,
): OutboundSendCandidate | null {
  return getState().candidates.get(candidateKey(workspaceId, actionId)) ?? null;
}

export function listOutboundSendCandidates(workspaceId: string): OutboundSendCandidate[] {
  return [...getState().candidates.values()].filter(
    (candidate) => candidate.action.workspaceId === workspaceId,
  );
}

// ---------------------------------------------------------------------------
// Outcomes (idempotency)
// ---------------------------------------------------------------------------

export function recordOutboundOutcome(idempotencyKey: string, result: LiveSendResult): void {
  getState().outcomes.set(idempotencyKey, result);
}

export function getOutboundOutcome(idempotencyKey: string): LiveSendResult | null {
  return getState().outcomes.get(idempotencyKey) ?? null;
}

// ---------------------------------------------------------------------------
// Daily counters
// ---------------------------------------------------------------------------

export function sentTodayOnChannel(
  workspaceId: string,
  channelId: OutboundChannelId,
  now: Date = new Date(),
): number {
  return getState().dailyCounts.get(dayKey(workspaceId, channelId, now)) ?? 0;
}

export function incrementSentToday(
  workspaceId: string,
  channelId: OutboundChannelId,
  now: Date = new Date(),
): void {
  const key = dayKey(workspaceId, channelId, now);
  const state = getState();
  state.dailyCounts.set(key, (state.dailyCounts.get(key) ?? 0) + 1);
}

// ---------------------------------------------------------------------------
// Suppression list (cross-channel)
// ---------------------------------------------------------------------------

export function addSuppression(workspaceId: string, recipient: string, reason: string): void {
  getState().suppression.set(suppressionKey(workspaceId, recipient), reason);
}

export function isSuppressed(workspaceId: string, recipient: string): boolean {
  return getState().suppression.has(suppressionKey(workspaceId, recipient));
}

// ---------------------------------------------------------------------------
// Test support
// ---------------------------------------------------------------------------

export function resetOutboundSendStoreForTests(): void {
  const globals = globalThis as OutboundSendStoreGlobals;
  globals.__outboundSendStoreState = undefined;
}
