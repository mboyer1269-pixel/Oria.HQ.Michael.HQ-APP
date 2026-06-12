---
id: agent-naming-product-modules
type: decision
title: Naming agents v1 — un visage (Joris), des modules fonctionnels
project: oria-hq
tags: naming, agents, product
confidence: high
sourceRefs: docs/AGENT_NAMING.md, src/features/agents/seed.ts, src/features/agents/naming.ts
createdAt: 2026-06-12
updatedAt: 2026-06-12
---

# Naming agents v1 — un visage, des modules

Décision : [[agent:joris]] reste la seule persona nommée (seul agent
conversationnel). Tous les autres agents prennent des noms de modules
fonctionnels bilingues : Relay (`hermes`), Radar (`orion`), Sentinel,
Scribe, FinOps, Forge (`builder`), Closer, Studio (`marketing`),
Lab (`inventor`). Le panthéon mythologique (Thémis, Mnémosyne, Ploutos,
Héphaïstos, Peithô, Phémé, Dédale) est retiré.

Les IDs techniques ne bougent jamais ; les noms d'affichage se résolvent via
`getAgentDisplayName()` (`src/features/agents/naming.ts`), qui absorbe aussi
les alias ledger et les anciens noms. Dérive produit corrigée au passage :
« Hermès HQ » (prompt Joris) et « Orya HQ » (chaînes visibles) → Oria HQ.

Source : `docs/AGENT_NAMING.md`. Action : [[action:apply-agent-naming-v1]].
