// src/features/ventures/hermes-prep-plan.ts
//
// Pure planner for one Relay (agent id `hermes`) prep tick. Given a batch of candidate cash moves
// (each already composed into packet + council summary + outreach plan) and the
// prepared actions already on the queue, it decides what to enqueue:
//   - NEW       — no active queue entry targets this move,
//   - REFRESH   — an active entry targets this move but its content changed
//                 (emit a superseding entry),
//   - DEDUPE    — an identical active entry already exists (skip).
// It then prioritizes the result so the best cash moves surface first.
//
// Pure and deterministic: no DB, no network, no LLM, no clock (createdAt is
// injected), no randomness. The server tick wrapper composes the candidates and
// persists the result; this module holds only the decision logic so it is fully
// testable without a real database or an applied migration.

import type { CashActionPacket } from "./cash-action-packet";
import type { HermesOutreachPlan } from "./hermes-outreach-plan";
import type {
  PreparedAction,
  PreparedActionCouncilSummary,
  PreparedActionPriority,
} from "./prepared-action";
import { buildPreparedAction, preparedActionContentHashFor } from "./prepared-action";

// ---------------------------------------------------------------------------
// SECTION A — Inputs / outputs
// ---------------------------------------------------------------------------

// A fully-composed candidate for one cash move.
export type HermesPrepCandidate = {
  packet: CashActionPacket;
  council: PreparedActionCouncilSummary;
  hermesPlan: HermesOutreachPlan;
};

export type HermesPrepPlanInput = {
  candidates: readonly HermesPrepCandidate[];
  // The current queue (any status). Used to dedup / detect refreshes.
  existing: readonly PreparedAction[];
  // Injected clock — keeps the planner deterministic.
  createdAt: string;
};

export type HermesPrepEntryKind = "new" | "refresh";

export type HermesPrepEntry = {
  action: PreparedAction;
  kind: HermesPrepEntryKind;
  // For a refresh, the preparedActionId of the active entry being superseded.
  supersedesId?: string;
};

export type HermesPrepPlanSummary = {
  candidates: number;
  enqueued: number;
  created: number;
  refreshed: number;
  deduped: number;
};

export type HermesPrepPlanResult = {
  // Highest priority first; deterministic tie-break by preparedActionId.
  toEnqueue: HermesPrepEntry[];
  summary: HermesPrepPlanSummary;
};

// ---------------------------------------------------------------------------
// SECTION B — Active queue + dedup signature
// ---------------------------------------------------------------------------

// A prepared action is "active" (occupies the queue for dedup purposes) unless
// it has been superseded or rejected.
const INACTIVE_STATUSES: ReadonlySet<string> = new Set(["superseded", "rejected"]);

export function isActivePreparedAction(action: PreparedAction): boolean {
  return !INACTIVE_STATUSES.has(action.status);
}

// A canonical signature of the MEANINGFUL content of a move — everything a human
// would notice as a change, excluding ids, timestamps, priority, and status.
// Two candidates with the same signature are the same prepared work.
function contentSignature(
  packet: CashActionPacket,
  council: PreparedActionCouncilSummary,
  plan: HermesOutreachPlan,
): string {
  return JSON.stringify({
    p: {
      targetBuyer: packet.targetBuyer,
      buyerType: packet.buyerType,
      painHypothesis: packet.painHypothesis,
      offer: packet.offer,
      pricePointCents: packet.pricePointCents,
      callToAction: packet.callToAction,
      outreachDraft: packet.outreachDraft,
      expectedCashSignal: packet.expectedCashSignal,
      requiredEvidence: packet.requiredEvidence,
    },
    c: {
      readiness: council.readiness,
      verdictDecision: council.verdictDecision,
      recommendedManualAction: council.recommendedManualAction,
    },
    h: {
      channel: plan.channel,
      senderRecommendation: plan.senderRecommendation,
      prospectProfile: plan.prospectProfile,
      prospectSelectionCriteria: plan.prospectSelectionCriteria,
      personalizationBasis: plan.personalizationBasis,
      messageDraft: plan.messageDraft,
      cta: plan.cta,
      expectedSignal: plan.expectedSignal,
      requiredEvidence: plan.requiredEvidence,
      complianceNotes: plan.complianceNotes,
      riskNotes: plan.riskNotes,
      manualSendInstructions: plan.manualSendInstructions,
    },
  });
}

// ---------------------------------------------------------------------------
// SECTION C — Prioritization (deterministic)
// ---------------------------------------------------------------------------

