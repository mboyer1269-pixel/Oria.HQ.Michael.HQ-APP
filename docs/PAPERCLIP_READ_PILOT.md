# Paperclip read-only pilot

This slice adds authenticated `GET /api/orchestration/missions`. It is disabled by default and does not create, queue, retry, cancel or execute work. No Paperclip code was installed or executed to implement it.

The Missions page now provides a read-only orchestration panel. Loading is explicit and refresh is manual, with no polling or persisted duplicate tasks. The panel distinguishes not-yet-read, loading, disabled, unconfigured, unbound workspace, access denial, transport failure and a validated empty list. It checks the returned workspace against the page workspace and cancels in-flight reads when unmounted. The UI labels completion as reported by Paperclip and keeps independent validation, token use and provider availability unknown. Company tasks are not implicitly matched to HQ mission dossiers. Only the latest 50 tasks are shown; opaque agent identifiers are not presented as names.

The server resolves the owner's active HQ workspace and matches it to one explicitly configured Paperclip company. The browser cannot choose a destination, company, workspace, token or query filter. All query parameters are rejected. Configure the five fields documented in `.env.example` through deployment configuration and its secret store; never put the token in public client configuration.

The configured base URL must be an HTTPS origin without credentials, path, query or fragment. HTTP is allowed only on explicit loopback hosts for local testing. Redirects are rejected. A dedicated non-admin Paperclip board identity should have membership only in the mapped company; board-token expiry/rotation remains an operator responsibility. A Paperclip project is not assumed to provide the company security boundary.

The client requests the 50 most recently updated issues from `/api/companies/{companyId}/issues`. It validates the full-list array against the pinned Paperclip source contract, rejects foreign-company rows and duplicates, and strips descriptions, provider metadata and other unneeded fields. The returned page may be incomplete; `mayHaveMore` is conservative and no total is invented. Result status is Paperclip's reported status, not independent evidence of successful delivery.

Limits: five-second deadline, 512 KiB response body, no retry, no shared response cache. Error responses expose only stable generic codes, never upstream error text, tokens or connection URLs. A missing/disabled/mismatched binding fails closed without fetching. This is a read projection, not a second task database.

Source inspected: local Paperclip commit `29c8fb0b66cb01167f71e7107a89628e36b5e032`, `server/src/routes/issues.ts` list route, `packages/db/src/schema/issues.ts`, and shared issue statuses. Its API returns an array for the default full-list request. A future API change fails validation rather than silently changing semantics.

Validation uses synthetic responses and the established owner-auth denial hook. The provider itself and deployment credentials are not verified by these tests. Before enabling: provision authenticated Paperclip/private networking and durable storage, configure a least-privilege company identity, verify a real read, and confirm cross-company denial. Live execution remains a separate gated integration.
