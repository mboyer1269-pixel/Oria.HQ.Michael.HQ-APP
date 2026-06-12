---
id: joris
type: agent
title: Joris — booking and operations agent
status: active
project: oria-hq
tags: joris, agents, context-injection
confidence: high
sourceRefs: docs/JORIS_OPERATING_PROFILE.md, src/server/joris
createdAt: 2026-05-20
updatedAt: 2026-06-12
---

# Joris — booking and operations agent

Primary operating agent for the michael-hq workspace: booking intent parsing,
calendar writes, action ledger entries, daily direction generation. Reads only
verified Memory Vault entries at invocation start (max 20, workspace-scoped)
per [[source:memory-vault-contract]]. Governed by
[[source:agents-operating-guide]] and [[decision:phase-1-locked]].
