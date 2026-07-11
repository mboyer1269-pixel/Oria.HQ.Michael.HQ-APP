// src/features/studio/studio-campaign-packet.ts
//
// Pure model for a Studio (agent id `marketing`) campaign packet — one unit of
// prepared marketing work queued for CEO review. Mirrors prepared-action
// governance: requiresCeoApproval, requiresManualPublish, noExecutionAuthorized
// are locked to literal true. Studio prepares; CEO publishes.
//
// No Supabase, no network, no LLM, no persistence.

export type StudioCampaignChannel =
  | "linkedin_post"
  | "x_post"
  | "email_nurture"
  | "landing_copy"
  | "ad_creative_brief";

export const STUDIO_CAMPAIGN_CHANNELS: readonly StudioCampaignChannel[] = [
  "linkedin_post",
  "x_post",
  "email_nurture",
  "landing_copy",
  "ad_creative_brief",
];

export type StudioCampaignPriority = "critical" | "high" | "medium" | "low";

export const STUDIO_CAMPAIGN_PRIORITIES: readonly StudioCampaignPriority[] = [
  "critical",
  "high",
  "medium",
  "low",
];

/**
 * Lifecycle statuses. `approved_for_manual_publish` / `rejected` are reserved
 * for a future CEO-gate transition — Yellow 3 only writes prepared /
 * ready_for_ceo_review (and marks superseded on refresh).
 */
export type StudioCampaignStatus =
  | "prepared"
  | "ready_for_ceo_review"
  | "approved_for_manual_publish"
  | "rejected"
  | "superseded";

export const STUDIO_CAMPAIGN_STATUSES: readonly StudioCampaignStatus[] = [
  "prepared",
  "ready_for_ceo_review",
  "approved_for_manual_publish",
  "rejected",
  "superseded",
];

/** Statuses still awaiting CEO review (mirrors Relay prepared-action queue). */
export const REVIEWABLE_STUDIO_CAMPAIGN_STATUSES: ReadonlySet<StudioCampaignStatus> = new Set([
  "prepared",
  "ready_for_ceo_review",
]);

export type StudioCampaignPacket = {
  packetId: string;
  ventureId: string;
  /** Campaign theme / offer hook. */
  theme: string;
  /** Audience hypothesis (who this speaks to). */
  audience: string;
  channel: StudioCampaignChannel;
  /** Draft copy — never auto-published. */
  draftCopy: string;
  /** Optional CTA the CEO may approve. */
  callToAction: string;
  /** Why Studio believes this is worth a review slot. */
  rationale: string;
  createdAt: string;
};

export type StudioPreparedCampaign = {
  preparedCampaignId: string;
  ventureId: string;
  packetId: string;
  contentHash: string;
  supersedesId?: string;
  packet: StudioCampaignPacket;
  priority: StudioCampaignPriority;
  priorityScore: number;
  status: StudioCampaignStatus;
  createdAt: string;
  /** Governance locks — always literal true. */
  requiresCeoApproval: true;
  requiresManualPublish: true;
  noExecutionAuthorized: true;
};

export type StudioCampaignValidation = {
  valid: boolean;
  errors: string[];
};

function requireText(value: unknown, field: string, errors: string[]): void {
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(`${field} must be non-empty`);
  }
}

/** Deterministic FNV-1a dedup key over theme + audience + channel. */
export function computeStudioCampaignContentHash(
  ventureId: string,
  theme: string,
  audience: string,
  channel: string,
): string {
  const key = [ventureId, theme, audience, channel].join("\u0001");
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `sc_${(h >>> 0).toString(16).padStart(8, "0")}`;
}

