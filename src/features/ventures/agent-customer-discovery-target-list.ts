// src/features/ventures/agent-customer-discovery-target-list.ts
//
// Pure helper that turns local venture workbench items into a customer
// discovery target list. Read-only only: no persistence, no API, no CRM,
// no scraping, no server actions, and no runtime execution.

import { buildAgentVenturePrioritizationQueue } from "./agent-venture-prioritization";
import type { AgentVentureProfitabilityRecommendation } from "./agent-venture-profitability";
import type { AgentVentureWorkbenchItem } from "./agent-venture-workbench-data";

export type AgentVentureDiscoveryTarget = {
  rank: number;
  workbenchItemId: string;
  opportunityTitle: string;
  targetCustomer: string;
  icp: string;
  persona: string;
  discoveryChannel: string;
  qualificationCriteria: string[];
  discoveryQuestions: string[];
  buyingSignals: string[];
  whyRelevant: string;
  nextDiscoveryStep: string;
  priorityReason: string;
  recommendation: AgentVentureProfitabilityRecommendation;
  profitabilityScore: number;
  riskLevel: AgentVentureWorkbenchItem["brief"]["risk"]["riskLevel"];
  blockerSeverity: string;
  nextCeoDecision: string;
  readOnly: true;
  humanOnTheLoop: true;
  approvalRequired: true;
  noExecutionAuthorized: true;
};

function personaFor(targetCustomer: string): string {
  const normalized = targetCustomer.toLowerCase();
  if (normalized.includes("founder")) return "Founder or CEO";
  if (normalized.includes("finance")) return "Finance lead";
  if (normalized.includes("ops")) return "Operations lead";
  if (normalized.includes("service")) return "Owner-operator";
  if (normalized.includes("team")) return "Team lead";
  return "Decision-maker";
}

function icpFor(item: AgentVentureWorkbenchItem): string {
  return `${item.brief.targetCustomer} with a current workaround and a clear budget owner.`;
}

function qualificationCriteriaFor(item: AgentVentureWorkbenchItem): string[] {
  return [
    `Confirms ${item.brief.problem.toLowerCase()}`,
    "Can describe the current workaround and who owns the decision",
    "Can talk about price, budget, or urgency",
  ];
}

function discoveryQuestionsFor(item: AgentVentureWorkbenchItem): string[] {
  return [
    `How do you solve ${item.brief.problem.toLowerCase()} today?`,
    "What does that cost you in time, money, or risk?",
    "What would make a pilot worth testing this month?",
  ];
}

function buyingSignalsFor(item: AgentVentureWorkbenchItem): string[] {
  return [
    `Asks about price or pilot scope for ${item.brief.targetCustomer}`,
    "Can name the current workaround without prompting",
    "Wants to try a narrow test quickly",
  ];
}

function whyRelevantFor(item: AgentVentureWorkbenchItem): string {
  return `The offer promise and validation plan both point at ${item.brief.targetCustomer} as a likely early discovery segment for ${item.brief.problem}.`;
}

export function buildAgentVentureDiscoveryTargetList(
  items: AgentVentureWorkbenchItem[],
): AgentVentureDiscoveryTarget[] {
  const prioritized = buildAgentVenturePrioritizationQueue(items);
  const itemsById = new Map(items.map((item) => [item.id, item] as const));

  return prioritized
    .map((entry): AgentVentureDiscoveryTarget | null => {
      const item = itemsById.get(entry.workbenchItemId);
      if (!item) return null;

      return {
        rank: entry.rank,
        workbenchItemId: item.id,
        opportunityTitle: item.brief.title,
        targetCustomer: item.brief.targetCustomer,
        icp: icpFor(item),
        persona: personaFor(item.brief.targetCustomer),
        discoveryChannel: item.brief.validationPlan.validationChannel,
        qualificationCriteria: qualificationCriteriaFor(item),
        discoveryQuestions: discoveryQuestionsFor(item),
        buyingSignals: buyingSignalsFor(item),
        whyRelevant: whyRelevantFor(item),
        nextDiscoveryStep: item.brief.validationPlan.firstValidationStep,
        priorityReason: entry.whyRankedThere,
        recommendation: entry.recommendation,
        profitabilityScore: entry.profitabilityScore,
        riskLevel: item.brief.risk.riskLevel,
        blockerSeverity: entry.blockerSeverity,
        nextCeoDecision: entry.nextCeoDecision,
        readOnly: true,
        humanOnTheLoop: true,
        approvalRequired: true,
        noExecutionAuthorized: true,
      };
    })
    .filter((entry): entry is AgentVentureDiscoveryTarget => entry !== null);
}
