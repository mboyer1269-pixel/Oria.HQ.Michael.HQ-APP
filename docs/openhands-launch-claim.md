# Closed OpenHands launch claim

This tranche adds no route, Docker call, scheduler, provider request or activation.
Every result has externalEffectAllowed=false. The owner-facing confirmation of a
submission is not authorization to launch: a separate ledger decision uses scope
openhands.launch and binds the audited reservation payload hash plus image digest,
runner, executor version, permission policy and budgets in launchHash.

The service receives authenticated context only from a future trusted server
boundary. The browser must never construct authority records. Confirmation sends
only an expected launch hash; canonical authority is persisted/read from the
existing action ledger. Ten-minute authority is insert-or-ignore and cannot be
silently refreshed by retry. Expired authority requires an explicit future renewal
design; none is implemented here.

A full mission input/version CAS reserves one launchId/containerName. Prior claims
always require reconciliation, regardless of their state. Ambiguous writes are
closed. This is not exactly-once Docker execution and lease takeover is absent.
The trusted-host lifecycle service now persists ordered transitions through the
same CAS: claimed → creation_requested → container_created → start_requested →
execution_finished. It binds the runner, launch ID, image, commit, reservation,
canonical dossier, and full container ID. Creating and starting require a fresh
read of unexpired launch authority; recording observed effects can happen after
expiry. Process exit zero never sets independent validation or mission success.
No HTTP transport, host worker authentication or Docker dispatch is wired yet.

Before execution wiring: canonically reload the original dossier, verify its
commit and prepared checkout, implement revocation/admission and runner identity,
qualify budget enforcement, and inspect existing containers before retry. The
current hardTokenLimitEnforced=false explicitly prevents claiming full budget
enforcement. Authority is submission/launch intent, not individual tool approval.

Validation: targeted launch service tests cover concurrent CAS, scope/hash/expiry
rejection, changed config, ambiguous committed writes, lifecycle CAS races,
container mismatches and foreign runners. Real Supabase authority
and CAS integration plus the global repository gates remain required before any
deployment claim. No database writes are made by the targeted unit tests.

Future Docker wiring must configure bounded log retention (`max-size` and
`max-file` on a compatible logging driver). Redirecting client stdout to DEVNULL
does not bound daemon container logs. Keep diagnostic logs within the same
workspace retention policy without allowing unbounded disk growth.
