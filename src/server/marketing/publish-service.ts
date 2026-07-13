// src/server/marketing/publish-service.ts
//
// Publisher agent — turns inventory into channel publications:
//   - facebook_page: auto-publish via the official Graph API when a Page
//     token is configured; simulated dry-run in local dev; otherwise a
//     ready-to-copy assisted-manual publication.
//   - marketplace: prepares the full packet (copy + photos + deep link) and
//     queues it for the human final click — Meta has no vehicle-listing API.
//
// Every inbound reply to a publication becomes a SalesLead (capture routes),
// closing the publish → prospect → lead → sale loop.

import type { VehicleStock } from "@/features/inventory/vehicle-stock";
import {
  buildAutoPilotPlan,
  buildUtmUrl,
  validateSocialPublication,
  vehicleLabel,
  type AutoPilotCandidate,
  type PublicationChannel,
  type SocialPublication,
} from "@/features/marketing/social-publication";
import { buildVehicleContentPack } from "@/features/marketing/content-pack";
import { isLocalPersistenceFallbackAllowed } from "@/lib/server-env";
import { getInventorySnapshot } from "@/server/inventory/inventory-store";
import { prepareMarketplaceListing } from "@/server/marketplace-listings/prepare-listing";
import {
  createFacebookPagePublisherFromEnv,
  type FacebookPagePublisherPort,
} from "./facebook-page-publisher";
import { listSocialPublications, saveSocialPublication } from "./publication-store";

export type RunPublisherInput = {
  workspaceId: string;
  /** "auto_pilot" scores the lot and picks the best vehicles; "single" targets one stock. */
  mode: "auto_pilot" | "single";
  stockId?: string;
  channels?: PublicationChannel[];
  maxPerRun?: number;
  nowIso?: string;
  /** Client-provided inventory fallback (serverless instances without snapshot). */
  vehiclesOverride?: VehicleStock[];
  /** Injected publisher for tests; defaults to env wiring. */
  pagePublisher?: FacebookPagePublisherPort | null;
  /** Allow simulated auto-publish when no Page token (defaults to dev-only). */
  allowSimulated?: boolean;
};

export type RunPublisherResult =
  | {
      ok: true;
      publications: SocialPublication[];
      candidates: AutoPilotCandidate[];
      pageConnected: boolean;
      summaryFr: string;
    }
  | { ok: false; errors: string[] };

function resolveVehicles(
  workspaceId: string,
  vehiclesOverride?: VehicleStock[],
): VehicleStock[] {
  const snapshot = getInventorySnapshot(workspaceId);
  if (snapshot && snapshot.vehicles.length > 0) return snapshot.vehicles;
  return vehiclesOverride ?? [];
}

function basePublication(input: {
  workspaceId: string;
  vehicle: VehicleStock;
  channel: PublicationChannel;
  message: string;
  rationale: string;
  nowIso: string;
}): SocialPublication {
  const { vehicle } = input;
  const utmUrl = buildUtmUrl(vehicle.listingUrl, vehicle.stockId, input.channel);
  return {
    publicationId: `pub_${input.channel}_${vehicle.stockId}_${input.nowIso.replace(/[:.]/g, "")}`,
    workspaceId: input.workspaceId,
    stockId: vehicle.stockId,
    vehicleLabel: vehicleLabel(vehicle),
    channel: input.channel,
    message: input.message,
    photoUrls: [...vehicle.photoUrls].slice(0, 10),
    linkUrl: vehicle.listingUrl,
    utmUrl,
    status: "queued",
    mode: "assisted_manual",
    rationale: input.rationale,
    createdAt: input.nowIso,
    updatedAt: input.nowIso,
  };
}

async function publishToPage(
  publication: SocialPublication,
  publisher: FacebookPagePublisherPort | null,
  allowSimulated: boolean,
  nowIso: string,
): Promise<SocialPublication> {
  if (publisher) {
    const outcome = await publisher.publishPost({
      message: publication.message,
      linkUrl: publication.utmUrl ?? publication.linkUrl,
      photoUrls: publication.photoUrls,
    });
    if (outcome.ok) {
      return {
        ...publication,
        status: "published_auto",
        mode: "auto_api",
        postId: outcome.postId,
        postUrl: outcome.postUrl,
        publishedAt: nowIso,
        updatedAt: nowIso,
      };
    }
    return {
      ...publication,
      status: "failed",
      mode: "auto_api",
      error: outcome.error,
      updatedAt: nowIso,
    };
  }

  if (allowSimulated) {
    return {
      ...publication,
      status: "published_auto",
      mode: "simulated",
      postId: `sim_${publication.publicationId}`,
      publishedAt: nowIso,
      updatedAt: nowIso,
    };
  }

  // No token, no simulation: ready-to-copy manual publication.
  return publication;
}

