# Provider profile binding — local implementation, 2026-09-30

The optional `config.providerProfile` is public policy metadata, not an active provider connection. The current host cannot execute a profile-bearing job. The preview displays that limitation and disables confirmation in the UI; the host independently refuses it before checkout preparation and again before socket/container creation. A direct API caller cannot bypass those execution guards.

The strict profile schema accepts only `id` (lowercase slug, max 80 characters), `policySha256` (64 lowercase hexadecimal characters), `provider: "claude"`, `authentication: "subscription"`, `network: "restricted-proxy"`, and `accountConnectors: "disabled"`. These are requested policy attributes, not a claim that a proxy or subscription connection exists. No credential, host path, arbitrary connector, or unknown property is accepted.

The complete parsed configuration already participates in the canonical launch hash. Adding, changing, or removing the profile therefore invalidates previous preview confirmations and persisted launch authority. An absent profile stays absent: no default is inserted into legacy offline bindings.

`policySha256` must eventually identify a verified operator-owned policy manifest. This change validates its format and binds its value, but does not compute or verify the manifest content. Before enabling profiles, implement host manifest verification, enforce network and authentication boundaries, qualify actual account refresh and tool review, then remove the explicit unsupported-profile guards only when those paths pass integration tests. Never treat a well-formed digest as proof of enforcement.

No provider secret, OAuth consent, runtime network, active VPS service, or deployment image was changed for this contract. Existing account consent and project-memory publication remain separate prerequisites.

Regression coverage: adding/changing/removing the policy invalidates approval; persisted old authority is rejected even with a fresh preview hash; secrets/paths/unknown policies are rejected; offline configuration remains unchanged; consumer and worker deny before side effects. Test doubles verify these boundaries without contacting a model.

Validation on 2026-09-30: HQ OpenHands suites 76 passed, 2 conditional Memex integration tests skipped; host Python suite 81 passed, 8 platform-dependent tests skipped on Windows; deployment bundle 3 passed. Typecheck, build and local Joris smoke passed. Lint exited 0 with five warnings in files untouched by this change. Build reported missing Inngest keys: scheduled production jobs were not qualified. No provider call or deployed integration success is inferred from these results. No commit or push was made.
