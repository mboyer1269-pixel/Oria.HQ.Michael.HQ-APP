// src/features/ventures/cash-action-packet.ts
//
// Pure model for a CONCRETE revenue action an agent proposes that Michael
// (the CEO / executor) should approve and perform manually. This is the
// "operator" half of the vertical cash loop: not a dashboard, not a score —
// a single, actionable packet describing who to sell to, what to offer, what
// to say, and what evidence would prove the cash.
//
// Hard boundary: a packet is a PROPOSAL ONLY. It never executes, never
// contacts a customer, never sends an email, never spends, never publishes.
// requiresCeoApproval and noExecutionAuthorized are locked to literal true.
//
// Dependency-free and pure: no Supabase, no database, no network, no UI, no
// scoring, no persistence, no runtime execution. Validation follows the
// hand-rolled { valid, errors } style of the adjacent Ventures modules.

import type { EvidenceKind } from "./evidence-ref";
import { EVIDENCE_KINDS } from "./evidence-ref";

// ---------------------------------------------------------------------------
// SECTION A — Cash signal taxonomy (canonical owner)
// ---------------------------------------------------------------------------

// The operator-facing vocabulary for "what cash signal do we expect / did we
// get". Defined ONCE here and reused by cash-signal-intake and the outcome
// adapter — do not duplicate this union elsewhere. It is intentionally richer
// than EvidenceKind: it carries operator concepts (meeting_booked,
// verbal_commitment) that the intake layer later maps onto accounting-grade
// EvidenceKind values.
export type CashSignalType =
  | "stripe_charge"
  | "signed_loi"
  | "email_reply"
  | "meeting_booked"
  | "verbal_commitment"
  | "manual_note";

export const CASH_SIGNAL_TYPES: readonly CashSignalType[] = [
  "stripe_charge",
  "signed_loi",
  "email_reply",
  "meeting_booked",
  "verbal_commitment",
  "manual_note",
];

// Only these expected signals, once verified, can later prove real cash.
export const CASH_FINANCIAL_SIGNAL_TYPES: readonly CashSignalType[] = [
  "stripe_charge",
  "signed_loi",
];

export function isCashFinancialSignalType(type: CashSignalType): boolean {
  return CASH_FINANCIAL_SIGNAL_TYPES.includes(type);
}

// ---------------------------------------------------------------------------
// SECTION B — Buyer type
// ---------------------------------------------------------------------------

export type CashActionBuyerType =
  | "individual"
  | "smb"
  | "mid_market"
  | "enterprise"
  | "marketplace"
  | "other";

export const CASH_ACTION_BUYER_TYPES: readonly CashActionBuyerType[] = [
  "individual",
  "smb",
  "mid_market",
  "enterprise",
  "marketplace",
  "other",
];

// ---------------------------------------------------------------------------
// SECTION C — The CashActionPacket type
// ---------------------------------------------------------------------------

export type CashActionPacket = {
  packetId: string;
  ventureId: string;
  agentId: string;

  // Who and why — concrete enough for a human to act on.
  targetBuyer: string;
  buyerType: CashActionBuyerType;
  painHypothesis: string;

  // What to offer and how to ask for the sale.
  offer: string;
  pricePointCents: number;
  callToAction: string;

  // The literal message draft Michael could adapt and send HIMSELF.
  // This is a draft only — the model never sends it.
  outreachDraft: string;

  // What signal we expect back, and what evidence would make it real.
  expectedCashSignal: CashSignalType;
  requiredEvidence: EvidenceKind[];

  // The cash math — proposal-level estimates, not realized cash.
  expectedCashImpactCents: number;
  expectedCostCents: number;
  expectedRoiMultiple: number;

  createdAt: string;

  // Governance locks — always literal true.
  requiresCeoApproval: true;
  noExecutionAuthorized: true;
};

// ---------------------------------------------------------------------------
// SECTION D — Constants
// ---------------------------------------------------------------------------

// A draft / hypothesis shorter than this is too thin to act on.
export const CASH_ACTION_MIN_TEXT_LENGTH = 10;

// ---------------------------------------------------------------------------
// SECTION E — ROI math (deterministic, no clock, no randomness)
// ---------------------------------------------------------------------------

// Expected ROI multiple = impact / cost, rounded to 2 decimals. With zero cost
// we cannot express a multiple, so we return 0 rather than Infinity — keeping
// the field finite and the output deterministic.
export function computeExpectedRoiMultiple(
  expectedCashImpactCents: number,
  expectedCostCents: number,
): number {
  if (
    !Number.isFinite(expectedCashImpactCents) ||
    !Number.isFinite(expectedCostCents) ||
    expectedCostCents <= 0
  ) {
    return 0;
  }
  return Math.round((expectedCashImpactCents / expectedCostCents) * 100) / 100;
}

// ---------------------------------------------------------------------------
// SECTION F — Validation
// ---------------------------------------------------------------------------

export type CashActionPacketValidation = {
  valid: boolean;
  errors: string[];
};

