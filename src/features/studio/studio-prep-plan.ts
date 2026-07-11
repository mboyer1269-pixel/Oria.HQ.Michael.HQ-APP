// src/features/studio/studio-prep-plan.ts
//
// Pure planner for one Studio (marketing) campaign prep tick. Mirrors
// hermes-prep-plan: NEW / REFRESH / DEDUPE, then prioritize. Never publishes.

import type {
  StudioCampaignPacket,
  StudioCampaignPriority,
  StudioPreparedCampaign,
} from "./studio-campaign-packet";
import {
  buildStudioPreparedCampaign,
  computeStudioCampaignContentHash,
} from "./studio-campaign-packet";

export type StudioPrepCandidate = {
  packet: StudioCampaignPacket;
  priority?: StudioCampaignPriority;
};

export type StudioPrepPlanInput = {
  candidates: readonly StudioPrepCandidate[];
  existing: readonly StudioPreparedCampaign[];
  createdAt: string;
};

export type StudioPrepEntryKind = "new" | "refresh";

export type StudioPrepEntry = {
  campaign: StudioPreparedCampaign;
  kind: StudioPrepEntryKind;
  supersedesId?: string;
};

export type StudioPrepPlanSummary = {
  candidates: number;
  enqueued: number;
  created: number;
  refreshed: number;
  deduped: number;
};

export type StudioPrepPlanResult = {
  toEnqueue: StudioPrepEntry[];
  summary: StudioPrepPlanSummary;
};

const INACTIVE_STATUSES: ReadonlySet<string> = new Set(["superseded", "rejected"]);

export function isActiveStudioCampaign(campaign: StudioPreparedCampaign): boolean {
  return !INACTIVE_STATUSES.has(campaign.status);
}

function contentSignature(packet: StudioCampaignPacket): string {
  return JSON.stringify({
    theme: packet.theme,
    audience: packet.audience,
    channel: packet.channel,
    draftCopy: packet.draftCopy,
    callToAction: packet.callToAction,
    rationale: packet.rationale,
  });
}

function priorityScoreFor(priority: StudioCampaignPriority): number {
  switch (priority) {
    case "critical":
      return 100;
    case "high":
      return 75;
    case "medium":
      return 50;
    case "low":
      return 25;
    default:
      return 50;
  }
}

function dedupKey(packet: StudioCampaignPacket): string {
  return computeStudioCampaignContentHash(
    packet.ventureId,
    packet.theme,
    packet.audience,
    packet.channel,
  );
}

/**
 * Decide what to enqueue from Studio campaign candidates. Pure + deterministic.
 */
export function computeStudioPrepPlan(input: StudioPrepPlanInput): StudioPrepPlanResult {
  const active = input.existing.filter(isActiveStudioCampaign);
  const byHash = new Map<string, StudioPreparedCampaign>();
  for (const campaign of active) {
    byHash.set(campaign.contentHash, campaign);
  }

  const toEnqueue: StudioPrepEntry[] = [];
  let created = 0;
  let refreshed = 0;
  let deduped = 0;

  for (const candidate of input.candidates) {
    const packet = candidate.packet;
    const hash = dedupKey(packet);
    const priority = candidate.priority ?? "medium";
    const existing = byHash.get(hash);

    if (existing) {
      // Active index already excludes rejected/superseded.
      const same = contentSignature(existing.packet) === contentSignature(packet);
      if (same) {
        deduped += 1;
        continue;
      }
      const campaign = buildStudioPreparedCampaign({
        preparedCampaignId: `scamp_${hash}_${input.createdAt.replace(/[:.]/g, "")}`,
        ventureId: packet.ventureId,
        packetId: packet.packetId,
        supersedesId: existing.preparedCampaignId,
        packet,
        priority,
        priorityScore: priorityScoreFor(priority),
        status: "ready_for_ceo_review",
        createdAt: input.createdAt,
      });
      toEnqueue.push({
        campaign,
        kind: "refresh",
        supersedesId: existing.preparedCampaignId,
      });
      refreshed += 1;
      byHash.set(hash, campaign);
      continue;
    }

    const campaign = buildStudioPreparedCampaign({
      preparedCampaignId: `scamp_${hash}_${input.createdAt.replace(/[:.]/g, "")}`,
      ventureId: packet.ventureId,
      packetId: packet.packetId,
      packet,
      priority,
      priorityScore: priorityScoreFor(priority),
      status: "ready_for_ceo_review",
      createdAt: input.createdAt,
    });
    toEnqueue.push({ campaign, kind: "new" });
    created += 1;
    byHash.set(hash, campaign);
  }

  toEnqueue.sort((a, b) => {
    if (b.campaign.priorityScore !== a.campaign.priorityScore) {
      return b.campaign.priorityScore - a.campaign.priorityScore;
    }
    return a.campaign.preparedCampaignId.localeCompare(b.campaign.preparedCampaignId);
  });

  return {
    toEnqueue,
    summary: {
      candidates: input.candidates.length,
      enqueued: toEnqueue.length,
      created,
      refreshed,
      deduped,
    },
  };
}
