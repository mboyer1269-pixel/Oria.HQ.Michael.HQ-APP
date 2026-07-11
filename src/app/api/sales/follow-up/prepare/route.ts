import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { requireOwnerApiSession } from "@/server/auth/owner";
import { prepareFollowUpDraft } from "@/features/sales/follow-up-draft";
import { getSalesLead } from "@/server/sales/lead-bank-store";
import { findVehicleInSnapshot } from "@/server/inventory/inventory-store";

// POST /api/sales/follow-up/prepare — copy-ready SMS/email draft (never sends)

const bodySchema = z.object({
  leadId: z.string().min(1),
  channel: z.enum(["sms", "email"]),
  lane: z.enum(["reply_assist", "follow_up"]).optional(),
  vehicleHint: z.string().optional(),
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

  const lead = getSalesLead(ctx.workspace.id, parsed.data.leadId);
  if (!lead) {
    return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  }

  let vehicleHint = parsed.data.vehicleHint;
  if (!vehicleHint && lead.interestedStockIds[0]) {
    const vehicle = findVehicleInSnapshot(ctx.workspace.id, lead.interestedStockIds[0]);
    if (vehicle) {
      vehicleHint = `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.trim ? ` ${vehicle.trim}` : ""}`;
    }
  }

  const nowIso = new Date().toISOString();
  const result = prepareFollowUpDraft({
    lead,
    channel: parsed.data.channel,
    lane: parsed.data.lane,
    vehicleHint,
    nowIso,
  });

  if (!result.ok) {
    return NextResponse.json({ error: "Prepare failed.", errors: result.errors }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    draft: result.draft,
    sendAuthorized: false,
    note: "Prepare-only. Copy into SMS/email yourself — Oria does not send.",
  });
}
