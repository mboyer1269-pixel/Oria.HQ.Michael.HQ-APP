// Resolve follow-up lane from lead source — warm lanes only.

import type { FollowUpLane } from "@/features/sales/follow-up-draft";
import type { LeadSource } from "@/features/sales/sales-lead";

/** Marketplace inbound replies use reply_assist; other warm leads use follow_up. */
export function resolveFollowUpLane(source: LeadSource): FollowUpLane {
  if (source === "marketplace_message" || source === "marketplace_post") {
    return "reply_assist";
  }
  return "follow_up";
}
