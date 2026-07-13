import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { requireOwnerApiSession } from "@/server/auth/owner";
import type { VehicleStock } from "@/features/inventory/vehicle-stock";
import { buildVehicleContentPack } from "@/features/marketing/content-pack";
import { getInventorySnapshot } from "@/server/inventory/inventory-store";

// POST /api/marketing/content-pack
// Marketing director: full content pack for one vehicle — FB post, optimized
// Marketplace description, ad copy, Reel/YouTube scripts, hashtags.
// Deterministic generation from stock + GM model knowledge (no AI key needed).

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
  vehicle: vehicleSchema.optional(),
});

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

  const needle = parsed.data.stockId.trim().toLowerCase();
  const snapshot = getInventorySnapshot(ctx.workspace.id);
  const vehicle =
    (parsed.data.vehicle as VehicleStock | undefined) ??
    snapshot?.vehicles.find(
      (v) =>
        v.stockId.toLowerCase() === needle || v.stockNumber?.toLowerCase() === needle,
    );

  if (!vehicle) {
    return NextResponse.json(
      { error: `stockId introuvable dans l'inventaire : ${parsed.data.stockId}` },
      { status: 404 },
    );
  }

  const nowIso = new Date().toISOString();
  const pack = buildVehicleContentPack({
    packId: `pack_${vehicle.stockId}_${nowIso.replace(/[:.]/g, "")}`,
    workspaceId: ctx.workspace.id,
    vehicle,
    nowIso,
  });

  return NextResponse.json({
    ok: true,
    pack,
    persistence: "ephemeral",
    note: "Contenu prêt : post FB, description Marketplace, pub, scripts vidéo. Tu filmes / publies.",
  });
}
