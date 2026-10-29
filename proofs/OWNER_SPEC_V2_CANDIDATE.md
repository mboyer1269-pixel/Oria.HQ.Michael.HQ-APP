# Owner-operated specification v2 — validation candidate, DO NOT MERGE

This unmounted local-development candidate is stacked on PR462 exact commit
`8e16f42b1dac82a1aaa81cff21f5cd5d6e3e44a3` (tree `72283a904e53bdd5fbbc3affa085ba066be0162b`),
which depends on unmerged G1 PR457 `b79e1cef590a071caa271b514b18abe24563b92a`.
It is not based on current main and is not release-ready. No source G1 branch,
production configuration, credentials, license or v1 receipt flags are changed.

## Complete bounded verification path

An **unmounted** handler uses the actual workspace session/owner/subscription-holder
checks, strict commands and same-origin, UTF8, byte and five-second body bounds.
`review` persists exact server-derived mission/run/installation/SHA/instruction
bytes and an expiring hash. `confirm` repeats source/host checks; the narrow
`atelier.spec.start` rule requires approval, without weakening unknown-action BLOCK.
A real G1 owner decision is produced and consumed in the same transaction as a
sealed ledger append and v2 admission. Only a fresh acknowledged admission plus
current identity/revocation/expiry checks reaches the exclusive local engine marker.
The G1 event's four true flags still mean that an event alone authorizes no execution.
No new autonomous agent license exists; builder/spec.draft remains an instruction profile.

The engine has **no real provider installed**. Its injected test provider is either
an explicitly simulated process or a controlled real Node child. The latter checks
exact prompt bytes, writes deterministic SPEC.md and synthetic model/session records,
and denies networking. This is NOT Codex/model output, authenticated subscription
qualification, successful bwrap execution or proof of OS sandbox enforcement.
The proposed invocation is read-only repository plus writable SPEC.md only; the
candidate has no credential mount or live network. Legacy mutation entrypoints reject
bound runs. No git staging, automatic commit, command step or fallback is allowed.

Observed artifact bytes, SHA256, exact run/attempt/decision/SHA manifest and result
are persisted on the canonical mission with another sealed ledger append. `recover`
reads that result. If publication failed before DB commit, explicit recovery may
re-read a validated local artifact and idempotently publish evidence only: never
qualify, approve, launch, or rerun the provider. Uncertain/missing evidence stays
reconciliation_required. This is NOT same-session resume-spawn and NOT exactly-once
external execution. Revocation prevents future admission/current-check dispatch;
it cannot retract an already-started process. Historical evidence may still be recorded.

## DB and trust boundary

Unnumbered draft SQL only; never applied to production. Existing canonicalizer/HMAC
sealer and ledger constraints are reused. SQL checks exact sealed content/byte hash
and expected tail under workspace lock; the HMAC key remains exclusively server-side.
No second ledger/canonicalization algorithm, broad grant, RLS bypass policy, index
relaxation or catch-and-succeed after consume was introduced. RPC/helpers are invoker,
service_role only. The caller must be the authenticated owner handler; service_role
is trusted, not proof of human identity by itself. Strict SQL shape/bounds supplement
existing TS cryptographic source/binding reconstruction. This is not a cryptographic
audit of all historic ledger rows.

## Tests and evidence limits before CI

- Recovered from exact remote PR462 after cloud workspace replacement. Old unpublished
  source bytes were unavailable; this implementation was reconstructed and retested,
  not falsely claimed recovered byte-for-byte.
- Node22.23.4: **161/161 targeted tests**, zero skipped/failures, including contracts,
  real controlled fake child, store uncertainty, request auth/stream timeout, recovery,
  exact import graph inventory, prior LOT4 tests and G1 refusal tests.
- Typecheck, lint (zero errors;13 inherited warnings), generated map/layering and Joris
  booking smoke pass. No broad global network-test retry was performed.
- Local build compiled/generated37 pages but **EXIT1**, because a process-local guard
  blocked1 network attempt. Destination was not captured; no claimed transmission,
  attribution or exposure. Protected Next config/security advisory checks unchanged.
- Independent scoped reviewers validated source and reproduced targeted tests.
- **v2 SQL not yet executed.** The new workflow must execute all13 actual isolated
  PostgreSQL16.4/PostgREST12.2 proofs; zero skipped tests and zero unexpected fetches.
  Proofs include actual owner producer, two observed admission lock waiters, full
  rollback AFTER consume+ledger, nonempty chain, revocation/expiry, raw-RPC malformed
  binding, lost ACK, actual Node restart recovery, local-evidence republication and
  role denial/revert. DI/static checks do not substitute for these proofs.

## Rollout boundaries

Publication is authorized only as draft+isolated CI validation. No merge, production
migration/deployment, public runtime URL mounting, live provider activation, spending,
new credentials or autonomous powers are authorized. A compatible host and reviewed
subscription/network confinement adapter remain separate prerequisites. PR463 UI and
reservation preparation are on another stack and are not silently included here.
The inherited G1 CI baseline remains separately red; do not describe the entire system
as ready. SQL revert removes only v2 functions and preserves all recorded facts.
