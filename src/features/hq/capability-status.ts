// src/features/hq/capability-status.ts
//
// HQ Capability Status — the honest, single source of truth for what is
// ACTUALLY active vs dormant across the HQ (coherence audit P4a). It exists so
// no surface presents a dormant capability as if it were live, and so
// activating a dormant capability later is a deliberate, tracked decision.
// Pure data + pure helpers — no I/O.
//
// Status taxonomy:
//   - "live":          wired, persisted, affects the running product.
//   - "display_only":  computed and surfaced for the human, but not persisted
//                      and not driving an autonomous loop.
//   - "shadow":        code runs behind a flag / in shadow, no product effect.
//   - "contract_only": pure contract/logic exists, not surfaced or wired.
//   - "planned":       declared intent, little/no code yet (often mandate-gated).
//
// Each entry cites the evidence (file/flag) that grounds its status, so the
// claim is auditable. capability-status.test.mjs ties the ledger hash-chain
// entry to the real write flag, so this registry cannot drift from reality
// silently.

export type CapabilityStatus =
  | "live"
  | "display_only"
  | "shadow"
  | "contract_only"
  | "planned";

export type CapabilityRecord = {
  id: string;
  label: string;
  status: CapabilityStatus;
  /** Where it shows in the product, or null when it has no surface yet. */
  surface: string | null;
  /** Grounding: the file/flag that proves this status. */
  evidence: string;
  /** One honest line on maturity / what is missing for the next step. */
  note: string;
};

