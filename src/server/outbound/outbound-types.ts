// ---------------------------------------------------------------------------
// Outbound Lane — canonical server-side types
// ---------------------------------------------------------------------------
// See docs/OUTBOUND_POLICY.md for the full contract specification.
// See docs/REVENUE_EXECUTION_LANE.md for the operating model.
//
// These types are workspace-bound and live server-side only.
// ---------------------------------------------------------------------------

import type { EvidenceRef } from "@/features/ventures/evidence-ref";

// ---------------------------------------------------------------------------
// Enums / union types
// ---------------------------------------------------------------------------

export type OutboundSubVoie =
  | "reply_assist"
  | "follow_up"
  | "re_activation"
  | "cold_email";

export type AudienceType =
  | "internal_test"
  | "known_contact"
  | "warm_lead"
  | "cold_prospect";

export type ConsentBasis =
  | "express"
  | "implied_verified"
  | "manual_review_required"
  | "unknown";

export type Jurisdiction = "CA" | "US" | "EU" | "other";

export type BatchState =
  | "drafted"
  | "policy_checked"
  | "pending_approval"
  | "approved"
  | "executing"
  | "paused"
  | "completed"
  | "expired"
  | "blocked";

export type ActionState =
  | "queued"
  | "sent"
  | "delivered"
  | "bounced"
  | "outcome_captured"
  | "closed"
  | "orphaned";

export type OutboundOutcomeType =
  | "email_reply"
  | "booked_call"
  | "signed_loi"
  | "stripe_charge"
  | "unsubscribe"
  | "manual_note";

export type SuppressionReason =
  | "unsubscribed"
  | "hard_bounce"
  | "complaint"
  | "in_conversation"
  | "existing_customer"
  | "competitor"
  | "manual";

export type CircuitBreakerState = "closed" | "open";

export type PolicyDecision = "ALLOW" | "REQUIRE_APPROVAL" | "BLOCK";

// ---------------------------------------------------------------------------
// OutboundBatch — what Michael approves (template + audience + policy)
// ---------------------------------------------------------------------------

