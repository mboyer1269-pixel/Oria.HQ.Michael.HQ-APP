// src/features/ventures/cash-action-packet-generator.ts
//
// The PRODUCER that lets an agent act like an operator: it turns a real
// venture (a workbench item, via its already-derived offer draft) into a
// concrete, proposal-only CashActionPacket Michael can approve and run by
// hand. This is what makes the vertical cash loop start from real data
// instead of hand-built fixtures.
//
// It COMPOSES existing pure helpers — it does not re-derive offers, pricing,
// or recommendations:
//   AgentVentureWorkbenchItem --(agent-venture-offer)--> AgentVentureOfferDraft
//                              --(this module)----------> CashActionPacket
//
// Determinism: this module reads no clock and no randomness. The caller
// supplies createdAt (an ISO string), so the same item + same createdAt always
// yields the same packet — safe for tests, snapshots, and reproducible runs.
//
// Pure/local: no Supabase, DB, API, runtime, server, or UI. It never executes,
// never contacts a customer, never sends, never spends. The produced packet is
// governance-locked (requiresCeoApproval / noExecutionAuthorized = true).

import type { AgentVentureProfitabilityRecommendation } from "./agent-venture-profitability";
import type { AgentVentureOfferDraft } from "./agent-venture-offer";
import { buildAgentVentureOfferDraft } from "./agent-venture-offer";
import type { AgentVentureWorkbenchItem } from "./agent-venture-workbench-data";
import type { CashActionBuyerType, CashActionPacket, CashSignalType } from "./cash-action-packet";
import { buildCashActionPacket } from "./cash-action-packet";
import type { EvidenceKind } from "./evidence-ref";

// ---------------------------------------------------------------------------
// SECTION A — Recommendation → cash-action shape
// ---------------------------------------------------------------------------

// What signal each recommendation is honestly aiming for. Stronger
// recommendations aim at real financial proof; softer ones aim at engagement
// or exploration. This mirrors the cash-signal taxonomy so the produced packet
// lines up with what the intake layer can later capture.
function expectedCashSignalFor(
  recommendation: AgentVentureProfitabilityRecommendation,
): CashSignalType {
  switch (recommendation) {
    case "prioritize_for_validation":
      return "signed_loi";
    case "refine_offer":
      return "signed_loi";
    case "reduce_validation_cost":
      return "meeting_booked";
    case "gather_more_evidence":
      return "email_reply";
    case "request_ceo_review":
      return "meeting_booked";
    case "reject_for_now":
      return "manual_note";
  }
}

// What evidence would make the expected signal real. Cash-aiming actions
// require financial proof; softer actions require their own lighter evidence.
function requiredEvidenceFor(
  recommendation: AgentVentureProfitabilityRecommendation,
): EvidenceKind[] {
  switch (recommendation) {
    case "prioritize_for_validation":
    case "refine_offer":
      return ["signed_loi", "stripe_charge"];
    case "reduce_validation_cost":
    case "request_ceo_review":
      return ["analytics_event"];
    case "gather_more_evidence":
      return ["email_reply"];
    case "reject_for_now":
      return ["manual_note"];
  }
}

// The concrete next move Michael would perform himself.
function callToActionFor(
  recommendation: AgentVentureProfitabilityRecommendation,
): string {
  switch (recommendation) {
    case "prioritize_for_validation":
      return "Offer a paid 2-week pilot and ask them to sign a short LOI to start.";
    case "refine_offer":
      return "Send the refined one-pager and ask for a signed pilot LOI.";
    case "reduce_validation_cost":
      return "Book a 20-minute concierge call to test willingness to pay.";
    case "gather_more_evidence":
      return "Ask three discovery questions by email to confirm the pain and budget.";
    case "request_ceo_review":
      return "Book an internal CEO review before any buyer-facing claim.";
    case "reject_for_now":
      return "Do not pitch yet — log a learning note and set a revisit trigger.";
  }
}

// ---------------------------------------------------------------------------
// SECTION B — Buyer type inference (deterministic keyword map)
// ---------------------------------------------------------------------------

export function inferBuyerType(targetCustomer: string): CashActionBuyerType {
  const c = targetCustomer.toLowerCase();
  if (/(enterprise|fortune|large account|global)/.test(c)) return "enterprise";
  if (/(mid-market|mid market|midmarket|scale-?up)/.test(c)) return "mid_market";
  if (/(marketplace|platform|two-sided)/.test(c)) return "marketplace";
  if (/(smb|small business|startup|founder|team lead|owner-operator|ops lead)/.test(c)) return "smb";
  if (/(individual|consumer|freelancer|solo|person)/.test(c)) return "individual";
  return "other";
}

// ---------------------------------------------------------------------------
// SECTION C — Outreach draft (draft only — never sent by this module)
// ---------------------------------------------------------------------------

function outreachDraftFor(offer: AgentVentureOfferDraft, callToAction: string): string {
  return [
    `Hi {name}, I work with ${offer.targetCustomer} on ${offer.customerPain}.`,
    offer.offerPromise,
    offer.reasonToBuyNow,
    callToAction,
  ].join(" ");
}

// ---------------------------------------------------------------------------
// SECTION D — Generator
// ---------------------------------------------------------------------------

export type BuildCashActionPacketFromOfferOptions = {
  // ISO date string — supplied by the caller so this module reads no clock.
  createdAt: string;
  // Defaults to the offer's workbench item id.
  ventureId?: string;
  // Defaults to `packet:${offer.workbenchItemId}`.
  packetId?: string;
};

// Map one offer draft to one concrete CashActionPacket. The expected signal,
// required evidence, and CTA are driven by the offer's recommendation, so a
// strong opportunity aims at a signed LOI / charge while a weak one aims only
// at a discovery email or a learning note.
export function buildCashActionPacketFromOffer(
  offer: AgentVentureOfferDraft,
  options: BuildCashActionPacketFromOfferOptions,
): CashActionPacket {
  const recommendation = offer.recommendation;
  const callToAction = callToActionFor(recommendation);

  return buildCashActionPacket({
    packetId: options.packetId ?? `packet:${offer.workbenchItemId}`,
    ventureId: options.ventureId ?? offer.workbenchItemId,
    agentId: offer.agentId,
    targetBuyer: offer.targetCustomer,
    buyerType: inferBuyerType(offer.targetCustomer),
    painHypothesis: offer.customerPain,
    offer: `${offer.offerPromise} (${offer.packageLabel})`,
    pricePointCents: offer.priceHypothesisCents,
    callToAction,
    outreachDraft: outreachDraftFor(offer, callToAction),
    expectedCashSignal: expectedCashSignalFor(recommendation),
    requiredEvidence: requiredEvidenceFor(recommendation),
    // Honest, un-inflated estimate: landing one paying pilot at the price
    // point. We do NOT annualize — accounting stays strict.
    expectedCashImpactCents: offer.priceHypothesisCents,
    expectedCostCents: offer.validationCostCents,
    createdAt: options.createdAt,
  });
}

// Convenience: go straight from raw workbench items to packets, composing the
// offer builder. Deterministic given a single createdAt.
export function buildCashActionPacketsFromItems(
  items: AgentVentureWorkbenchItem[],
  options: { createdAt: string },
): CashActionPacket[] {
  return items.map((item) => {
    const offer = buildAgentVentureOfferDraft(item);
    return buildCashActionPacketFromOffer(offer, { createdAt: options.createdAt });
  });
}
