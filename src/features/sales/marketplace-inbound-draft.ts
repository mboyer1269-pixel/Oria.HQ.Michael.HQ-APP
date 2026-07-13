// Prepare-only first-reply drafts for Marketplace Messenger inbound.
// Converts curiosity into booked test drives — human sends.

import type { MarketplaceListingPacket } from "@/features/marketplace-listings/listing-packet";

export type MarketplaceInboundDraft = {
  draftId: string;
  packetId: string;
  stockId: string;
  body: string;
  followUpIfNoReply: string;
  rationale: string;
  createdAt: string;
  requiresManualSend: true;
  noExecutionAuthorized: true;
};

export function prepareMarketplaceInboundDraft(input: {
  packet: MarketplaceListingPacket;
  repFirstName?: string;
  nowIso: string;
  draftId?: string;
}): MarketplaceInboundDraft {
  const rep = input.repFirstName?.trim() || "votre conseiller";
  const vehicle = input.packet.title;
  const price =
    input.packet.priceCad !== undefined
      ? new Intl.NumberFormat("fr-CA", {
          style: "currency",
          currency: "CAD",
          maximumFractionDigits: 0,
        }).format(input.packet.priceCad)
      : "le prix affiché";

  const body = [
    `Salut! Merci pour ton message concernant le ${vehicle}.`,
    `Je suis ${rep} chez Buckingham Chevrolet Buick GMC (Gatineau).`,
    `Le véhicule est disponible — prix affiché ${price} (+ taxes et frais).`,
    "",
    "Pour planifier un essai, quel jour te convient cette semaine (jour ou soir)?",
    "Et quel numéro puis-je utiliser pour te confirmer le rendez-vous?",
  ].join("\n");

  const followUpIfNoReply = [
    `Re-bonjour! Je voulais m'assurer que tu avais bien reçu mon message pour le ${vehicle}.`,
    "On a encore des créneaux cette semaine à Buckingham GM — tu préfères en semaine ou samedi?",
  ].join(" ");

  return {
    draftId:
      input.draftId ??
      `mid_${input.packet.packetId}_${input.nowIso.replace(/[:.]/g, "")}`,
    packetId: input.packet.packetId,
    stockId: input.packet.stockId,
    body,
    followUpIfNoReply,
    rationale: "First-reply template: qualify + book test drive + capture phone",
    createdAt: input.nowIso,
    requiresManualSend: true,
    noExecutionAuthorized: true,
  };
}
