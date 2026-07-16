import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { requireOwnerApiSession } from "@/server/auth/owner";
import { buildSalesMarketingPack } from "@/features/sales/marketing-content-pack";
import { findVehicleInSnapshot } from "@/server/inventory/inventory-store";

// POST /api/sales/marketing/content-pack — prepare-only marketing + prospecting pack

const bodySchema = z.object({
  stockId: z.string().min(1),
  prospectFirstName: z.string().optional(),
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

  const vehicle = findVehicleInSnapshot(ctx.workspace.id, parsed.data.stockId);
  if (!vehicle) {
    return NextResponse.json(
      {
        error: "Vehicle not found in inventory snapshot.",
        hint: "Sync inventaire d'abord (POST /api/inventory/sync) ou ingest JSON.",
      },
      { status: 404 },
    );
  }

  const nowIso = new Date().toISOString();
  const pack = buildSalesMarketingPack({
    vehicle,
    workspaceId: ctx.workspace.id,
    nowIso,
    prospectFirstName: parsed.data.prospectFirstName,
  });

  return NextResponse.json({
    ok: true,
    pack,
    publishAuthorized: false,
    sendAuthorized: false,
    note: "Prepare-only. Copie posts/SMS toi-même — pas d'auto-publish ni d'envoi.",
  });
}
