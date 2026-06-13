# Revue — Workflows live board + KPIs sur observations (2026-06-12)

Continuation de la requête « Upgrade des workflows » (moteur de runs, vue live
multi-agents `/hq/workflows`, KPIs branchés sur observations réelles).

## 0. Incident de départ (transparence)

Au démarrage, le working tree contenait 4 fichiers **corrompus** par les crashs
de la session précédente (socket fermée, modèle `claude-fable-5` inexistant) :
`package.json` (JSON invalide), `agent-charter.ts`, `app/hq/agents/page.tsx`,
`docs/DECISION_LOG.md` — tous tronqués en plein token. Restaurés vers le dernier
commit propre `c8f352c` (les bonnes versions y étaient intactes). Base repartie
saine avant tout build.

> Note environnement : l'écriture via l'outil d'édition sur ce mount Windows a
> tronqué une fois `cockpit-shell.tsx` (même symptôme). Réparé via restauration
> HEAD + ré-édition Python. Tous les fichiers livrés sont vérifiés intacts
> (typecheck propre, fins de fichier correctes).

## 1. Ce qui a été construit (additif, zéro modif du modèle existant)

Nouveau module pur `src/features/workflows/` posé PAR-DESSUS le modèle de chartes
(`agent-charter.ts` non touché). Les 24 workflows réels se projettent en 5 étapes
observables (Déclencheur → Intrants → Production → Validation → Action suivante),
ancrées sur le texte réel de chaque charte — rien d'inventé.

- **Moteur de runs** : contrat + dérivation d'étapes (`workflow-run.ts`),
  event-sourcing pur + store mémoire (`workflow-run-events.ts`).
- **Live board** : projection swimlanes par agent, chaque run en ligne d'étapes
  (`workflow-live-board.ts`).
- **KPIs ↔ observations** : parseur de cibles + agrégation + verdict
  (`kpi-observations.ts`) avec bindings **explicites et documentés**
  (`kpi-observation-bindings.ts`) — 4 KPIs branchés, le reste affiché
  honnêtement « binding à définir » / « en attente d'observations ».
- **Vue** : route `/hq/workflows` (`app/hq/workflows/page.tsx`) + panneaux
  (`components/workflow-board-panel.tsx`, `components/kpi-observation-panel.tsx`),
  entrée de nav ajoutée dans `cockpit-shell.tsx`.
- **Données de démo** déterministes (`workflow-run-seed.ts`) clairement
  étiquetées « aucune exécution live » pour que la page rende la structure réelle.

## 2. Fichiers

Modifié (1) :
- `src/features/cockpit/components/cockpit-shell.tsx` (entrée nav « Workflows »)

Nouveaux (14) :
- `src/app/hq/workflows/page.tsx`
- `src/features/workflows/workflow-run.ts`
- `src/features/workflows/workflow-run-events.ts`  (+ `.test.mjs`)
- `src/features/workflows/workflow-live-board.ts`  (+ `.test.mjs`)
- `src/features/workflows/kpi-observations.ts`  (+ `.test.mjs`)
- `src/features/workflows/kpi-observation-bindings.ts`
- `src/features/workflows/workflow-run-seed.ts`
- `src/features/workflows/workflows-page-data.ts`  (+ `.test.mjs`)
- `src/features/workflows/components/workflow-board-panel.tsx`
- `src/features/workflows/components/kpi-observation-panel.tsx`

## 3. Validation

| Gate | Résultat |
|---|---|
| `tsc --noEmit` (projet entier) | ✅ propre (exit 0) |
| Tests workflows (4 suites) | ✅ 32/32 |
| Tests adjacents (charte, lessons) | ✅ 23/23 |
| Total exécuté | ✅ 55/55 |
| `eslint` | ⏳ à lancer sur Windows (démarrage à froid > limite sandbox) |
| `next build` | ⏳ à lancer sur Windows (binaire SWC linux absent du sandbox) |

Commandes de revue (Windows PowerShell) :
```
Set-Location "C:\Users\micha\Dev\Oria.HQ"
npm run typecheck
node --test src/features/workflows/*.test.mjs
npm run lint
npm run build
```

## 4. Garde-fous respectés

Aucune DB, migration, env/secret, service-role, dispatch runtime, exécutor live,
endpoint public. Pure data + fonctions pures, déterministes, `noExecutionAuthorized`
préservé. Aucun push, aucun commit, aucune PR, aucun merge effectué.

> Le `.git/index.lock` (résidu du crash) ne peut pas être retiré depuis le
> sandbox Linux (restriction mount). Les commits doivent se faire côté Windows.

