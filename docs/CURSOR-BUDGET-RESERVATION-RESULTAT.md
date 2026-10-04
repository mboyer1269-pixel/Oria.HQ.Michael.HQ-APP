# Contrat — réservation budgétaire à l'appel, 1 octobre 2026

Base produit `codex/hq-delivery-integration` `58712d08ace9477e6ba0e86ac39242d287f9d1de`. Code `4412af09ea1dca2b0610c5ae0106d7b4cd4e0f9a`. Le lot routage n'est pas repris. `relativeWeight` reste la métrique de routage de `chooseModel` (0, 1 ou 5). Il n'est pas stocké, sommé, ni converti en argent.

## Contrat

Unité : cents USD entiers. Une émission en mode budgété exige les deux lignes serveur suivantes, jamais un champ client :

- `hq_call_budget_ceiling` : plafond du workspace, `currency = USD`, `max_amount_cents`.
- `hq_call_budget_quote` : devis du couple fournisseur + modèle, `reliable = true`, `not_to_exceed_cents > 0`, `covers_max_tokens` au moins égal au `maxTokens` réellement envoyé.

La fonction `hq_reserve_call_attempt` n'a pas d'argument montant. Sans plafond, statut `unavailable` / `ceiling_not_configured`, aucun envoi. Sans devis fiable, ou si le devis ne couvre pas les jetons, statut `refused` / `estimate_insufficient`, aucun envoi. La migration n'insère ni plafond ni devis et n'allume pas le flag.

Droit d'émettre : sous `FOR UPDATE` de la ligne de plafond, un seul `caller_id` possède `hq_call_emit_right` pour `(workspace_id, subject_id)`. La clé unique est un filet, pas le mutex. Un autre appelant reçoit `lost` / `emit_right_held` et n'ouvre aucun socket, y compris sur un fallback déjà autorisé. Seul le gagnant peut réserver ce fallback, qui repasse par le même devis et le même plafond.

États d'une tentative : `held` peut être libéré avant le socket. `hq_mark_call_emitted`, juste avant l'envoi, passe à `emitted_unknown` avec `reconciliation_required`. Cette retenue n'a pas de colonne d'expiration et `hq_release_call_attempt` la refuse. Un succès appelle `hq_consume_call_attempt` sans mettre les cents à zéro. Un échec, un timeout ou une exception après la marque laisse la retenue. Le registre borne des devis réservés. Il ne borne pas la facture fournisseur.

Classes : seul `api` (identifiant appelable de l'allowlist) peut réserver. `subscription`, `local` et `unknown` sont refusés, sans devis inventé. `HQ_CALL_RESERVATION` doit valoir exactement `1`. Toute autre valeur laisse le contrôle explicitement indisponible et ne change pas l'envoi. `DURABLE_BUDGET_IMPLEMENTED` reste `false` : le journal mémoire n'est pas ce registre, et aucune politique de dépense n'est activée.

## Branchement

Le seul point d'émission de ce lot est `generateStructuredJson`. Le `caller_id` est un UUID créé dans ce processus, pas un champ de la requête. `callSubjectId` est une identité d'appel ou de mission déjà détenue par le serveur. Les appelants qui ne le passent pas — `runJorisCommand` dans `brain.ts`, `generateDailyDirection`, `generateLlmCashActionPacketsFromVentures`, `runShadowProposalForVenture` — ne sont pas élargis. Flag éteint, leur comportement est inchangé. Flag allumé, l'absence de sujet refuse avant `fetch` (`identity`). `chooseModel` enregistre encore une estimation et ne réserve pas.

Contrat proposé, non codé, pour la frontière partagée : l'entrée serveur du chat doit fournir un `callSubjectId` émis par le serveur, jamais un plafond ni un prix venus du client, avant que `HQ_CALL_RESERVATION=1` puisse s'appliquer à la conversation. Pas de formulaire, d'auth, de maquette, ni d'admission OpenHands dans ce lot.

## Commandes

Répertoire du clone isolé, Node 22.14.0.

- `npx tsc --noEmit` — exit 0
- `npx eslint` sur `call-reservation.ts`, `call-reservation.test.mjs`, `llm-json-provider.ts`, `call-accounting.ts`, `types.ts` — exit 0
- `node --test --test-concurrency=1` sur `call-reservation.test.mjs`, `llm-json-provider.test.mjs`, `routing-execution.test.mjs` — 34 tests, 0 échec, exit 0
- `sh proofs/run-call-reservation-real-db.sh` — `NON EXECUTE`, exit 127. Docker est absent. La migration n'a pas été appliquée et les assertions PostgreSQL n'ont pas tourné.

Les quatre portes produit (typecheck complet du dépôt, lint, build, smoke) ne sont pas relancées ici. Codex les fait sur le candidat assemblé. Les cents 40 et 80 du script de preuve sont des fixtures de ce processus, pas un tarif.

## Limites

Pas d'activation prod, pas de seed, pas de nouvelle politique de dépenses. Hors flag, rien n'est retenu. Avec le flag, sans devis serveur fiable et sans plafond, aucun envoi. Une retenue après émission inconnue attend une réconciliation explicite ; aucun TTL ne la libère. Le coût agrégé du provider garde `monetaryUsd: null`. Ce n'est pas un plafond de facture.
