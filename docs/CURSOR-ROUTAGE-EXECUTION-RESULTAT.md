# Routage et coût — résultat d'exécution

Correctif local du produit `Oria.HQ.Michael.HQ-APP`. Ce document décrit un contrat et des essais injectés. Il n'authentifie pas un appel fournisseur réel, un budget durable, ni une mission réelle.

## Base

- Dépôt : `mboyer1269-pixel/Oria.HQ.Michael.HQ-APP`
- Branche de base : `codex/hq-mission-dossier`
- Commit de base : `e9ff840a38b4532b687bb29f3e2371afeeb3024e`
- Branche de travail : `cursor/routage-couts-execution`
- Commit d'implémentation : `8497a19aa2c306954a1e410044b63e09ba53752d`
- Commit de ce document, avant la note de push : `aa3d543b8ab10255b6c61c5a172cb93d892d90e9`
- Le commit qui enregistre le refus de push est le sommet de la branche. `git rev-parse HEAD` le donne.

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
- `src/features/ventures/llm-cash-action-packet-generator.test.mjs`
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

## Impact sur les appelants de `generateStructuredJson`

Aucun appelant ne reçoit un consentement par défaut. `paidFallback` n'est envoyé que si l'appelant le fournit, et seulement s'il vise le même `workspaceId`. La fonction Ventures n'a pas été modifiée : elle n'a pas de paramètre d'autorisation.

- `generateLlmCashActionPacketsFromVentures` appelle `auto` sans `paidFallback`. Un échec Anthropic produit `fallback_seed` et une `failureChain` d'un seul élément. OpenAI n'est pas appelé. `providerPreference: "openai"` ou `"anthropic"` reste un choix explicite d'un seul fournisseur, pas un repli. Le commentaire du paramètre dit encore « Anthropic → OpenAI » ; le comportement ne le fait plus. `smoke:revenue` l'appelle sans clé et obtient `fallback_seed`.
- `generateDailyDirection` fait deux tentatives de prompt, chacune en `auto` sans `paidFallback`. Chaque tentative n'appelle qu'Anthropic. Ce n'est pas un repli de fournisseur. Ses 6 tests passent.
- `generateJorisReply` transmet `paidFallback` seulement si on le lui donne. `runJorisCommand` ne le donne pas. Le modèle choisi part vers son seul fournisseur pris en charge.
- `runShadowProposalForVenture` appelle `auto` sans workspace ni `paidFallback`. Un échec Anthropic saute la venture ; OpenAI n'est pas tenté. Ses tests injectent `generateJson` et passent.
- Le test du générateur de paquets prouve les deux côtés sans ajouter de consentement au générateur : un appel Anthropic et zéro appel OpenAI ; puis, sur `generateStructuredJson` seulement, le second fournisseur quand `paidFallback` autorise le même workspace, et pas quand le workspace diffère.

## Vérifications du 1er octobre, après alignement du test

- `npx tsc --noEmit` : code 0
- `npm run lint` : code 0, 5 avertissements déjà présents, aucun dans ce diff
- `npm run build` : code 0
- `npm run smoke:joris` : PASS
- `npm run smoke:runtime` : PASS
- `npm run smoke:revenue` : PASS, `source: fallback_seed`, clés absentes
- `node --test --test-concurrency=1` sur le générateur de paquets, `daily-direction-generator`, `joris-reply-generator`, `venture-score-shadow-runner` : 59 tests, 0 échec

## Revue avant acceptation

Commit du correctif : `a8413508d48bd7776931f33292e4febc918f9b07`, sur `cbc7d61473a5e77d524e2018f07cce287d4a3ec8`. Node `v22.14.0`. Aucune clé `ANTHROPIC_API_KEY` ni `OPENAI_API_KEY` dans l'environnement après les essais. Les deux `fetch` sont injectés. Aucun appel fournisseur réel.

Avant ce commit, `executionTargetForModel` lisait un objet ordinaire. `constructor`, `toString` et `__proto__` étaient annoncés appelables et partaient vers OpenAI ; `providerUsed` devenait une fonction ou un objet. L'allowlist est maintenant un `Map`. Une valeur n'est appelable que si elle est exactement `anthropic` ou `openai`.