## 5. Commit recommandé (à faire par Michael, Windows)

```
git checkout -b feat/workflows-live-board
git add src/features/workflows src/app/hq/workflows src/features/cockpit/components/cockpit-shell.tsx
git commit -m "feat(workflows): live multi-agent run board + KPI-on-observations wiring"
```
Un seul commit focalisé. Ne pas pousser avant ta revue.

## 6. Risques

| Risque | Sévérité | Recommandation |
|---|---|---|
| Board en données de démo (pas de runs live) | Faible | Étiqueté explicitement ; câbler un vrai émetteur d'événements de run aux missions quand prêt |
| Bindings KPI = proxys (4/21) | Faible | Notes documentées par binding ; étendre `kpi-observation-bindings.ts` au besoin |
| Lint/build non lancés en sandbox | Faible | Lancer les 2 sur Windows avant push |
| Mount tronque parfois les écritures | Moyen | Fichiers livrés vérifiés ; refaire un `git diff` avant commit |

## 7. Prochaine action humaine

Revue → `npm run lint` + `npm run build` sur Windows → commit sur branche
`feat/workflows-live-board` → push/PR à ta discrétion. Aucun push fait.

---

# Round 2 — Auto-audit + montée en qualité (2026-06-12)

Suite à « va auditer ton travail, tu peux faire mieux ». Faiblesses trouvées et corrigées :

1. **Board démo → réel.** Nouveau `workflow-run-projection.ts` : projection
   read-only de l'`action_ledger` (decision→action→result par mission) en runs
   réels. La page lit le vrai ledger ; le seed démo devient un **fallback
   étiqueté** quand il n'y a pas d'activité. (`selectWorkflowsModel`)
2. **« API » livrée.** `GET /api/workflows/board` (owner-gated, read-only)
   renvoie le board — le morceau manquant de « contrat + store + API ».
3. **Vue réellement live.** `workflow-board-live.tsx` (client) poll l'API toutes
   les 15 s et fait avancer les lignes d'étapes sans recharger.
4. **Boucle KPI fermée.** `workflow-run-observations.ts` : un run conclu nourrit
   directement les KPIs (completé = output utile ; échec = souci guardrail).
   `evaluate` raffiné (bande « à risque » sur cibles 100 %). Bindings 4 → 6.

Fichiers ajoutés (round 2) : `workflow-run-projection.ts` (+test),
`workflow-run-observations.ts` (+test), `components/workflow-board-live.tsx`,
`app/api/workflows/board/route.ts`. Modifiés : `workflow-run.ts`,
`workflow-live-board.ts`, `kpi-observations.ts`, `kpi-observation-bindings.ts`,
`workflows-page-data.ts` (+test), `app/hq/workflows/page.tsx`.

Validation round 2 : `tsc --noEmit` propre (projet entier), **45/45** tests
workflows (6 suites). Lint + `next build` : toujours côté Windows.

Commit recommandé (mise à jour) :
```
git checkout -b feat/workflows-live-board
git add src/features/workflows src/app/hq/workflows src/app/api/workflows src/features/cockpit/components/cockpit-shell.tsx docs/review
git commit -m "feat(workflows): real ledger run board + KPI loop + live API"
```

Garde-fous : aucune écriture, aucune migration, aucun dispatch runtime, aucun
executor — uniquement lecture du ledger existant + projection pure. Aucun push.

---

# Round 3 — Santé HQ réelle (2026-06-12)

Amélioration « A » (ROI max retenu) : les runs réels conclus nourrissent
désormais le **scorecard agent existant** (`/hq/agents` « Qualité
opérationnelle »), pas seulement la nouvelle page. La santé moyenne du HQ
reflète l'activité réelle au lieu de rester sur le baseline blueprint.

- Pont pur `agent-quality-from-runs.ts` : `buildAgentObservationsFromRuns`
  réutilise la même dérivation runs→observations + agrégation (zéro divergence
  avec le rapport KPI).
- `/hq/agents/page.tsx` : lit le ledger (read-only, try/catch → fallback vide),
  projette les runs, passe les observations à `buildAgentQualityEvaluation`.
- `buildAgentQualityEvaluation` lui-même **non modifié** — son test existant
  reste vert. Intégration prouvée : un agent passe en mode « observed » sur de
  vrais runs sans baisser son score.

Fichiers : `agent-quality-from-runs.ts` (+test) ; modifié `app/hq/agents/page.tsx`.
Validation : `tsc` propre, **54** tests (workflows + quality-eval). Lint + build
côté Windows. Ajouter `src/app/hq/agents` à la liste de `git add` du commit.
