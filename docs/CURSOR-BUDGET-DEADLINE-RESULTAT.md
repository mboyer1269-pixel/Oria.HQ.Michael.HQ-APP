# Délai des clients JSON — correctif supplémentaire

Le patch budget `58712d08..1ff9da57` n'est pas modifié. Ce correctif part de `1ff9da576788d39ec9df6e8ee4b2c5b4b7f59431`. Code `669c1d35e6c1cca78315b4c3c9c5909955ddc60a`.

`anthropic-json-client.ts` et `openai-json-client.ts` annulaient le délai après les en-têtes, avant `response.json()`. Le même `AbortSignal` reste armé pendant la lecture du corps. `clearTimeout` est dans `finally`. Aucun tarif, aucune activation de `HQ_CALL_RESERVATION`, aucun plafond OpenHands. `budget_agent.py` n'est pas recopié. Un devis absent laisse le mode budgété bloqué, comme dans le lot précédent.

Un fetch injecté qui ignore le signal n'est pas couvert : l'appel reste pendant. Un timeout loopback après émission laisse la réservation `emitted_unknown`, sans libération et sans remettre les cents à zéro.

## Commandes

Node 22.14.0, fetch réel vers `127.0.0.1` seulement. Aucun appel modèle. Docker n'a pas été lancé.

`node --test --test-concurrency=1 src/server/ai/json-client-deadline.test.mjs src/server/ai/anthropic-json-client.test.mjs src/server/ai/openai-json-client.test.mjs` — 27 tests, 0 échec, exit 0.

Mesures `timeoutMs=600` :

- Anthropic : en-têtes bloqués 598 ms, réponse complète 7 ms, corps bloqué 601 ms, réservation encore `emitted_unknown` à 602 ms, 0 libération.
- OpenAI : en-têtes bloqués 600 ms, réponse complète 2 ms, corps bloqué 601 ms, réservation encore `emitted_unknown` à 601 ms, 0 libération.
- Fetch injecté qui ignore le signal : toujours pendant à 1201 ms, des deux côtés.

`npx tsc --noEmit` — exit 0. `npx eslint` sur les deux clients et `json-client-deadline.test.mjs` — exit 0. Les quatre portes et PostgreSQL ne sont pas rejouées ici.
