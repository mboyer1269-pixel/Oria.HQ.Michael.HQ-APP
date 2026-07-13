// src/features/marketing/social-publication.ts
//
// Social publication contracts for the dealership publisher agent.
// Pure: types, validation, UTM links, and the auto-pilot vehicle plan.
//
// Channels — honest capability map:
//   - "facebook_page": auto-publishable via the official Meta Graph API
//     (Page access token). No cookies, no UI bot.
//   - "marketplace": Meta exposes NO public API for vehicle listings
//     (dealer feeds retired in 2023). The agent prepares everything
//     (title/copy/photos/deep link) and the human does the final click.

import type { VehicleStock } from "@/features/inventory/vehicle-stock";

export type PublicationChannel = "facebook_page" | "marketplace";

export const PUBLICATION_CHANNELS: readonly PublicationChannel[] = [
  "facebook_page",
  "marketplace",
];

export type PublicationStatus =
  | "queued"
  | "published_auto"
  | "published_manual"
  | "failed";

export const PUBLICATION_STATUSES: readonly PublicationStatus[] = [
  "queued",
  "published_auto",
  "published_manual",
  "failed",
];

/**
 * How the publication reached (or will reach) the channel:
 *   - "auto_api": posted through the official Graph API.
 *   - "assisted_manual": agent prepared everything; human clicks publish.
 *   - "simulated": dev/local mode without a Page token — full dry-run.
 */
export type PublicationMode = "auto_api" | "assisted_manual" | "simulated";

export type SocialPublication = {
  publicationId: string;
  workspaceId: string;
  stockId: string;
  /** Human label, e.g. "2026 Chevrolet Trax LT". */
  vehicleLabel: string;
  channel: PublicationChannel;
  /** Marketplace listing packet id when one was prepared for this publication. */
  packetId?: string;
  /** Post copy (caption for FB page, description base for Marketplace). */
  message: string;
  photoUrls: string[];
  /** Dealer VDP link included in the post. */
  linkUrl?: string;
  /** Same link with UTM tracking so inbound traffic is attributable. */
  utmUrl?: string;
  status: PublicationStatus;
  mode: PublicationMode;
  /** Graph API post id when published via API. */
  postId?: string;
  /** Public URL of the published post when known. */
  postUrl?: string;
  error?: string;
  /** Why the auto-pilot picked this vehicle (transparency for the operator). */
  rationale: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type PublicationValidation = {
  valid: boolean;
  errors: string[];
};

function requireText(value: unknown, field: string, errors: string[]): void {
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(`${field} must be non-empty`);
  }
}

export function validateSocialPublication(input: unknown): PublicationValidation {
  const errors: string[] = [];
  if (!input || typeof input !== "object") {
    return { valid: false, errors: ["publication must be an object"] };
  }
  const p = input as Record<string, unknown>;
  requireText(p.publicationId, "publicationId", errors);
  requireText(p.workspaceId, "workspaceId", errors);
  requireText(p.stockId, "stockId", errors);
  requireText(p.vehicleLabel, "vehicleLabel", errors);
  requireText(p.message, "message", errors);
  requireText(p.rationale, "rationale", errors);
  requireText(p.createdAt, "createdAt", errors);
  requireText(p.updatedAt, "updatedAt", errors);
  if (
    typeof p.channel !== "string" ||
    !PUBLICATION_CHANNELS.includes(p.channel as PublicationChannel)
  ) {
    errors.push(`channel must be one of: ${PUBLICATION_CHANNELS.join(", ")}`);
  }
  if (
    typeof p.status !== "string" ||
    !PUBLICATION_STATUSES.includes(p.status as PublicationStatus)
  ) {
    errors.push(`status must be one of: ${PUBLICATION_STATUSES.join(", ")}`);
  }
  if (!Array.isArray(p.photoUrls)) errors.push("photoUrls must be an array");
  return { valid: errors.length === 0, errors };
}

/** Deep link to the Marketplace vehicle-listing composer (human final click). */
export const MARKETPLACE_CREATE_VEHICLE_URL =
  "https://www.facebook.com/marketplace/create/vehicle";

/**
 * Append UTM parameters so every click from a publication is attributable
 * to the publisher agent — the base of the lead-generation loop.
 */
