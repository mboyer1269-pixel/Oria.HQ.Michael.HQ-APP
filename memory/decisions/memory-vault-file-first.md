---
id: memory-vault-file-first
type: decision
title: Memory Vault v0.1 is file-backed, no pgvector, no migration
status: active
project: oria-hq
tags: memory-vault, persistence, architecture
confidence: high
sourceRefs: docs/MEMORY_VAULT_CONTRACT.md, docs/memory-vault/ARCHITECTURE.md
createdAt: 2026-06-12
updatedAt: 2026-06-12
---

# Memory Vault v0.1 is file-backed, no pgvector, no migration

The first real Memory Vault wave is file-backed markdown under `memory/`,
parsed by pure TypeScript (`src/server/memory/memory-graph.ts`) and rendered
on `/hq/memory`. Supabase persistence and pgvector stay locked until an
explicit CEO mandate — the contract in [[source:memory-vault-contract]]
remains the gate.

Scope note: [[note:memory-vault-v0-1-scope]] · Implementation:
[[action:implement-memory-vault-v0-1]] · Next: wire verified vault context
into Joris injection (future PR).
