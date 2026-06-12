# Compound Learning Loop — Arena → Vault → Agents

> **Status:** v0.1 implemented · 2026-06-12
> **Code:** `src/server/memory/agent-learning-loop.ts` (pure) · `learning-loop-service.ts` (wiring)
> **UI:** widget « Boucle d'apprentissage » on `/hq/memory`

## Le problème

La ROI Arena évalue des candidats et produit des verdicts riches (score,
`roiMultiple`, `netValueCents`, raisons, garde-fous) — puis ces verdicts
meurent dans un store in-memory TTL. Les agents répètent leurs erreurs ;
chaque évaluation est un coût, jamais un actif.

## La boucle

```
Arena verdicts ──► signaux ──► résumés ROI par agent (leaderboard)
                       │
                       └────► leçons PROPOSÉES ──► approbation CEO ──► memory/notes/*.md
                                                        │
                                          (vérifiée) ───┴──► contexte agent (Joris)
```

1. **Signaux** — `adaptStoredVerdict` aplatit chaque verdict stocké (+
   métadonnées candidat quand disponibles : `agentId`, `skillId`).
2. **Résumés ROI** — `buildAgentRoiSummaries` : par agent, win rate, score
   moyen, valeur nette cumulée, meilleur ROI. Tri = leaderboard.
3. **Leçons** — `deriveLessonProposals` détecte les patterns répétés
   (seuil `MIN_PATTERN_OCCURRENCES = 2`) :
   - `failure-pattern` — même raison de rejet répétée ;
   - `guard-pattern` — même garde-fou déclenché plusieurs fois ;
   - `winning-pattern` — agent avec ≥ 2 verdicts promising à ROI ≥ `WINNING_ROI_THRESHOLD = 2`.
4. **Dédup** — une leçon déjà dans la vault (id ou titre normalisé) n'est
   jamais re-proposée.
5. **Approbation** — `serializeLessonProposalMarkdown` produit le fichier
   vault prêt (`status: proposed`). **Rien n'est écrit automatiquement** :
   l'écriture dans `memory/notes/` est un geste CEO (ou une action approuvée).

## Gouvernance (invariants)

- Les leçons sont **proposées**, jamais auto-vérifiées — le contrat
  `docs/MEMORY_VAULT_CONTRACT.md` tient : entrée agent ⇒ approbation CEO
  avant `verified` ⇒ seul `verified` atteint le contexte de Joris.
- Le service est **read-only** : aucune écriture vault, aucune action,
  aucun appel externe, zéro LLM.
- La boucle ne touche pas à l'exécution — elle apprend de ce que le ledger
  et l'Arena ont déjà jugé.

## Pourquoi c'est le différenciateur

Les OS d'agents concurrents loggent ou évaluent. Aucun ne ferme la boucle
**sous gouvernance** : verdict → leçon auditable (chainline : source → note →
décision → action → ledger → PR → next) → contexte agent. Chaque dollar
dépensé en évaluation devient un actif composé ; le ROI des agents monte
mécaniquement parce que les patterns perdants sont éliminés en amont et les
patterns gagnants priorisés.

## Limites v0.1 / prochaines marches

- Le store Arena est in-memory : les signaux vivent le temps du processus.
  La persistance des verdicts (P2) rendra la boucle durable.
- L'attribution `agentId` dépend des métadonnées candidat — les verdicts
  seuls groupent sous « non-attribué ». Joindre candidat + verdict au
  stockage est la prochaine petite PR.
- L'injection des leçons vérifiées dans le contexte Joris reste à câbler
  (chemin déjà contractualisé).
