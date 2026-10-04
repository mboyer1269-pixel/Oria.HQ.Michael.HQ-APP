# OpenHands project memory context (preparation helper)

`src/server/missions/openhands-memory-context.ts` prepares a read-only, project-centered Memex snapshot. A validated capture already persisted in `mission.input._openhandsMemory` is included in dossier contract v2, its approval hash, reservation rebuild and launch consistency checks. Contract v1 remains unchanged for missions without a capture. The browser cannot submit or override this input.

The caller must provide authenticated workspace/project IDs and a server-owned resolver. The resolver must return an explicit project-scoped `org:` namespace and a stable center entity ID; browser input, workspace-wide namespace fallback, and title/scope-derived anchors are not valid. Missing or mismatched bindings return `unavailable` before contacting Memex.

The helper uses only `agentmemory_context_pack` in JSON mode, through the existing read-only transport and handshake. It caps the graph at 12 entities and 16 relations and the serialized selected context at 4,000 characters. It validates the exact namespace, center identity, active/verified entity status, source provenance, relation endpoints, and record validity dates. It redacts before snapshotting and hashes the exact snapshot inputs with its retrieval timestamp. The hash is an HQ snapshot hash; Memex does not currently expose a graph revision, so the helper makes no claim of remote revision identity.

Memex namespaces are the project isolation boundary. `context_pack` returns same-namespace neighbors of the center; the center ID alone does not isolate projects sharing one namespace. The resolver must only attest a namespace that is actually dedicated to the requested project. If that guarantee is unavailable, the caller must omit the Memex context. JSON mode does not invoke AgentMemory Vault search; the helper does not call Vault tools.

The optional in-memory integration test uses the real Memex handlers when `MEMEX_CORE_TEST_ROOT` points to a Memex Core checkout.
# Durable preparation snapshot

`openhands-memory-snapshot-store.ts` stores a validated context capture in the existing
action ledger, keyed by authenticated workspace, project, actor, mission and mission
version. Insert-or-ignore plus canonical reread means concurrent preparations return
the same winning snapshot. The first database insert wins, not necessarily the first
HTTP request. A read failure is an error, never an empty snapshot or permission to
refresh. Retrying retains the original capture and retrieval time.

This record is preparation evidence, not authorization. The server must establish
project ownership and its namespace mapping independently. A changed mapping or
intentional refresh requires a new mission version and a new confirmation. The
hash validates integrity, not source authenticity. No local development Vault is used.

Status: storage, context validation, registry resolution, the mission endpoint and the
project selection UI are wired in code. `openhands-memory-attachment.ts` implements
the versioned attachment: load eligible draft, resolve a trusted project mapping, reuse
or persist its capture, then compare-and-swap the full prior mission input/version/status.
It refuses already reserved missions and never refreshes an attached snapshot. An ambiguous
write requires reading the current mission; it does not trigger a new write automatically.
The deployed registry and dedicated handles still need provisioning and live validation. The dossier hash, review UI, confirmation ledger and
Python receiver now support attached captures. Tests use the real Supabase client with a
synthetic HTTP transport; they do not prove deployed database/RLS behavior. Memex
handler tests use an in-memory database, not production memory.

The UI exposes the exact captured content as escaped text and labels it as context,
not authority. The Python receiver validates the v2 envelope, bounded memory fields,
UTF-16 length, snapshot hash and complete dossier hash. The idempotency key retains
its v1 identity layout (workspace/mission/version); changing the payload under that
identity must remain a conflict. It is not a contract version marker.

## HTTP project access

The existing workspace HTTP transport deliberately accepts only `org:workspace:<id>`.
It cannot serve a project capture. `resolveMemexProjectHttpBinding` and
`createProjectHttpMemexTransport` now support a separately configured read handle
restricted to exactly one project namespace, resolved on the server. Workspace handles,
multiple namespaces and workspace namespaces are rejected. The project transport exposes
only `agentmemory_context_pack`, with no write or Vault calls. Memex remains responsible
for checking the handle signature; local payload inspection is only configuration narrowing.
No existing handle, credential file or deployment configuration was changed.

Six attachment tests cover versioning, concurrent CAS, unknown outcomes, exclusions,
snapshot reuse and actual Supabase query construction with synthetic HTTP. Nine HTTP
transport tests include context preparation through the project transport. These do not
establish real project provisioning, production RLS or a running provider mission.

## Server registry and user flow

`ORIA_MEMEX_PROJECT_BINDINGS` is a server-only JSON array, maximum 20 entries and
32 KiB. Each entry requires `workspaceId`, `projectId`, `label`, `namespace`,
`centerEntityId`, `endpoint` and absolute `readHandleFile`. It contains references
to mounted credentials, never the handle itself. Do not configure a namespace shared
by projects. Duplicate workspace/project identities and endpoint/namespace mappings
are rejected. Missing configuration returns an empty project list; malformed
configuration fails closed. No real entries or credentials were added by this change.

The authenticated-owner GET endpoint exposes only project IDs and display labels for
the active workspace. POST `attach_memory` accepts a project ID and existing submission
parameters; addresses, namespaces, identity and credentials are forbidden in browser
input. The server composes the registry, durable snapshot and mission stores, and
project HTTP transport. It snapshots the registry once per operation.

Before preparing a dossier, the owner can select a configured project and attach its
memory. This increments the mission version. Refreshing the mission remounts the
preparation component; the owner then prepares and reviews the new exact dossier.
After an ambiguous attachment result, the UI locks further submissions until the
mission is checked. A successful version change resets the component. It does not
automatically resend an attachment, confirm a dossier, or start an agent.

The endpoint remains behind `ORIA_ENABLE_OPENHANDS_CONFIRMATION`. Project availability
in the list means configured, not verified connectivity. A mounted single-project
read handle and an existing active/verified Memex anchor are required for a real read.

## Signed HTTP lifecycle qualification

`openhands-memory-http-lifecycle.test.mjs` starts the actual Memex Express app on
an ephemeral loopback port with an in-memory graph and a randomly generated test-only
signing secret. It exercises the HQ handler, attachment service, signed HTTP transport,
snapshot, dossier preparation, confirmation and repeat confirmation. The test confirms
that the live graph changes while the approved snapshot stays fixed, another project
is rejected by Memex itself, and an invalid signature returns HTTP 401.

This qualification uses in-memory doubles for HQ mission/ledger persistence and an
injected owner identity. It proves the real Memex network/authentication boundary;
it does not prove Supabase/RLS durability, actual owner login, browser interaction or
provider execution. It issues two HQ-to-Memex requests for the capture and none for
preparation/confirmation/repeat confirmation. Direct negative probes are separate.
Run with `MEMEX_CORE_TEST_ROOT` pointing to the canonical Memex checkout and
`node --experimental-strip-types --test src/server/missions/openhands-memory-http-lifecycle.test.mjs`.
