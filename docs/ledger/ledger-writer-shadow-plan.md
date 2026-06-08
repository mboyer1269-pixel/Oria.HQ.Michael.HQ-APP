# Ledger Hash-Chain Shadow Writer — Integration Plan

**Status:** Design doc (pre-implementation)  
**Date:** 2026-06-08  
**Depends on:** PR #236 merged (`hash-chain-sealer.ts`)  
**Track:** `action_ledger` tamper-evident integrity

---

## Purpose

The shadow writer is a pure in-memory adapter layer that sits between the
existing `action_ledger` write path and the eventual DB-backed hash-chain
writer. It lets us validate the full sealing + chaining logic end-to-end
without touching the database, without environment secrets, and without
changing any runtime dispatch behavior.

Once validated, the shadow writer's interface is promoted to the real writer
by swapping the in-memory store for actual DB reads/writes.

---

## What the Shadow Writer Is

A TypeScript module (`hash-chain-shadow-writer.ts`) that:

1. Accepts raw `ActionLedgerEntry` objects one at a time.
2. Seals each entry using `sealLedgerEntry` (chain tip as `prevHash`).
3. Maintains a private in-memory chain array.
4. Exposes read-only accessors (`getChain`, `getChainTip`, `length`).
5. Exposes `verify()` — calls `verifyChain` over the accumulated chain.
6. Is **stateless from the caller's perspective** — no DB reads, no env access, no side effects.

The shadow writer does NOT:
- Read from or write to any database.
- Access `process.env` or any secret store.
- Change any live executor or dispatch behavior.
- Emit events or call external services.

---

## API Design

```typescript
// hash-chain-shadow-writer.ts

export interface ShadowWriterOptions {
  hmacKey: string; // caller-supplied; never from env in the shadow layer
}

export interface ShadowChainEntry {
  // All fields from ActionLedgerEntry, plus:
  entry_hash: string;
  hmac: string;
  canonical_version: number;
  prev_hash: string | null;
}

export class HashChainShadowWriter {
  constructor(options: ShadowWriterOptions);

  /** Seal and append an entry. Returns the sealed entry. */
  append(entry: ActionLedgerEntry): ShadowChainEntry;

  /** Return a read-only copy of the full chain. */
  getChain(): readonly ShadowChainEntry[];

  /** Return the last sealed entry, or null if empty. */
  getChainTip(): ShadowChainEntry | null;

  /** Verify the entire accumulated chain. FAIL-CLOSED. */
  verify(): { ok: boolean; brokenAt?: number; reason?: string };

  /** Number of entries in the chain. */
  readonly length: number;
}
```

---

## Integration Path

### Phase 1 — Shadow writer (in-memory, this PR)

```
ActionLedgerEntry → HashChainShadowWriter.append() → sealed entry (in memory only)
```

Validation: `HashChainShadowWriter.verify()` returns `{ ok: true }` for all appended entries.

This phase has **zero production impact**. It can be merged and left dormant.

### Phase 2 — Shadow writer wired at write time (future, requires mandate)

The real ledger write path calls `HashChainShadowWriter.append()` (or its DB-backed successor)
immediately after each `INSERT INTO action_ledger`. The sealed fields are written to the same row.

Prerequisites for Phase 2:
- DB migration adds columns: `entry_hash TEXT`, `hmac TEXT`, `canonical_version INTEGER`, `prev_hash TEXT`
- HMAC key provisioned per workspace (Vault / Supabase secrets — not in source)
- Service-role executor updated to call sealer at write time
- Backfill plan for existing rows (anchor the chain from a known-clean state)

### Phase 3 — Audit / reconciliation script (future)

Reads `action_ledger` rows in sequence and calls `verifyChain`. Surfaces broken entries.
Suitable for a cron job or on-demand CLI tool.

---

## Risk Register

| Risk | Severity | Mitigation |
|------|----------|------------|
| HMAC key in source | Critical | Shadow writer accepts key as argument; never reads env |
| Chain ordering race | High | Phase 2 must use row-level locking or serialized writes per workspace |
| Backfill of existing rows | Medium | Anchor point + batch sealing script needed; plan before Phase 2 |
| Performance (sha256 per write) | Low | sha256 is fast; adds <1ms per row in benchmarks |

---

## Files Affected (this PR — shadow writer only)

```
src/server/ledger/
  hash-chain-shadow-writer.ts      ← new (pure TypeScript, no DB)
  hash-chain-shadow-writer.test.mjs ← new (pure in-memory tests)
```

No other files are modified. No migrations. No env changes. No runtime wiring.

---

## Acceptance Criteria

- [ ] `HashChainShadowWriter` appends entries and chains `prev_hash` correctly
- [ ] `verify()` returns `{ ok: true }` for a well-formed chain
- [ ] `verify()` returns `{ ok: false }` if any entry is tampered post-append
- [ ] No database calls in any code path
- [ ] No `process.env` access in any code path
- [ ] TypeScript strict-mode clean
- [ ] All tests pass with `node --test`
