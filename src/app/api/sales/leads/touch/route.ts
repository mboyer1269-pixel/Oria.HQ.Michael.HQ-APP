import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { requireOwnerApiSession } from "@/server/auth/owner";
import type { LeadStage } from "@/features/sales/sales-lead";
import { touchSalesLead } from "@/server/sales/touch-lead";

// POST /api/sales/leads/touch — mark contacted, schedule next follow-up

const leadStageSchema = z.enum([
  "new",
  "contacted",
  "qualified",
  "appointment_set",
  "appointment_done",
  "negotiation",
  "sold",
  "lost",
  "nurture",
]);

const bodySchema = z.object({
  leadId: z.string().min(1),
  stage: leadStageSchema.optional(),
  lastContactAt: z.string().optional(),
  nextFollowUpAt: z.string().nullable().optional(),
  notesAppend: z.string().optional(),
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

  const result = touchSalesLead({
    workspaceId: ctx.workspace.id,
    leadId: parsed.data.leadId,
    stage: parsed.data.stage as LeadStage | undefined,
    lastContactAt: parsed.data.lastContactAt,
    nextFollowUpAt: parsed.data.nextFollowUpAt,
    notesAppend: parsed.data.notesAppend,
    createdByUserId: ctx.userId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: "Touch failed.", errors: result.errors }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    lead: result.lead,
    note: "Lead touché — relance planifiée. Envoi SMS/email reste manuel.",
  });
}
