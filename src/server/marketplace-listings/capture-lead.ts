// src/server/marketplace-listings/capture-lead.ts
//
// Capture an inbound Marketplace reply as a SalesLead.
// Chains packetId → sourceRef so posts reinforce the lead bank.

import type { SalesLead } from "@/features/sales/sales-lead";
import { upsertSalesLead } from "@/server/sales/lead-bank-store";
import { getMarketplaceListing } from "./listing-store";

export type CaptureMarketplaceLeadInput = {
  workspaceId: string;
  /** Marketplace listing packet that generated the inbound. */
  packetId: string;
  fullName: string;
  phone?: string;
  email?: string;
  messageExcerpt?: string;
  leadId?: string;
  createdByUserId: string;
  nowIso?: string;
};

export type CaptureMarketplaceLeadResult =
  | { ok: true; lead: SalesLead; created: boolean; packetStockId: string }
  | { ok: false; errors: string[] };

export function captureMarketplaceLead(
  input: CaptureMarketplaceLeadInput,
): CaptureMarketplaceLeadResult {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const packet = getMarketplaceListing(input.workspaceId, input.packetId);
  if (!packet) {
    return { ok: false, errors: [`listing packet not found: ${input.packetId}`] };
  }
  if (!input.phone?.trim() && !input.email?.trim()) {
    return { ok: false, errors: ["phone or email is required"] };
  }
  if (!input.fullName?.trim()) {
    return { ok: false, errors: ["fullName must be non-empty"] };
  }

  const noteParts = [
    `Inbound Marketplace (packet ${packet.packetId}) — ${packet.title}`,
    input.messageExcerpt?.trim() ? `Message: ${input.messageExcerpt.trim()}` : null,
  ].filter(Boolean);

  const result = upsertSalesLead({
    workspaceId: input.workspaceId,
    nowIso,
    mergeOnDedupe: true,
    lead: {
      leadId: input.leadId ?? `lead_mkt_${nowIso.replace(/[:.]/g, "")}`,
      fullName: input.fullName.trim(),
      phone: input.phone,
      email: input.email,
      source: "marketplace_message",
      sourceRef: packet.packetId,
      interestedStockIds: [packet.stockId],
      interestedModels: [packet.title],
      stage: "new",
      consentBasis: "implied_verified",
      consentNote: "Inbound reply to Marketplace listing (implied interest)",
      nextFollowUpAt: nowIso,
      notes: noteParts.join("\n"),
      createdByUserId: input.createdByUserId,
    },
  });

  if (!result.ok) return result;
  return {
    ok: true,
    lead: result.lead,
    created: result.created,
    packetStockId: packet.stockId,
  };
}
