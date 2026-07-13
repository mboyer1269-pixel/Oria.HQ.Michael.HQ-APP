import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { requireOwnerApiSession } from "@/server/auth/owner";
import { findVehicleInSnapshot } from "@/server/inventory/inventory-store";
import {
  buildMarketingContentBundle,
  formatMarketingBundleClipboard,
} from "@/features/sales/marketing-content";
import { buildLeadProspectPlaybook } from "@/features/sales/lead-prospect-playbook";
import { listSalesLeads } from "@/server/sales/lead-bank-store";
import { getInventorySnapshot } from "@/server/inventory/inventory-store";
import { listPublishedStockIds } from "@/server/sales/publishing-queue-store";

// GET  /api/sales/marketing/content — playbook + recommendations
// POST /api/sales/marketing/content — marketing bundle for one vehicle

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

const postSchema = z.object({
  stockId: z.string().min(1),
  vehicle: vehicleSchema.optional(),
});

export async function GET() {
  const authError = await requireOwnerApiSession();
  if (authError) return authError;

  const ctx = getActiveWorkspaceContext();
  const snap = getInventorySnapshot(ctx.workspace.id);
  const vehicles = snap?.vehicles ?? [];
  const leads = listSalesLeads(ctx.workspace.id);
  const nowIso = new Date().toISOString();

  const playbook = buildLeadProspectPlaybook({
    vehicles,
    leads,
    publishedStockIds: listPublishedStockIds(ctx.workspace.id),
    nowIso,
  });

  return NextResponse.json({
    playbook,
    agent: "marketing_director",
    note: "Directeur Marketing — recommandations + contenus prepare-only.",
  });
}

export async function POST(request: Request) {
  const authError = await requireOwnerApiSession();
  if (authError) return authError;

  const ctx = getActiveWorkspaceContext();
  const body = await request.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const vehicle =
    parsed.data.vehicle ??
    findVehicleInSnapshot(ctx.workspace.id, parsed.data.stockId);

  if (!vehicle) {
    return NextResponse.json(
      { error: "Vehicle not found.", stockId: parsed.data.stockId },
      { status: 404 },
    );
  }

  const bundle = buildMarketingContentBundle(vehicle);
  const trim = vehicle.trim ? ` ${vehicle.trim}` : "";
  const title = `${vehicle.year} ${vehicle.make} ${vehicle.model}${trim}`;

  return NextResponse.json({
    ok: true,
    stockId: vehicle.stockId,
    vehicleTitle: title,
    marketing: bundle,
    clipboard: formatMarketingBundleClipboard(bundle, title),
    agent: "marketing_director",
    note: "Contenus prêts — valide puis publie sur FB/Reels/YouTube. Aucune dépense pub sans approbation.",
  });
}
