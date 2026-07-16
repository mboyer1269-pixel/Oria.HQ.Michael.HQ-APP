import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { requireOwnerApiSession } from "@/server/auth/owner";
import { buildMarketplacePhotoPack } from "@/server/marketplace-listings/build-photo-pack";
import {
  getMarketplaceListing,
} from "@/server/marketplace-listings/listing-store";
import { findVehicleInSnapshot } from "@/server/inventory/inventory-store";

// POST /api/marketplace/listings/photo-pack
// Downloads allowlisted inventory photos into a ZIP for manual Marketplace upload.
// Prepare-only — no Facebook publish.

const bodySchema = z.object({
  packetId: z.string().min(1).optional(),
  stockId: z.string().min(1).optional(),
  /** Optional explicit URLs (must still pass host allowlist). */
  photoUrls: z.array(z.string().url()).max(20).optional(),
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

  let stockId = parsed.data.stockId?.trim() ?? "";
  let photoUrls = parsed.data.photoUrls ?? [];

  if (parsed.data.packetId) {
    const packet = getMarketplaceListing(ctx.workspace.id, parsed.data.packetId);
    if (packet) {
      stockId = stockId || packet.stockId;
      if (photoUrls.length === 0) photoUrls = packet.photoUrls;
    }
  }

  if (photoUrls.length === 0 && stockId) {
    const vehicle = findVehicleInSnapshot(ctx.workspace.id, stockId);
    if (vehicle) photoUrls = vehicle.photoUrls;
  }

  if (!stockId) {
    return NextResponse.json(
      { error: "stockId or packetId is required." },
      { status: 400 },
    );
  }

  const pack = await buildMarketplacePhotoPack({
    photoUrls,
    stockId,
  });

  if (!pack.ok) {
    return NextResponse.json(
      { error: "Photo pack failed.", errors: pack.errors, skipped: pack.skipped },
      { status: 400 },
    );
  }

  return new NextResponse(Buffer.from(pack.zip), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${pack.filename}"`,
      "Cache-Control": "no-store",
      "X-Oria-Photo-Count": String(pack.files.length),
      "X-Oria-Photo-Skipped": String(pack.skipped.length),
      "X-Oria-Publish-Authorized": "false",
    },
  });
}
