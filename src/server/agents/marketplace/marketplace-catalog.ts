// src/server/agents/marketplace/marketplace-catalog.ts
//
// Static, file-backed marketplace catalog for dry-run browse.
//
// No network, no OAuth, no vendor SDK. Entries are illustrative of the
// Tool Universe corridor (Zapier-class / Hermes-skills-class) so Studio and
// agents can browse without claiming a live connector.
//
// Enable / install / execute remain CEO-gated (marketplace-provider-contract).

import type { MarketplaceCatalogEntry } from "@/server/agents/providers/marketplace-provider-contract";

export type MarketplaceCatalogSource = "static_seed";

export type MarketplaceCatalogSnapshot = {
  source: MarketplaceCatalogSource;
  /** Literal: this catalog never executes. */
  browseIsReadOnly: true;
  /** Literal: no live OAuth session is attached. */
  liveOAuthAttached: false;
  generatedAtIso: string;
  entries: readonly MarketplaceCatalogEntry[];
};

/** Seed catalog — honest placeholders, not live Zapier/Hermes API results. */
export const MARKETPLACE_CATALOG_SEED: readonly MarketplaceCatalogEntry[] = [
  {
    toolId: "calendar.read_events",
    label: "Calendar — read events (read-only)",
    trustLevel: "reviewed",
    mutatesExternalState: false,
    canSpend: false,
  },
  {
    toolId: "crm.lookup_contact",
    label: "CRM — lookup contact",
    trustLevel: "reviewed",
    mutatesExternalState: false,
    canSpend: false,
  },
  {
    toolId: "email.draft_reply",
    label: "Email — draft reply (prepare-only)",
    trustLevel: "official",
    mutatesExternalState: false,
    canSpend: false,
  },
  {
    toolId: "email.send",
    label: "Email — send (CEO Send Desk)",
    trustLevel: "official",
    mutatesExternalState: true,
    canSpend: false,
  },
  {
    toolId: "ads.campaign_metrics",
    label: "Ads — campaign metrics (read-only)",
    trustLevel: "community",
    mutatesExternalState: false,
    canSpend: false,
  },
  {
    toolId: "ads.publish_spend",
    label: "Ads — publish / spend",
    trustLevel: "quarantine",
    mutatesExternalState: true,
    canSpend: true,
  },
  {
    toolId: "skills.hub.browse",
    label: "Skills hub — browse published skills",
    trustLevel: "reviewed",
    mutatesExternalState: false,
    canSpend: false,
  },
  {
    toolId: "n8n.webhook_dispatch",
    label: "n8n — webhook dispatch (approved binding)",
    trustLevel: "official",
    mutatesExternalState: true,
    canSpend: false,
  },
];

export type BrowseMarketplaceCatalogInput = {
  /** Optional substring filter on toolId or label (case-insensitive). */
  query?: string;
  /** When true, exclude tools that can spend. Default true for Studio safety. */
  excludeSpend?: boolean;
  /** When true, exclude tools that mutate external state. */
  readOnlyOnly?: boolean;
  nowIso?: string;
};

/**
 * Browse the static marketplace catalog. Pure: no I/O, no network.
 */
export function browseMarketplaceCatalog(
  input: BrowseMarketplaceCatalogInput = {},
): MarketplaceCatalogSnapshot {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const excludeSpend = input.excludeSpend !== false;
  const readOnlyOnly = input.readOnlyOnly === true;
  const query = typeof input.query === "string" ? input.query.trim().toLowerCase() : "";

  let entries = [...MARKETPLACE_CATALOG_SEED];

  if (excludeSpend) {
    entries = entries.filter((e) => !e.canSpend);
  }
  if (readOnlyOnly) {
    entries = entries.filter((e) => !e.mutatesExternalState);
  }
  if (query) {
    entries = entries.filter(
      (e) => e.toolId.toLowerCase().includes(query) || e.label.toLowerCase().includes(query),
    );
  }

  return {
    source: "static_seed",
    browseIsReadOnly: true,
    liveOAuthAttached: false,
    generatedAtIso: nowIso,
    entries,
  };
}
