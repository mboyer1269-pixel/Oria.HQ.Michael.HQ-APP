import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { requireOwnerApiSession } from "@/server/auth/owner";
import { getInventorySnapshot } from "@/server/inventory/inventory-store";
import { fetchMarketAdvantageBrief } from "@/server/market/fetch-market-comps";
import type { VehicleStock } from "@/features/inventory/vehicle-stock";

// POST /api/sales/market-brief
// Public AutoTrader Gatineau comps → talking points vs on-lot inventory.
// Prepare-only intelligence (no publish, no CRM write).

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
  year: z.number().int().min(1990).max(2100),
  make: z.string().min(1).max(40),
  model: z.string().min(1).max(60),
  stockId: z.string().optional(),
  vehicle: vehicleSchema.optional(),
  inventory: z.array(vehicleSchema).max(200).optional(),
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

  const snapshot = getInventorySnapshot(ctx.workspace.id);
  const inventoryFromClient = (parsed.data.inventory ?? []) as VehicleStock[];
  const inventory =
    inventoryFromClient.length > 0 ? inventoryFromClient : (snapshot?.vehicles ?? []);

  let focusVehicle: VehicleStock | null = null;
  if (parsed.data.vehicle) {
    focusVehicle = parsed.data.vehicle as VehicleStock;
  } else if (parsed.data.stockId) {
    focusVehicle =
      inventory.find(
        (v) =>
          v.stockId.toLowerCase() === parsed.data.stockId!.toLowerCase() ||
          v.stockNumber?.toLowerCase() === parsed.data.stockId!.toLowerCase(),
      ) ?? null;
  }

  const result = await fetchMarketAdvantageBrief({
    target: {
      year: parsed.data.year,
      make: parsed.data.make,
      model: parsed.data.model,
    },
    inventory,
    focusVehicle,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: "Market brief failed.",
        errors: result.errors,
        warnings: result.warnings,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    brief: result.brief,
    warnings: result.warnings,
    persistence: "ephemeral",
    publishAuthorized: false,
    note:
      "Public AutoTrader comps (Gatineau). Talking points only — you adjust price / publish manually.",
  });
}