export function validateStudioCampaignPacket(packet: StudioCampaignPacket): StudioCampaignValidation {
  const errors: string[] = [];
  requireText(packet.packetId, "packetId", errors);
  requireText(packet.ventureId, "ventureId", errors);
  requireText(packet.theme, "theme", errors);
  requireText(packet.audience, "audience", errors);
  requireText(packet.draftCopy, "draftCopy", errors);
  requireText(packet.callToAction, "callToAction", errors);
  requireText(packet.rationale, "rationale", errors);
  if (!STUDIO_CAMPAIGN_CHANNELS.includes(packet.channel)) {
    errors.push("channel must be a known Studio campaign channel");
  }
  if (typeof packet.createdAt !== "string" || Number.isNaN(+new Date(packet.createdAt))) {
    errors.push("createdAt must be a valid ISO date string");
  }
  return { valid: errors.length === 0, errors };
}

export function validateStudioPreparedCampaign(
  campaign: StudioPreparedCampaign,
): StudioCampaignValidation {
  const errors: string[] = [];
  requireText(campaign.preparedCampaignId, "preparedCampaignId", errors);
  requireText(campaign.ventureId, "ventureId", errors);
  requireText(campaign.packetId, "packetId", errors);
  requireText(campaign.contentHash, "contentHash", errors);
  if (campaign.supersedesId !== undefined) {
    requireText(campaign.supersedesId, "supersedesId", errors);
  }
  if (!campaign.packet || typeof campaign.packet !== "object") {
    errors.push("packet must be present");
  } else {
    const r = validateStudioCampaignPacket(campaign.packet);
    for (const e of r.errors) errors.push(`packet: ${e}`);
    if (campaign.packet.packetId !== campaign.packetId) {
      errors.push("packet.packetId must match packetId");
    }
    if (campaign.packet.ventureId !== campaign.ventureId) {
      errors.push("packet.ventureId must match ventureId");
    }
  }
  if (!STUDIO_CAMPAIGN_PRIORITIES.includes(campaign.priority)) {
    errors.push("priority must be a known priority");
  }
  if (
    typeof campaign.priorityScore !== "number" ||
    !Number.isFinite(campaign.priorityScore) ||
    campaign.priorityScore < 0
  ) {
    errors.push("priorityScore must be a number >= 0");
  }
  if (!STUDIO_CAMPAIGN_STATUSES.includes(campaign.status)) {
    errors.push("status must be a known status");
  }
  if (typeof campaign.createdAt !== "string" || Number.isNaN(+new Date(campaign.createdAt))) {
    errors.push("createdAt must be a valid ISO date string");
  }
  if (campaign.requiresCeoApproval !== true) {
    errors.push("requiresCeoApproval must be true");
  }
  if (campaign.requiresManualPublish !== true) {
    errors.push("requiresManualPublish must be true");
  }
  if (campaign.noExecutionAuthorized !== true) {
    errors.push("noExecutionAuthorized must be true");
  }
  return { valid: errors.length === 0, errors };
}

export function isStudioCampaignProposalOnly(campaign: StudioPreparedCampaign): boolean {
  return (
    campaign.requiresCeoApproval === true &&
    campaign.requiresManualPublish === true &&
    campaign.noExecutionAuthorized === true
  );
}

export type BuildStudioPreparedCampaignInput = Omit<
  StudioPreparedCampaign,
  "requiresCeoApproval" | "requiresManualPublish" | "noExecutionAuthorized" | "contentHash"
>;

export function buildStudioPreparedCampaign(
  input: BuildStudioPreparedCampaignInput,
): StudioPreparedCampaign {
  const campaign: StudioPreparedCampaign = {
    preparedCampaignId: input.preparedCampaignId,
    ventureId: input.ventureId,
    packetId: input.packetId,
    contentHash: computeStudioCampaignContentHash(
      input.packet.ventureId,
      input.packet.theme,
      input.packet.audience,
      input.packet.channel,
    ),
    packet: structuredClone(input.packet),
    priority: input.priority,
    priorityScore: input.priorityScore,
    status: input.status,
    createdAt: input.createdAt,
    requiresCeoApproval: true,
    requiresManualPublish: true,
    noExecutionAuthorized: true,
  };
  if (input.supersedesId !== undefined) {
    campaign.supersedesId = input.supersedesId;
  }
  return campaign;
}