export function buildUtmUrl(
  listingUrl: string | undefined,
  stockId: string,
  channel: PublicationChannel,
): string | undefined {
  if (!listingUrl) return undefined;
  try {
    const url = new URL(listingUrl);
    url.searchParams.set("utm_source", channel === "facebook_page" ? "facebook" : "marketplace");
    url.searchParams.set("utm_medium", "oria_publisher");
    url.searchParams.set("utm_campaign", `stock_${stockId.toLowerCase()}`);
    return url.toString();
  } catch {
    return listingUrl;
  }
}

// ---------------------------------------------------------------------------
// Auto-pilot plan — which vehicles should be published today, and why.
// ---------------------------------------------------------------------------

/** Models with strong local demand — boosted by the auto-pilot score. */
const HIGH_DEMAND_MODELS = [
  "trax",
  "trailblazer",
  "equinox",
  "terrain",
  "envista",
  "encore",
  "silverado",
  "sierra",
  "canyon",
  "colorado",
];

export type AutoPilotCandidate = {
  vehicle: VehicleStock;
  score: number;
  reasons: string[];
};

export type AutoPilotPlanInput = {
  vehicles: readonly VehicleStock[];
  /** Prior publications — used for the per-stock cooldown. */
  recentPublications: ReadonlyArray<
    Pick<SocialPublication, "stockId" | "createdAt" | "status">
  >;
  nowIso: string;
  /** Max vehicles per run (default 3 — steady feed beats spam). */
  maxPerRun?: number;
  /** Days before the same stock can be re-published (default 7). */
  cooldownDays?: number;
};

function daysBetween(aIso: string, bIso: string): number {
  const a = Date.parse(aIso);
  const b = Date.parse(bIso);
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.POSITIVE_INFINITY;
  return Math.abs(b - a) / 86_400_000;
}

/**
 * Pick the best vehicles to publish now.
 *
 * Scoring (transparent, deterministic):
 *   +3 has 3+ photos (Marketplace/FB posts without photos do not convert)
 *   +2 price displayed (price-visible listings get far more messages)
 *   +2 high-demand model locally
 *   +1 new vehicle (fresh stock momentum)
 *   +1 has dealer VDP link (trackable click-through)
 *   skip: zero photos, or published within the cooldown window
 */
export function buildAutoPilotPlan(input: AutoPilotPlanInput): AutoPilotCandidate[] {
  const maxPerRun = Math.max(1, Math.min(input.maxPerRun ?? 3, 10));
  const cooldownDays = input.cooldownDays ?? 7;

  const lastPublishedAt = new Map<string, string>();
  for (const pub of input.recentPublications) {
    if (pub.status === "failed") continue;
    const prior = lastPublishedAt.get(pub.stockId);
    if (!prior || pub.createdAt > prior) lastPublishedAt.set(pub.stockId, pub.createdAt);
  }

  const candidates: AutoPilotCandidate[] = [];
  for (const vehicle of input.vehicles) {
    if (vehicle.photoUrls.length === 0) continue;
    const last = lastPublishedAt.get(vehicle.stockId);
    if (last && daysBetween(last, input.nowIso) < cooldownDays) continue;

    let score = 0;
    const reasons: string[] = [];
    if (vehicle.photoUrls.length >= 3) {
      score += 3;
      reasons.push(`${vehicle.photoUrls.length} photos prêtes`);
    } else {
      reasons.push(`${vehicle.photoUrls.length} photo(s)`);
    }
    if (vehicle.priceCad !== undefined) {
      score += 2;
      reasons.push("prix affiché (plus de messages)");
    }
    const modelKey = vehicle.model.trim().toLowerCase();
    if (HIGH_DEMAND_MODELS.some((m) => modelKey.includes(m))) {
      score += 2;
      reasons.push("modèle en forte demande locale");
    }
    if (vehicle.condition === "new") {
      score += 1;
      reasons.push("véhicule neuf");
    }
    if (vehicle.listingUrl) {
      score += 1;
      reasons.push("lien concession traçable (UTM)");
    }
    candidates.push({ vehicle, score, reasons });
  }

  candidates.sort(
    (a, b) => b.score - a.score || a.vehicle.stockId.localeCompare(b.vehicle.stockId),
  );
  return candidates.slice(0, maxPerRun);
}

export function vehicleLabel(vehicle: VehicleStock): string {
  const trim = vehicle.trim ? ` ${vehicle.trim}` : "";
  return `${vehicle.year} ${vehicle.make} ${vehicle.model}${trim}`.trim();
}
