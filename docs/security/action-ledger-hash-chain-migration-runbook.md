# Action Ledger Hash-Chain — Migration Runbook (GO / Rollback)

Status: **Operator runbook for a mandate-gated migration. Nothing here is applied
automatically.** The migration is authored as a DRAFT under
`db/migrations/drafts/`; it is promoted and applied only on Michael's explicit
written GO, staging first.

Related: `docs/security/action-ledger-hash-chain-plan.md` (design, §2/§5/§6),
`docs/ledger/hash-chain-track-status.md` (track status).

---

## 1. What this delivers

Tamper-evident, append-only `action_ledger`: each row carries `prev_hash`,
`entry_hash`, `hmac`, `canonical_version`; fork-prevention indexes; and a
`BEFORE UPDATE OR DELETE` trigger making the table append-only at the DB level.

It is delivered in two apply phases with a code backfill between them, because
the immutability trigger blocks the backfill `UPDATE` once active, and the
fork-prevention indexes assume a fully sealed chain.

---

## 2. Artifacts (all present in the repo, none applied)

| Artifact | Path | Role |
| --- | --- | --- |
| Phase 1 columns | `db/migrations/drafts/action_ledger_hash_chain_01_columns.sql` | additive nullable chain columns |
| Phase 1 revert | `..._01_columns_revert.sql` | drops the columns |
| Phase 2 seal | `..._02_seal.sql` | fork-prevention indexes + immutability trigger |
| Phase 2 revert | `..._02_seal_revert.sql` | drops trigger, function, indexes |
| Post-apply verify | `..._hash_chain_verify.sql` | read-only `SELECT`s to confirm the applied state |
| Draft checker | `npm run ledger:check-migration-draft` | static completeness + revert-symmetry (CI) |
| Write flag | `src/server/ledger/hash-chain-write-flag.ts` | `LEDGER_HASH_CHAIN_WRITE`, OFF by default |
| Seal-plan contract | `src/server/ledger/hash-chain-write-plan.ts` | pure planner, not yet wired |
| Audit proof | `npm run ledger:audit` (CI + nightly) | fail-closed chain verification |

---

## 3. Environment / secrets (never committed)

| Variable | Purpose | Notes |
| --- | --- | --- |
| `LEDGER_HMAC_KEY` | seals `entry_hash` → `hmac` | provisioned in env secrets only; never in repo, migration, or logs. Rotation re-seals `hmac` with a recorded key id; it never rewrites `entry_hash`. |
| `LEDGER_HASH_CHAIN_WRITE` | enables live seal-on-append | absent/`0`/`false` = OFF (default). Only flip ON after Phase 1 + backfill on the target environment. |

Do not edit real `.env` files as part of this runbook; secrets are set through the
hosting provider's environment configuration.

---

## 4. Preconditions for GO

- [ ] Explicit written GO from Michael for the **target environment**.
- [ ] `npm run ledger:check-migration-draft` green (draft complete, revert symmetric).
- [ ] `npm run ledger:audit` and `npm run test:ledger-hash-chain` green on `main`.
- [ ] `LEDGER_HMAC_KEY` provisioned in the target environment's secrets.
- [ ] A recent backup / PITR window confirmed for the target database.
- [ ] Writer integration (the wiring that calls `planChainWrite`) reviewed — note
      it is intentionally NOT merged/enabled yet; enabling is part of this sequence.

---

## 5. GO sequence — STAGING FIRST

Run the entire sequence on staging and complete §7 before touching production.

1. **Promote the drafts.** Copy the four phase files out of `drafts/` to the next
   numbered slots (e.g. `0021_action_ledger_hash_chain_columns.sql`,
   `0022_action_ledger_hash_chain_seal.sql`) in a reviewed PR. The CI tripwire
   (`guard-hash-chain-not-live`) is expected to fail on that PR — that failure is
   the intentional GO checkpoint; relax it in the same PR with reviewer sign-off.
2. **Apply Phase 1 (columns)** on staging via the usual manual migration path
   (Supabase SQL editor / reviewed apply). Behavior is unchanged; rows are not
   yet sealed.
3. **Backfill** existing rows with the TS writer: for each workspace chain, in
   `created_at` order, compute genesis + recompute `entry_hash`/`hmac` and write
   them back. The immutability trigger is NOT yet present, so these `UPDATE`s
   succeed. Verify the chain in memory with the audit tooling before continuing.
4. **Apply Phase 2 (seal)** on staging: fork-prevention indexes + immutability
   trigger. After this, the table is append-only.
5. **Run `..._hash_chain_verify.sql`** and confirm every "Expected" note
   (columns present, 3 unique indexes, trigger BEFORE UPDATE OR DELETE, function
   present, 0 genesis forks, 0 unsealed rows).
6. **Enable the flag** on staging (`LEDGER_HASH_CHAIN_WRITE=1`) so new appends
   seal-on-write. Confirm new rows carry `entry_hash`/`hmac`.
7. **Soak.** Let several consecutive nightly `ledger:audit` runs pass green over
   real staging data before production (plan §6).

Production: repeat steps 1–7 against production only after staging soak is green
and Michael re-confirms GO for production.

---

## 6. Rollback (reverse order)

Rollback is low-risk **only while no product surface asserts immutability**
(plan §2.7). Per phase, in reverse:

1. **Disable the flag:** set `LEDGER_HASH_CHAIN_WRITE=0` (or unset). New appends
   stop sealing immediately.
2. **Phase 2 revert** (`..._02_seal_revert.sql`): drops the trigger first
   (restoring mutability), then the function and indexes.
3. **Phase 1 revert** (`..._01_columns_revert.sql`): drops the chain columns.
4. If the migration was promoted to numbered files, revert that PR (and the
   tripwire relaxation) so the numbered sequence no longer contains hash-chain
   DDL.

For a code-only issue (bad wiring) prefer step 1 alone — disabling the flag
restores current behavior without touching the schema.

---

## 7. Post-migration validation checklist

- [ ] `..._hash_chain_verify.sql` matches every "Expected" note.
- [ ] A manual `UPDATE`/`DELETE` on a ledger row is rejected by the trigger.
- [ ] `npm run ledger:audit` (snapshot mode) on an exported chain range returns OK.
- [ ] Nightly `ledger:audit` green for the agreed soak window.
- [ ] A deliberately tampered exported row makes the audit FAIL (fail-closed proven).
- [ ] No `using (true)` policy and no `service_role` policy was introduced.

---

## 8. Acceptance criteria (from plan §6)

Before any "tamper-proof" claim is made anywhere in the product:

- Deterministic canonicalization (golden vectors) — ✅ shipped.
- Writer produces a linked chain; verifier returns OK on good chains and NOT OK
  on every tamper class — ✅ shipped (verifier + audit + write-plan tests).
- Migration dry-run reviewed on a staging DB; never applied to prod without GO.
- Written, validated rollback (this runbook) — ✅.
- Verifier proves intact chain over real data for a sustained window.
- Fail-closed proven by a tampered fixture — ✅ (`ledger:audit` self-test).
- No prod migration without explicit written GO.
