# Supplément de banc — frontières d'admission

Portée exacte : `proofs/prove-admission-rls.sql`, `proofs/admission-boundary-structure.test.mjs`, et ce rapport. Aucune migration. Aucun code de route, d'authentification, de service ou de contrat. Aucun composant. Aucun audit. Le patch déjà appliqué reste `cursor-qualification-admission.patch`, SHA256 `8041679e12194d91b677906a568b5d965147e76eef343b99ef8055a2913c1cb3`, arbre `e305d80f031f0e7d7d810d43e78af7ddab4160f8`. Ce fichier ne le remplace pas.

## Assertions ajoutées

Dans la transaction qui accorde puis annule `select, insert, update, delete`, pour `anon` et pour `authenticated` :

- juste après `SET ROLE`, `current_user` doit être ce rôle, avant toute lecture ou écriture. Le même contrôle précède les essais sans grant et les appels `service_role`. Un échec de `SET ROLE` arrête le banc. Il n'est pas capturé comme un refus de requête.
- fixtures valides, en plus de l'INSERT mission déjà présent : UPDATE et DELETE sur `missions` ; INSERT, UPDATE et DELETE sur `hq_call_budget_ceiling`, `hq_call_budget_quote`, `hq_call_emit_right` et `hq_call_reservation`.
- effet nul : privilège insuffisant, ou zéro ligne touchée. Revenu au rôle de session, chaque table sonde a encore une ligne, et cette ligne complète est identique à l'instantané pris avant les essais.
- `ROLLBACK` retire les grants et les lignes. Aucune policy n'est conservée.

La suite ciblée ne lance plus le script réel. Le cas sans moteur est un binaire `docker` factice en tête de `PATH` : `docker info` échoue, le script sort 127 avec `NON EXECUTE`, et l'unique invocation enregistrée est `info`. Aucun conteneur n'est créé. Pas de nouveau test regex qui reflète l'implémentation. Le banc réel reste la commande explicite `sh proofs/run-admission-rls-real-db.sh`.

## Ce qui a tourné ici

Node 22.14.0. `node --test --test-concurrency=1 src/app/api/missions/development/route-owner-boundary.test.mjs proofs/admission-boundary-structure.test.mjs` : 10 tests, 0 échec, exit 0. Les 6 cas de route sont inchangés.

`sh proofs/run-admission-rls-real-db.sh` : exit 127, `NON EXECUTE`. Docker est absent. Ce n'est pas le passage du SQL nouveau, et ce n'est pas le run `1790842532_79642`.

Contrôle local séparé, pas le script Docker, pas l'image `postgres:16.4-alpine`, pas une session Supabase : PostgreSQL 16.15, mêmes rôles `nobypassrls`, migrations `0001`, `0005` et `0028`, puis `proofs/prove-admission-rls.sql`. Exit 0. Après coup, cinq comptes à 0 et grants client absents. Base détruite. Un échec de `SET ROLE` hors superutilisateur sort sur `permission denied to set role` ; l'ancien handler d'essai, lui, avale cette erreur et termine quand même.

## Non couvert

Pas de JWT, pas de clé service réelle, pas de VPS, pas de Hermes, pas de lancement OpenHands. Les quatre portes globales ne sont pas relancées. Hermes reste le prochain prérequis réel. Le raccordement déjà existant est `POST /api/missions/development` par le propriétaire, puis `POST /api/orchestration/openhands` avec le flag prévu.
