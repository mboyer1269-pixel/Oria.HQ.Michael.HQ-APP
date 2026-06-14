# HQ Run Glossary — couches « run » & statuts

> Résout l'incohérence P2 de `docs/HQ_COHERENCE_AUDIT.md` : le mot « run » porte
> plusieurs sens et les enums de statut ont dérivé. Ce glossaire nomme chaque
> couche et **aligne les statuts par une phase canonique commune — sans renommer
> aucun token** (plusieurs sont persistés, voir plus bas). La source de vérité
> exécutable est `src/features/workflows/run-lifecycle-phase.ts`.

## Les couches (ne plus confondre)

| Couche | Sens | Type / fichier |
|--------|------|----------------|
| **Mission** | l'unité de travail gouvernée | `MissionStatus` (`src/core/types.ts`) + ligne DB (`src/server/db/types.ts`) |
| **Définition** de workflow | ce qu'un workflow *devrait faire* | `AgentWorkflowDef` (`src/features/agents/agent-charter.ts`) |
| **Run-exécution** | ce qui *a été fait*, dérivé du ledger | `WorkflowRun` / `WorkflowRunStatus` (`src/features/workflows/workflow-run.ts`) |
| **Run-délibération** | ce qu'on *en pense* (proposal-only) | `AgentCouncilRun` / `AgentCouncilRunStatus` (`src/server/agents/agent-council-run-contract.ts`) |

## Les vocabulaires de statut, côte à côte

| Couche | Type | Valeurs |
|--------|------|---------|
| Mission | `MissionStatus` | draft · queued · running · needs_approval · completed · failed · cancelled |
| Run-exécution | `WorkflowRunStatus` | queued · running · completed · failed · blocked |
| Étape (step) | `WorkflowStepStatus` | pending · active · done · failed · skipped |
| Run-délibération | `AgentCouncilRunStatus` | draft · running · waiting_for_agent · ready_for_ceo · blocked · completed · failed |
| Tour (turn) | `AgentCouncilTurnStatus` | pending · completed · failed · skipped |

## La phase canonique (l'alignement, pas un renommage)

Chaque valeur ci-dessus mappe sur **une** phase parmi sept :

`not_started · in_progress · waiting · blocked · done · failed · cancelled`

| Phase | Libellé | Reçoit (par couche) |
|-------|---------|---------------------|
| `not_started` | Pas démarré | mission `draft`/`queued` · run `queued` · council `draft` · step/turn `pending` |
| `in_progress` | En cours | mission/run/council `running` · step `active` |
| `waiting` | En attente | mission `needs_approval` · council `waiting_for_agent`/`ready_for_ceo` |
| `blocked` | Bloqué | run `blocked` · council `blocked` |
| `done` | Terminé | mission/run/council `completed` · step `done` |
| `failed` | Échec | `failed` (toutes couches) |
| `cancelled` | Annulé | mission `cancelled` · step/turn `skipped` |

Équivalences clés that the audit pointait :
- **`queued` ≡ `draft` ≡ `pending`** = `not_started` (« pas démarré »).
- **`done` ≡ `completed`** = `done` (« résolu avec succès »).
- **`skipped` → `cancelled`** : terminal, travail volontairement non fait — ni succès, ni échec.

## Pourquoi une phase, et pas un renommage

`MissionStatus` et le statut de ligne DB (`src/server/db/types.ts`) sont
**persistés**. Renommer `queued`→`draft` (etc.) casserait des données et des
contrats. La phase canonique vit donc **au-dessus**, à la couche
affichage/dérivation : elle ne modifie aucun token stocké ni aucun contrat.

## Garanties

- **Exhaustivité au typecheck** : chaque mapping est `Record<EnumUnion,
  RunLifecyclePhase>` — ajouter une valeur à un enum source sans lui donner de
  phase casse `npm run typecheck`.
- **Contrat runtime** : `src/features/workflows/run-lifecycle-phase.test.mjs`
  épingle les jeux de clés, la fermeture du jeu de phases et les équivalences.

## Hors périmètre (volontaire)

- Aucun renommage d'enum, aucun changement de contrat ou de persistance.
- Aucune fusion council ↔ pipeline d'exécution (c'est P4 « câblage de la
  boucle » dans l'audit).
- Branchement des surfaces UI sur `phaseLabel` = suite P2b, non inclus ici.