const READINESS_WEIGHT: Record<PreparedActionCouncilSummary["readiness"], number> = {
  ready_for_ceo: 1,
  needs_more_evidence: 0.6,
  needs_refinement: 0.5,
  blocked_by_auditor: 0.25,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// Priority score = expected cash impact (in dollars) weighted by ROI quality and
// council readiness. Pure arithmetic — no clock, no randomness.
export function computePreparedActionPriorityScore(
  packet: CashActionPacket,
  council: PreparedActionCouncilSummary,
): number {
  const impactDollars = Math.max(0, packet.expectedCashImpactCents) / 100;
  const roiWeight = clamp(packet.expectedRoiMultiple / 10, 0, 1); // roi 0..10 -> 0..1
  const readinessWeight = READINESS_WEIGHT[council.readiness] ?? 0.5;
  return Math.round(impactDollars * (0.5 + 0.5 * roiWeight) * readinessWeight);
}

export function priorityBucketForScore(score: number): PreparedActionPriority {
  if (score >= 300) return "critical";
  if (score >= 120) return "high";
  if (score >= 40) return "medium";
  return "low";
}

// ---------------------------------------------------------------------------
// SECTION D — Id generation (deterministic, collision-safe across ticks)
// ---------------------------------------------------------------------------

function compactTimestamp(iso: string): string {
  return iso.replace(/[^0-9A-Za-z]/g, "");
}

// A new prepared action id derived from the packet and the tick time. A refresh
// in a later tick gets a different time component, so it never collides with the
// entry it supersedes (the unique (workspace, prepared_action_id) constraint).
export function preparedActionIdFor(packetId: string, createdAt: string): string {
  return `${packetId}_prepared_${compactTimestamp(createdAt)}`;
}

// ---------------------------------------------------------------------------
// SECTION E — The planner
// ---------------------------------------------------------------------------

function buildEntry(
  candidate: HermesPrepCandidate,
  createdAt: string,
  kind: HermesPrepEntryKind,
  supersedesId: string | undefined,
): HermesPrepEntry {
  const score = computePreparedActionPriorityScore(candidate.packet, candidate.council);
  const action = buildPreparedAction({
    preparedActionId: preparedActionIdFor(candidate.packet.packetId, createdAt),
    ventureId: candidate.packet.ventureId,
    cashActionPacketId: candidate.packet.packetId,
    packet: candidate.packet,
    council: candidate.council,
    hermesPlan: candidate.hermesPlan,
    priority: priorityBucketForScore(score),
    priorityScore: score,
    status: "ready_for_ceo_review",
    createdAt,
    ...(supersedesId !== undefined ? { supersedesId } : {}),
  });
  return supersedesId !== undefined ? { action, kind, supersedesId } : { action, kind };
}

export function computeHermesPrepPlan(input: HermesPrepPlanInput): HermesPrepPlanResult {
  const { candidates, existing, createdAt } = input;

  // Index active queue entries by content hash, keeping their content signature.
  const activeByHash = new Map<string, { action: PreparedAction; signature: string }>();
  for (const action of existing) {
    if (!isActivePreparedAction(action)) continue;
    const sig = contentSignature(action.packet, action.council, action.hermesPlan);
    // Keep the first active entry seen for a hash (callers pass most-recent first).
    if (!activeByHash.has(action.contentHash)) {
      activeByHash.set(action.contentHash, { action, signature: sig });
    }
  }

  const entries: HermesPrepEntry[] = [];
  let created = 0;
  let refreshed = 0;
  let deduped = 0;

  // Guard against duplicate candidates within the same batch.
  const seenInBatch = new Set<string>();

  for (const candidate of candidates) {
    const hash = preparedActionContentHashFor(candidate.packet, candidate.hermesPlan);
    if (seenInBatch.has(hash)) {
      deduped++;
      continue;
    }
    seenInBatch.add(hash);

    const existingActive = activeByHash.get(hash);
    if (!existingActive) {
      entries.push(buildEntry(candidate, createdAt, "new", undefined));
      created++;
      continue;
    }

    const candidateSig = contentSignature(candidate.packet, candidate.council, candidate.hermesPlan);
    if (candidateSig === existingActive.signature) {
      deduped++;
      continue;
    }

    entries.push(
      buildEntry(candidate, createdAt, "refresh", existingActive.action.preparedActionId),
    );
    refreshed++;
  }

  // Highest priority first; deterministic tie-break by preparedActionId.
  entries.sort((a, b) => {
    if (b.action.priorityScore !== a.action.priorityScore) {
      return b.action.priorityScore - a.action.priorityScore;
    }
    return a.action.preparedActionId < b.action.preparedActionId
      ? -1
      : a.action.preparedActionId > b.action.preparedActionId
        ? 1
        : 0;
  });

  return {
    toEnqueue: entries,
    summary: {
      candidates: candidates.length,
      enqueued: entries.length,
      created,
      refreshed,
      deduped,
    },
  };
}
