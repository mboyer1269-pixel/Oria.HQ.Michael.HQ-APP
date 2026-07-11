// src/server/studio/studio-prep-tick.ts
//
// Server-side orchestration of one Studio (marketing) campaign prep tick.
// Mirrors hermes-prep-tick: plan + enqueue. Never publishes, spends, or sends.

import type { StudioCampaignPacket } from "@/features/studio/studio-campaign-packet";
import type { StudioPrepPlanResult } from "@/features/studio/studio-prep-plan";
import { computeStudioPrepPlan } from "@/features/studio/studio-prep-plan";
import type { StudioPreparedCampaign } from "@/features/studio/studio-campaign-packet";
import {
  enqueueStudioPreparedCampaign,
  listStudioPreparedCampaigns,
} from "./studio-campaign-store";

export type StudioPrepTickDeps = {
  listExisting: (workspaceId: string) => Promise<StudioPreparedCampaign[]> | StudioPreparedCampaign[];
  enqueue: (
    workspaceId: string,
    campaign: StudioPreparedCampaign,
  ) => Promise<StudioPreparedCampaign> | StudioPreparedCampaign;
  now: () => string;
};

function resolveDeps(overrides?: Partial<StudioPrepTickDeps>): StudioPrepTickDeps {
  return {
    listExisting: overrides?.listExisting ?? listStudioPreparedCampaigns,
    enqueue: overrides?.enqueue ?? enqueueStudioPreparedCampaign,
    now: overrides?.now ?? (() => new Date().toISOString()),
  };
}

export type StudioPrepTickInput = {
  workspaceId: string;
  userId: string;
  packets: readonly StudioCampaignPacket[];
};

export type StudioPrepTickResult = {
  plan: StudioPrepPlanResult;
  enqueued: StudioPreparedCampaign[];
  createdAt: string;
  /** Literal governance reminder for API consumers. */
  publishAuthorized: false;
};

/**
 * Runs one Studio prep tick: plan + in-memory enqueue for CEO review.
 * Never publishes or executes anything. Queue is process-local (not durable).
 */
export async function runStudioPrepTick(
  input: StudioPrepTickInput,
  overrides?: Partial<StudioPrepTickDeps>,
): Promise<StudioPrepTickResult> {
  const deps = resolveDeps(overrides);
  const createdAt = deps.now();
  const existing = await deps.listExisting(input.workspaceId);

  const plan = computeStudioPrepPlan({
    candidates: input.packets.map((packet) => ({ packet })),
    existing,
    createdAt,
  });

  const enqueued: StudioPreparedCampaign[] = [];
  for (const entry of plan.toEnqueue) {
    enqueued.push(await deps.enqueue(input.workspaceId, entry.campaign));
  }

  // userId is accepted for future ledger attribution; Yellow 3 does not persist it.
  void input.userId;

  return { plan, enqueued, createdAt, publishAuthorized: false };
}

/** Seed packets for a heartbeat when the caller has no drafts yet. */
export function buildDefaultStudioHeartbeatPackets(nowIso: string): StudioCampaignPacket[] {
  return [
    {
      packetId: `pkt_studio_visibility_${nowIso.slice(0, 10)}`,
      ventureId: "venture-default",
      theme: "Operator cockpit visibility",
      audience: "Independent operators building AI-assisted workflows",
      channel: "linkedin_post",
      draftCopy:
        "Oria HQ keeps prepare and publish apart: agents draft, the CEO sends. " +
        "That boundary is the product — not a missing feature.",
      callToAction: "Review the prepared campaign in HQ Studio queue",
      rationale: "Heartbeat: keep a review-ready visibility draft in the queue",
      createdAt: nowIso,
    },
    {
      packetId: `pkt_studio_marketplace_${nowIso.slice(0, 10)}`,
      ventureId: "venture-default",
      theme: "Marketplace browse without auto-spend",
      audience: "Founders evaluating tool corridors",
      channel: "email_nurture",
      draftCopy:
        "Browse tools. Approve enablement. Publish only when you mean it. " +
        "Studio prepares campaign packets; spend stays human-gated.",
      callToAction: "Open Autonomy Readiness → marketplace corridor",
      rationale: "Heartbeat: reinforce review-first marketplace posture",
      createdAt: nowIso,
    },
  ];
}
