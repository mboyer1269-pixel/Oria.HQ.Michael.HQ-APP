// src/features/ventures/cash-signal-outcome-adapter.ts
//
// The closing seam of the vertical cash loop. It converts a captured
// CashSignalIntake into a BuildAgentRevenueOutcomeInput, so the existing
// AgentRevenueOutcome model and the score system downstream can "light up"
// from REAL proof — without inventing cash.
//
// The whole accounting contract lives here in one rule:
//   - verified financial proof  -> backs cashGenerated (real cash)
//   - market signal             -> backs paymentSignal / customerProof only
//   - weak / exploration signal  -> low-trust exploratory evidence only
//
// Fake cash is structurally impossible: cashGenerated.amountCents is only ever
// the intake amount for a VERIFIED FINANCIAL signal; every other class maps to
// zero realized cash. Weak market signals stay valid — exploration is not
// punished, it is simply never mistaken for money.
//
// Pure/local: no Supabase, DB, API, runtime, server/agents, or UI. It reuses
// the canonical EvidenceRef, CashSignalIntake, and AgentRevenueOutcome models;
// it defines no new evidence type, no new score, and no new ROI logic.

import type { BuildAgentRevenueOutcomeInput } from "./agent-revenue-outcome";
import type { CashSignalIntake } from "./cash-signal-intake";
import { intakeIsVerifiedFinancial } from "./cash-signal-intake";
import type { EvidenceRef } from "./evidence-ref";

// ---------------------------------------------------------------------------
// SECTION A — Classification
// ---------------------------------------------------------------------------

export type CashSignalOutcomeClass = "verified_cash" | "market_signal" | "exploration";

// Where does this captured signal sit on the accounting ladder?
//   verified_cash  — a verified stripe_charge or signed_loi: real financial proof.
//   market_signal  — engagement worth acting on (email reply, booked meeting,
//                    or an as-yet-unverified financial claim) but NOT cash.
//   exploration    — verbal nods and notes: weak, low-trust, keep exploring.
export function classifyCashSignalForOutcome(
  intake: CashSignalIntake,
): CashSignalOutcomeClass {
  if (intakeIsVerifiedFinancial(intake)) {
    return "verified_cash";
  }
  if (intake.signalType === "email_reply" || intake.signalType === "meeting_booked") {
    return "market_signal";
  }
  if (intake.signalType === "stripe_charge" || intake.signalType === "signed_loi") {
    // A financial claim that is not yet verified is a strong lead, not proof.
    return "market_signal";
  }
  // verbal_commitment, manual_note, and anything else.
  return "exploration";
}

// ---------------------------------------------------------------------------
// SECTION B — Signal-input helpers
// ---------------------------------------------------------------------------

type SignalInput = {
  score: number;
  basis: string;
  evidence: readonly EvidenceRef[];
};

function dim(score: number, basis: string, evidence: readonly EvidenceRef[] = []): SignalInput {
  return { score, basis, evidence };
}

// A neutral, non-empty basis for a dimension that this single signal does not
// speak to. Keeps the outcome valid without overclaiming.
const QUIET_BASIS = "No signal captured for this dimension from this intake.";

// ---------------------------------------------------------------------------
// SECTION C — The adapter
// ---------------------------------------------------------------------------

// Build the per-class set of six cash dimensions + cashGenerated.
function buildDimensions(
  intake: CashSignalIntake,
  klass: CashSignalOutcomeClass,
): Pick<
  BuildAgentRevenueOutcomeInput,
  | "customerProof"
  | "paymentSignal"
  | "painClarity"
  | "buyerIdentifiability"
  | "offerTestability"
  | "cashProximity"
  | "cashGenerated"
> {
  const ref = intake.evidenceRef;
  const refId = intake.referenceId;

  // Defaults: every dimension present, low score, no evidence (valid: <60 may
  // be empty), neutral basis. Specific classes override the dimensions they
  // actually speak to.
  const base = {
    customerProof: dim(10, QUIET_BASIS),
    paymentSignal: dim(10, QUIET_BASIS),
    painClarity: dim(10, QUIET_BASIS),
    buyerIdentifiability: dim(10, QUIET_BASIS),
    offerTestability: dim(10, QUIET_BASIS),
    cashProximity: dim(10, QUIET_BASIS),
    cashGenerated: { amountCents: 0, verified: false, evidence: [] as readonly EvidenceRef[] },
  };

  if (klass === "verified_cash") {
    // Real money. Only here does cashGenerated carry an amount, and only the
    // amount that the verified financial signal actually attached.
    const amountCents = typeof intake.amountCents === "number" && intake.amountCents > 0
      ? intake.amountCents
      : 0;
    return {
      ...base,
      paymentSignal: dim(85, `Verified ${intake.signalType} ${refId} is a confirmed payment signal.`, [ref]),
      customerProof: dim(75, `A real buyer produced verified financial proof (${refId}).`, [ref]),
      cashProximity: dim(90, `Cash has actually changed hands or been committed (${refId}).`, [ref]),
      cashGenerated: { amountCents, verified: true, evidence: [ref] },
    };
  }

  if (klass === "market_signal") {
    // Engagement, not cash. Evidence backs payment intent / customer proof,
    // never cashGenerated.
    if (intake.signalType === "meeting_booked") {
      return {
        ...base,
        customerProof: dim(50, `A real buyer engaged: ${intake.signalType} ${refId}.`, [ref]),
      };
    }
    return {
      ...base,
      paymentSignal: dim(50, `Buyer signalled purchase interest: ${intake.signalType} ${refId}.`, [ref]),
    };
  }

  // exploration — weak, low-trust. Keep it as exploratory customer proof only.
  return {
    ...base,
    customerProof: dim(25, `Weak, unproven signal worth exploring: ${intake.signalType} ${refId}.`, [ref]),
  };
}

function buildNextCashAction(
  intake: CashSignalIntake,
  klass: CashSignalOutcomeClass,
): { actionLabel: string; rationale: string } {
  if (klass === "verified_cash") {
    return {
      actionLabel: "Record the verified cash, then propose the next upsell to the same buyer",
      rationale: `Verified ${intake.signalType} ${intake.referenceId} — bank it and expand the account.`,
    };
  }
  if (klass === "market_signal") {
    return {
      actionLabel: "Convert this interest into a paid offer and ask for the sale",
      rationale: `${intake.signalType} ${intake.referenceId} shows engagement — send pricing and request a commitment.`,
    };
  }
  return {
    actionLabel: "Strengthen this weak signal with verifiable evidence before investing",
    rationale: `${intake.signalType} ${intake.referenceId} is unproven — pursue a charge or a signed LOI first.`,
  };
}

// Convert a captured cash signal into the input the AgentRevenueOutcome builder
// consumes. Deterministic and pure — every field is derived from the intake.
export function mapCashSignalToOutcomeInput(
  intake: CashSignalIntake,
): BuildAgentRevenueOutcomeInput {
  const klass = classifyCashSignalForOutcome(intake);
  const dimensions = buildDimensions(intake, klass);

  return {
    outcomeId: `outcome:${intake.signalId}`,
    agentId: intake.sourceAgentId,
    ventureId: intake.ventureId,
    taskId: `task:${intake.packetId}`,
    ...dimensions,
    evidenceSummary: intake.summary,
    nextCashAction: buildNextCashAction(intake, klass),
    createdAt: intake.capturedAt,
  };
}
