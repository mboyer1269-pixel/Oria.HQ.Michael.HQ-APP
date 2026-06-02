// src/features/ventures/agent-revenue-validation-work-queue.ts
//
// Pure helper that turns local venture workbench items into a revenue
// validation agent work queue. Read-only only: no persistence, no API, no
// CRM, no external send, no server actions, and no runtime execution.

import { buildAgentVenturePrioritizationQueue } from "./agent-venture-prioritization";
import type { AgentVentureWorkbenchItem } from "./agent-venture-workbench-data";

export type AgentRevenueValidationWorkTask = {
  role: string;
  task: string;
  expectedOutput: string;
};

export type AgentRevenueValidationWorkQueueItem = {
  rank: number;
  workbenchItemId: string;
  opportunityTitle: string;
  targetCustomer: string;
  validationChannel: string;
  durationDays: number;
  budgetCapCents: number;
  workTasks: AgentRevenueValidationWorkTask[];
  handoffSequence: string[];
  priorityReason: string;
  recommendation: string;
  profitabilityScore: number;
  nextCeoDecision: string;
  readOnly: true;
  humanOnTheLoop: true;
  approvalRequired: true;
  noExecutionAuthorized: true;
};

function formatCents(cents: number): string {
  const dollars = Math.round(cents / 100);
  return `$${dollars.toLocaleString("en-US")}`;
}

function workTasksFor(item: AgentVentureWorkbenchItem): AgentRevenueValidationWorkTask[] {
  const validationChannel = item.brief.validationPlan.validationChannel;
  const targetCustomer = item.brief.targetCustomer;
  const proposedOffer = item.brief.proposedOffer;
  const budgetCap = formatCents(item.brief.validationPlan.budgetCapCents);

  switch (item.profitabilityScore.recommendation) {
    case "prioritize_for_validation":
      return [
        {
          role: "Research Agent",
          task: `Map pains and competitors for ${targetCustomer}`,
          expectedOutput: "Pain map and competitor summary",
        },
        {
          role: "Offer Agent",
          task: `Draft the buyer-facing offer for ${proposedOffer}`,
          expectedOutput: "Offer draft",
        },
        {
          role: "Sales Agent",
          task: `Draft validation messages for ${validationChannel}`,
          expectedOutput: "Message draft",
        },
        {
          role: "Ops Agent",
          task: "Prepare delivery checklist and guardrails",
          expectedOutput: "Delivery checklist",
        },
        {
          role: "Finance Agent",
          task: `Estimate margin and budget against ${budgetCap}`,
          expectedOutput: "Margin note",
        },
      ];
    case "refine_offer":
      return [
        {
          role: "Offer Agent",
          task: `Tighten the offer for ${targetCustomer}`,
          expectedOutput: "Refined offer draft",
        },
        {
          role: "Research Agent",
          task: `Confirm the strongest pain point for ${targetCustomer}`,
          expectedOutput: "Pain refinement note",
        },
        {
          role: "Sales Agent",
          task: `Rewrite the validation message for ${validationChannel}`,
          expectedOutput: "Message variant",
        },
        {
          role: "Finance Agent",
          task: "Check price sensitivity against the current budget cap",
          expectedOutput: "Pricing note",
        },
      ];
    case "reduce_validation_cost":
      return [
        {
          role: "Research Agent",
          task: `Identify the cheapest validation signal for ${targetCustomer}`,
          expectedOutput: "Low-cost validation note",
        },
        {
          role: "Finance Agent",
          task: "Trim the validation budget and test cost assumptions",
          expectedOutput: "Budget reduction note",
        },
        {
          role: "Ops Agent",
          task: "Strip the plan down to the smallest usable delivery path",
          expectedOutput: "Minimal ops checklist",
        },
      ];
    case "gather_more_evidence":
      return [
        {
          role: "Research Agent",
          task: `Collect stronger evidence on ${targetCustomer}`,
          expectedOutput: "Evidence memo",
        },
        {
          role: "Sales Agent",
          task: `Draft a lightweight validation ask for ${validationChannel}`,
          expectedOutput: "Validation ask draft",
        },
      ];
    case "request_ceo_review":
      return [
        {
          role: "Research Agent",
          task: `Summarize the evidence and risks for ${targetCustomer}`,
          expectedOutput: "CEO review memo",
        },
        {
          role: "Finance Agent",
          task: "Summarize the margin and budget exposure",
          expectedOutput: "Financial risk note",
        },
        {
          role: "Offer Agent",
          task: "Prepare the safest possible offer shape for review",
          expectedOutput: "Offer review draft",
        },
      ];
    case "reject_for_now":
      return [
        {
          role: "Research Agent",
          task: "Record the learning and archive the current hypothesis",
          expectedOutput: "Learning note",
        },
      ];
  }
}

function handoffSequenceFor(workTasks: AgentRevenueValidationWorkTask[]): string[] {
  return workTasks.map((task) => task.role);
}

export function buildAgentRevenueValidationWorkQueue(
  items: AgentVentureWorkbenchItem[],
): AgentRevenueValidationWorkQueueItem[] {
  const prioritized = buildAgentVenturePrioritizationQueue(items);
  const itemsById = new Map(items.map((item) => [item.id, item] as const));

  return prioritized
    .map((entry): AgentRevenueValidationWorkQueueItem | null => {
      const item = itemsById.get(entry.workbenchItemId);
      if (!item) return null;

      const workTasks = workTasksFor(item);

      return {
        rank: entry.rank,
        workbenchItemId: item.id,
        opportunityTitle: item.brief.title,
        targetCustomer: item.brief.targetCustomer,
        validationChannel: item.brief.validationPlan.validationChannel,
        durationDays: item.brief.validationPlan.validationWindowDays,
        budgetCapCents: item.brief.validationPlan.budgetCapCents,
        workTasks,
        handoffSequence: handoffSequenceFor(workTasks),
        priorityReason: `${entry.whyRankedThere} Assigned roles: ${workTasks.map((task) => task.role).join(", ")}.`,
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
      (entry): entry is AgentRevenueValidationWorkQueueItem => entry !== null,
    );
}
