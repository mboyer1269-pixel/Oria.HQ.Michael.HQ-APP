// src/server/decision-spine/collect-decision-signals.ts
//
// P3a — read-only signal collector for the Decision Spine.
//
// Bridges the live read surfaces into the pure engine's DecisionSignalSnapshot.
// Every external read is an INJECTABLE dependency, so tests run 100% offline
// (no Supabase, no filesystem, no network). The real default readers are loaded
// LAZILY via dynamic import, so importing this module pulls in nothing heavy —
// and the defaults are never reached when deps are injected.
//
// Hard boundaries (P3a):
//   * READ-ONLY. Never writes. Never calls updateLoi96Target or the loi96 board
//     action (which reconcile-WRITE pipeline.json). The pipeline is read only
//     via loadLoi96Pipeline().
//   * No Cost Ladder, no providers, no Resend/Twilio, no Supabase writes.

import type { DecisionSignalSnapshot, Loi96TargetSignal } from "./next-best-action";
import type { Loi96Pipeline, Loi96Target } from "@/server/ventures/loi96-target-store";
import type { OutboundSendCandidate } from "@/server/outbound/outbound-send-store";
import type { LiveSendResult } from "@/server/outbound/outbound-executor-live";
import type { ListActionLedgerResult } from "@/server/actions/action-ledger-read.types";

/** Number of recent ledger entries normalized into the snapshot. */
export const COLLECTOR_LEDGER_LIMIT = 20;

/** Injectable read-only ports. Defaults read the real stores lazily. */
export type CollectorDeps = {
  loadPipeline: () => Loi96Pipeline | null | Promise<Loi96Pipeline | null>;
  listCandidates: (
    workspaceId: string,
  ) => OutboundSendCandidate[] | Promise<OutboundSendCandidate[]>;
  getOutcome: (
    idempotencyKey: string,
  ) => LiveSendResult | null | Promise<LiveSendResult | null>;
  listLedger: (input: { workspaceId: string; limit: number }) => Promise<ListActionLedgerResult>;
  now: () => string;
};

const defaultDeps: CollectorDeps = {
  loadPipeline: async () =>
    (await import("@/server/ventures/loi96-target-store")).loadLoi96Pipeline(),
  listCandidates: async (workspaceId) =>
    (await import("@/server/outbound/outbound-send-store")).listOutboundSendCandidates(workspaceId),
  getOutcome: async (idempotencyKey) =>
    (await import("@/server/outbound/outbound-send-store")).getOutboundOutcome(idempotencyKey),
  listLedger: async (input) =>
    (await import("@/server/actions/action-ledger-read")).listActionLedgerForWorkspace(input),
  now: () => new Date().toISOString(),
};

export type CollectDecisionSignalsInput = {
  workspaceId: string;
  /** Reserved for future per-user scoping; unused by current read paths. */
  userId?: string;
  deps?: Partial<CollectorDeps>;
};

function hasEmailContact(contact: string | null): boolean {
  return typeof contact === "string" && contact.includes("@");
}

function normalizeTarget(target: Loi96Target): Loi96TargetSignal {
  return {
    domain: target.domain,
    name: target.name,
    tier: target.tier,
    status: target.status,
    hasEmail: hasEmailContact(target.contact),
    sentDate: target.sentDate,
    replyDate: target.replyDate,
    outboundActionId: target.outboundActionId ?? null,
  };
}

/**
 * Collects a read-only signal snapshot for the Decision Spine. Async because the
 * ledger read is async. Pure-read: triggers no writes, no dispatch, no external
 * side effects. Inject `deps` to run fully offline (see the collector test).
 */
export async function collectDecisionSignalSnapshot(
  input: CollectDecisionSignalsInput,
): Promise<DecisionSignalSnapshot> {
  const deps: CollectorDeps = { ...defaultDeps, ...input.deps };
  const now = deps.now();

  // 1. loi96 pipeline — READ ONLY via loadLoi96Pipeline (never the writing board action).
  const pipeline = await deps.loadPipeline();
  const loi96: DecisionSignalSnapshot["loi96"] = pipeline
    ? {
        present: true,
        weeklyGoalAuditsSent: pipeline.weeklyGoal.auditsSent,
        killMetrics: pipeline.killMetrics,
        targets: pipeline.targets.map(normalizeTarget),
      }
    : { present: false, weeklyGoalAuditsSent: 0, killMetrics: [], targets: [] };

  // 2. Send Desk — a candidate stays "queued / awaiting CEO click" until its
  //    recorded outcome is `sent`.
  const candidates = await deps.listCandidates(input.workspaceId);
  const queuedActionIds: string[] = [];
  for (const candidate of candidates) {
    const outcome = await deps.getOutcome(candidate.action.idempotencyKey);
    if (!outcome || outcome.status !== "sent") {
      queuedActionIds.push(candidate.action.id);
    }
  }

  // 3. Recent ledger activity — context only (no v1 rule consumes it yet).
  const ledger = await deps.listLedger({
    workspaceId: input.workspaceId,
    limit: COLLECTOR_LEDGER_LIMIT,
  });

  return {
    now,
    loi96,
    sendDesk: {
      queuedCount: queuedActionIds.length,
      queuedActionIds,
    },
    ledger: {
      recent: ledger.entries.map((entry) => ({
        actionType: entry.actionType,
        summary: entry.summary,
        createdAt: entry.createdAt,
      })),
    },
  };
}
