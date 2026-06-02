"use client";

import { useState } from "react";
import {
  AGENT_VENTURE_WORKBENCH_ITEMS,
  type AgentVentureWorkbenchItem,
} from "../agent-venture-workbench-data";
import { buildAgentRevenueValidationWorkQueue } from "../agent-revenue-validation-work-queue";
import { buildAgentVenturePrioritizationQueue } from "../agent-venture-prioritization";
import { AgentVentureWorkbench } from "./agent-venture-workbench";
import { AgentOpportunityBriefForm } from "./agent-opportunity-brief-form";
import { VentureRevenueValidationWorkQueuePanel } from "./venture-revenue-validation-work-queue-panel";
import { VenturePrioritizationQueuePanel } from "./venture-prioritization-queue-panel";

export function AgentVentureWorkbenchWithForm() {
  const [draftItem, setDraftItem] =
    useState<AgentVentureWorkbenchItem | null>(null);

  const items: AgentVentureWorkbenchItem[] = draftItem
    ? [draftItem, ...AGENT_VENTURE_WORKBENCH_ITEMS]
    : AGENT_VENTURE_WORKBENCH_ITEMS;
  const prioritizationQueue = buildAgentVenturePrioritizationQueue(items);
  const validationWorkQueue = buildAgentRevenueValidationWorkQueue(items);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
            Analyse a New Opportunity
          </h2>
          <p className="text-[11px] text-neutral-500">
            Local draft only — nothing is saved, sent, or executed.
          </p>
        </div>
        <AgentOpportunityBriefForm onBriefChange={setDraftItem} />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
            Revenue Priority Queue
          </h2>
          <p className="text-[11px] text-neutral-500">
            Ranked locally from the current workbench items against the revenue operating loop.
            Read-only. No execution authorized.
          </p>
        </div>
        <VenturePrioritizationQueuePanel items={prioritizationQueue} />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
            Revenue Validation Agent Work Queue
          </h2>
          <p className="text-[11px] text-neutral-500">
            Draft tasks for Research, Offer, Sales, Ops, and Finance agents. Read-only. No
            execution authorized.
          </p>
        </div>
        <VentureRevenueValidationWorkQueuePanel items={validationWorkQueue} />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
            Agent Venture Workbench
          </h2>
          <p className="text-[11px] text-neutral-500">
            {draftItem
              ? "Live draft (first card) + example workbenches. Read-only. No execution authorized."
              : "Prepared by agents for CEO review. Read-only. No execution authorized."}
          </p>
        </div>
        <AgentVentureWorkbench items={items} />
      </div>
    </div>
  );
}
