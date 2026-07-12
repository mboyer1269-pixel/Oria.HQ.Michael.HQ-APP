import { NextResponse } from "next/server";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { requireOwnerApiSession } from "@/server/auth/owner";
import { getVehicleCatalogSnapshot } from "@/server/inventory/vehicle-catalog-service";
import { modelsForMake } from "@/features/inventory/vehicle-catalog";

// GET /api/inventory/vehicle-catalog
 // Relational make/model catalog for cascading Selects + market analysis.
 // Optional query: ?makeId=hyundai → models filtered server-side.

export async function GET(request: Request) {
  const authError = await requireOwnerApiSession();
  if (authError) return authError;

  const ctx = getActiveWorkspaceContext();
  const catalog = getVehicleCatalogSnapshot(ctx.workspace.id);
  const url = new URL(request.url);
  const makeId = url.searchParams.get("makeId")?.trim() || null;

  if (makeId) {
    const make = catalog.makes.find((m) => m.makeId === makeId);
    if (!make) {
      return NextResponse.json(
        { error: "Unknown makeId.", makeId, makes: catalog.makes },
        { status: 404 },
      );
    }
    return NextResponse.json({
      ok: true,
      make,
      models: modelsForMake(catalog, makeId),
      years: catalog.years,
      source: catalog.source,
      generatedAt: catalog.generatedAt,
      relations: catalog.relations,
    });
  }

  return NextResponse.json({
    ok: true,
    catalog,
    counts: {
      makes: catalog.makes.length,
      models: catalog.models.length,
      years: catalog.years.length,
    },
  });
}
