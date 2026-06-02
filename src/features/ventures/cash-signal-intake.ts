// src/features/ventures/cash-signal-intake.ts
//
// Pure model for capturing the RESULT of an owner-approved cash action — the
// "what came back" half of the vertical cash loop. Michael performs the real
// external action (sends the email, runs the charge, signs the LOI); this
// model records the signal that came back and normalizes it into a typed,
// trust-classified EvidenceRef.
//
// Accounting discipline, not bureaucracy:
//   - stripe_charge / signed_loi (verified) can become real financial proof.
//   - email_reply / meeting_booked are useful market signals, never cash.
//   - verbal_commitment is a weak signal unless backed by stronger evidence.
//   - manual_note is exploration only.
//   - a positive amountCents REQUIRES a verified financial signal — fake cash
//     is blocked at the door.
//
// Reuses the canonical CashSignalType taxonomy (cash-action-packet) and the
// canonical EvidenceRef model (evidence-ref). It defines NO new evidence type
// and NO new scoring. Pure/local: no Supabase, DB, API, runtime, or UI.

import type { CashSignalType } from "./cash-action-packet";
import { CASH_SIGNAL_TYPES, isCashFinancialSignalType } from "./cash-action-packet";
import type { EvidenceKind, EvidenceRef } from "./evidence-ref";
import {
  EVIDENCE_MIN_SUMMARY_LENGTH,
  isVerifiedFinancialEvidence,
  validateEvidenceRef,
} from "./evidence-ref";

// ---------------------------------------------------------------------------
// SECTION A — Signal → EvidenceKind mapping
// ---------------------------------------------------------------------------

// The operator vocabulary (CashSignalType) is richer than the accounting
// vocabulary (EvidenceKind). This map is the single bridge between them. It
// is deterministic and total over CashSignalType.
//
//   stripe_charge     -> stripe_charge      (financial, strongest when verified)
//   signed_loi        -> signed_loi         (financial, high when verified)
//   email_reply       -> email_reply        (engagement, non-cash)
//   meeting_booked    -> analytics_event    (a recorded event, non-cash)
//   verbal_commitment -> self_reported      (weak, low trust)
//   manual_note       -> manual_note        (exploration only)
const SIGNAL_TO_EVIDENCE_KIND: Record<CashSignalType, EvidenceKind> = {
  stripe_charge: "stripe_charge",
  signed_loi: "signed_loi",
  email_reply: "email_reply",
  meeting_booked: "analytics_event",
  verbal_commitment: "self_reported",
  manual_note: "manual_note",
};

export function cashSignalTypeToEvidenceKind(type: CashSignalType): EvidenceKind {
  return SIGNAL_TO_EVIDENCE_KIND[type];
}

// Where the normalized evidence came from — a deterministic, non-empty tag.
export function cashSignalSource(sourceAgentId: string): string {
  return `cash-signal:${sourceAgentId}`;
}

// ---------------------------------------------------------------------------
// SECTION B — The CashSignalIntake type
// ---------------------------------------------------------------------------

export type CashSignalIntake = {
  signalId: string;
  packetId: string;
  ventureId: string;
  sourceAgentId: string;

  signalType: CashSignalType;
  referenceId: string;
  isVerified: boolean;

  // Present only when a monetary amount is genuinely attached to the signal.
  // A positive value is only allowed for a verified financial signal.
  amountCents?: number;

  summary: string;
  capturedAt: string; // ISO date string

  // The normalized, accounting-grade evidence for this signal.
  evidenceRef: EvidenceRef;
};

// ---------------------------------------------------------------------------
// SECTION C — Normalization into EvidenceRef
// ---------------------------------------------------------------------------

// The fields the intake builder needs before it has produced the evidenceRef.
export type CashSignalIntakeInput = Omit<CashSignalIntake, "evidenceRef">;

// Build the canonical EvidenceRef for a raw signal. Deterministic — derived
// entirely from the signal's own fields, no clock and no randomness.
export function cashSignalToEvidenceRef(input: CashSignalIntakeInput): EvidenceRef {
  return {
    kind: cashSignalTypeToEvidenceKind(input.signalType),
    referenceId: input.referenceId,
    isVerified: input.isVerified,
    source: cashSignalSource(input.sourceAgentId),
    capturedAt: input.capturedAt,
    summary: input.summary,
  };
}

