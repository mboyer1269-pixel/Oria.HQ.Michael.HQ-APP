# Private host discovery of confirmed launches

`src/scripts/openhands-pending-launches.mjs /protected/profile.json [afterMissionId]` is a Linux root-only read command. It inherits the existing HQ server environment; no credentials or project content appear in its output. The profile and every ancestor must be root-owned, non-writable by group/others and free of symlink indirection. Configuration is bounded to 16 KiB.

The profile contains exactly `{context:{workspaceId,actorId,runnerId},config}`. Config follows the shared launch configuration schema and must match the runner. This is an operator-controlled profile, never supplied by a browser or agent. Do not expose this CLI as a public API.

The reader queries existing mission claims in the configured workspace for the configured owner/runner, state `claimed`. It reads at most 20 records ordered by mission UUID, then performs at most four simultaneous canonical lifecycle preparation checks. These verify the exact dossier, configuration and still-valid authority. No claim, authority renewal, checkout, container or model call is created by discovery.

Output `ready` contains minimal job references (mission ID, launch ID, payload hash, expiry), scanned/rejected counts and `nextAfterMissionId`. Continue with that cursor until null, then begin a new polling cycle. Rejected records still advance pagination; expired records must not starve later work. Read failures return `unavailable`, not a misleading healthy empty queue. Invalid input returns `invalid_request`. CLI exit0 means ready, exit3 means service rejection/unavailability, exit2 means protected-configuration/CLI failure. No automatic retry is implemented by the command.

Discovery is advisory and may become stale immediately. A future host consumer must recheck authority through existing preparation, reserve the filesystem directories exclusively, and let the existing dispatch CAS choose a single creator. Never treat the returned job list as a new authorization. Do not delete partial jobs to force a retry.

2026-09-30 qualification: the disposable PostgreSQL/PostgREST harness invokes both the actual reader and this exact CLI. It finds the one confirmed job, excludes a foreign workspace and refuses a world-writable profile. The subsequent actual host preparation/dispatch remains functional, verifies the exact commit and records the Claude authentication-required process exit. Six ledger events survive database restart. No provider account/model request, public ports, production DB, owner-auth or RLS qualification.

The discovery command is not yet installed as a continuously running production service. The next integration is a protected consumer that passes these references into existing preparation and dispatch, with bounded concurrency and explicit reconciliation of uncertain attempts. Provider authentication/network profile and a successful independently reviewed coding mission are still required.
