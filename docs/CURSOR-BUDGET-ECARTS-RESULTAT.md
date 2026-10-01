# Écarts du registre — correctif séparé

Le supplément délai reste. Ce commit part de `4225cc1f4f19d2429afff382c3d4c80d9fd29eae`. Aucun tarif, aucun seed, `HQ_CALL_RESERVATION` n'est pas allumé.

1. Si `markEmitted` a commis mais que la réponse RPC est perdue, `release` refuse `emitted_unknown`. Le résultat n'est plus fabriqué en `released`. Le montant, l'état inconnu et `reconciliation_required` restent. Aucun socket n'est ouvert, y compris le fallback.

2. La course PostgreSQL déduit le gagnant et le perdant des statuts, puis les réutilise. La même course est rejouée avec l'ordre des appelants inversé.

3. La reprise compare les lignes triées (identité, propriétaire, fournisseur, modèle, cents, état, émission, réconciliation, jetons, octets), plus le droit d'émettre. Plus seulement un agrégat.

4. Un devis utilisable a le périmètre `prompt_system_output`, une version, un `valid_until` futur, une borne d'octets UTF-8 du système et du prompt, et une borne de jetons de sortie. Sinon `estimate_insufficient`. `valid_until` ne libère pas une retenue.

## Commandes

Node 22.14.0. Aucun modèle.

- `npx tsc --noEmit` — exit 0
- `npx eslint` sur `call-reservation.ts`, `call-reservation.test.mjs`, `llm-json-provider.ts`, `types.ts` — exit 0
- `node --test --test-concurrency=1 src/server/ai/call-reservation.test.mjs` — 9 tests, 0 échec, exit 0
- Le test délai loopback, déjà vert sur ce même arbre de clients, n'a pas été modifié.
- `sh proofs/run-call-reservation-real-db.sh` — `NON EXECUTE`, exit 127. Docker absent. Les assertions PostgreSQL n'ont pas tourné.
