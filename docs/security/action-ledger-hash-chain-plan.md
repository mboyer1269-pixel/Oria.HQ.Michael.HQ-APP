# Action Ledger Hash-Chain Immutability — Plan & Proof Design

Status: **Planning / proof design only. No migration, no code, no DB change.**
Repo: `C:\Users\micha\Dev\Oria.HQ` (canonical — never the OneDrive copy).
Authored: 2026-06-08. Owner: ledger security architecture.

> This document designs the future append-only, tamper-evident hash chain for
> `public.action_ledger`. It is a **design-only** artifact. It does **not** add
> SQL, a migration, a `ledger_writer` role, triggers, or HMAC code. No claim of
> hash-chain immutability may be made anywhere in the product until a verifier
> exists and proves an intact chain (see §4 and §6).

---

## 1. Current state (repo truth)

| Fact | Status | Evidence |
|---|---|---|
| `public.action_ledger` table exists | ✅ | `db/schema.sql`; row mapping in `src/server/actions/action-ledger-repository.ts` |
| Workspace schema hardening (`workspace_id` NOT NULL + RLS enabled + index) | ✅ | PR #227; `db/migrations/0020_action_ledger_workspace_scope.sql` |
| Green-lane **ledger pre-dispatch** guard (journal-then-act) | ✅ | PR #218; `src/server/runtime/green-lane-execution-service.ts`, `green-lane-ledger.ts` |
| Workspace auth/session context boundary documented | ✅ | PR #228; `docs/security/workspace-auth-context-contract.md` |
| Ledger writes go through a server-side helper on the service-role client | ✅ | `src/server/actions/ledger-events.ts` → `recordLedgerEvent`; `src/server/supabase/admin.ts` |
| **Hash-chain immutability (prev_hash / entry_hash / HMAC / immutability trigger)** | ❌ **NOT delivered** | 0 markers in `db/` or `src/` (verified by `scripts/audit/repo-truth.ps1`, snapshot `docs/audit/REPO_TRUTH_2026-06.md`) |

