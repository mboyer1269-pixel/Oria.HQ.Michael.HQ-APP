import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { requireOwnerApiSession } from "@/server/auth/owner";
import { listMarketingPacks } from "@/server/sales/marketing-pack-store";
import { prepareMarketingPack } from "@/server/sales/prepare-marketing-pack";

// GET  /api/sales/marketing/prepare — list prepared marketing kits
// POST /api/sales/marketing/prepare — Directeur Marketing kit (Marketplace+FB+Reel+YT+Ad)
// Prepare-only: no auto-publish to Facebook/Marketplace.

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

const bodySchema = z.object({
  stockId: z.string().min(1),
  packId: z.string().optional(),
  locationHint: z.string().optional(),
  vehicle: vehicleSchema.optional(),
});

export async function GET() {
  const authError = await requireOwnerApiSession();
  if (authError) return authError;

  const ctx = getActiveWorkspaceContext();
  const packs = listMarketingPacks(ctx.workspace.id);

  return NextResponse.json({
    packs,
    publishAuthorized: false,
    persistence: "in_memory",
    note: "Directeur Marketing prepare-only. You publish manually on each channel.",
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
  const result = await prepareMarketingPack({
    workspaceId: ctx.workspace.id,
    stockId: parsed.data.stockId,
    packId: parsed.data.packId,
    locationHint: parsed.data.locationHint,
    nowIso,
    vehicleOverride: parsed.data.vehicle,
  });

  if (!result.ok) {
    return NextResponse.json({ error: "Prepare failed.", errors: result.errors }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    pack: result.pack,
    packet: result.listingPacket,
    photoEnrichment: result.photoEnrichment,
    publishAuthorized: false,
    persistence: "in_memory",
    note:
      "Kit prêt (Marketplace + Facebook + Reel + YouTube Short + Meta Ad). " +
      "Publication manuelle uniquement — pas de bot Facebook / cookies.",
  });
}
