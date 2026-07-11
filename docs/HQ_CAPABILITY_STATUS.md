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

## Registre actuel

Source exécutable : `src/features/hq/capability-status.ts` (ne pas dupliquer à la main
sans re-sync). Entrées autonomy Yellow 1–3 (à jour avec le code) :

| Capacité | Statut | Surface | Preuve |
|----------|--------|---------|--------|
| Workflow run board | **live** | `/hq/workflows` | `workflow-run-projection.ts` (ledger réel) |
| Agent charters / DNA | **live** | `/hq/agents` | `agent-charter.ts` (+ charter-seed) |
| Mission execution boundary | **live** | — | `approval-derivation.ts` + `execution-attempt-store.ts` |
| Agent council (délibération) | **live** | `/hq/ventures/cash-actions` | run durable persisté sur `prepared_actions` |
| Memory vault (v0.1 fichier) | **live** | `/hq/memory` | `memory/` + `learning-loop-service.ts` |
| Memory vault — Supabase/pgvector | **planned** | — | `MEMORY_VAULT_CONTRACT.md` (verrouillé) |
| Cost Ladder | **display_only** | — | `cost-ladder.ts` + model-router |
| Ledger integrity hash-chain | **shadow** | — | `hash-chain-write-flag.ts` (flag off) |
| Subscription CLI probe | **live** | `/hq` Command Tower | `local-runtime-probe.ts` |
| Subscription CLI dispatch | **shadow** | `/api/runtimes/local/dry-run` | dry-run only, `enablesDispatch=false` |
| Nous Hermes Agent adapter | **planned** | — | `AUTONOMY_COCKPIT_BRIEF.md` |
| Marketplace catalog browse | **shadow** | `/api/marketplace/catalog` | static seed + MCP browse |
| Studio marketing autonomy | **shadow** | `/api/studio/prep-tick` | prepare-only, in-memory |

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
