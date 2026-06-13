---
id: wire-lessons-rail-into-joris
type: action
title: Câbler la rail de leçons vérifiées dans le cerveau de Joris
status: in-progress
project: oria-hq
tags: joris, learning-loop, implementation
confidence: high
sourceRefs: src/server/agents/context/verified-lessons-context.ts, src/server/joris/brain.ts
createdAt: 2026-06-12
updatedAt: 2026-06-12
---

# Câbler la rail de leçons vérifiées dans le cerveau de Joris

Implémentation de [[decision:lessons-rail-subordinated]] :
`composeVerifiedLessonsContext` (module pur), branché dans `brain.ts` au même
point d'invocation que la lecture vault existante, avec trace non sensible
(`lessonCount`, `lessonIds`, `charCount`, compteurs d'exclusion). Concerne
[[agent:joris]]. Référence ledger en attente du commit.