export async function runPublisherAgent(
  input: RunPublisherInput,
): Promise<RunPublisherResult> {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const channels: PublicationChannel[] =
    input.channels && input.channels.length > 0
      ? input.channels
      : ["facebook_page", "marketplace"];

  const vehicles = resolveVehicles(input.workspaceId, input.vehiclesOverride);
  if (vehicles.length === 0) {
    return {
      ok: false,
      errors: ["Inventaire vide — lance « Sync site web » avant de publier."],
    };
  }

  let candidates: AutoPilotCandidate[];
  if (input.mode === "single") {
    const needle = input.stockId?.trim().toLowerCase();
    if (!needle) {
      return { ok: false, errors: ["stockId requis en mode single."] };
    }
    const vehicle = vehicles.find(
      (v) =>
        v.stockId.toLowerCase() === needle || v.stockNumber?.toLowerCase() === needle,
    );
    if (!vehicle) {
      return { ok: false, errors: [`stockId introuvable dans l'inventaire : ${input.stockId}`] };
    }
    candidates = [
      { vehicle, score: 0, reasons: ["sélection manuelle de l'opérateur"] },
    ];
  } else {
    candidates = buildAutoPilotPlan({
      vehicles,
      recentPublications: listSocialPublications(input.workspaceId),
      nowIso,
      maxPerRun: input.maxPerRun,
    });
    if (candidates.length === 0) {
      return {
        ok: false,
        errors: [
          "Aucun véhicule éligible : tout le stock avec photos a été publié récemment (cooldown 7 jours).",
        ],
      };
    }
  }

  const pagePublisher =
    input.pagePublisher !== undefined
      ? input.pagePublisher
      : createFacebookPagePublisherFromEnv();
  const allowSimulated = input.allowSimulated ?? isLocalPersistenceFallbackAllowed();

  const publications: SocialPublication[] = [];
  const errors: string[] = [];

  for (const candidate of candidates) {
    const pack = buildVehicleContentPack({
      packId: `pack_${candidate.vehicle.stockId}_${nowIso.replace(/[:.]/g, "")}`,
      workspaceId: input.workspaceId,
      vehicle: candidate.vehicle,
      nowIso,
    });
    const rationale =
      candidate.reasons.length > 0
        ? `Score ${candidate.score} — ${candidate.reasons.join(", ")}`
        : "Sélection opérateur";

    for (const channel of channels) {
      if (channel === "facebook_page") {
        const draft = basePublication({
          workspaceId: input.workspaceId,
          vehicle: candidate.vehicle,
          channel,
          message: pack.facebookPostFr,
          rationale,
          nowIso,
        });
        const published = await publishToPage(draft, pagePublisher, allowSimulated, nowIso);
        const validation = validateSocialPublication(published);
        if (!validation.valid) {
          errors.push(...validation.errors);
          continue;
        }
        publications.push(saveSocialPublication(published));
      } else {
        // Marketplace: prepare the full packet, then queue for the human click.
        const prepared = await prepareMarketplaceListing({
          workspaceId: input.workspaceId,
          stockId: candidate.vehicle.stockId,
          nowIso,
          vehicleOverride: candidate.vehicle,
          enrichPhotos: false,
        });
        const draft = basePublication({
          workspaceId: input.workspaceId,
          vehicle: candidate.vehicle,
          channel,
          message: pack.marketplaceDescriptionFr,
          rationale,
          nowIso,
        });
        const publication: SocialPublication = prepared.ok
          ? { ...draft, packetId: prepared.packet.packetId }
          : { ...draft, error: prepared.errors.join("; ") };
        const validation = validateSocialPublication(publication);
        if (!validation.valid) {
          errors.push(...validation.errors);
          continue;
        }
        publications.push(saveSocialPublication(publication));
      }
    }
  }

  if (publications.length === 0) {
    return { ok: false, errors: errors.length > 0 ? errors : ["Aucune publication créée."] };
  }

  const autoCount = publications.filter((p) => p.status === "published_auto").length;
  const queuedCount = publications.filter((p) => p.status === "queued").length;
  const failedCount = publications.filter((p) => p.status === "failed").length;
  const pageConnected = Boolean(pagePublisher);
  const summaryFr = [
    `${publications.length} publication(s) générée(s) pour ${candidates.length} véhicule(s).`,
    autoCount > 0
      ? `${autoCount} auto-publiée(s) sur la Page Facebook${pageConnected ? "" : " (mode simulation locale)"}.`
      : null,
    queuedCount > 0
      ? `${queuedCount} en file Marketplace — copie prête, clic final humain (Meta n'offre pas d'API Marketplace).`
      : null,
    failedCount > 0 ? `${failedCount} échec(s) — voir détails.` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return { ok: true, publications, candidates, pageConnected, summaryFr };
}
