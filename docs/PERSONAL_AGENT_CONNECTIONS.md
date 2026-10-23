# Personal agent connections: implementation boundary

Status: initial coherence safeguards. Multi-account login and execution are not delivered by this change.

## Owner-visible connection status

The owner-only `/hq/runtime` page now reads the configured runner connection through the canonical launch configuration and the existing persisted-evidence reader. `getPersonalConnectionStatus` receives the actual `requireOwnerAccess` result and active workspace; the configured identity or evidence author never substitutes for the authenticated reader. Its public DTO contains bounded references and enumerated statuses. It excludes email, provider diagnostics, container paths, approval references and secret material.

The panel distinguishes implemented code, an observed account, fresh evidence, the selected confirmation transport and an independently verified mission. A positive persisted observation never verifies the operator-probe path, permission to launch or a completed mission. The page performs no active account probe, SSH, login or model call to populate this panel. Unknown storage/configuration remains unavailable. The existing local prototype section is explicitly identified as a reference rather than a current VPS status report.

Current storage remains single-connection: `provider_connection_evidence` uses `(workspace_id, provider_id)` as its key. Two accounts or hosts for the same provider would overwrite that evidence. A real multi-connection selector requires additive connection metadata, connection-keyed evidence and an explicitly approved selection binding. Account identities remain in the existing identity repository. `scope.ownerActorRef` identifies the authorized reader only; it does not assert ownership of the provider account.

## Current behavior

The OpenHands launch schema keeps both Claude and Codex profile identities for existing plans. The catalog does not establish that a runner implementation exists. The current Orchestrator runner implements the Claude ACP path only.

`resolveRunnerAdapterAvailability` in `src/server/missions/model-emission-launch-gate.ts` checks code support independently of caller-supplied catalog and connection evidence. Confirmation for an unavailable provider returns `runner_adapter_unavailable` with `externalEffectAllowed: false` before account probing, approval reads or dispatch. The HTTP handler maps this refusal to 409. HQ explains this confirmed refusal without claiming a launch or retrying it. Ambiguous responses retain the existing uncertainty and duplicate-attempt protections.

Claude must reference its matching subscription adapter. Existing workspace, attested account, approval, policy and final recheck requirements remain in force. An implemented adapter is not proof of a working login, model entitlement or completed mission.

Connection snapshots with future timestamps, malformed times or non-finite/negative freshness windows are stale. Zero age permits only the exact observation instant; the configured upper boundary remains inclusive.

## Connection design to extend

### Native Claude on a personal host

The local connection adapter is an explicit operator-only diagnostic boundary, not a browser login endpoint or a background worker. Its binding must name the authorized owner, workspace, personal host and prequalified absolute native executable. Cloud markers, a foreign owner/workspace/host, missing operator approval and Windows shell launchers are refused before subprocess execution. Only the existing version and noninteractive auth-status commands are allowed. The child environment removes API-key variables and injected Claude/Anthropic authentication tokens; the installed official client retains ownership of its native login.

`ORIA_ENABLE_LOCAL_CLAUDE_ATTESTATION` must be exactly `1` for any observation. A local production build additionally requires the existing `ORIA_ENABLE_LOCAL_RUNTIME_PROBE=1`. Neither flag replaces the written operator binding, and neither permits execution in a cloud environment. The example configuration leaves attestation disabled.

The adapter accepts a Claude account login only when the native response identifies that authentication mode. A bare `loggedIn`, organization identifier, API authentication or catalog entry does not attest a personal subscription identity. The canonical account identity repository resolves a random opaque account reference; no email or raw CLI diagnostics enter the returned observation. The observation is scoped to the personal host, carries no VPS-runner evidence and grants no chat, mission or tool execution rights. No page or API route calls this adapter automatically.

For the eventual HQ-to-companion connection, use an explicitly paired owner/workspace/host and a revocable connection identity. The browser must never supply a command, executable path or a provider token. Before enabling a mission, bind its approved connection, account, host, adapter, model and configuration revision, then recheck the same selection immediately before execution. The transport and connection-keyed persistence are still pending; a successful local diagnostic alone does not complete this pairing.

Reuse canonical HQ workspace, identity, conversation, mission, permissions and ledger contracts. Store only opaque connection/account/host references and observed capability metadata in HQ. The official native client owns provider authentication. A local companion, or an explicitly qualified private execution host, mediates the client transport. Do not collect provider passwords or copy consumer OAuth tokens into HQ.

ACP means Agent Client Protocol. It negotiates an agent session and authentication methods; it is not a universal subscription login. MCP supplies tool/data access and has its own authorization. Use each provider's official supported transport and deployment conditions rather than assuming all accounts expose the same protocol or entitlements.

Track catalogued, installed, account recognized, capability observed and mission independently verified as separate facts. Bind each selection to workspace, owner, host, adapter and opaque account reference. Keep conversation, coding and MCP capabilities distinct. Never silently switch a failed personal-account request to a paid API.

## Next acceptance milestones

1. Introduce the minimal operational connection metadata using existing account identity ownership, with multiple independently selected account references and no new credential store.
2. Qualify one Claude vertical through HQ: explicit account/host/model selection, native login, permission handling, cancellation, result and independent validation.
3. Add Codex's official native transport, then Gemini and Cursor ACP, each with its own implementation and evidence. Provider documentation and hosting/subscription eligibility must be checked at implementation time.
4. Route HQ conversations through selected agent sessions; govern MCP tools per workspace and mission. Neither is implied by a successful coding-agent login.

These safeguards do not activate a runner, change authentication, install a provider client, send a model prompt, migrate a database or deploy production. Infrastructure authentication and ledger HMAC secrets remain required independently of provider API usage.

## Dependency baseline

This change raises Next.js and its ESLint config from 16.3.8 to 16.4.2, and the MCP TypeScript SDK from 1.31.0 to 1.32.1. React stays at 19.2.6 and the existing security overrides stay in place. The direct-dependency audit policy is unchanged; transitive advisories and the existing ESLint tooling exception must still be reported honestly.

The lock also refreshes compatible transitive patches: proxy-addr 2.0.8, source-map-js 1.2.2 and Vite 8.3.5 with its matching Rolldown packages. No forced upgrade or new dependency was introduced. The resulting audit reports zero critical, five high and three moderate affected package entries. The high entries are the existing ESLint/braces dependency chain; the moderate entries include Vitest tooling and ip-address. Passing the repository's direct-dependency gate does not mean the complete dependency tree has no advisories.

The MCP SDK is imported here only as a stdio client (`src/server/mcp/memex-stdio-transport.ts`). The upstream HTTP-server validation advisory additionally requires server configuration; upgrading this client is not evidence that every separate MCP server is secured.

Official references checked 2026-10-22:

- [Next.js upgrade guidance](https://nextjs.org/docs/app/guides/upgrading/version-16)
- [MCP SDK validation advisory and additional server option](https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-46jr-4wx8-v453)
- [ACP introduction](https://agentclientprotocol.com/get-started/introduction)
- [Codex authentication](https://learn.chatgpt.com/docs/auth)
- [Claude hosting and authentication conditions](https://code.claude.com/docs/en/legal-and-compliance)
- [Gemini CLI authentication](https://geminicli.com/docs/get-started/authentication/)
- [Cursor ACP](https://cursor.com/docs/cli/acp)

## Verification record

The dated local validation receipt is kept outside the product source tree at `output/hq-agent-connections-checks-2026-10-22.json` in the Orchestrator workspace. Local checks do not constitute a GitHub CI run, production qualification or a mission sent through HQ.
