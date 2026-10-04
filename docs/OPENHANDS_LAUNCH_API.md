# OpenHands launch confirmation boundary

The existing owner-authenticated POST `/api/orchestration/openhands` now accepts two additional actions. Both require the existing confirmation feature flag; launch additionally requires `ORIA_ENABLE_OPENHANDS_LAUNCH=1` and a valid server-only `ORIA_OPENHANDS_LAUNCH_CONFIG`. Defaults remain disabled. No runtime environment was changed by this implementation.

- `prepare_launch`: `{action, missionId}` returns the canonical launch binding for an already-reserved eligible mission. It does not write launch authority.
- `confirm_launch`: `{action, missionId, expectedLaunchHash, confirm:true}` persists exact owner authority and attempts a single canonical claim using the existing compare-and-swap service.

Unknown fields are rejected. Actor and workspace derive from the authenticated server context. Browser inputs cannot specify the image, runner, budgets, source directory, credentials or launch configuration. The existing same-origin, bounded-body, request-timeout and no-store protections apply.

The private JSON configuration follows `launchConfigSchema`: pinned image digest, executor version, runner ID, default-deny permission policy, cost/token/iteration/time limits and explicit `hardTokenLimitEnforced:false`. It is reread on every request, bounded to 4096 UTF-8 bytes, and strictly validated. A changed image or runner changes the launch hash; changed budgets must still match the canonical submission. A stale preview cannot authorize a different configuration.

`claimed` means a durable execution reservation, not agent startup. Responses retain `externalEffectAllowed:false`. Uncertain confirmation outcomes return reconciliation_required with no automatic retry. The host preparation/dispatch commands exist separately; no queue or host notification is wired by this API change. Do not enable this path as a complete orchestrator until the actual host workflow and provider profile are qualified.

## Mission UI

The mission dossier displays a launch panel only for durable missions with an existing reservation and both feature flags enabled. It fetches the server preview, displays commit/executor/budgets and requires a checkbox before confirmation. The common contract in `src/core/openhands-launch-contract.ts` is used by server and browser. Browser responses are bounded and checked against mission/workspace and the exact preview; a malformed or lost confirmation response never reports success.

A sessionStorage marker is written before confirmation, scoped by workspace and mission. It prevents a second attempt in that tab after remount; it is not the security or concurrency boundary (canonical server CAS remains authoritative). On uncertainty, refresh and reconcile server state. This first panel intentionally has no reset/retry control. Existing claims prevent new confirmation controls. Closing the tab does not cancel or undo a claim.

Browser qualification used the actual component in a synthetic fixture with stubbed HTTP: nominal response produced one confirmation and explicitly stated that startup was not confirmed; lost response produced one confirmation and no retry button. This verifies UI behavior, not owner authentication, persistence, host dispatch or full production styling. Fixture screenshot: `output/playwright/launch-response-lost.png`. The only browser console error was the fixture's missing favicon; dev CSP messages were report-only. The fixture browser and dev server were stopped afterward.

The 23 targeted launch/UI/HTTP tests pass, together with typecheck, lint (five existing warnings), build and Joris smoke. Product changes are local, not deployed.

Validation: 91 targeted tests passed on 2026-09-30 across HTTP handler, launch/lifecycle, server configuration and runtime capability inventory. They include forged client configuration, missing confirmation/hash, closed feature/configuration gates, changed server image invalidating the preview, concurrent claims and uncertain persistence. These tests do not prove authenticated browser-to-host execution or a successful model mission. No provider call or production deployment occurred.
