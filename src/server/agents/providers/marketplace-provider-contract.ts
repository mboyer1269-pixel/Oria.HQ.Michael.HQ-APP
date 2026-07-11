// src/server/agents/providers/marketplace-provider-contract.ts
//
// Tool Universe Corridor — Marketplace-CLASS providers (Zapier MCP, Hermes
// Skills Hub, future OAuth catalogs). Pure contract: no network, no SDK, no
// vendor lock-in to a proper noun beyond adapterKind vocabulary.
//
// Inspired by Viktor-style "connect tools, review-first actions" without
// importing Viktor or claiming a live catalog.
//
// RULES:
//   * Catalog browse may be read-only.
//   * Install / enable of a tool is never silent — CEO or explicit mandate.
//   * Execution of a marketplace action ALWAYS goes skillId → Sentinelle →
//     Ledger (same corridor as n8n / mailbox).
//   * Auto-execute requires an active autonomy line; default is prepare-only.
//   * Marketing Studio may draft campaigns; publish/spend stays human-gated.

import type { AdapterProviderDescriptor } from "./adapter-provider-contract.ts";

export type MarketplaceTrustLevel = "official" | "reviewed" | "community" | "quarantine";

export type MarketplaceCatalogEntry = {
  /** Stable id inside the adapter, never a secret. */
  toolId: string;
  label: string;
  trustLevel: MarketplaceTrustLevel;
  /** Whether this tool can mutate external systems. */
  mutatesExternalState: boolean;
  /** Whether spend / ads / money movement is possible. */
  canSpend: boolean;
};

export type MarketplaceProviderContract = {
  descriptor: AdapterProviderDescriptor & { adapterKind: "marketplace_provider" };
  catalog: {
    /** Literal: browse does not execute. */
    browseIsReadOnly: true;
    /** Literal: enabling a tool requires explicit approval. */
    enableRequiresApproval: true;
  };
  execution: {
    /** Literal: no marketplace call outside a skillId corridor. */
    viaSkillIdOnly: true;
    /** Literal: auto-run needs an active autonomy line. */
    autoExecuteRequiresActiveLine: true;
    /** Literal: spend actions always require CEO confirmation. */
    spendRequiresCeoConfirmation: true;
  };
  marketing: {
    /** Studio may prepare; never publish without human gate. */
    studioPreparesOnly: true;
    publishRequiresManualSend: true;
  };
};

export const MARKETPLACE_PROVIDER_INVARIANTS = [
  "browseIsReadOnly",
  "enableRequiresApproval",
  "viaSkillIdOnly",
  "autoExecuteRequiresActiveLine",
  "spendRequiresCeoConfirmation",
  "studioPreparesOnly",
  "publishRequiresManualSend",
] as const;

/** Factory for a fail-closed marketplace contract skeleton. */
export function createMarketplaceProviderContract(
  descriptor: AdapterProviderDescriptor & { adapterKind: "marketplace_provider" },
): MarketplaceProviderContract {
  return {
    descriptor,
    catalog: {
      browseIsReadOnly: true,
      enableRequiresApproval: true,
    },
    execution: {
      viaSkillIdOnly: true,
      autoExecuteRequiresActiveLine: true,
      spendRequiresCeoConfirmation: true,
    },
    marketing: {
      studioPreparesOnly: true,
      publishRequiresManualSend: true,
    },
  };
}
