# Personal companion connection: bounded implementation plan

## Baseline and authority

Continue `builder/agent-connections-foundation`, not a replacement checkout of main.
Baseline inspected: `f4b3b2a10f572b34fcd01959b211dc72636908ac`, PR #400 open and unmerged.
Michael explicitly requested cloud implementation, small verified increments and no dependency on his PC.
No provider prompt, live pairing, production database operation, SSH, secret creation, deployment,
commit or push is authorized by this plan. The June context pack is historical; current repository
rules and Michael's current mandate govern this work.

## Increment 1: exact selection contract (this change)

Add a server-only pure validator and tests, leaving existing runtime behavior intact.
The selected tuple names a connection UUID, authenticated owner UUID, workspace, opaque host UUID,
canonical account UUID, provider, implemented adapter, exact model and monotonic configuration revision.
Evidence carries the same tuple. A different account, host, connection, model or revision cannot
reuse an observation. Revocation, pending pairing, stale/future evidence and login-only observations
refuse. Evidence authorship (`recordedBy`) is never account ownership.

`consistent` means only that the supplied snapshots agree. `externalEffectAllowed` remains false.
This module has no runtime caller, database adapter, pairing credential or permission grant.
Server-loaded data and authenticated observation origin are prerequisites for any future caller.
Tests use fixtures only; they do not qualify a host or a model. The existing provider-keyed store
still has its documented overwrite limitation; this change does not claim to repair it.

## Increment 2: connection-keyed persistence and canonical identity lookup

Prepare additive migration candidates and mocked repository tests before applying anything.
Keep `account_identities` as the sole account registry; add an opaque-reference lookup scoped to
workspace and provider, returning no email. That registry does not currently establish owner-to-account
ownership: owner approval and proof of control of the paired host/client must establish it separately.

Connection rows must reference the canonical account and hold owner/workspace/host, adapter/model,
revision, lifecycle state and revocation metadata. Connection-keyed observations must reference the
exact connection/revision/selection, with server-assigned receipt time and authenticated host provenance.
The paired host UUID is a new opaque reference: the older local diagnostic accepts generic host
references. An explicit verified mapping is required; never coerce or silently reuse a host label.
Use a composite uniqueness/FK design so cross-workspace or cross-provider account substitution fails.
Do not reuse `(workspace_id, provider_id)` for multiple connections. Keep legacy data on its legacy path;
never promote old observations into paired-host evidence. No production migration in this increment.

## Increment 3: authenticated, revocable companion transport

Verify current official Claude client authentication, automation and hosting conditions before
implementing client execution. Qualify one explicitly selected personal execution host independently
of Michael's broken PC. Cloud development access is not access to that host or its Claude login.

Design owner-approved pairing, host proof of control, expiring one-use challenges, anti-replay,
bounded payloads, credential rotation and revocation. Any real credential provisioning needs separate
authority; tests use fixtures. A browser may choose opaque references, never commands, paths or tokens.
Prefer an outbound companion connection; do not introduce an unaudited public executor endpoint.
HQ consumes authenticated observations, never caller assertions of pairing or inference.

## Increment 4: one HQ mission, then independent validation and Atelier

Before sending one useful mission, Michael chooses its bounded objective and allowed files/tools.
Bind approval to mission payload, connection/account/host/adapter/exact model/revision, limits and expiry.
Recheck current selection, revocation, canonical identity, native account and exact model immediately
before the provider prompt; deny on unavailable state. Existing Sentinelle, permissions, ledger,
duplicate/uncertain-attempt protections remain authoritative. No paid-API fallback.

Test cancellation before dispatch and during execution, disconnect/timeout, duplicate delivery,
revocation during work and uncertain outcomes. Cancellation is a request until executor acknowledgement;
do not claim a stopped provider or retry an uncertain launch without reconciliation.
Collect result, diff, tests and independent review, then record the qualified outcome in Atelier.
No new mission has been sent by this work. Extend to other providers only after this vertical passes.

## Validation and rollback

Run focused selection tests, typecheck, lint, build and `smoke:joris` under Node 22.22.3;
report failures and environment limitations without borrowing prior CI results.
Inspect status/diff before any publication. No new dependencies, production configuration or migrations
are part of increment 1. Rollback of this unconnected increment consists of removing its new module,
test and plan after review; no persistent product state exists to compensate.

## GO / NO GO

GO for the next offline increment only after the contract checks and independent review pass.
NO GO for live pairing, provider inference or mission execution until persistence, authenticated
transport, owner approval, cancellation and final selection recheck are independently qualified.

## Cloud qualification receipt (2026-10-22, America/Toronto)

- Node 22.22.3 installed outside the repository; lockfile installation succeeded without changes
  to dependency manifests, engine constraints or credentials.
- New focused suite: 10 passed; independent read-only reviewer repeated 10/10 successfully.
- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0, 8 warnings in unchanged files, no errors.
- `npm run build`: exit 0. Existing `document-index.ts` dynamic-filesystem tracing warning remains;
  optional provider/scheduler configuration is absent. A build is not a configured deployment.
- `npm run smoke:joris`: exit 0, local persistence, no Supabase write.
- `npm test`: exit 1; 4,535 tests, 4,526 passed, 8 skipped, 1 failed. The unchanged
  `src/server/missions/openhands-control-client.test.mjs` cannot bind its local Unix socket
  (`listen EPERM`). Reproduced in isolation with a workspace-local TMPDIR as well as `/tmp`.
  No test was disabled or rewritten. The complete suite is not qualified green in this sandbox.
- Independent review: no concrete blocking defect in the pure validator. Paired host UUID vs.
  historical generic host reference requires explicit mapping in the future integration.
- Changed work: three new files only (this plan, the validator and its focused test).
  No commit, push, new CI run, deployment, account connection or mission was performed.

Publication qualification remains READY AFTER an exact-patch CI run on an environment allowing
the existing Unix-socket test. Any commit/push needs Michael's explicit approval per repository rules.
