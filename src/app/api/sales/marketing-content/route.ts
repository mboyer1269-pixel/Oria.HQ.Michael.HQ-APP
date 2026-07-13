import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { requireOwnerApiSession } from "@/server/auth/owner";
import { findVehicleInSnapshot } from "@/server/inventory/inventory-store";
import { buildMarketingContentPack } from "@/features/sales/marketing-content-pack";
import type { VehicleStock } from "@/features/inventory/vehicle-stock";

// POST /api/sales/marketing-content — generate multi-channel marketing pack (prepare-only)

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
  channels: z
    .array(
      z.enum([
        "facebook_post",
        "facebook_ad",
        "instagram_reel",
        "youtube_short",
        "marketplace_hook",
      ]),
    )
    .optional(),
});

function resolveVehicle(
  workspaceId: string,
  stockId: string,
  override?: VehicleStock,
): VehicleStock | null {
  if (override && override.stockId === stockId) return override;
  return findVehicleInSnapshot(workspaceId, stockId) ?? override ?? null;
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

  const vehicle = resolveVehicle(
    ctx.workspace.id,
    parsed.data.stockId,
    parsed.data.vehicle,
  );
  if (!vehicle) {
    return NextResponse.json(
      { error: "Vehicle not found.", errors: [`stockId: ${parsed.data.stockId}`] },
      { status: 404 },
    );
  }

  const nowIso = new Date().toISOString();
  const pack = buildMarketingContentPack({
    packId: `mcp_${vehicle.stockId}_${nowIso.replace(/[:.]/g, "")}`,
    vehicle,
    nowIso,
    channels: parsed.data.channels,
  });

  return NextResponse.json({
    ok: true,
    pack,
    publishAuthorized: false,
    note:
      "Directeur Marketing — contenus prêts à copier. Tu publies manuellement sur FB/IG/YT.",
  });
}
