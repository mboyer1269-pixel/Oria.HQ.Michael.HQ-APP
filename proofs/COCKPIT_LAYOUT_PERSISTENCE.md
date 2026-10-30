# Cockpit layout preference contract — local candidate

Base: PR466 `ed17316b1f21b6a3dd2a31c9a355c0077c84e2f9`, itself stacked on PR463.
The published branch is not modified by this local worktree. No production SQL,
migration, auth/RLS change, provider, new dependency, permission or runtime route.

## Actual contract

Both existing server actions independently call `requireOwnerAccess('/hq/cockpit')`.
User id comes only from that session, with the existing default-workspace owner
membership rules. This preference remains per-user, not a new workspace/agent
capability. Service-role creation stays server-only; no browser identity parameter.

`getCockpitLayout()` distinguishes `loaded`, confirmed `missing`, `failed`,
`unavailable`, `forbidden`. Only confirmed missing uses the default order as a
persistable baseline. Failed reads carry no order; the UI may show a provisional
layout but disables saving and preserves its local order on failed reload.

`saveCockpitLayout({order, expectedRevision})` accepts all seven known widget IDs
exactly once, and an existing `updated_at` string or null (missing). Unknown keys,
including caller identity, are rejected. Server re-reads the baseline; failed read
never dispatches a write. Existing rows use owner+revision-filtered UPDATE, missing
rows use unique-key INSERT — never blind upsert. Revision is strictly advanced by
at least1ms beyond the parsed previous timestamp, including sub-ms Postgres values.
This protects concurrent writers using this contract; it is not an exactly-once
claim or a guarantee about arbitrary writers ignoring updated_at.

- `confirmed`: the actual mutation response contains the matching owner/order/
  version. ACK of that write, not a promise against later changes/storage loss.
- `not_attempted`: forbidden/invalid input/unavailable client/failed baseline read;
  no mutation was dispatched by this invocation.
- `conflict`: stale baseline, conditional UPDATE zero rows, or INSERT unique conflict.
- `unconfirmed`: post-dispatch transport/timeout/DB error or malformed ACK. The
  write may have committed. It is NEVER automatically retried or labelled absent.

Read/write representations must have the expected HTTP status, an explicit array
and matching exact count. Empty204, JSONnull, absent bodies/counts and the SDK
404-to-empty workaround are failures/unknown, never proof of missing/no effect.

Database requests have5s abort signals and explicit `.retry(false)`; aborting a
write is not proof of rollback. UI keeps local order and locks further saves after
uncertainty/conflict/no-attempt until an explicit **read-only reload** succeeds.
That gesture can replace the displayed draft with the recorded order; failed
reload does not replace it. Reload button remains mounted across pending/success
for keyboard focus. Same-tab single-flight prevents repeated drag submission.

## Evidence and remaining limits

Local tests use the **real installed Supabase SDK** with explicit fake fetch, and
auth-module DI; they are contract evidence, NOT a live authenticated DB proof.
State-machine tests cover pending, dropped ACK, read failure, explicit reload,
repeated drag and default-order overwrite prevention. No browser/mock test proves
production durability.

`prove-cockpit-layout-real-db.mjs` + workflow are a **NOT YET EXECUTED** disposable
CI proof candidate. Exact PG16.4/PostgREST12.2 pins reuse the previous isolated
proof pattern. The script rejects every URL except named empty loopback test DB
and fixed loopback REST, verifies migration bytes against the base, applies0019
and ONLY the cockpit restrictive-policy section of0025. It does not claim the rest
of0025 is applied/tested. Roles/auth.uid are synthetic fixture infrastructure;
actual owner-session gating is independently unit-tested, not a real login flow.

Eight required proofs: insert+fresh OS-process read; scoped update/foreign-row
preservation; stale/missing conflicts; two observed UPDATE lock waiters; actual
committed lost ACK with validated pre-loss HTTP ACK, advancing readback revision
and a real DB-rejection negative control of the same proof; read failure no mutation; DB
trigger refusal with preserved row; existing anon/authenticated RLS denial, including a matching synthetic owner UID
that would satisfy0019 without0025 restrictive policies.
No skip-to-green. Failed observation/timeout fails the job. Harness import/offline
target guards are testable here; actual DB execution requires isolated CI.

No local frontend build retried: the independently reviewed standalone offline
guard already demonstrated native SWC incompatibility on the parent UI candidate.
Next build must be proved on authorized CI; changing protected config or granting
native/network exceptions to force a local green result is out of scope.