**Implication.** Today the ledger is an ordinary append table. Rows are written
in the correct *sequence* (#218 guarantees decision + pending-dispatch are
recorded before any dispatch), but nothing makes a row **tamper-evident**: a
holder of the service-role key (which bypasses RLS, per #228) could in principle
`UPDATE`/`DELETE` historical rows with no cryptographic trace. Closing that is
the goal of the future work designed below.

---

## 2. Future migration goals (design targets — not implemented here)

The following are the intended building blocks. Each is described as a design
target; none is added in this PR.

### 2.1 Chain columns (per ledger row)
- **`prev_hash`** — the `entry_hash` of the immediately preceding row in the same
  chain (NULL only for the genesis row of each chain). Establishes linkage.
- **`entry_hash`** — `sha256(canonical(row) || prev_hash)`. The row's identity in
  the chain; any change to the row or its predecessor breaks it.
- **`hmac`** — `hmac_sha256(LEDGER_HMAC_KEY, entry_hash)`. Proves the row was
  sealed by a holder of the secret key, not merely re-hashed by an attacker who
  rewrote the chain.
- **`canonical_version`** (smallint, default 1) — the version of the
  canonicalization rules used to compute `entry_hash`, so the serialization can
  evolve without invalidating historical rows.

### 2.2 Canonical payload version (deterministic serialization)
- A single, frozen function defines how a row is turned into bytes before
  hashing: a fixed field order, fixed key ordering for `jsonb`, explicit
  null handling, UTF-8, and a fixed timestamp format (e.g. RFC3339 with fixed
  precision). The exact recipe is pinned and **never changed in place**; changes
  bump `canonical_version` and apply only to new rows.
- Goal: the same logical row always serializes to the same bytes on any machine
  (determinism is a hard requirement for verification — see §4).

### 2.3 Immutable UPDATE/DELETE trigger
- A `BEFORE UPDATE OR DELETE` trigger on `action_ledger` that raises an exception,
  making historical rows append-only at the database level (defense in depth on
  top of role restriction in §2.6).

### 2.4 Advisory lock strategy (per workspace/client chain)
- The chain is **per workspace** (and, when multi-tenant lands, per
  `(client_id, workspace_id)`). Each append must read the current tail's
  `entry_hash` and insert the next row atomically, or two concurrent writes could
  both claim the same `prev_hash` and fork the chain.
- Design: take a transaction-scoped Postgres advisory lock keyed by the chain
  identity (e.g. `pg_advisory_xact_lock(hashtext(workspace_id))`) around the
  read-tail-then-insert sequence. The lock is released automatically at
  transaction end. This serializes appends per chain without blocking other
  chains.
- Open question to resolve at design time: advisory lock vs. a `SELECT … FOR
  UPDATE` on a per-chain "tail" row vs. a unique constraint on
  `(workspace_id, prev_hash)`. The unique constraint is the cheapest
  fork-prevention and should be evaluated alongside the lock.

### 2.5 Verification script / endpoint
- **Admin endpoint** (server-side, authenticated, never client-exposed) that
  recomputes the chain for a workspace over a range and returns
  `{ ok, brokenAt?, count }`.
- **CI / cron script** (PowerShell, read-only, in `scripts/`) that runs the same
  verification and fails the job if the chain is broken. Mirrors the existing
  read-only diagnostic pattern (`scripts/audit/repo-truth.ps1`).
- Verification recomputes `entry_hash` from `canonical(row)` + stored `prev_hash`,
  re-derives `hmac`, and checks linkage row-to-row. **Fail closed** (see §4).

### 2.6 Writer-role restriction (design note)
- A dedicated least-privilege Postgres role (working name `ledger_writer`) with
  `INSERT` + `SELECT` only — no `UPDATE`/`DELETE` — would be the runtime identity
  for ledger appends, replacing blanket service-role writes on this table. This
  is a **design target only**; this PR does not create any role.

### 2.7 Rollback strategy (for the future migration)
- The future migration must ship with a paired revert path that drops the
  trigger, drops the chain columns (or leaves them nullable and unused), and
  reverts the role grant — applied only after explicit GO.
- Because the chain columns are additive and the trigger is the only behavioral
  change, rollback is low-risk **provided** no product surface has begun
  asserting immutability. Sequencing: never expose a "tamper-proof" claim until
  after the verifier has run green for a sustained window (§6).

---

## 3. Non-goals (explicit, binding for this PR)

- ❌ No migration in this PR. No `db/migrations/*.sql` added or edited.
- ❌ No production database change of any kind.
- ❌ No runtime code change (no writer, no verifier, no canonicalizer).
- ❌ No service-role behavior change.
- ❌ No `ledger_writer` role, no trigger, no HMAC code.
- ❌ No hash-chain / "immutable" / "tamper-proof" claim in product, docs, or UI
  until a verifier exists and proves an intact chain.

---

## 4. Security invariants (must hold once implemented)

1. **Append-only.** No `UPDATE` or `DELETE` on ledger rows — enforced by trigger
   (§2.3) and role restriction (§2.6), defense in depth.
2. **Tamper-evident.** Any change to a row's content, order, or a predecessor
   breaks `entry_hash` linkage and is detectable by the verifier.
3. **Deterministic canonicalization.** The same logical row hashes identically
   everywhere; serialization rules are frozen and versioned (`canonical_version`),
   never mutated in place.
4. **HMAC seal.** `entry_hash` is sealed with a secret key so an attacker who can
   rewrite rows still cannot forge a valid chain without the key.
5. **Verification fails closed.** If the verifier cannot read a row, cannot
   recompute a hash, or finds any mismatch, the result is **NOT ok** (never a
   silent pass). CI treats a non-`ok` result as a hard failure.
6. **HMAC key never committed.** `LEDGER_HMAC_KEY` lives only in environment
   secrets, never in the repo, never in a migration, never in logs. Key rotation
   is handled via `hmac` re-sealing with a recorded key id — not by rewriting
   `entry_hash`.
7. **Per-chain atomicity.** Appends to a single workspace/client chain are
   serialized so the chain cannot fork (§2.4).
8. **No client-side exposure.** Verifier and writer are server-only; the
   service-role/`ledger_writer` identity is never reachable from client code
   (consistent with `docs/security/workspace-auth-context-contract.md`).

---

## 5. Future PR breakdown (ranked — each its own PR, GO required for 🔴)

1. **Migration draft (🔴, GO required)** — `db/migrations/00XX_action_ledger_hash_chain.sql`
   adds `prev_hash`, `entry_hash`, `hmac`, `canonical_version`; the immutable
   `BEFORE UPDATE OR DELETE` trigger; the per-chain fork-prevention (advisory
   lock and/or unique constraint); and a paired revert script. Ships as a
   **draft / not applied** — written, dry-run reviewed, **not** run against prod
   until explicit GO. Backfill of historical rows (genesis + recompute) is part
   of this draft's design.
2. **Writer + verifier service** — the deterministic canonicalizer, the append
   path that computes `entry_hash`/`hmac` under the per-chain lock, and the
   verifier that recomputes and validates a chain. Includes the server-side admin
   verify endpoint. Unit-tested against known-good and known-tampered fixtures.
3. **CI / admin verify script** — a read-only PowerShell script in `scripts/`
   (sibling to `repo-truth.ps1`) plus a CI job that verifies the chain and fails
   closed on any break; optional nightly cron. This is what licenses the product
   to *claim* tamper-evidence.

Rationale for order: the migration defines the shape; the service makes writes
chained and provides the proof mechanism; the CI/admin script institutionalizes
continuous proof. No "immutable" claim is made until step 3 runs green.

---

## 6. Acceptance criteria for the future implementation

Before any hash-chain work is considered complete:

- **Tests.** Canonicalization is deterministic (golden-vector tests); the writer
  produces a linked chain; the verifier returns `ok` on a good chain and
  **NOT ok** on every tamper class (row edit, row delete, reorder, forged
  `entry_hash`, wrong/absent HMAC).
- **Migration dry-run.** The migration is reviewed and dry-run validated (against
  a local/branch DB), never applied to prod without explicit GO.
- **Rollback doc.** A written, paired revert procedure exists and has been
  validated on the dry-run target.
- **Verifier proves chain integrity.** The admin endpoint and CI script both
  recompute and confirm an intact chain over real data for a sustained window
  (e.g. several consecutive green nightly runs) before any immutability claim.
- **Fail-closed proven.** A deliberately tampered fixture causes the verifier and
  the CI job to fail (not silently pass).
- **No prod migration without explicit GO.** The 🔴 migration is applied to
  production only on Michael's explicit written mandate.

---

## Related documents

- `docs/security/workspace-auth-context-contract.md` — service-role / RLS boundary (#228)
- `docs/EXECUTION_PHASE_STATUS.md` — current execution + ledger pre-dispatch status (#218/#232)
- `docs/roadmap/ORIA_HQ_A_TO_Z_RECONCILED_2026-06.md` — roadmap; hash-chain listed as deferred
- `docs/audit/REPO_TRUTH_2026-06.md` — ground-truth snapshot confirming 0 hash-chain markers (#233)
- `src/server/runtime/green-lane-ledger.ts`, `src/server/actions/ledger-events.ts` — current ledger write path
