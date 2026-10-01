# Qualification des frontières d'admission

Base produit `3af7ec6dd2c6d4db83802f804664a86f9d458a09`, code `286a211f6ab4de042d61604df1a33bb9d969b289`, arbre de code `f7151f6ccb27e4a5bb461663cb1f1e911efcf8d9`. Arbre publié avant ce document : `f6642d70c527abf7d12edc7d3d4365b83d3a1731`. Aucun fichier de contrat, de migration ou d'Antigravity n'est modifié. Aucun défaut de contrat n'a été reproduit ; rien n'a été changé dans la barrière.

## Frontière

`POST/GET /api/missions/development` appelle `getCurrentAuthUser` puis `isOwnerUser`. Sans session : HTTP 401. Session non propriétaire : HTTP 403. Le corps ne choisit ni l'acteur, ni le workspace, ni le mode. `createdBy` est l'id de session. Le workspace `michael-hq` et le mode `hq` viennent de `getActiveWorkspaceContext`. L'écriture durable passe ensuite par le client service, pas par le rôle du navigateur. Cette route ne lit pas `__ownerApiSessionTestResult`.

Déjà couvert, non rejoué comme preuve nouvelle : `handlers.test.mjs` (dépendances injectées, origine, schéma strict), `owner-api-session-guard.test.mjs` (`requireOwnerApiSession` ignore le global en production). Le banc d'intake `qualification_service` et le run budget `1790840244_77530` restent des preuves de persistance privilégiée ; ils ne qualifient pas RLS.

## Preuves

Identités HTTP synthétiques. Ce n'est pas une session OAuth.

- Session absente : 401, zéro écriture.
- Non-propriétaire : 403, zéro écriture.
- Propriétaire par id, puis par email : `createdBy` est l'id de session, pas l'id configuré quand seul l'email correspond. Workspace et mode viennent du serveur. Reçu `saved`, statut `draft`, `executionRequested` false.
- `createdBy`, `workspaceId` ou `actorId` dans le corps : 400, zéro écriture.
- `NODE_ENV=production` et global de test à `null` : la route reste 401, y compris le GET. Aucun socket réseau.

PostgreSQL : `sh proofs/run-admission-rls-real-db.sh`. Ici, exit 127, `NON EXECUTE`. Docker absent. Les assertions SQL n'ont pas tourné. Ce n'est pas `real_infra`.

La commande à rejouer sur le Docker local déjà autorisé est celle-ci, depuis la racine produit. Image `postgres:16.4-alpine`, loopback, volume nommé, nettoyage du run. Rôles locaux `anon`, `authenticated`, `service_role`, tous `nosuperuser nobypassrls`. Ce ne sont pas des sessions Supabase. Le script applique `0001`, `0005` et `0028`, refuse lecture et écriture client, refuse les 4 RPC aux rôles client, et attend l'exécution `service_role` sans ligne laissée. Une sonde de RLS ouvre un grant puis l'annule ; elle ne remplace pas les migrations.

## Non couvert

Pas de JWT Supabase réel, pas de clé service réelle, pas de VPS, pas de Hermes, pas de lancement OpenHands. Le commentaire de `0005` rappelle qu'une clé service Supabase réelle contourne RLS ; ce banc ne recrée pas ce privilège.

## Commandes

Node 22.14.0. Aucun modèle.

- `node --test --test-concurrency=1 src/app/api/missions/development/route-owner-boundary.test.mjs proofs/admission-boundary-structure.test.mjs` — 10 tests, 0 échec, exit 0
- `sh proofs/run-admission-rls-real-db.sh` — exit 127, `NON EXECUTE`
- Typecheck, lint, build et smoke non relancés : le code produit de la barrière est inchangé.

## Prochain prérequis réel

Hermes reste non observé : pas d'accès VPS, pas de version, transport, capacités ni mode de compte. Après cette qualification, le raccordement existant est `POST /api/missions/development` par le propriétaire, puis `POST /api/orchestration/openhands` avec le flag déjà prévu. Pas une nouvelle architecture.
