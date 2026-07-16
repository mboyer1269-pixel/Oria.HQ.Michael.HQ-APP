# HQ Capability Status — qu'est-ce qui est réellement actif

> Résout (en partie) l'incohérence P4 de `docs/HQ_COHERENCE_AUDIT.md` :
> empêcher HQ de présenter une capacité **dormante** comme **vivante**. Source de
> vérité exécutable : `src/features/hq/capability-status.ts`. Tenir ce registre
> à jour est la condition pour **activer délibérément** une capacité dormante.

## Taxonomie de statut

| Statut | Sens |
|--------|------|
| `live` | câblé, persisté, agit sur le produit |
| `display_only` | calculé et affiché pour l'humain, mais non persisté, sans loop autonome |
| `shadow` | tourne derrière un flag / en shadow, sans effet produit |
| `contract_only` | contrat/logique pur existe, ni affiché ni câblé |
| `planned` | intention déclarée, peu/pas de code (souvent mandate-gated) |

## Registre actuel (2026-06-13)

| Capacité | Statut | Surface | Preuve |
|----------|--------|---------|--------|
| Workflow run board | **live** | `/hq/workflows` | `workflow-run-projection.ts` (ledger réel) |
| Agent charters / DNA | **live** | `/hq/agents` | `agent-charter.ts` (+ charter-seed) |
| Mission execution boundary | **live** | — | `approval-derivation.ts` + `execution-attempt-store.ts` |
| Agent council (délibération) | **live** | `/hq/ventures/cash-actions` | run durable (runId/status/verdict) persisté sur `prepared_actions` (P4b) |
| Memory vault (v0.1 fichier) | **live** | `/hq/memory` | `memory/` + `learning-loop-service.ts` |
| Memory vault — Supabase/pgvector | **planned** | — | `MEMORY_VAULT_CONTRACT.md` (verrouillé) |
| Ledger integrity hash-chain | **shadow** | — | `hash-chain-write-flag.ts` (flag off) |
| Sales lead bank + morning queue | **shadow** | `/hq/sales` + `/api/sales/leads` | Sales Desk UI + in-memory APIs |
| Marketplace listing → lead capture | **shadow** | `/hq/sales` + `/api/marketplace/listings` | prepare + capture (manual publish) |
| Dealership inventory snapshot | **shadow** | `/hq/sales` + `/api/inventory/sync` | Sync site + manual JSON |
| Livre de RDV (appointment book) | **shadow** | `/hq/sales` + `/api/sales/appointments` | schedule + SMS prepare-only |
| Marketing + prospection pack | **shadow** | `/hq/sales` + content-pack API | FB / Marketplace / SMS / Reel prepare-only |
| Marketplace listing via Joris | **shadow** | chat intent `marketplace.listing.prepare` | prepare-only fiche from stock # |

## Comment ce registre reste honnête

- **Preuve obligatoire** : chaque entrée cite le fichier/flag qui fonde son statut.
- **Garde-fou auto-vérifié** : `capability-status.test.mjs` relie l'entrée
  `ledger_hash_chain` au vrai flag `isHashChainWriteEnabled`. Passer le flag à
  `on` sans repasser le registre à `live` **casse le test**. Le registre ne peut
  pas dériver de la réalité en silence.

## Ce que ça débloque (suite)

- **P4b ✅ (2026-06-13)** : run council durable (runId/status/verdict) persisté
  sur `prepared_actions` (colonne jsonb `council`, **sans migration**) + badge
  phase (P2) sur `/hq/ventures/cash-actions` → council passé `display_only` →
  `live`. Reste : loop autonome (run dédié + reprise) = P4b+.
- **Activation hash-chain** : mandate-gated (migration Phase 1 + `LEDGER_HMAC_KEY`),
  puis passer l'entrée à `live` — le test l'exigera.
- *(optionnel)* une petite tuile read-only sur une page HQ qui lit ce registre,
  pour rendre la posture visible au CEO.
