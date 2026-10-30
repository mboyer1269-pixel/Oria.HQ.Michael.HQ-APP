# Atelier atomic boundary — validation candidate only

This draft is stacked on **G1 PR #457**, exact base
`b79e1cef590a071caa271b514b18abe24563b92a`, rather than main because it consumes
G1's single-use approval in the same transaction as the mission claim and sealed
ledger append. G1 is unmerged; this candidate is **not approved for merge,
production migration or runtime activation**. No public route calls this module.
The two development-contract prerequisite files are byte-identical to published
PR #461 commit `2f6620aba2c902397c475c09e3abc365f68c4541`.

## Evidence and limits before CI

Local Node 24.22.1: 83 contract/store/inventory tests plus 4 harness tests passed;
typecheck, lint (13 baseline warnings), system-map, layering and read-only Joris
smoke passed. Build compiled and generated all 37 pages but exited **1** because
a process-local network guard blocked an API attempt. Its destination was not
captured. Installed Next's background version/security assessment is a plausible
source, not observed attribution. No security advisory protection was disabled,
no external retry was made, and the build is **not reported as passed**.
PostgreSQL was unavailable locally: SQL, concurrency, rollback and privileges
remain **unproven until the actual isolated CI job passes**.

## Disposable proof harness

Run only through `.github/workflows/atelier-boundary-proof.yml`, or with an
explicit `--run` on a newly created disposable local database. It accepts only
`postgres://postgres@127.0.0.1:5432/oria_test_*` (no password or URL options) and
`http://127.0.0.1:3000`. It asserts an empty public schema before applying the
exact listed G1 schema bytes and this unnumbered draft. It never accepts a hosted
Supabase URL. The fixture key is synthetic and is not sent to PostgreSQL.

The workflow uses the existing G1 PostgreSQL 16.4/PostgREST 12.2.0 service pins,
read-only repository permissions, no secrets or deployment action, and no
`pull_request_target`. The proof's HTTP transport directly uses loopback and
rejects redirects, proxies and every path except three exact RPC endpoints.
Only fixed psql commands and `git show` are spawned, with a minimized environment;
no agent CLI is invoked. Dependency installation is separate from proof traffic.
`UNEXPECTED_NETWORK=0` refers to fenced application fetch attempts, not setup's
approved checkout/package/container downloads or unrelated inherited workflows.

Thirteen non-skippable DB scenarios cover exact TS bytes and lookup/replay,
two missions on a nonempty sealed chain, two claim sessions **observed waiting
on the same mission blocker's actual PostgreSQL lock chain**, stale source,
tampered envelope, invalid/revoked/expired/unsupported decisions, revocation and
expiry during observed waits, same-head contention, ledger-failure rollback,
lost acknowledgement with lookup/no resend, role denial, and revert preservation.
Hard timeouts fail proofs; cleanup releases/rolls back owned blockers. A canonical
receipt is historical evidence, never permission to execute or retry a process.
The existing v1 canonicalizer/sealer and unchanged ledger indexes remain decisive;
tail verification is not a full historical cryptographic audit.

Older unsealed LOT4 draft artifacts are superseded. Publication of this validation
candidate does not apply any SQL to production or grant a new agent capability.
