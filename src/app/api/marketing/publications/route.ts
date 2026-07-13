import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { requireOwnerApiSession } from "@/server/auth/owner";
import type { VehicleStock } from "@/features/inventory/vehicle-stock";
import { MARKETPLACE_CREATE_VEHICLE_URL } from "@/features/marketing/social-publication";
import {
  listSocialPublications,
  markPublicationPublishedManual,
} from "@/server/marketing/publication-store";
import { runPublisherAgent } from "@/server/marketing/publish-service";
import { markListingPublishedManual } from "@/server/marketplace-listings/listing-store";

// GET  /api/marketing/publications — publisher agent history
// POST /api/marketing/publications — run the publisher (auto-pilot / single)
//                                    OR mark a Marketplace publication done.
//
// facebook_page publishes automatically through the official Graph API when
// FACEBOOK_PAGE_ID + FACEBOOK_PAGE_ACCESS_TOKEN are configured (simulated in
// local dev). Marketplace stays assisted-manual: Meta has no listing API.

const vehicleSchema = z.object({
  stockId: z.string().min(1),
  vin: z.string().optional(),
  year: z.number().int(),
  make: z.string().min(1),
  model: z.string().min(1),
  trim: z.string().optional(),
  condition: z.enum(["new", "used", "cpo"]),
  priceCad: z.number().optional(),
  mileageKm: z.number().optional(),
  exteriorColor: z.string().optional(),
  stockNumber: z.string().optional(),
  listingUrl: z.string().optional(),
  photoUrls: z.array(z.string()),
  notes: z.string().optional(),
});

const runSchema = z.object({
  action: z.literal("run").optional(),
  mode: z.enum(["auto_pilot", "single"]),
  stockId: z.string().optional(),
  channels: z.array(z.enum(["facebook_page", "marketplace"])).optional(),
  maxPerRun: z.number().int().min(1).max(10).optional(),
  inventory: z.array(vehicleSchema).max(200).optional(),
});

const markPublishedSchema = z.object({
  action: z.literal("mark_published_manual"),
  publicationId: z.string().min(1),
});

const bodySchema = z.union([runSchema, markPublishedSchema]);

export async function GET() {
  const authError = await requireOwnerApiSession();
  if (authError) return authError;

  const ctx = getActiveWorkspaceContext();
  return NextResponse.json({
    publications: listSocialPublications(ctx.workspace.id),
    marketplaceCreateUrl: MARKETPLACE_CREATE_VEHICLE_URL,
    persistence: "in_memory",
  });
}

export async function POST(request: Request) {
  const authError = await requireOwnerApiSession();
  if (authError) return authError;

  const ctx = getActiveWorkspaceContext();
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const nowIso = new Date().toISOString();

  if ("action" in parsed.data && parsed.data.action === "mark_published_manual") {
    const publication = markPublicationPublishedManual(
      ctx.workspace.id,
      parsed.data.publicationId,
      nowIso,
    );
    if (!publication) {
      return NextResponse.json({ error: "Publication introuvable." }, { status: 404 });
    }
    if (publication.packetId) {
      markListingPublishedManual(ctx.workspace.id, publication.packetId, nowIso);
    }
    return NextResponse.json({
      ok: true,
      publication,
      note: "Marquée publiée. Capture chaque inbound comme lead (source marketplace_message).",
    });
  }

  const result = await runPublisherAgent({
    workspaceId: ctx.workspace.id,
    mode: parsed.data.mode,
    stockId: parsed.data.stockId,
    channels: parsed.data.channels,
    maxPerRun: parsed.data.maxPerRun,
    nowIso,
    vehiclesOverride: (parsed.data.inventory ?? []) as VehicleStock[],
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: "Publisher run failed.", errors: result.errors },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    publications: result.publications,
    candidates: result.candidates.map((c) => ({
      stockId: c.vehicle.stockId,
      score: c.score,
      reasons: c.reasons,
    })),
    pageConnected: result.pageConnected,
    summaryFr: result.summaryFr,
    marketplaceCreateUrl: MARKETPLACE_CREATE_VEHICLE_URL,
    persistence: "in_memory",
  });
}
