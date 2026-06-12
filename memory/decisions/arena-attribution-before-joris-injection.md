---
id: arena-attribution-before-joris-injection
type: decision
title: Attribution candidat persistée avant injection Joris (décision CEO)
status: active
project: oria-hq
tags: arena, learning-loop, attribution, sequencing
confidence: high
sourceRefs: src/server/arena/arena-verdict-store.ts, src/server/arena/arena-verdict-repository.ts
createdAt: 2026-06-12
updatedAt: 2026-06-12
---

# Attribution candidat persistée avant injection Joris (décision CEO)

Décision CEO 2026-06-12 : la prochaine vague après la boucle d'apprentissage
est la persistance des métadonnées candidat (agentId, skillId, missionId,
title) avec le verdict Arena — attribution agent complète dans le leaderboard
et les leçons. L'injection des leçons vérifiées dans le contexte Joris vient
APRÈS, pas avant.

Implémentation : snapshot d'attribution au moment de l'évaluation, enveloppe
versionnée dans la colonne Json existante (zéro migration), lecture
rétro-compatible des lignes legacy. Découle de
[[decision:compound-learning-loop]] · Action:
[[action:persist-arena-attribution]].
