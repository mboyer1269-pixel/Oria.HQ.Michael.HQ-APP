import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { requireOwnerApiSession } from "@/server/auth/owner";
import { CONSENT_BASES, LEAD_SOURCES, LEAD_STAGES } from "@/features/sales/sales-lead";
import { listSalesLeads, upsertSalesLead } from "@/server/sales/lead-bank-store";

// GET  /api/sales/leads — list lead bank
// POST /api/sales/leads — upsert lead (mergeOnDedupe default true)

const upsertSchema = z.object({
  leadId: z.string().min(1).optional(),
  fullName: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().optional(),
  source: z.enum(LEAD_SOURCES as unknown as [string, ...string[]]),
  sourceRef: z.string().optional(),
  interestedStockIds: z.array(z.string()).optional(),
  interestedModels: z.array(z.string()).optional(),
  stage: z.enum(LEAD_STAGES as unknown as [string, ...string[]]).optional(),
  consentBasis: z.enum(CONSENT_BASES as unknown as [string, ...string[]]),
  consentNote: z.string().optional(),
  nextFollowUpAt: z.string().optional(),
  lastContactAt: z.string().optional(),
  notes: z.string().optional(),
  mergeOnDedupe: z.boolean().optional(),
});

export async function GET() {
  const authError = await requireOwnerApiSession();
  if (authError) return authError;

  const ctx = getActiveWorkspaceContext();
  const leads = listSalesLeads(ctx.workspace.id);

  return NextResponse.json({
    leads,
    count: leads.length,
    persistence: "in_memory",
    note: "Lead bank is process-local. Dump hot leads on day 1; durable store is later.",
  });
}

export async function POST(request: Request) {
  const authError = await requireOwnerApiSession();
  if (authError) return authError;

  const ctx = getActiveWorkspaceContext();
  const body = await request.json().catch(() => null);
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const nowIso = new Date().toISOString();
  const data = parsed.data;
  if (!data.phone?.trim() && !data.email?.trim()) {
    return NextResponse.json(
      { error: "phone or email is required." },
      { status: 400 },
    );
  }

  const result = upsertSalesLead({
    workspaceId: ctx.workspace.id,
    nowIso,
    mergeOnDedupe: data.mergeOnDedupe !== false,
    lead: {
      leadId: data.leadId ?? `lead_${nowIso.replace(/[:.]/g, "")}`,
      fullName: data.fullName,
      phone: data.phone,
      email: data.email,
      source: data.source as (typeof LEAD_SOURCES)[number],
      sourceRef: data.sourceRef,
      interestedStockIds: data.interestedStockIds ?? [],
      interestedModels: data.interestedModels ?? [],
      stage: (data.stage as (typeof LEAD_STAGES)[number] | undefined) ?? "new",
      consentBasis: data.consentBasis as (typeof CONSENT_BASES)[number],
      consentNote: data.consentNote,
      nextFollowUpAt: data.nextFollowUpAt ?? nowIso,
      lastContactAt: data.lastContactAt,
      notes: data.notes ?? "",
      createdByUserId: ctx.userId,
    },
  });

  if (!result.ok) {
    return NextResponse.json({ error: "Upsert failed.", errors: result.errors }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    lead: result.lead,
    created: result.created,
    mergedFromLeadId: result.mergedFromLeadId,
    persistence: "in_memory",
  });
}
