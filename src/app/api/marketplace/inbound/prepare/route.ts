import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { requireOwnerApiSession } from "@/server/auth/owner";
import { prepareMarketplaceInboundDraft } from "@/features/sales/marketplace-inbound-draft";
import { getMarketplaceListing } from "@/server/marketplace-listings/listing-store";

// POST /api/marketplace/inbound/prepare — first-reply draft for Messenger inbound

const bodySchema = z.object({
  packetId: z.string().min(1),
  repFirstName: z.string().optional(),
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

  const packet = getMarketplaceListing(ctx.workspace.id, parsed.data.packetId);
  if (!packet) {
    return NextResponse.json({ error: "Listing packet not found." }, { status: 404 });
  }

  const draft = prepareMarketplaceInboundDraft({
    packet,
    repFirstName: parsed.data.repFirstName,
    nowIso: new Date().toISOString(),
  });

  return NextResponse.json({
    ok: true,
    draft,
    requiresManualSend: true,
    note: "Copie dans Messenger — jamais d'envoi automatique.",
  });
}
