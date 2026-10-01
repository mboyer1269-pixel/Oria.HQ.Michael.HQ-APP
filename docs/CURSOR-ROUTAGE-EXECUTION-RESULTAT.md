# Routage et coût — résultat d'exécution

Correctif local du produit `Oria.HQ.Michael.HQ-APP`. Ce document décrit un contrat et des essais injectés. Il n'authentifie pas un appel fournisseur réel, un budget durable, ni une mission réelle.

## Base

- Dépôt : `mboyer1269-pixel/Oria.HQ.Michael.HQ-APP`
- Branche de base : `codex/hq-mission-dossier`
- Commit de base : `e9ff840a38b4532b687bb29f3e2371afeeb3024e`
- Branche de travail : `cursor/routage-couts-execution`
- Commit d'implémentation : `8497a19aa2c306954a1e410044b63e09ba53752d`
- Ce document est le commit suivant sur la même branche. Son SHA se lit avec `git rev-parse HEAD` après ce commit.

## Reproduction sur e9ff840, avant correctif

Worktree détaché à `e9ff840`, clients HTTP remplacés, aucune clé réelle.

- `chooseModel` avec un modèle gratuit éligible, puis le même modèle marqué indisponible : le store passe de 0 à 1. Le second choix devient `gpt-4o-mini` alors que la raison reste « zéro coût ».
- Premium indisponible : le choix devient `gpt-4o`, raison `claude-sonnet-4-6 indisponible → gpt-4o`.
- `generateStructuredJson` en `auto` : Anthropic répond 503, OpenAI est appelé (`openaiCalls: 1`, `fallbackUsed: true`).

Les entiers 0, 1 et 5 sont des poids relatifs. Ils ne sont pas des dollars.

## Ce qui change

La sélection n'appelle plus `BudgetStore.add` et n'écrit plus dans le journal sommé par `getCostLadderSnapshot`. Elle peut journaliser une estimation : poids relatif, `monetaryUsd: null`, `networkRequestSent: false`.

Cinq situations restent distinctes :

- estimation : poids 0, 1 ou 5, sans débit ;
- réservation : non implémentée, aucun hold (`reservationNotImplemented`) ;
- usage observé : jetons d'une réponse complétée, montant monétaire toujours `null` ;
- coût inconnu : appel terminé sans usage, `null`, distinct de 0 ;
- appel échoué possiblement facturé : la requête a pu atteindre le fournisseur, `null`, distinct de 0.

Un modèle indisponible ou non pris en charge est refusé. Il n'est pas remplacé par `gpt-4o`, `gpt-4o-mini` ou un autre fournisseur payant. Gemini, OpenRouter, un id local ou un id d'abonnement ne sont pas appelés et ne sont pas annoncés comme opérationnels.

`auto` n'essaie OpenAI après Anthropic que si l'appel porte `paidFallback: { authorized: true, workspaceId }` et que `workspaceId` est le même. L'autorisation d'un workspace ne vaut pas pour un autre.

`chooseModel` renvoie `chosenModelId` et `executedModelId: null`. Le chemin conversationnel n'envoie un id que s'il est pris en charge (`claude-sonnet-4-6`, `claude-haiku-4-5-20251001`, `gpt-4o`, `gpt-4o-mini`). Le résultat LLM met cet id dans `modelId` et `executedModelId`. Un résumé template met `executedModelId: null` et n'écrit pas `modelId`. Les résultats de règles gardent `modelId` comme id choisi, avec `executedModelId: null`, pour les appelants existants.

## Budget durable

Non implémenté. `DURABLE_BUDGET_IMPLEMENTED` vaut `false`. Le `Map` en mémoire n'est pas un budget.

Contrat proposé, non migré, pour une table HQ partagée et non pour Antigravity :

`hq_model_call_cost (workspace_id, attempt_id, kind, chosen_model_id, executed_model_id, input_tokens, output_tokens, monetary_usd, provider_request_reached, created_at)`

`monetary_usd` reste nullable. `null` signifie inconnu, pas zéro. Aucune ligne n'est écrite ici.

## Fichiers

- `src/server/ai/model-router.ts`
- `src/server/ai/model-config.ts`
- `src/server/ai/cost-ladder.ts`
- `src/server/ai/llm-json-provider.ts`
- `src/server/ai/call-accounting.ts`
- `src/server/ai/execution-models.ts`
- `src/server/ai/model-router.test.mjs`
- `src/server/ai/llm-json-provider.test.mjs`
- `src/server/ai/routing-execution.test.mjs`
- `src/server/ai/cost-ladder.test.mjs` (inchangé, rejoué)
- `src/server/joris/brain.ts`
- `src/server/joris/joris-reply-generator.ts` (adaptateur d'appel utilisé par le cerveau)
- `src/server/missions/mission-draft-control.ts`
- `src/core/types.ts` (champs optionnels)
- tests d'appelants listés ci-dessous
- ce document

Hors diff : auth, formulaire de mission, CLI d'admission, cockpit, Antigravity.

## Commandes exécutées

Depuis le clone produit, après `npm ci --ignore-scripts` (760 paquets, code 0) :

- `npx tsc --noEmit` : code 0
- `npm run lint` : code 0, 5 avertissements déjà présents (mémoire / Memex), aucun dans ce diff
- `npm run build` : code 0, Next.js 16.3.7
- `npm run smoke:joris` : `PASS`, mode local, aucun écrit Supabase
- `npm run smoke:runtime` : `PASS`, echo local
- `node --test --test-concurrency=1` sur `model-router`, `routing-execution`, `llm-json-provider`, `cost-ladder`, `brain-cost-ladder-tagging`, `brain-llm-reply`, `joris-reply-generator`, `mission-draft-control` : 72 tests, 0 échec

Les fixtures n'ouvrent pas le réseau réel. `fetch` est injecté ou la requête est refusée avant `fetch`.

## Limites

- `permissions.push` du dépôt produit était faux dans cette session. Si le push de cette branche échoue, la livraison est le commit local et le patch, pas une branche GitHub.
- `src/features/ventures/llm-cash-action-packet-generator.test.mjs` a deux sous-tests rouges : ils exigent encore le repli implicite Anthropic vers OpenAI et une `failureChain` de longueur au moins 2. Le générateur n'a pas été modifié. Action : son propriétaire passe `paidFallback` seulement avec une autorisation explicite du même workspace, puis aligne ces deux assertions. `daily-direction-generator` reste vert.
- Pas de table de prix. Un usage observé n'est pas un montant.
- Le journal d'estimation disparaît avec le processus.
- Aucune preuve backend réelle (`be61d26`, rapport PostgreSQL collecté) n'est dans ce clone. Elle n'a pas été revue.
- Aucun appel de modèle payant n'a été fait.
