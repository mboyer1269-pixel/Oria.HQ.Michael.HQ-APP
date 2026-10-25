# Lot A′ — Registre de couverture (état réel au 2026-10-25)

Base lue : `main` = `491a7a9b27106e514cc98ca8e300f9db93cb84ac` (#399). Têtes de PR : voir `RECUPERATION.md`.
Sources : plan de vision (chap. 11, 14, p. 29–31) et audit, via `R4-ALIGNEMENT.md` §7. **Les PDF n'ont pas été relus ligne à ligne ici** : ce qui vient d'eux est marqué **H**.

## Légende

| Marque | Sens |
|---|---|
| **V** | Vérifié aujourd'hui, par lecture du code (fichier:ligne) ou par exécution (commande + résultat). |
| **S** | Supposé : déduit sans preuve d'exécution (ex. pas de base, pas de compte). |
| **H** | Hérité du plan ou de l'audit, pas revérifié. |

Statut : **réel** (chemin de production branché et utilisé) · **simulé** (code réel mais non branché, désactivé, ou sans producteur) · **mock** (données/états déclarés, pas observés).
SHA = empreinte git du fichier (`git rev-parse <commit>:<chemin>`, 7 car.).

## 1. Fichiers et zones clés

| # | Chemin | Dépôt @ commit | SHA fichier | Statut | Marque | Tests | Constats | Décision |
|---|---|---|---|---|---|---|---|---|
| 1 | `src/server/orchestration/paperclip-dispatch.ts` | main | `69d2469` | simulé | V | `paperclip-dispatch.test.mjs` passe | Appelé par `src/app/api/orchestration/missions/dispatch/route.ts`. Ne fait que **lier** une mission : `paperclip-dispatch.ts:95` renvoie `executionRequested: false`. Actif seulement si `serverEnv.paperclipDispatchEnabled`. | conserver |
| 2 | `src/server/orchestration/paperclip-dispatch-store.ts` | main | `ca8d3b6` | simulé | V | indirect (#1) | 39 lignes, utilisé seulement par #1. | conserver |
| 3 | `src/server/missions/openhands-tool-inbox.ts` | main | `7e54b46` | simulé | V / S | `openhands-tool-route.test.mjs` | Utilisé par `api/orchestration/openhands/tools/[launchId]/route.ts`. Parle à un socket fixe `/run/oria-hq-control/<id>/review.sock` (l.15) : rien ne prouve qu'un tel socket existe en prod (**S**). | reconnecter (plus tard, après D′) |
| 4 | `src/server/ai/model-router.ts` | main | `b0bc435` | réel (partiel) | V | `test:model-router` passe | 552 l. Classifieur de difficulté « stub/heuristic for MVP » (l.161). | faire évoluer |
| 5 | `src/features/skills/skill-governance.ts` | main | `7782065` | simulé (orphelin) | V | `test:skill-governance` | **Aucun import hors de son test** (`git grep skill-governance`). Code mort côté produit. | déprécier ou reconnecter (décision boss) |
| 6 | `src/server/memory/memory-graph.ts` | main | `c8c0972` | réel | V | `test:memory-graph` | Utilisé par `app/hq/memory/page.tsx`, `memory-vault-explorer.tsx`, `agent-learning-loop.ts`, `memory-file-vault.ts`. | conserver |
| 7 | `src/server/jobs/inngest-client.ts` | main | `e3fe502` | simulé | V | nouveau test runtime sur #408 (`492e404`) | Client unique `michael-hq`. Voir raccordement R2 : l'événement n'a **aucun producteur**. | conserver |
| 8 | `src/app/api/inngest/route.ts` | main | `363b333` | simulé | V | idem | Enregistre `jorisExecuteJob` + `shadowScoreCron`. Testé sans compte (mode dev) sur #408. | conserver |
| 9 | `src/server/joris/brain.ts` | main | `1e5dba9` | réel | V | nombreux tests | Appelé en direct par `api/joris/chat/route.ts:42` (synchrone). Génère via `joris-reply-generator` (l.27, 300). | faire évoluer |
| 10 | `src/features/agents/seed.ts` | main | `77653f2` | **mock** | V | `test:agent-charter` | Registre statique ; `status: "active"` déclaré pour les agents, **pas observé** (aucune preuve d'exécution). 22 fichiers l'importent. | faire évoluer (statuts observés) |
| 11 | `src/server/ai/subscription-runtime.ts` | #409 @ `6c25d7a` | `79224ce`→ modifié | réel (local seulement) | V (tests) / S (vrai CLI) | 17 tests, dont 3 nouveaux avec vrai processus | Ajout aujourd'hui : UTF-8 (StringDecoder + `LANG/LC_ALL=C.UTF-8`) et **une seule exécution CLI à la fois** (429 `runtime_busy`). Jamais lancé avec un vrai abonnement Codex ici (**S**). | conserver |
| 12 | `src/server/atelier/atelier-mission.ts` | #412 @ `d492174` | `e181f5c` | simulé | V | non relancés | #412 est **empilée sur d'anciens commits** de #409 (`261c8e7`) et #410 (`7b58a4f`), pas sur `e635d74`/`aac608b`. Il contient sa propre `0032` **différente** de celle de #410 (`9dd86d8` ≠ `6919630`). | faire évoluer (rebase en B′) |
| 13 | `src/server/auth/authz-context.ts` | #410 @ `aac608b` | `8c059c4` | réel (code) | V | tests #410 | Exige `email_confirmed_at` (l.8). | conserver |
| 14 | `db/migrations/0032_workspace_members*.sql` | #410 | `6919630` / revert `8001f14` / verify `f8b711a` | **non appliquée** | V (fichier) / S (base) | aucun sur base | En-tête « Prepared only: NOT APPLIED ». Pas de base de test accessible ici → ni appliquée ni vérifiée (interdit de toute façon). | conserver, appliquer sur base de test en B′ |
| 15 | `db/migrations/drafts/employee_profiles*.sql` | #406 @ `83e7b1c` | `150c2fa` (+ verify `7b2f049`, revert `3a9c9d2`) | brouillon | V | — | Brouillons uniquement. #406 apporte aussi une UI (`src/features/employees/…`). Plan : ne garder que la migration. | reconnecter (migration seule) |
| 16 | `src/server/outbound/consent-evidence.ts` | #413 @ `b7b0217` | `2729b16` | réel (code) | H | non relancés | Consentement inconnu ⇒ envoi bloqué (titre de PR). Réaudit Sentinelle demandé par le plan non fait ici. | conserver |
| 17 | `db/migrations/0001`→`0031` | main | 49 fichiers | **inconnu en prod** | V (liste) / S (état base) | — | **Trou : pas de `0026`.** Doublons de numéro : deux `0006`, deux `0008`(+revert/verify), deux `0009`, `0021`. 8 brouillons dans `drafts/`. Quelles migrations sont appliquées en prod : **non vérifié** (pas d'accès base). | documenter, vérifier en B′ |
| 18 | Interface (`src/features/**/*.tsx`, `src/app/**/*.tsx`) | lot-a-prime | `eslint.config.mjs` | réel | V | `src/core/ui-import-boundary.test.mjs` (9 tests) | Nouvelle règle : pas d'import **valeur** de client DB, de moteurs ni de `server-env`. 0 violation sauf **UI-1** : `src/app/hq/missions/page.tsx:19` lit le jeton Paperclip via `serverEnv` (exception limitée, à corriger). Beaucoup de composants serveur importent encore des dépôts métier (`@/server/missions`, `action-ledger-read`…) : permis par la règle, à resserrer plus tard. | faire évoluer |

## 2. Les 4 raccordements du chapitre 11 (lus dans le code)

| # | Raccordement | Constat (fichier:ligne, `main`) | Marque |
|---|---|---|---|
| R1 | Où `executionRequested` est fixé | Toujours à `false`, en type littéral : `server/missions/development-mission.ts:11,26`, `server/missions/openhands-submission.ts:34,80`, `features/missions/openhands-preparation.ts:14` (`z.literal(false)`), `orchestration/paperclip-dispatch.ts:95`. **Aucun chemin ne peut le mettre à `true`.** | V |
| R2 | Qui consomme / produit `joris/execute` | Consommateur : `server/jobs/joris-execute-job.ts:35`. **Producteur : aucun** (`git grep "inngest.send\|joris/execute"` ne trouve que ce fichier). Le chat appelle `runJorisCommand` en direct (`api/joris/chat/route.ts:42`). Le job est donc mort. | V |
| R3 | Gouvernance des skills | `skill-governance.ts` n'est importé par aucun fichier produit. | V |
| R4 | Mémoire → agents | `memory-graph.ts` est branché (UI mémoire + boucle d'apprentissage). | V |

Les intitulés exacts des 4 raccordements du chap. 11 n'ont pas été relus dans le PDF : R3/R4 sont **ma lecture** de « 4 raccordements » (**S**).

## 3. Dépôts externes
Aucun installé, aucun relu aujourd'hui. Les SHA et verdicts restent ceux du plan (**H**). À refaire en fiche si un dépôt est retenu.

## 4. Correctifs livrés aujourd'hui (sans force-push)

| PR | Commit | Quoi | Preuves |
|---|---|---|---|
| #408 | `492e404` | vitest 4.1.12 (⇒ vite 8.3.5, @vitest/mocker 4.1.12) ; test `inngest-client.runtime.test.mjs` (vrai client + vraie route + payload `joris/execute`, mode dev, sans compte) | `npm audit` = **0** (dev compris) ; typecheck 0, lint 0 erreur, `npm test` 4496 ok / 0 échec, build ok |
| #409 | `6c25d7a` | UTF-8 + une exécution CLI à la fois (429) ; faux CLI en vrai processus | 3 nouveaux tests ; ils **échouent sans le correctif** (vérifié) ; typecheck, lint, `npm test` 4509 ok / 0 échec, build ok |
| lot-a-prime | voir PR | règle ESLint de frontière UI + test négatif ; ce registre ; `RECUPERATION.md` | lint 0 erreur ; test 9/9 |

## 5. Écarts restants (honnêtes)
0. **`main` lui-même** : `npm audit --omit=dev` = 12 alertes (2 critiques : next, proxy-addr ; 6 hautes dont zod, body-parser, MCP SDK) — mesuré aujourd'hui (**V**). Cette branche lot-a-prime, basée sur main, les hérite. Seule #408 (`492e404`) est à 0. **Le critère « 0 alerte élevée/critique » n'est donc rempli que sur #408**, pas sur main.
1. **#409 seule** a encore 1 critique + alertes hautes dans `npm audit` (next, proxy-addr, zod, MCP SDK…) : elle n'a pas les correctifs de #408/main. Disparaît après fusion 408 → main puis rebase (B′). Idem probable pour #410–#413 (**S**, non mesuré).
2. #412 empilée sur d'anciennes versions de #409/#410 + `0032` divergente : conflit sûr en B′. Mon commit #409 touche `subscription-runtime.ts`, que #412 contient aussi.
3. 0032 jamais appliquée ; pas de `pg_dump` : aucune base de test accessible ici.
4. Test UTF-8 de #412 (`atelier-mission.ts`) **pas fait** (demandé par le plan, hors demande du jour).
5. Réaudit Sentinelle de #412/#413 non fait ; revue distincte de l'auteur non faite.
6. tsc/lint/test/build verts **par branche**, pas sur un « SHA combiné » (il n'existe pas encore).
