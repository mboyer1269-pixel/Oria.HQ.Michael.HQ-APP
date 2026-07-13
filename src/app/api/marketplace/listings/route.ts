import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { requireOwnerApiSession } from "@/server/auth/owner";
import { listMarketplaceListings } from "@/server/marketplace-listings/listing-store";
import { prepareMarketplaceListing } from "@/server/marketplace-listings/prepare-listing";
import { markListingPublishedManual } from "@/server/marketplace-listings/listing-store";
import { AUTO_PUBLISH_BLOCKED_REASON_FR } from "@/features/marketplace-listings/publish-policy";

// GET  /api/marketplace/listings — prepared listing packets
// POST /api/marketplace/listings — prepare from stock OR mark published_manual

const prepareSchema = z.object({
  action: z.literal("prepare").optional(),
  stockId: z.string().min(1),
  packetId: z.string().optional(),
  locationHint: z.string().optional(),
  vehicle: z
    .object({
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
    })
    .optional(),
});

const publishedSchema = z.object({
  action: z.literal("mark_published_manual"),
  packetId: z.string().min(1),
});

const autoPublishSchema = z.object({
  action: z.literal("auto_publish"),
  stockId: z.string().optional(),
  packetId: z.string().optional(),
});

const bodySchema = z.union([prepareSchema, publishedSchema, autoPublishSchema]);

export async function GET() {
  const authError = await requireOwnerApiSession();
  if (authError) return authError;

  const ctx = getActiveWorkspaceContext();
  const listings = listMarketplaceListings(ctx.workspace.id);

  return NextResponse.json({
    listings,
    publishAuthorized: false,
    persistence: "in_memory",
    note: "Prepare-only packets. You publish on Facebook Marketplace manually.",
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

  if ("action" in parsed.data && parsed.data.action === "auto_publish") {
    return NextResponse.json(
      {
        ok: false,
        publishAuthorized: false,
        error: "Auto-publish blocked.",
        policy: AUTO_PUBLISH_BLOCKED_REASON_FR,
        alternative:
          "Use action prepare, copy bundle from Sales Desk, publish manually on Facebook Marketplace.",
      },
      { status: 403 },
    );
  }

  if ("action" in parsed.data && parsed.data.action === "mark_published_manual") {
    const packet = markListingPublishedManual(ctx.workspace.id, parsed.data.packetId, nowIso);
    if (!packet) {
      return NextResponse.json({ error: "Listing packet not found." }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      packet,
      note: "Marked published_manual. Capture inbound replies via /api/marketplace/leads/capture.",
    });
  }

  const result = await prepareMarketplaceListing({
    workspaceId: ctx.workspace.id,
    stockId: parsed.data.stockId,
    packetId: parsed.data.packetId,
    locationHint: parsed.data.locationHint,
    nowIso,
    vehicleOverride: "vehicle" in parsed.data ? parsed.data.vehicle : undefined,
  });

  if (!result.ok) {
    return NextResponse.json({ error: "Prepare failed.", errors: result.errors }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    packet: result.packet,
    photoEnrichment: result.photoEnrichment,
    publishAuthorized: false,
    persistence: "in_memory",
    note:
      "Copy title/description/price/photos into Facebook Marketplace yourself. " +
      "Then mark_published_manual and capture every inbound as a lead.",
  });
}
