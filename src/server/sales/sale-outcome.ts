// src/server/sales/sale-outcome.ts
//
// Capture sold | lost on a lead. Enforces soldStockId / lostReason.

import type { SalesLead } from "@/features/sales/sales-lead";
import { getSalesLead, upsertSalesLead } from "./lead-bank-store";

export type SaleOutcomeInput = {
  workspaceId: string;
  leadId: string;
  outcome: "sold" | "lost";
  soldStockId?: string;
  lostReason?: string;
  notes?: string;
  nowIso?: string;
};

export type SaleOutcomeResult =
  | { ok: true; lead: SalesLead }
  | { ok: false; errors: string[] };

export function captureSaleOutcome(input: SaleOutcomeInput): SaleOutcomeResult {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const existing = getSalesLead(input.workspaceId, input.leadId);
  if (!existing) return { ok: false, errors: [`lead not found: ${input.leadId}`] };

  if (input.outcome === "sold") {
    if (!input.soldStockId?.trim()) {
      return { ok: false, errors: ["sold requires soldStockId"] };
    }
    return upsertSalesLead({
      workspaceId: input.workspaceId,
      nowIso,
      lead: {
        ...existing,
        stage: "sold",
        soldStockId: input.soldStockId.trim(),
        soldAt: nowIso,
        lostReason: undefined,
        nextFollowUpAt: undefined,
        notes: input.notes?.trim()
          ? `${existing.notes}\n[sold] ${input.notes.trim()}`.trim()
          : existing.notes,
      },
    });
  }

  if (!input.lostReason?.trim()) {
    return { ok: false, errors: ["lost requires lostReason"] };
  }
  return upsertSalesLead({
    workspaceId: input.workspaceId,
    nowIso,
    lead: {
      ...existing,
      stage: "lost",
      lostReason: input.lostReason.trim(),
      soldStockId: undefined,
      soldAt: undefined,
      nextFollowUpAt: undefined,
      notes: input.notes?.trim()
        ? `${existing.notes}\n[lost] ${input.notes.trim()}`.trim()
        : existing.notes,
    },
  });
}