export type OutboundBatch = {
  id: string;
  workspaceId: string;
  agentId: string;
  ventureId?: string;
  subVoie: OutboundSubVoie;
  audienceType: AudienceType;
  recipientCount: number;
  messageTemplate: string;          // template, NOT the final rendered message
  aiDisclosure: string;             // policy/ethics layer (NOT a legal requirement)
  consentBasis: ConsentBasis;
  consentProvenance: EvidenceRef[]; // verifiable source of right-to-contact
  unsubscribeMechanism: "present" | "absent";
  jurisdiction: Jurisdiction;
  riskLevel: "low" | "medium" | "high" | "critical";
  approvalMode: "none" | "batch" | "per_message" | "blocked";
  contentHash: string;              // hash(template + audienceType + jurisdiction + consentBasis + aiDisclosure)
  approvalToken?: string;           // bound to contentHash; dies if hash changes
  approvedBy?: string;              // userId of CEO who approved
  approvedAt?: string;              // ISO 8601
  sendWindow: { start: string; end: string }; // ISO 8601
  volumeCap: number;                // hard cap — enforced, not advisory
  state: BatchState;
  policyDecisionRef?: string;       // reference to PolicyDecisionRecord id
  createdAt: string;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// OutboundAction — one action per recipient (what goes to the ledger)
// ---------------------------------------------------------------------------

export type OutboundAction = {
  id: string;
  workspaceId: string;
  batchId: string;
  leadId: string;
  idempotencyKey: string;                     // format: `${batchId}:${leadId}`
  actionType: OutboundSubVoie;
  renderedSubject: string;
  renderedBody: string;
  personalizationSources: EvidenceRef[];      // every personalization references a real source
  threadId?: string;                          // for reply attribution
  modelUsed: string;                          // model that drafted — quality audit
  costEstimateCents: number;
  state: ActionState;
  sentAt?: string;
  deliveredAt?: string;
  bouncedAt?: string;
  outcomeType?: OutboundOutcomeType;
  outcomeAt?: string;
  outcomeEvidenceRef?: EvidenceRef;
  createdAt: string;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// PolicyDecisionRecord — Sentinelle output
// ---------------------------------------------------------------------------

export type PolicyDecisionRecord = {
  id: string;
  decision: PolicyDecision;
  batchId: string;
  workspaceId: string;
  reasons: string[];
  suppressionHits: number;
  reputationWarnings: string[];
  consentIssues: string[];
  complianceFlags: string[];
  checkedAt: string;
};

// ---------------------------------------------------------------------------
// SuppressionEntry — Do-Not-Contact registry
// ---------------------------------------------------------------------------

export type SuppressionEntry = {
  id: string;
  workspaceId: string;
  contactKey: string;           // normalized email or domain (lowercase, trimmed)
  reason: SuppressionReason;
  source: EvidenceRef;          // verifiable provenance
  createdAt: string;
};

// ---------------------------------------------------------------------------
// ReputationState — per mailbox/domain health tracking
// ---------------------------------------------------------------------------

export type ReputationState = {
  mailboxId: string;
  workspaceId: string;
  domain: string;
  dailySentCount: number;
  dailyCap: number;             // ramp-up / warmup
  rollingBounceRate: number;    // 0.0 – 1.0
  rollingComplaintRate: number; // 0.0 – 1.0
  circuitBreaker: CircuitBreakerState; // open = auto-pause sends on this domain
  lastUpdatedAt: string;
};

// ---------------------------------------------------------------------------
// AgentBudgetGuard — per-agent spend/loop limits
// ---------------------------------------------------------------------------

export type RepetitionDetectionConfig = {
  enabled: true;
  window: number;       // number of recent actions to inspect
  haltAfterK: number;   // halt if hash(action+input) seen K times in window
};

export type AgentBudgetGuard = {
  agentId: string;
  workspaceId: string;
  dailyTokenBudget: number;
  dailyUsdBudget: number;
  maxLoopsPerTask: number;
  maxRetries: number;
  repetitionDetection: RepetitionDetectionConfig;
  escalationThreshold: number;
};

// ---------------------------------------------------------------------------
// OrgBudgetGuard — global org spend cap (catches N agents under budget)
// ---------------------------------------------------------------------------

export type OrgBudgetGuard = {
  workspaceId: string;
  dailyUsdCap: number;
  monthlyUsdCap: number;
};

// ---------------------------------------------------------------------------
// ModelRoutingPolicy — no hardcoded models; judge ≠ producer
// ---------------------------------------------------------------------------

export type ModelRoutingPolicy = {
  taskType: string;
  preferredModel: string;
  fallbackModel: string;
  maxCostCents: number;
  requiredReasoningLevel: "low" | "standard" | "high";
  criticalEvaluatorModel: string; // MUST differ from producer model
};

// ---------------------------------------------------------------------------
// Batch state transition helpers
// ---------------------------------------------------------------------------

/** All valid state transitions for OutboundBatch */
export const BATCH_TRANSITIONS: Record<BatchState, BatchState[]> = {
  drafted:          ["policy_checked"],
  policy_checked:   ["pending_approval", "approved", "blocked"],
  pending_approval: ["approved", "blocked"],
  approved:         ["executing", "expired"],
  executing:        ["paused", "completed"],
  paused:           ["executing", "expired"],
  completed:        [],
  expired:          [],
  blocked:          [],
};

/** All valid state transitions for OutboundAction */
export const ACTION_TRANSITIONS: Record<ActionState, ActionState[]> = {
  queued:           ["sent", "orphaned"],
  sent:             ["delivered", "bounced", "orphaned"],
  delivered:        ["outcome_captured", "closed"],
  bounced:          ["closed"],
  outcome_captured: ["closed"],
  closed:           [],
  orphaned:         [],
};

export function isBatchTransitionAllowed(from: BatchState, to: BatchState): boolean {
  return BATCH_TRANSITIONS[from].includes(to);
}

export function isActionTransitionAllowed(from: ActionState, to: ActionState): boolean {
  return ACTION_TRANSITIONS[from].includes(to);
}

// ---------------------------------------------------------------------------
// Content hash helpers (pure, no side effects)
// ---------------------------------------------------------------------------

/**
 * Builds the canonical string used to compute contentHash.
 * Order is deterministic — do not change without migrating existing tokens.
 */
export function buildContentHashInput(batch: Pick<OutboundBatch,
  "messageTemplate" | "audienceType" | "jurisdiction" | "consentBasis" | "aiDisclosure"
>): string {
  return [
    batch.messageTemplate,
    batch.audienceType,
    batch.jurisdiction,
    batch.consentBasis,
    batch.aiDisclosure,
  ].join("|");
}

/**
 * Idempotency key for an OutboundAction.
 * Format: `{batchId}:{leadId}` — stable across retries, prevents double-send.
 */
export function buildActionIdempotencyKey(batchId: string, leadId: string): string {
  return `${batchId}:${leadId}`;
}
