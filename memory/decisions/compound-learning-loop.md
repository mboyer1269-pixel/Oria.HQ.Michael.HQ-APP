---
id: compound-learning-loop
type: decision
title: Les verdicts Arena deviennent des leçons proposées (boucle composée)
status: active
project: oria-hq
tags: learning-loop, arena, memory-vault, roi
confidence: high
sourceRefs: src/server/memory/agent-learning-loop.ts, docs/memory-vault/LEARNING_LOOP.md
createdAt: 2026-06-12
updatedAt: 2026-06-12
---

# Les verdicts Arena deviennent des leçons proposées (boucle composée)

Les verdicts de la ROI Arena ne meurent plus dans un store TTL : les patterns
répétés (échecs, garde-fous, gains à ROI ≥ 2x) sont distillés en leçons
*proposées* au Memory Vault — jamais auto-vérifiées, approbation CEO requise
avant injection dans le contexte agent, conformément à
[[source:memory-vault-contract]].

Source: [[source:roadmap-completion-2026-06]] · Action:
[[action:implement-learning-loop-v0-1]] · Agents concernés: [[agent:joris]].