export const HQ_CAPABILITIES: readonly CapabilityRecord[] = [
  {
    id: "workflow_run_board",
    label: "Workflow run board",
    status: "live",
    surface: "/hq/workflows",
    evidence:
      "src/features/workflows/workflow-run-projection.ts (projectRunsFromLedger, real ledger)",
    note: "Dérivé du ledger réel ; fallback seed quand le ledger est vide.",
  },
  {
    id: "agent_charters",
    label: "Agent charters / DNA",
    status: "live",
    surface: "/hq/agents",
    evidence: "src/features/agents/agent-charter.ts (+ charter-seed.ts) — pilote /hq/agents",
    note: "Chartes + run-health pilotent la page agents.",
  },
  {
    id: "mission_execution_boundary",
    label: "Mission execution boundary",
    status: "live",
    surface: null,
    evidence:
      "src/server/missions/approval-derivation.ts + execution-attempt-store.ts (no-exec-without-approval)",
    note: "Garde-fou actif : aucune exécution sans MissionApprovalRecord vérifié.",
  },
  {
    id: "agent_council",
    label: "Agent council (délibération)",
    status: "live",
    surface: "/hq/ventures/cash-actions",
    evidence:
      "agent-council-run-contract.ts via venture-council-cash-run-composer.ts ; run durable (runId/status/verdict) persisté sur prepared_actions (PreparedActionCouncilSummary, P4b)",
    note: "Run durable persisté via la file prepared-actions (identité + statut + verdict) ; turns recomposés déterministe ; loop autonome reste futur (P4b+).",
  },
  {
    id: "memory_vault",
    label: "Memory vault (v0.1 fichier)",
    status: "live",
    surface: "/hq/memory",
    evidence: "memory/ + src/server/memory/learning-loop-service.ts — câblé à /hq/memory",
    note: "v0.1 fichier ; la persistance Supabase/pgvector est verrouillée (voir memory_vault_supabase).",
  },
  {
    id: "memory_vault_supabase",
    label: "Memory vault — runtime Supabase/pgvector",
    status: "planned",
    surface: null,
    evidence: "docs/MEMORY_VAULT_CONTRACT.md (verrouillé jusqu'à mandat CEO)",
    note: "Ingestion automatique + pgvector restent futurs jusqu'à mandat explicite.",
  },
  {
    id: "cost_ladder",
    label: "Cost Ladder (routage token-smart)",
    status: "display_only",
    surface: null,
    evidence:
      "src/server/ai/cost-ladder.ts + intégration model-router.ts (chooseModel taskClass) ; config/openrouter.free-models.json (free-first, enabled+recommended)",
    note: "Décide l'étage de coût (free-first sous plancher de qualité + garde-budget agent/jour) et le journalise (événement cost). L'économie réelle attend le dispatch provider live (non câblé) ; client_audit reste premium obligatoire.",
  },
  {
    id: "ledger_hash_chain",
    label: "Ledger integrity hash-chain",
    status: "shadow",
    surface: null,
    evidence:
      "src/server/ledger/hash-chain-write-flag.ts (LEDGER_HASH_CHAIN_WRITE off par défaut)",
    note: "Vérificateur + sealer prêts ; écriture live mandate-gated (migration Phase 1 + LEDGER_HMAC_KEY).",
  },
  {
    id: "sales_lead_bank",
    label: "Sales lead bank + morning queue",
    status: "shadow",
    surface: "/hq/sales",
    evidence:
      "src/app/hq/sales/page.tsx + lead-bank-store.ts + morning-queue + follow-up prepare (in-memory, prepare-only)",
    note: "Sales Desk UI + banque process-locale. Pas d'auto-send. Persistance durable = mandat futur.",
  },
  {
    id: "marketplace_listing_prepare",
    label: "Marketplace listing prepare → lead capture",
    status: "shadow",
    surface: "/hq/sales",
    evidence:
      "src/features/sales/components/sales-desk-client.tsx + prepare-listing.ts + capture-lead.ts",
    note: "Prépare fiches FB Marketplace depuis stock ; capture inbound → lead bank. Pas d'auto-post.",
  },
  {
    id: "dealership_inventory_snapshot",
    label: "Dealership inventory snapshot (manual ingest)",
    status: "shadow",
    surface: "/hq/sales",
    evidence: "src/server/inventory/inventory-ingest.ts + public-inventory-sync.ts (allowlist buckinghamgm.com)",
    note: "Ingest manuel + sync HTML public allowlist. Persistance in-memory ; pas de DMS/CRM.",
  },
  {
    id: "joris_marketplace_listing_prepare",
    label: "Marketplace listing via Joris",
    status: "shadow",
    surface: "/api/joris/chat",
    evidence: "src/server/joris/marketplace-listing-intent.ts (intent marketplace.listing.prepare)",
    note: "Chat prepare-only : sync inventaire + fiche stock #. Pas d'auto-post Facebook.",
  },
  {
    id: "social_publisher_agent",
    label: "Publisher agent (Page FB auto + file Marketplace)",
    status: "shadow",
    surface: "/hq/sales",
    evidence:
      "src/server/marketing/publish-service.ts + facebook-page-publisher.ts (Graph API officielle ; simulé sans token)",
    note: "Auto-publication Page FB via API Meta quand FACEBOOK_PAGE_ID/TOKEN configurés ; Marketplace reste clic humain (pas d'API Meta). In-memory.",
  },
  {
    id: "marketing_director",
    label: "Directeur marketing (packs contenu + calendrier)",
    status: "shadow",
    surface: "/hq/sales",
    evidence:
      "src/features/marketing/content-pack.ts + content-calendar.ts (génération déterministe, model knowledge)",
    note: "Post FB, description Marketplace, pub, scripts Reel/YouTube + plan 7 jours. Génération locale sans clé AI.",
  },
];

const STATUS_LABELS: Record<CapabilityStatus, string> = {
  live: "Actif",
  display_only: "Affichage seul",
  shadow: "Shadow",
  contract_only: "Contrat seul",
  planned: "Planifié",
};

/** Display label for a capability status. */
export function capabilityStatusLabel(status: CapabilityStatus): string {
  return STATUS_LABELS[status];
}

/** Single capability by id, or null. */
export function getCapability(id: string): CapabilityRecord | null {
  return HQ_CAPABILITIES.find((capability) => capability.id === id) ?? null;
}

/** All capabilities in a given status. */
export function capabilitiesByStatus(status: CapabilityStatus): CapabilityRecord[] {
  return HQ_CAPABILITIES.filter((capability) => capability.status === status);
}

/** Count of capabilities per status (all five keys always present). */
export function capabilityStatusCounts(): Record<CapabilityStatus, number> {
  const counts: Record<CapabilityStatus, number> = {
    live: 0,
    display_only: 0,
    shadow: 0,
    contract_only: 0,
    planned: 0,
  };
  for (const capability of HQ_CAPABILITIES) counts[capability.status] += 1;
  return counts;
}
