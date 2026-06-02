// src/features/ventures/agent-venture-offer.ts
//
// Pure helper that turns a local venture workbench item into a structured
// offer draft. Read-only only: no persistence, no API, no Supabase, no server
// actions, no runtime execution, no sending, and no spending.

import type { AgentVentureProfitabilityRecommendation } from "./agent-venture-profitability";
import type { AgentVentureWorkbenchItem } from "./agent-venture-workbench-data";

export type AgentVentureOfferDraft = {
  workbenchItemId: string;
  opportunityTitle: string;
  agentId: string;
  targetCustomer: string;
  customerPain: string;
  offerPromise: string;
  packageLabel: string;
  packageDeliverables: string[];
  priceHypothesisCents: number;
  priceHypothesisLabel: string;
  mainObjection: string;
  riskReduction: string;
  reasonToBuyNow: string;
  nextValidationStep: string;
  recommendation: AgentVentureProfitabilityRecommendation;
  profitabilityScore: number;
  riskLevel: AgentVentureWorkbenchItem["brief"]["risk"]["riskLevel"];
  validationCostCents: number;
  speedToFirstDollarDays: number;
  blockerCount: number;
  readOnly: true;
  humanOnTheLoop: true;
  approvalRequired: true;
  noExecutionAuthorized: true;
};

function formatPriceLabel(cents: number): string {
  const dollars = Math.round(cents / 100);
  return `$${dollars.toLocaleString("en-US")}/mo`;
}

function priceHypothesisCentsFor(item: AgentVentureWorkbenchItem): number {
  const revenue = item.brief.estimatedRevenuePotentialCents;

  if (revenue >= 100_000_000) return 49_000;
  if (revenue >= 50_000_000) return 29_000;
  if (revenue >= 20_000_000) return 15_000;
  if (revenue >= 10_000_000) return 9_900;
  if (revenue >= 5_000_000) return 4_900;
  if (revenue >= 1_000_000) return 1_900;
  return 990;
}

function packageLabelFor(
  recommendation: AgentVentureProfitabilityRecommendation,
): string {
  switch (recommendation) {
    case "prioritize_for_validation":
      return "Limited pilot package";
    case "refine_offer":
      return "Refined client package";
    case "reduce_validation_cost":
      return "Concierge pilot package";
    case "gather_more_evidence":
      return "Discovery-only package";
    case "request_ceo_review":
      return "CEO review package";
    case "reject_for_now":
      return "No-go offer draft";
  }
}

function packageDeliverablesFor(
  recommendation: AgentVentureProfitabilityRecommendation,
): string[] {
  switch (recommendation) {
    case "prioritize_for_validation":
      return [
        "Offer one-pager",
        "Pilot onboarding checklist",
        "Success metric sheet",
      ];
    case "refine_offer":
      return [
        "Offer one-pager",
        "Scope and exclusions",
        "Objection handling notes",
      ];
    case "reduce_validation_cost":
      return [
        "Low-cost pilot script",
        "Fast validation checklist",
        "Budget cap note",
      ];
    case "gather_more_evidence":
      return [
        "Discovery questions",
        "Signal logging sheet",
        "Competitor gap notes",
      ];
    case "request_ceo_review":
      return [
        "CEO summary memo",
        "Risk summary",
        "Decision options",
      ];
    case "reject_for_now":
      return [
        "Learning memo",
        "Retire for now",
        "Revisit triggers",
      ];
  }
}

function mainObjectionFor(item: AgentVentureWorkbenchItem): string {
  switch (item.brief.risk.riskLevel) {
    case "critical":
      return "The risk profile is still too high for a direct buyer claim.";
    case "high":
      return "The buyer will ask why this is trustworthy enough to test now.";
    case "medium":
      return "The buyer will ask why this offer is better than the current workaround.";
    case "low":
      return "The buyer will ask what proof exists before committing.";
  }
}

function riskReductionFor(
  recommendation: AgentVentureProfitabilityRecommendation,
): string {
  switch (recommendation) {
    case "prioritize_for_validation":
      return "Tight pilot, explicit success metric, and short feedback loop.";
    case "refine_offer":
      return "Tighter scope, clearer exclusions, and a simpler promise.";
    case "reduce_validation_cost":
      return "Smaller test, lower budget cap, and fewer moving parts.";
    case "gather_more_evidence":
      return "Collect more proof before pricing or packaging.";
    case "request_ceo_review":
      return "CEO judgment required before any buyer-facing claim.";
    case "reject_for_now":
      return "Hold this draft; the signal is too weak to sell now.";
  }
}

function reasonToBuyNowFor(item: AgentVentureWorkbenchItem): string {
  const recommendation = item.profitabilityScore.recommendation;

  switch (recommendation) {
    case "prioritize_for_validation":
      return "Fast first-dollar path, clear problem, and bounded pilot make this worth testing now.";
    case "refine_offer":
      return "The opportunity is close; a tighter promise should reduce buyer friction.";
    case "reduce_validation_cost":
      return "The smallest test now preserves learning while protecting budget.";
    case "gather_more_evidence":
      return "No buy-now claim yet; gather stronger evidence before the offer is sharpened.";
    case "request_ceo_review":
      return "There is upside here, but the risk profile requires CEO judgment first.";
    case "reject_for_now":
      return "Not ready to sell now; keep as a learning note instead of a buyer claim.";
  }
}

function offerPromiseFor(item: AgentVentureWorkbenchItem): string {
  return `Help ${item.brief.targetCustomer} solve ${item.brief.problem} with ${item.brief.proposedOffer}.`;
}

export function buildAgentVentureOfferDraft(
  item: AgentVentureWorkbenchItem,
): AgentVentureOfferDraft {
  const recommendation = item.profitabilityScore.recommendation;
  const priceHypothesisCents = priceHypothesisCentsFor(item);

  return {
    workbenchItemId: item.id,
    opportunityTitle: item.brief.title,
    agentId: item.brief.agentId,
    targetCustomer: item.brief.targetCustomer,
    customerPain: item.brief.problem,
    offerPromise: offerPromiseFor(item),
    packageLabel: packageLabelFor(recommendation),
    packageDeliverables: packageDeliverablesFor(recommendation),
    priceHypothesisCents,
    priceHypothesisLabel: formatPriceLabel(priceHypothesisCents),
    mainObjection: mainObjectionFor(item),
    riskReduction: riskReductionFor(recommendation),
    reasonToBuyNow: reasonToBuyNowFor(item),
    nextValidationStep: item.brief.validationPlan.firstValidationStep,
    recommendation,
    profitabilityScore: item.profitabilityScore.profitabilityScore,
    riskLevel: item.brief.risk.riskLevel,
    validationCostCents: item.brief.estimatedValidationCostCents,
    speedToFirstDollarDays: item.brief.speedToFirstDollarDays,
    blockerCount: item.profitabilityScore.blockerCount,
    readOnly: true,
    humanOnTheLoop: true,
    approvalRequired: true,
    noExecutionAuthorized: true,
  };
}

export function buildAgentVentureOfferDrafts(
  items: AgentVentureWorkbenchItem[],
): AgentVentureOfferDraft[] {
  return items.map((item) => buildAgentVentureOfferDraft(item));
}