function requireText(
  value: unknown,
  field: string,
  errors: string[],
  minLength = 1,
): void {
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(`${field} must be non-empty`);
  } else if (value.trim().length < minLength) {
    errors.push(`${field} is too thin (min ${minLength} characters)`);
  }
}

function requireNonNegative(value: unknown, field: string, errors: string[]): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    errors.push(`${field} must be a number >= 0`);
  }
}

export function validateCashActionPacket(
  packet: CashActionPacket,
): CashActionPacketValidation {
  const errors: string[] = [];

  // Identity.
  requireText(packet.packetId, "packetId", errors);
  requireText(packet.ventureId, "ventureId", errors);
  requireText(packet.agentId, "agentId", errors);

  // Who and why — must be concrete.
  requireText(packet.targetBuyer, "targetBuyer", errors);
  if (!CASH_ACTION_BUYER_TYPES.includes(packet.buyerType)) {
    errors.push("buyerType must be a known buyer type");
  }
  requireText(packet.painHypothesis, "painHypothesis", errors, CASH_ACTION_MIN_TEXT_LENGTH);

  // What to offer and how to ask.
  requireText(packet.offer, "offer", errors, CASH_ACTION_MIN_TEXT_LENGTH);
  requireNonNegative(packet.pricePointCents, "pricePointCents", errors);
  requireText(packet.callToAction, "callToAction", errors);

  // Draft only — must be present, but it is just text.
  requireText(packet.outreachDraft, "outreachDraft", errors, CASH_ACTION_MIN_TEXT_LENGTH);

  // Expected signal + required evidence.
  if (!CASH_SIGNAL_TYPES.includes(packet.expectedCashSignal)) {
    errors.push("expectedCashSignal must be a known cash signal type");
  }
  if (!Array.isArray(packet.requiredEvidence)) {
    errors.push("requiredEvidence must be an array");
  } else {
    if (packet.requiredEvidence.length === 0) {
      errors.push("requiredEvidence must list at least one evidence kind");
    }
    packet.requiredEvidence.forEach((kind, i) => {
      if (!EVIDENCE_KINDS.includes(kind)) {
        errors.push(`requiredEvidence[${i}] must be a known evidence kind`);
      }
    });
  }

  // Cash math.
  requireNonNegative(packet.expectedCashImpactCents, "expectedCashImpactCents", errors);
  requireNonNegative(packet.expectedCostCents, "expectedCostCents", errors);
  requireNonNegative(packet.expectedRoiMultiple, "expectedRoiMultiple", errors);

  // createdAt — valid ISO string.
  if (typeof packet.createdAt !== "string" || isNaN(+new Date(packet.createdAt))) {
    errors.push("createdAt must be a valid ISO date string");
  }

  // Governance locks — never executes, always needs the CEO.
  if (packet.requiresCeoApproval !== true) {
    errors.push("requiresCeoApproval must be true");
  }
  if (packet.noExecutionAuthorized !== true) {
    errors.push("noExecutionAuthorized must be true");
  }

  return { valid: errors.length === 0, errors };
}

// A packet is only ever a proposal: it must require approval and authorize no
// execution. This is the single source of truth for "is this safe to hold?".
export function isProposalOnly(packet: CashActionPacket): boolean {
  return packet.requiresCeoApproval === true && packet.noExecutionAuthorized === true;
}

// ---------------------------------------------------------------------------
// SECTION G — Builder
// ---------------------------------------------------------------------------

// The build boundary accepts everything except the governance locks and the
// derived ROI multiple. The builder locks governance to true and computes the
// ROI deterministically, so a packet can never be constructed in an
// executable or self-inflated state.
export type BuildCashActionPacketInput = Omit<
  CashActionPacket,
  "requiresCeoApproval" | "noExecutionAuthorized" | "expectedRoiMultiple"
> & {
  // Optional override is intentionally NOT accepted — ROI is always derived.
  requiredEvidence: readonly EvidenceKind[];
};

export function buildCashActionPacket(
  input: BuildCashActionPacketInput,
): CashActionPacket {
  return {
    packetId: input.packetId,
    ventureId: input.ventureId,
    agentId: input.agentId,
    targetBuyer: input.targetBuyer,
    buyerType: input.buyerType,
    painHypothesis: input.painHypothesis,
    offer: input.offer,
    pricePointCents: input.pricePointCents,
    callToAction: input.callToAction,
    outreachDraft: input.outreachDraft,
    expectedCashSignal: input.expectedCashSignal,
    requiredEvidence: [...input.requiredEvidence],
    expectedCashImpactCents: input.expectedCashImpactCents,
    expectedCostCents: input.expectedCostCents,
    expectedRoiMultiple: computeExpectedRoiMultiple(
      input.expectedCashImpactCents,
      input.expectedCostCents,
    ),
    createdAt: input.createdAt,
    requiresCeoApproval: true,
    noExecutionAuthorized: true,
  };
}
