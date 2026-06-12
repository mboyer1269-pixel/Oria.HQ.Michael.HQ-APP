---
id: persist-arena-attribution
type: action
title: Persister l'attribution candidat avec le verdict Arena
status: in-progress
project: oria-hq
tags: arena, attribution, implementation
confidence: high
sourceRefs: src/server/arena/arena-candidate-attribution.test.mjs
createdAt: 2026-06-12
updatedAt: 2026-06-12
---

# Persister l'attribution candidat avec le verdict Arena

Implémentation de [[decision:arena-attribution-before-joris-injection]] :
`snapshotCandidateAttribution` (identité seulement, jamais les chiffres),
`store(verdict, candidate?)`, enveloppe `__v: 2` dans la colonne verdict Json,
unpack rétro-compatible, et câblage learning-loop
(`adaptStoredVerdict(entry, entry.candidate)`). Référence ledger en attente
du commit.
