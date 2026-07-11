import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { requireOwnerApiSession } from "@/server/auth/owner";
import { captureSaleOutcome } from "@/server/sales/sale-outcome";

// POST /api/sales/outcome — mark sold (requires soldStockId) or lost (requires lostReason)

const bodySchema = z.object({
  leadId: z.string().min(1),
  outcome: z.enum(["sold", "lost"]),
  soldStockId: z.string().optional(),
  lostReason: z.string().optional(),
  notes: z.string().optional(),
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

  const result = captureSaleOutcome({
    workspaceId: ctx.workspace.id,
    leadId: parsed.data.leadId,
    outcome: parsed.data.outcome,
    soldStockId: parsed.data.soldStockId,
    lostReason: parsed.data.lostReason,
    notes: parsed.data.notes,
  });

  if (!result.ok) {
    return NextResponse.json({ error: "Outcome failed.", errors: result.errors }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    lead: result.lead,
    persistence: "in_memory",
  });
}
