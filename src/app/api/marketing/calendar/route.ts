import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { requireOwnerApiSession } from "@/server/auth/owner";
import type { VehicleStock } from "@/features/inventory/vehicle-stock";
import { buildContentCalendar } from "@/features/marketing/content-calendar";
import { getInventorySnapshot } from "@/server/inventory/inventory-store";

// POST /api/marketing/calendar
// Marketing director: 7-day content calendar driven by the live inventory
// (auto-pilot scoring picks the vehicles most likely to generate messages).

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
  inventory: z.array(vehicleSchema).max(200).optional(),
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

  const snapshot = getInventorySnapshot(ctx.workspace.id);
  const fromClient = (parsed.data.inventory ?? []) as VehicleStock[];
  const vehicles =
    snapshot && snapshot.vehicles.length > 0 ? snapshot.vehicles : fromClient;

  const nowIso = new Date().toISOString();
  const calendar = buildContentCalendar({
    calendarId: `cal_${nowIso.replace(/[:.]/g, "")}`,
    workspaceId: ctx.workspace.id,
    vehicles,
    nowIso,
  });

  return NextResponse.json({
    ok: true,
    calendar,
    persistence: "ephemeral",
    note: "Plan 7 jours : spotlights, vidéos, preuve sociale, lead magnets. Chaque post vise un message privé.",
  });
}
