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

The track is being delivered **shadow-first**: every primitive, test, and audit
tool runs purely in memory or read-only. Promoting the chain into the live
ledger write path (columns, write-time sealing, backfill) is a separate,
mandate-gated step — see "What is NOT yet done".

---

## Shipped (merged to `main`)

### Foundations + test matrices (#234–#246)

| PR | What it added |
|----|---------------|
| #234 | `docs/security/action-ledger-hash-chain-plan.md` — end-to-end design |
| #235 | `hash-chain-canonicalizer.ts`, `hash-chain-verifier.ts` |
| #236 | `hash-chain-sealer.ts` (`sealLedgerEntry`, `appendSealedEntry`) |
| #234–#246 | golden vectors (31), edge guards (33), canonicalization regressions (37), bad-input matrix (68), shared test fixtures, and the in-memory **shadow writer** (`hash-chain-shadow-writer.ts`, #244); #246 cleaned up edge-guard lint |

### Operator audit layer + CI (#249–#254)

| PR | What it added |
|----|---------------|
| #249 | `hash-chain-audit.ts` — `auditChain()`, an operator-facing report over `verifyChain()` (verified count, genesis/tip, hmac flag, break index/reason, one-line summary) |
| #250 | `scripts/audit/ledger-hash-chain-audit.mjs` — read-only audit harness + `npm run ledger:audit`, wired into the CI `verify` job (fail-closed) |
| #251 | audit-script self-test now covers all three tamper vectors (content, linkage, hmac) |
| #252 | `.github/workflows/ledger-audit-nightly.yml` — scheduled + on-demand nightly audit |
| #253 | `npm run test:ledger-hash-chain` — targeted runner for the nine hash-chain test files (228 tests) |
| #254 | audit script gains a **JSON chain-snapshot** mode (audit an exported chain offline; entry_hash + linkage, no hmac key required) |

The primitives, the full test matrix, the in-memory shadow writer, and the
read-only operator/CI audit layer are all complete on `main`.

---

## Primitive API Surface

### `hash-chain-canonicalizer.ts`
- `stableStringify(value)` — deterministic JSON serialization (recursively key-sorted)
- `canonicalizeEntry(entry)` — single-line `{"v":1,...}` with `CANONICAL_FIELD_ORDER_V1`
- `computeEntryHash(entry, prevHash)` — `sha256(canonical + "\n" + (prevHash ?? ""))`
- `CANONICAL_VERSION = 1`

### `hash-chain-sealer.ts`
- `sealLedgerEntry(entry, { prevHash, hmacKey })` — validates inputs, returns entry + `entry_hash` + `hmac` + `canonical_version` + `prev_hash`
- `appendSealedEntry(chain, entry, { hmacKey })` — pure; returns a new array with the sealed entry appended

### `hash-chain-verifier.ts`
- `verifyChain(entries, { hmacKey })` — FAIL-CLOSED; `{ ok: true, count }` or `{ ok: false, brokenAt, reason, entryId? }`

### `hash-chain-audit.ts`
- `auditChain(entries, { hmacKey })` — structured `ChainAuditReport` over `verifyChain()`: `ok`, `count`, `verifiedCount`, `genesisId`, `tipId`, `hmacChecked`, `brokenAt`, `reason`, `brokenEntryId`, `summary`

### `hash-chain-shadow-writer.ts`
- In-memory accumulator of sealed entries — no DB reads/writes.

### Audit tooling
- `npm run ledger:audit` — fixtures + 3-vector tamper self-test (CI + nightly)
- `node scripts/audit/ledger-hash-chain-audit.mjs <chain.json>` — audit an exported chain snapshot
- `npm run test:ledger-hash-chain` — the nine hash-chain test files (228 tests)

### Canonical field order (`CANONICAL_FIELD_ORDER_V1`)
```
id, workspace_id, user_id, agent_id, skill_id, mission_id,
action_type, event_type, summary, autonomy_level,
requires_confirmation, payload, metadata, created_at
```
Absent fields → `null`. Unknown fields → stripped.

---

## What Is NOT Yet Done (mandate-gated)

Promoting the shadow chain into the live ledger requires explicit GO — it
touches the production DB, secrets, and the live `action_ledger` write path.

### DB migration
Adds `prev_hash`, `entry_hash`, `hmac`, `canonical_version` columns, the
immutable `BEFORE UPDATE OR DELETE` trigger, and per-chain fork prevention,
plus a paired revert script. Shipped as a draft, dry-run reviewed, **not**
applied without GO. Backfill of historical rows (genesis + recompute) is part
of this draft's design.

### DB writer integration
Reads `action_ledger` rows, seals each with the chain-tip prevHash, writes back
`entry_hash` + `hmac`. Requires:
- HMAC key provisioned per workspace (env/secrets, never in this repo)
- the migration above
- a service-role executor that seals at write time

### Live reconciliation
Wire the read-only audit (`auditChain` / `ledger:audit` snapshot mode) to a real
exported range of `action_ledger` rows once the columns exist. The tooling is
ready; only the data source is gated.

---

## Dependency Graph

```
#234 plan
  └─► #235 canonicalizer + verifier
        └─► #236 sealer
              ├─► shadow writer (#244, done)
              ├─► golden-vector / edge-guard / regression / bad-input tests (done)
              └─► audit report (#249)
                    └─► audit script + CI (#250–#254, done)
                          └─► DB writer integration (future — needs migration + secrets, GO-gated)
```

---

## Risk Register

| Risk | Severity | Note |
|------|----------|------|
| HMAC key management | High | Keys must never be in source; per-workspace provisioning strategy TBD |
| DB migration scope | Medium | Columns + immutable trigger; coordinated, mandate-gated deploy |
| Backfill of existing rows | Medium | Existing rows have no hashes; genesis anchoring needs a plan |
| Shadow → live writer gap | Low | Pure functions fully tested; integration wiring is the next hard step |

---

## Next Step

The shadow + audit layers are complete and continuously proven (CI `verify` +
nightly). The next track step — the DB migration draft (columns + immutable
trigger + revert script, applied to **nothing** until GO) — is **mandate-gated**
and must not start without Michael's explicit instruction.
