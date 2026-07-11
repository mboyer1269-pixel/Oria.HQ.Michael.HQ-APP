import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { requireOwnerApiSession } from "@/server/auth/owner";
import { ingestManualInventory } from "@/server/inventory/inventory-ingest";
import { getInventorySnapshot } from "@/server/inventory/inventory-store";

// GET  /api/inventory/snapshot — latest in-memory snapshot
// POST /api/inventory/snapshot — manual JSON ingest (no network fetch)

const vehicleSchema = z.object({
  stockId: z.string().min(1),
  vin: z.string().optional(),
  year: z.number().int().min(1980).max(2100),
  make: z.string().min(1),
  model: z.string().min(1),
  trim: z.string().optional(),
  condition: z.enum(["new", "used", "cpo"]),
  priceCad: z.number().nonnegative().optional(),
  mileageKm: z.number().nonnegative().optional(),
  exteriorColor: z.string().optional(),
  stockNumber: z.string().optional(),
  listingUrl: z.string().optional(),
  photoUrls: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

const ingestSchema = z.object({
  vehicles: z.array(vehicleSchema).min(1).max(500),
  source: z.enum(["manual_json", "manual_csv"]).optional(),
  snapshotId: z.string().optional(),
});

export async function GET() {
  const authError = await requireOwnerApiSession();
  if (authError) return authError;

  const ctx = getActiveWorkspaceContext();
  const snapshot = getInventorySnapshot(ctx.workspace.id);

  return NextResponse.json({
    snapshot,
    persistence: "in_memory",
    note: "Manual ingest only. Public HTML fetch is a later Yellow step.",
  });
}

export async function POST(request: Request) {
  const authError = await requireOwnerApiSession();
  if (authError) return authError;

  const ctx = getActiveWorkspaceContext();
  const body = await request.json().catch(() => null);
  const parsed = ingestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = ingestManualInventory({
    workspaceId: ctx.workspace.id,
    vehicles: parsed.data.vehicles.map((v) => ({
      ...v,
      photoUrls: v.photoUrls ?? [],
    })),
    source: parsed.data.source,
    snapshotId: parsed.data.snapshotId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: "Ingest failed.", errors: result.errors }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    snapshot: result.snapshot,
    persistence: "in_memory",
    note: "Inventory snapshot replaced for this workspace (in-memory).",
  });
}
