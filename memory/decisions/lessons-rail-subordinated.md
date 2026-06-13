---
id: lessons-rail-subordinated
type: decision
title: La rail de leçons est advisory, bornée et subordonnée aux règles système
status: active
project: oria-hq
tags: joris, learning-loop, context-injection, governance
confidence: high
sourceRefs: src/server/agents/context/verified-lessons-context.ts
createdAt: 2026-06-12
updatedAt: 2026-06-12
---

# La rail de leçons est advisory, bornée et subordonnée aux règles système

Les leçons vérifiées atteignent Joris via une rail de contexte explicite,
jamais une injection brute : bloc délimité déclarant sa propre autorité
(inférieure à system/developer/guardrails), max 5 leçons, max 2000 caractères,
sortie déterministe, texte sanitisé (les crochets sont neutralisés — le
contenu d'une leçon ne peut ni forger ni fermer le bloc). Une leçon sans
sourceRef viole la convention chainline et est exclue avec signalement.

Découle de [[decision:arena-attribution-before-joris-injection]] · Contrat:
[[source:memory-vault-contract]] · Action: [[action:wire-lessons-rail-into-joris]].