Avant ce commit, un Anthropic 503 puis un OpenAI 200 autorisé renvoyait `cost.kind=observed_usage` du seul second essai. Le premier essai, possiblement facturé, disparaissait du coût structuré. Chaque tentative est maintenant dans `attempts`. Le coût global ne somme pas des dollars.

Règle du total, sans nouveau type de coût :

- un succès après un `failed_maybe_billed` : `cost.kind=unknown_cost`, `monetaryUsd: null`, sans recopier les jetons du succès sur le total ; ces jetons restent sur la tentative qui les a observés ;
- une clé absente (`refused`, aucun `fetch`) puis un succès avec usage : le total reste `observed_usage` de cet unique appel réseau, et la tentative refusée reste dans `attempts` ;
- tous les essais ont envoyé une requête et ont échoué : le total est `failed_maybe_billed`, `monetaryUsd: null`, distinct de 0 ;
- aucun essai, ou seulement des refus : `refused`.

`tokenUsage` sur un succès reste l'usage de la réponse réussie. Ce n'est pas la somme des tentatives. `DURABLE_BUDGET_IMPLEMENTED` reste `false`.

Essais de cette revue, `node --test --test-concurrency=1 --test-name-pattern 'constructor, toString|authorized Anthropic 503|missing Anthropic key|every authorized attempt fails' src/server/ai/routing-execution.test.mjs` : 4 tests, 0 échec.

- `constructor`, `toString`, `__proto__` : `callable` faux, deux `fetch` injectés, `anthropicCalls` 0 et `openaiCalls` 0 pour chacune, `errorCode` `model_unsupported`, `providerUsed` absent, `attempts` vide, `cost.kind` `refused`.
- Anthropic 503 puis OpenAI 200 autorisé, même workspace, usage 3/4 : `attempts.length` 2, premier `failed_maybe_billed`, second `observed_usage` avec ces jetons, total `unknown_cost` sans `inputTokens` ni `outputTokens`, `monetaryUsd` `null`.
- Clé Anthropic absente puis OpenAI 200 autorisé, usage 8/2 : `fetch` Anthropic 0, `fetch` OpenAI 1, premier `refused`, second et total `observed_usage`.
- Anthropic 503 et OpenAI 500 autorisés : deux `failed_maybe_billed`, total `failed_maybe_billed`, `monetaryUsd` `null`.

Rejoués ensuite : `npx tsc --noEmit` code 0 ; `npx eslint` sur les trois fichiers modifiés code 0 ; `node --test --test-concurrency=1` sur `routing-execution`, `llm-json-provider`, `model-router` et le générateur de paquets : 53 tests, 0 échec ; puis `cost-ladder`, `brain-cost-ladder-tagging`, `brain-llm-reply`, `joris-reply-generator`, `mission-draft-control`, `daily-direction-generator`, `venture-score-shadow-runner` : 77 tests, 0 échec.

Fichiers de ce correctif : `src/server/ai/execution-models.ts`, `src/server/ai/llm-json-provider.ts`, `src/server/ai/routing-execution.test.mjs`, et cette note. Le générateur Ventures n'est pas modifié.

## Limites

- `git push -u origin cursor/routage-couts-execution` a de nouveau répondu `403` : `Permission to mboyer1269-pixel/Oria.HQ.Michael.HQ-APP.git denied to cursor[bot]`. `permissions.push` est `false`. Ce refus n'a pas été réessayé. La PR produit n'existe pas. Le sommet local se relit avec `git rev-parse HEAD`.
- `git am` du patch produit de nouveaux SHA de commits. L'arbre à comparer est `git rev-parse HEAD^{tree}`, pas le SHA de commit.
- Pas de migration de budget. `DURABLE_BUDGET_IMPLEMENTED` reste `false`.
- Pas de table de prix. Un usage observé n'est pas un montant.
- Le journal d'estimation disparaît avec le processus.
- Aucune preuve backend réelle (`be61d26`, rapport PostgreSQL collecté) n'est dans ce clone. Elle n'a pas été revue.
- Aucun appel de modèle payant n'a été fait.
