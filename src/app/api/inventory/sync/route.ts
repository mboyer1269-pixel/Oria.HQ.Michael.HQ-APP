import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { requireOwnerApiSession } from "@/server/auth/owner";
import { syncPublicInventory } from "@/server/inventory/public-inventory-sync";
import { BUCKINGHAM_DEFAULT_INVENTORY_URLS } from "@/server/inventory/public-inventory-allowlist";

// POST /api/inventory/sync — allowlisted public HTML fetch → in-memory snapshot
// No credentials. Manual ingest remains available via POST /api/inventory/snapshot.

const bodySchema = z.object({
  urls: z.array(z.string().url()).max(5).optional(),
});

export async function POST(request: Request) {
  const authError = await requireOwnerApiSession();
  if (authError) return authError;

  const ctx = getActiveWorkspaceContext();
  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await syncPublicInventory({
    workspaceId: ctx.workspace.id,
    urls: parsed.data.urls,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: "Public inventory sync failed.",
        errors: result.errors,
        warnings: result.warnings,
        fallback: "POST /api/inventory/snapshot with manual JSON still works.",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    snapshotId: result.snapshot.snapshotId,
    vehicleCount: result.vehicleCount,
    vehicles: result.snapshot.vehicles,
    fetchedUrls: result.fetchedUrls,
    warnings: result.warnings,
    persistence: "in_memory",
    source: "public_fetch",
    defaultUrls: BUCKINGHAM_DEFAULT_INVENTORY_URLS,
    note:
      "Public allowlist sync only (buckinghamgm.com). " +
      "Vehicles are returned in this response for the Sales Desk visual grid. " +
      "Next: prepare a Marketplace fiche from a stock card.",
  });
}
