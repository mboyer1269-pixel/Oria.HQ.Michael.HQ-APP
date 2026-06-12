---
id: apply-agent-naming-v1
type: action
title: Appliquer le naming agents v1 dans le repo (registre, UI, prompts, docs)
status: done
project: oria-hq
tags: naming, agents, implementation
confidence: high
sourceRefs: src/features/agents/seed.ts, src/features/agents/naming.ts, docs/AGENT_NAMING.md
createdAt: 2026-06-12
updatedAt: 2026-06-12
---

# Appliquer le naming agents v1

Implémentation de [[decision:agent-naming-product-modules]] : registre
(`seed.ts`) renommé, couche `naming.ts` créée (`getAgentDisplayName`,
alias ledger + anciens noms), chaînes UI (Send Desk, cash actions, loi96,
runtime, leaderboard) et prompt système de [[agent:joris]] alignés,
docs vivantes mises à jour (`AGENT_NAMING.md`, prep agent, roadmap,
execution status). Référence ledger en attente du commit.
