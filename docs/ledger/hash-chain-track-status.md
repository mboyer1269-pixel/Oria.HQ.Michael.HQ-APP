# Hash-Chain Track Status

**As of:** 2026-06-08  
**Repo:** Oria.HQ  
**Track:** `action_ledger` tamper-evident hash-chain integrity

---

## Overview

The hash-chain track adds cryptographic integrity to every `action_ledger` row.
Each entry carries a SHA-256 hash (`entry_hash`) that chains to the previous
entry, plus an HMAC that seals the hash with a workspace-specific key.
Together these make any retroactive modification detectable.

---

## Shipped PRs (merged to `main`)

| PR | Title | What it added |
|----|-------|---------------|
| #234 | action ledger hash-chain plan | `docs/security/action-ledger-hash-chain-plan.md` — end-to-end design |
| #235 | hash-chain canonicalizer/verifier foundation | `hash-chain-canonicalizer.ts`, `hash-chain-verifier.ts` |
| #236 | hash-chain sealer foundation | `hash-chain-sealer.ts` (`sealLedgerEntry`, `appendSealedEntry`) |

All three PRs are merged to `main`. The primitives layer is complete.

---

## Current Local Branches (overnight build, not yet pushed)

| Branch | Worktree | Commit | Content |
|--------|----------|--------|---------|
| `test/hash-chain-golden-vectors` | `Oria.HQ.worktrees/golden-vectors` | fc66099 | 31 golden-vector tests covering canonicalizer, verifier, sealer |
| `test/hash-chain-edge-guards` | `Oria.HQ.worktrees/edge-guards` | f1f5f2c | 33 adversarial-input tests (nulls, undefined, bad prev_hash, tampering) |
| `docs/hash-chain-track-status` | `Oria.HQ.worktrees/track-status` | this | This status document |

---

## Primitive API Surface (post-#236)

### `hash-chain-canonicalizer.ts`
- `stableStringify(value)` — deterministic JSON serialization (mirrors `JSON.stringify`)
- `canonicalizeEntry(entry)` — produces single-line `{"v":1,...}` with `CANONICAL_FIELD_ORDER_V1`
- `computeEntryHash(entry, prevHash)` — `sha256(canonical + "\n" + (prevHash ?? ""))`
- `CANONICAL_VERSION = 1`

### `hash-chain-sealer.ts`
- `sealLedgerEntry(entry, { prevHash, hmacKey })` — validates inputs, returns entry + `entry_hash` + `hmac` + `canonical_version` + `prev_hash`
- `appendSealedEntry(chain, entry, { hmacKey })` — pure function; returns new array with sealed entry appended

### `hash-chain-verifier.ts`
- `verifyChain(entries, { hmacKey })` — FAIL-CLOSED; returns `{ ok: true }` or `{ ok: false, brokenAt: number, reason: string }`

### Canonical field order (`CANONICAL_FIELD_ORDER_V1`)
```
id, workspace_id, user_id, agent_id, skill_id, mission_id,
action_type, event_type, summary, autonomy_level,
requires_confirmation, payload, metadata, created_at
```
Absent fields → `null`. Unknown fields → stripped.

---

## What Is NOT Yet Done

### In-memory shadow writer
A pure TypeScript helper (`hash-chain-shadow-writer.ts`) that accumulates sealed
entries in memory without any DB reads/writes. Needed before the real DB writer
can be wired. Planned as a local branch this session.

### DB writer integration
Reads `action_ledger` rows, seals each with the chain-tip prevHash, writes back
`entry_hash` + `hmac`. Requires:
- HMAC key provisioned per workspace (env/secrets, not in this repo)
- DB migration for `entry_hash`, `hmac`, `canonical_version`, `prev_hash` columns
- Service-role executor to seal at write time

**This work is deferred** until the shadow writer is validated and the key
management strategy is decided. No DB changes are in scope for overnight builds.

### Reconciliation / audit script
A CLI that reads a range of `action_ledger` rows and verifies the chain.
Planned after DB writer is wired.

---

## Dependency Graph

```
#234 plan
  └─► #235 canonicalizer + verifier
        └─► #236 sealer
              ├─► shadow writer (local, in progress)
              │     └─► DB writer integration (future, needs migrations + secrets)
              └─► golden-vectors tests (local, done)
              └─► edge-guard tests (local, done)
```

---

## Risk Register

| Risk | Severity | Note |
|------|----------|------|
| HMAC key management | High | Keys must never be in source; provisioning strategy TBD |
| DB migration scope | Medium | Columns needed; must be a coordinated deploy |
| Backfill of existing rows | Medium | Existing rows have no hashes; initial chain anchoring needs a plan |
| Shadow writer → real writer gap | Low | Pure functions tested; integration wiring is next hard step |

---

## Next Human Action

Michael should review and push these three local branches as PRs when ready:
1. `test/hash-chain-golden-vectors` (fc66099)
2. `test/hash-chain-edge-guards` (f1f5f2c)
3. `docs/hash-chain-track-status` (this)

No DB changes, no migrations, no env changes in any of these branches.
