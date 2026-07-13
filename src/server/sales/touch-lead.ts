// Touch a lead after operator contact — stage + follow-up scheduling.

import type { LeadStage, SalesLead } from "@/features/sales/sales-lead";
import { getSalesLead, upsertSalesLead } from "@/server/sales/lead-bank-store";

export type TouchLeadInput = {
  workspaceId: string;
  leadId: string;
  stage?: LeadStage;
  lastContactAt?: string;
  nextFollowUpAt?: string | null;
  notesAppend?: string;
  createdByUserId: string;
  nowIso?: string;
};

export type TouchLeadResult =
  | { ok: true; lead: SalesLead }
  | { ok: false; errors: string[] };

export function touchSalesLead(input: TouchLeadInput): TouchLeadResult {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const existing = getSalesLead(input.workspaceId, input.leadId);
  if (!existing) {
    return { ok: false, errors: [`lead not found: ${input.leadId}`] };
  }
  if (existing.stage === "sold" || existing.stage === "lost") {
    return { ok: false, errors: [`cannot touch closed lead stage=${existing.stage}`] };
  }

  const result = upsertSalesLead({
    workspaceId: input.workspaceId,
    nowIso,
    mergeOnDedupe: false,
    lead: {
      leadId: existing.leadId,
      fullName: existing.fullName,
      phone: existing.phone,
      email: existing.email,
      source: existing.source,
      sourceRef: existing.sourceRef,
      interestedStockIds: existing.interestedStockIds,
      interestedModels: existing.interestedModels,
      stage: input.stage ?? (existing.stage === "new" ? "contacted" : existing.stage),
      consentBasis: existing.consentBasis,
      consentNote: existing.consentNote,
      lastContactAt: input.lastContactAt ?? nowIso,
      nextFollowUpAt:
        input.nextFollowUpAt === null
          ? null
          : (input.nextFollowUpAt ?? defaultNextFollowUp(nowIso)),
      notes: input.notesAppend
        ? `${existing.notes}\n---\n${input.notesAppend}`.trim()
        : existing.notes,
      createdByUserId: input.createdByUserId,
    },
  });

  if (!result.ok) return result;
  return { ok: true, lead: result.lead };
}

function defaultNextFollowUp(nowIso: string): string {
  const d = new Date(nowIso);
  d.setDate(d.getDate() + 2);
  return d.toISOString();
}
