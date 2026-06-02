"use client";

import { useState } from "react";
import {
  AGENT_VENTURE_WORKBENCH_ITEMS,
  type AgentVentureWorkbenchItem,
} from "../agent-venture-workbench-data";
import { buildAgentVentureDiscoveryTargetList } from "../agent-customer-discovery-target-list";
import { buildAgentVenturePrioritizationQueue } from "../agent-venture-prioritization";
import { AgentVentureWorkbench } from "./agent-venture-workbench";
import { AgentOpportunityBriefForm } from "./agent-opportunity-brief-form";
import { VentureCustomerDiscoveryPanel } from "./venture-customer-discovery-panel";
import { VenturePrioritizationQueuePanel } from "./venture-prioritization-queue-panel";

export function AgentVentureWorkbenchWithForm() {
  const [draftItem, setDraftItem] =
    useState<AgentVentureWorkbenchItem | null>(null);

  const items: AgentVentureWorkbenchItem[] = draftItem
    ? [draftItem, ...AGENT_VENTURE_WORKBENCH_ITEMS]
    : AGENT_VENTURE_WORKBENCH_ITEMS;
  const prioritizationQueue = buildAgentVenturePrioritizationQueue(items);
  const discoveryTargets = buildAgentVentureDiscoveryTargetList(items);

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
            Customer Discovery Target List
          </h2>
          <p className="text-[11px] text-neutral-500">
            Ranked local segments, personas, and questions for discovery. Read-only. No contact or
            CRM writes.
          </p>
        </div>
        <VentureCustomerDiscoveryPanel items={discoveryTargets} />
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
