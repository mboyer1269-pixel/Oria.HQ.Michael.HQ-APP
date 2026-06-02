// src/features/ventures/cash-action-review.ts
//
// Pure view-model for the Cash Action Review screen — the human-in-the-loop
// seam where the agent has prepared a cash move, Michael acts on it by hand,
// and the system captures the proof. This module holds the testable logic so
// the React screen can stay a thin rendering layer.
//
// It does NOT execute, send, spend, persist, or touch a database. It only
// classifies a locally-captured CashSignalIntake by running the existing
// adapter + AgentRevenueOutcome builder, and reports — in plain terms —
// whether the captured signal became REAL CASH, a market signal, or
// exploration. Accounting stays strict: only verified financial proof reads
// as real cash.
//
// Pure/local: reuses the cash-signal adapter, the AgentRevenueOutcome builder,
// and the EvidenceRef trust classifier. No new model, no new score.

import { buildAgentRevenueOutcome } from "./agent-revenue-outcome";
import type { CashSignalIntake } from "./cash-signal-intake";
import {
  classifyCashSignalForOutcome,
  mapCashSignalToOutcomeInput,
} from "./cash-signal-outcome-adapter";
import type { CashSignalOutcomeClass } from "./cash-signal-outcome-adapter";
import type { EvidenceTrustLevel } from "./evidence-ref";
import { classifyEvidenceTrust } from "./evidence-ref";

// ---------------------------------------------------------------------------
// SECTION A — Decision state (local only)
// ---------------------------------------------------------------------------

// Michael's manual decision on a prepared packet. "Approved for manual action"
// means he will perform the real outreach himself — the system never sends.
export type CashActionDecision =
  | "pending"
  | "approved_for_manual_action"
  | "rejected_needs_refinement";

export const CASH_ACTION_DECISIONS: readonly CashActionDecision[] = [
  "pending",
  "approved_for_manual_action",
  "rejected_needs_refinement",
];

// ---------------------------------------------------------------------------
// SECTION B — Captured-signal summary
// ---------------------------------------------------------------------------

export type CapturedSignalSummary = {
  classification: CashSignalOutcomeClass;
  becameRealCash: boolean;
  cashAmountCents: number;
  trustLevel: EvidenceTrustLevel;
  headline: string;
};

function formatCents(cents: number): string {
  const dollars = Math.round(cents / 100);
  return `$${dollars.toLocaleString("en-US")}`;
}

// Run a captured intake through the real loop and report, in plain terms, what
// it unlocked. This is the moment the proof is read: only a verified financial
// signal reads as real cash; everything else is honestly labelled.
export function summarizeCapturedSignal(intake: CashSignalIntake): CapturedSignalSummary {
  const classification = classifyCashSignalForOutcome(intake);
  const outcome = buildAgentRevenueOutcome(mapCashSignalToOutcomeInput(intake));
  const cashAmountCents = outcome.cashGenerated.amountCents;
  const becameRealCash = cashAmountCents > 0 && outcome.cashGenerated.verified === true;
  const trustLevel = classifyEvidenceTrust(intake.evidenceRef);

  let headline: string;
  if (classification === "verified_cash") {
    headline = becameRealCash
      ? `Verified cash captured — ${formatCents(cashAmountCents)} backed by a verified ${intake.evidenceRef.kind}.`
      : `Verified financial proof captured (${intake.evidenceRef.kind}) — no amount attached yet.`;
  } else if (classification === "market_signal") {
    headline = "Market signal logged — real buyer interest, not cash yet.";
  } else {
    headline = "Exploration logged — weak signal, keep validating before investing.";
  }

  return { classification, becameRealCash, cashAmountCents, trustLevel, headline };
}
