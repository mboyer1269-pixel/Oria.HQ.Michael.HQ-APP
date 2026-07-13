import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { requireOwnerApiSession } from "@/server/auth/owner";
import {
  listMarketingPacks,
  markMarketingPackPublishedManual,
} from "@/server/sales/marketing-pack-store";
import { prepareMarketingContentPack } from "@/server/sales/prepare-marketing-pack";
import { rankVehiclesForPublishQueue } from "@/features/sales/marketing-content-pack";
import { getInventorySnapshot } from "@/server/inventory/inventory-store";

// GET  /api/sales/marketing/prepare — list packs + publish queue suggestions
// POST /api/sales/marketing/prepare — prepare pack OR mark published_manual

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

const prepareSchema = z.object({
  action: z.literal("prepare").optional(),
  stockId: z.string().min(1),
  packId: z.string().optional(),
  vehicle: vehicleSchema.optional(),
});

const publishedSchema = z.object({
  action: z.literal("mark_published_manual"),
  packId: z.string().min(1),
});

const bodySchema = z.union([prepareSchema, publishedSchema]);

export async function GET() {
  const authError = await requireOwnerApiSession();
  if (authError) return authError;

  const ctx = getActiveWorkspaceContext();
  const packs = listMarketingPacks(ctx.workspace.id);
  const snapshot = getInventorySnapshot(ctx.workspace.id);
  const publishQueue = rankVehiclesForPublishQueue(snapshot?.vehicles ?? [], 5).map((v) => ({
    stockId: v.stockId,
    label: `${v.year} ${v.make} ${v.model}${v.trim ? ` ${v.trim}` : ""}`,
    condition: v.condition,
    priceCad: v.priceCad,
    photoCount: v.photoUrls.length,
  }));

  return NextResponse.json({
    packs,
    publishQueue,
    publishAuthorized: false,
    persistence: "in_memory",
    note: "Directeur Marketing prepare-only. Copy → publish manually on Meta / YouTube.",
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
    const pack = markMarketingPackPublishedManual(ctx.workspace.id, parsed.data.packId, nowIso);
    if (!pack) {
      return NextResponse.json({ error: "Marketing pack not found." }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      pack,
      note: "Marked published_manual. Capture every inbound as a lead in Sales Desk.",
    });
  }

  const result = prepareMarketingContentPack({
    workspaceId: ctx.workspace.id,
    stockId: parsed.data.stockId,
    packId: parsed.data.packId,
    nowIso,
    vehicleOverride: "vehicle" in parsed.data ? parsed.data.vehicle : undefined,
  });

  if (!result.ok) {
    return NextResponse.json({ error: "Prepare failed.", errors: result.errors }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    pack: result.pack,
    publishAuthorized: false,
    persistence: "in_memory",
    note:
      "Pack multi-canal prêt (Marketplace, Facebook, Reel, Short, pub Meta). " +
      "Copie → publie manuellement → marque published_manual → capture chaque lead.",
  });
}
