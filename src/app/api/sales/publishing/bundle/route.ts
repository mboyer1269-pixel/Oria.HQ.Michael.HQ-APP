import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { requireOwnerApiSession } from "@/server/auth/owner";
import { createPublishingBundle } from "@/server/sales/publishing-agent";
import {
  listPublishingBundles,
  updateBundleStatus,
} from "@/server/sales/publishing-queue-store";
import { formatPublishingBundleClipboard } from "@/features/sales/publishing-bundle";

// GET  /api/sales/publishing/bundle — list publication bundles
// POST /api/sales/publishing/bundle — create bundle OR update status

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

const createSchema = z.object({
  action: z.literal("create").optional(),
  stockId: z.string().min(1),
  locationHint: z.string().optional(),
  vehicle: vehicleSchema.optional(),
});

const statusSchema = z.object({
  action: z.enum(["approve", "mark_published"]),
  bundleId: z.string().min(1),
});

const bodySchema = z.union([createSchema, statusSchema]);

export async function GET() {
  const authError = await requireOwnerApiSession();
  if (authError) return authError;

  const ctx = getActiveWorkspaceContext();
  const bundles = listPublishingBundles(ctx.workspace.id);

  return NextResponse.json({
    bundles,
    publishAuthorized: false,
    persistence: "in_memory",
    note:
      "Agent Publication — bundles prepare-only. Tu publies manuellement sur Facebook Marketplace, puis marques publié.",
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

  if ("bundleId" in parsed.data && parsed.data.action === "approve") {
    const bundle = updateBundleStatus(
      ctx.workspace.id,
      parsed.data.bundleId,
      "approved_for_publish",
      nowIso,
    );
    if (!bundle) {
      return NextResponse.json({ error: "Bundle not found." }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      bundle,
      clipboard: formatPublishingBundleClipboard(bundle),
      marketplaceUrl: "https://www.facebook.com/marketplace/create/vehicle",
      note: "Bundle approuvé — copie le clipboard et publie sur Marketplace.",
    });
  }

  if ("bundleId" in parsed.data && parsed.data.action === "mark_published") {
    const bundle = updateBundleStatus(
      ctx.workspace.id,
      parsed.data.bundleId,
      "published_manual",
      nowIso,
    );
    if (!bundle) {
      return NextResponse.json({ error: "Bundle not found." }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      bundle,
      note: "Marqué publié. Capture chaque message entrant via lead capture.",
    });
  }

  if (!("stockId" in parsed.data)) {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }

  const result = createPublishingBundle({
    workspaceId: ctx.workspace.id,
    stockId: parsed.data.stockId,
    locationHint: parsed.data.locationHint,
    vehicleOverride: parsed.data.vehicle,
    nowIso,
  });

  if (!result.ok) {
    return NextResponse.json({ error: "Create failed.", errors: result.errors }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    bundle: result.bundle,
    clipboard: formatPublishingBundleClipboard(result.bundle),
    publishAuthorized: false,
    persistence: "in_memory",
    note:
      "Bundle créé par l'Agent Publication. Approuve → copie → publie sur Marketplace → marque publié.",
  });
}
