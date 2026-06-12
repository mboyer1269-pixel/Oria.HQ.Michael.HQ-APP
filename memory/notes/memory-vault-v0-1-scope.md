---
id: memory-vault-v0-1-scope
type: note
title: Memory Vault v0.1 scope — graph, chainline, file vault
status: active
project: oria-hq
tags: memory-vault, scope
confidence: high
sourceRefs: docs/memory-vault/ARCHITECTURE.md
createdAt: 2026-06-12
updatedAt: 2026-06-12
---

# Memory Vault v0.1 scope — graph, chainline, file vault

v0.1 delivers: (1) pure graph contracts — entry parsing, backlink extraction,
graph build, duplicate detection, chainline mapping; (2) the file-backed vault
under `memory/`; (3) an interactive graph explorer on `/hq/memory` with
backlinks and chainline path display; (4) unit tests for all pure logic.

Out of scope: pgvector, Supabase migration, automatic ingestion, vault writes
from agents. Decision: [[decision:memory-vault-file-first]] · Contract:
[[source:memory-vault-contract]].