// True only when this signal is verified financial proof (a verified
// stripe_charge or signed_loi). This is what unlocks real cash downstream.
export function isVerifiedFinancialSignal(input: CashSignalIntakeInput): boolean {
  return (
    input.isVerified === true &&
    isCashFinancialSignalType(input.signalType)
  );
}

// ---------------------------------------------------------------------------
// SECTION D — Validation
// ---------------------------------------------------------------------------

export type CashSignalIntakeValidation = {
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

export function validateCashSignalIntake(
  intake: CashSignalIntake,
): CashSignalIntakeValidation {
  const errors: string[] = [];

  // Identity.
  requireText(intake.signalId, "signalId", errors);
  requireText(intake.packetId, "packetId", errors);
  requireText(intake.ventureId, "ventureId", errors);
  requireText(intake.sourceAgentId, "sourceAgentId", errors);

  // Signal shape.
  if (!CASH_SIGNAL_TYPES.includes(intake.signalType)) {
    errors.push("signalType must be a known cash signal type");
  }
  requireText(intake.referenceId, "referenceId", errors);
  if (typeof intake.isVerified !== "boolean") {
    errors.push("isVerified must be a boolean");
  }
  requireText(intake.summary, "summary", errors, EVIDENCE_MIN_SUMMARY_LENGTH);
  if (typeof intake.capturedAt !== "string" || isNaN(+new Date(intake.capturedAt))) {
    errors.push("capturedAt must be a valid ISO date string");
  }

  // Amount — optional, but if present it must be a non-negative number, and a
  // POSITIVE amount requires a verified financial signal. This is the gate
  // that blocks fake cash: a note or a verbal nod can never carry money.
  if (intake.amountCents !== undefined) {
    if (typeof intake.amountCents !== "number" || !Number.isFinite(intake.amountCents) || intake.amountCents < 0) {
      errors.push("amountCents, when present, must be a number >= 0");
    } else if (intake.amountCents > 0 && !isVerifiedFinancialSignal(intake)) {
      errors.push(
        "positive amountCents requires a verified financial signal (verified stripe_charge or signed_loi)",
      );
    }
  }

  // Evidence ref must be present, structurally valid, and consistent with the
  // signal it was normalized from.
  if (!intake.evidenceRef || typeof intake.evidenceRef !== "object") {
    errors.push("evidenceRef must be present");
  } else {
    const refResult = validateEvidenceRef(intake.evidenceRef);
    for (const e of refResult.errors) errors.push(`evidenceRef: ${e}`);

    const expectedKind = cashSignalTypeToEvidenceKind(intake.signalType);
    if (CASH_SIGNAL_TYPES.includes(intake.signalType) && intake.evidenceRef.kind !== expectedKind) {
      errors.push(`evidenceRef.kind must be ${expectedKind} for signalType ${intake.signalType}`);
    }
    if (intake.evidenceRef.isVerified !== intake.isVerified) {
      errors.push("evidenceRef.isVerified must match the signal's isVerified");
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// SECTION E — Builder
// ---------------------------------------------------------------------------

// Build a complete intake from raw fields, normalizing the evidenceRef.
// Deterministic and pure. Does NOT throw on weak signals — exploration is
// allowed; only a positive amount on a non-financial signal is a hard error,
// surfaced via validateCashSignalIntake.
export function buildCashSignalIntake(input: CashSignalIntakeInput): CashSignalIntake {
  const base: CashSignalIntake = {
    signalId: input.signalId,
    packetId: input.packetId,
    ventureId: input.ventureId,
    sourceAgentId: input.sourceAgentId,
    signalType: input.signalType,
    referenceId: input.referenceId,
    isVerified: input.isVerified,
    summary: input.summary,
    capturedAt: input.capturedAt,
    evidenceRef: cashSignalToEvidenceRef(input),
  };
  if (input.amountCents !== undefined) {
    base.amountCents = input.amountCents;
  }
  return base;
}

// Convenience: does this built intake's evidence qualify as verified financial
// proof? Mirrors the evidence-ref financial gate so callers don't re-derive it.
export function intakeIsVerifiedFinancial(intake: CashSignalIntake): boolean {
  return isVerifiedFinancialEvidence(intake.evidenceRef);
}
