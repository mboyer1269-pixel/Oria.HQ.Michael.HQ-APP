// src/server/studio/studio-campaign-store.ts
//
// In-memory prepared-campaign queue for Studio prep ticks (dev / local
// fallback). Never publishes. Not durable across restarts or multi-instance —
// production persistence is a future mandate.

import {
  REVIEWABLE_STUDIO_CAMPAIGN_STATUSES,
  type StudioPreparedCampaign,
} from "@/features/studio/studio-campaign-packet";

const store = new Map<string, StudioPreparedCampaign[]>();

/** All rows for a workspace (including superseded / rejected). */
export function listStudioPreparedCampaigns(workspaceId: string): StudioPreparedCampaign[] {
  return [...(store.get(workspaceId) ?? [])];
}

/** CEO review queue only — prepared / ready_for_ceo_review. */
export function listReviewableStudioCampaigns(workspaceId: string): StudioPreparedCampaign[] {
  return listStudioPreparedCampaigns(workspaceId).filter((campaign) =>
    REVIEWABLE_STUDIO_CAMPAIGN_STATUSES.has(campaign.status),
  );
}

export function enqueueStudioPreparedCampaign(
  workspaceId: string,
  campaign: StudioPreparedCampaign,
): StudioPreparedCampaign {
  const existing = store.get(workspaceId) ?? [];
  // Mark superseded rows when a refresh arrives.
  const next = existing.map((row) => {
    if (
      campaign.supersedesId &&
      row.preparedCampaignId === campaign.supersedesId &&
      row.status !== "superseded"
    ) {
      return { ...row, status: "superseded" as const };
    }
    return row;
  });
  next.push(campaign);
  store.set(workspaceId, next);
  return campaign;
}

/** Test helper — clear all workspaces. */
export function clearStudioCampaignStore(): void {
  store.clear();
}
