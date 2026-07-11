import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { requireOwnerApiSession } from "@/server/auth/owner";
import { captureMarketplaceLead } from "@/server/marketplace-listings/capture-lead";

// POST /api/marketplace/leads/capture — inbound Marketplace reply → lead bank

const bodySchema = z.object({
  packetId: z.string().min(1),
  fullName: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().optional(),
  messageExcerpt: z.string().optional(),
  leadId: z.string().optional(),
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

  const result = captureMarketplaceLead({
    workspaceId: ctx.workspace.id,
    packetId: parsed.data.packetId,
    fullName: parsed.data.fullName,
    phone: parsed.data.phone,
    email: parsed.data.email,
    messageExcerpt: parsed.data.messageExcerpt,
    leadId: parsed.data.leadId,
    createdByUserId: ctx.userId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: "Capture failed.", errors: result.errors }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    lead: result.lead,
    created: result.created,
    packetStockId: result.packetStockId,
    persistence: "in_memory",
    note:
      "Lead bank reinforced from Marketplace inbound. " +
      "Prepare follow-up via POST /api/sales/follow-up/prepare.",
  });
}
