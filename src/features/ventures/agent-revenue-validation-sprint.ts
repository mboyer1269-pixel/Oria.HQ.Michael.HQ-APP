// src/features/ventures/agent-revenue-validation-sprint.ts
//
// Pure helper that turns local venture workbench items into a revenue
// validation sprint plan. Read-only only: no persistence, no API, no CRM,
// no server actions, and no runtime execution.

import { buildAgentVenturePrioritizationQueue } from "./agent-venture-prioritization";
import type { AgentVentureWorkbenchItem } from "./agent-venture-workbench-data";

export type AgentRevenueValidationSprintPlan = {
  rank: number;
  workbenchItemId: string;
  opportunityTitle: string;
  targetCustomer: string;
  hypothesis: string;
  discoveryChannel: string;
  scriptDraft: string;
  landingCopyDraft: string;
  pricingTest: string;
  successMetric: string;
  killCriteria: string[];
  durationDays: number;
  budgetCapCents: number;
  assignedRoles: string[];
  sprintTasks: string[];
  priorityReason: string;
  recommendation: string;
  profitabilityScore: number;
  nextCeoDecision: string;
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

function assignedRolesFor(recommendation: string): string[] {
  switch (recommendation) {
    case "prioritize_for_validation":
      return ["Research Agent", "Offer Agent", "Validation Agent", "Ops Agent"];
    case "refine_offer":
      return ["Offer Agent", "Research Agent", "CEO"];
    case "reduce_validation_cost":
      return ["Research Agent", "Finance Agent", "Validation Agent"];
    case "gather_more_evidence":
      return ["Research Agent", "Validation Agent"];
    case "request_ceo_review":
      return ["CEO", "Research Agent"];
    case "reject_for_now":
      return ["Research Agent"];
    default:
      return ["Research Agent"];
  }
}

function sprintTasksFor(item: AgentVentureWorkbenchItem): string[] {
  return [
    `Confirm ${item.brief.targetCustomer} pain and current workaround`,
    "Draft the buyer-facing landing copy and validation script",
    "Run the first pricing and willingness-to-pay test",
    "Review kill criteria before any future execution path",
  ];
}

function scriptDraftFor(item: AgentVentureWorkbenchItem): string {
  return `Ask how ${item.brief.targetCustomer} solves ${item.brief.problem.toLowerCase()} today, what it costs them, and whether a pilot at ${formatPriceLabel(priceHypothesisCentsFor(item))} would be worth testing.`;
}

function landingCopyDraftFor(item: AgentVentureWorkbenchItem): string {
  return `Help ${item.brief.targetCustomer} reduce ${item.brief.problem} with ${item.brief.proposedOffer}.`;
}

function pricingTestFor(item: AgentVentureWorkbenchItem): string {
  return `Test a paid pilot at ${formatPriceLabel(priceHypothesisCentsFor(item))} to validate willingness to pay.`;
}

function assignedRolesLabelFor(recommendation: string): string {
  switch (recommendation) {
    case "prioritize_for_validation":
      return "Ready to validate quickly";
    case "refine_offer":
      return "Offer needs tightening first";
    case "reduce_validation_cost":
      return "Validation cost should be trimmed";
    case "gather_more_evidence":
      return "Evidence needs to grow first";
    case "request_ceo_review":
      return "CEO review required before validation";
    case "reject_for_now":
      return "Not ready for a validation sprint";
    default:
      return "Validation sprint draft";
  }
}

export function buildAgentRevenueValidationSprintPlans(
  items: AgentVentureWorkbenchItem[],
): AgentRevenueValidationSprintPlan[] {
  const prioritized = buildAgentVenturePrioritizationQueue(items);
  const itemsById = new Map(items.map((item) => [item.id, item] as const));

  return prioritized
    .map((entry): AgentRevenueValidationSprintPlan | null => {
      const item = itemsById.get(entry.workbenchItemId);
      if (!item) return null;

      return {
        rank: entry.rank,
        workbenchItemId: item.id,
        opportunityTitle: item.brief.title,
        targetCustomer: item.brief.targetCustomer,
        hypothesis: item.brief.validationPlan.hypothesis,
        discoveryChannel: item.brief.validationPlan.validationChannel,
        scriptDraft: scriptDraftFor(item),
        landingCopyDraft: landingCopyDraftFor(item),
        pricingTest: pricingTestFor(item),
        successMetric: item.brief.validationPlan.successMetric,
        killCriteria: item.brief.killCriteria.map(
          (criterion) => `${criterion.metric}: ${criterion.threshold} — ${criterion.reason}`,
        ),
        durationDays: item.brief.validationPlan.validationWindowDays,
        budgetCapCents: item.brief.validationPlan.budgetCapCents,
        assignedRoles: assignedRolesFor(entry.recommendation),
        sprintTasks: sprintTasksFor(item),
        priorityReason: `${entry.whyRankedThere} ${assignedRolesLabelFor(entry.recommendation)}.`,
        recommendation: entry.recommendation,
        profitabilityScore: entry.profitabilityScore,
        nextCeoDecision: entry.nextCeoDecision,
        readOnly: true,
        humanOnTheLoop: true,
        approvalRequired: true,
        noExecutionAuthorized: true,
      };
    })
    .filter(
      (entry): entry is AgentRevenueValidationSprintPlan => entry !== null,
    );
}
