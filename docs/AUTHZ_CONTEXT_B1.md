# B1 authorization context

`resolveAuthzContext({ userId, email }, workspaceId?)` is the server authorization
boundary. `ORIA_WORKSPACE_MEMBERS` is an ordered JSON array of
`{ userId?, email?, workspaceId, role: "owner" | "member" }`. Either identity
selector can match; emails are trimmed and case-insensitive. Invalid config
fails closed. Membership entries also declare minimal workspace configs when
no richer static config exists; no company or business tools are inherited.

The default is explicitly the first matching configured membership, followed
by legacy owner membership, otherwise `personal:<userId>`. Personal workspaces
always belong exclusively to that user, have personal mode, and no company.
Unknown explicit workspace selections and foreign membership raise typed
errors; they never select the default instead.

`MICHAEL_HQ_OWNER_ID` / `MICHAEL_HQ_OWNER_EMAIL` still declare an owner of
`michael-hq`. The existing no-argument `getActiveWorkspaceContext()` contract
remains the configured owner's declared legacy default (including dev fallback).
It does not authorize a request. New boundaries must supply authenticated
identity and explicit workspace selection.

HTTP: `/api/joris/chat` uses `requireWorkspaceApiSession`, with header
`x-oria-workspace` taking precedence over query `workspace`. Missing session
returns 401; unknown/foreign workspace returns 403. The existing owner API test
hook remains unchanged and non-production-only; it does not bypass the new
workspace guard. Test session/database injection uses module aliases only.

Jobs: Joris requires both event userId and workspaceId and rechecks membership
before executing. Invalid events raise Inngest `NonRetriableError`. Email-only
memberships cannot authorize a job carrying only userId; configure userId for
background execution rather than trusting an event-supplied email.

Contact create/list require workspaceId; local and service-role storage are
scoped. Public contact intake deliberately targets the configured owner's
workspace, not a visitor-supplied selector. Agent outcome create/list/get/update
are scoped, including updates by record id. Joris passes its context to brief
contact/calendar reads. Repositories trust server-resolved workspace ids; they
are not authentication endpoints.

Migration `0032_workspace_members.sql`, verify and revert are prepared and NOT
APPLIED. Membership resolution never reads this table. Supabase contact storage
will require the new column before deployment. No remote query was executed.

## Inspection and remaining boundaries

Quick inspection found workspace predicates already present in calendar,
ledger readers, governance decisions, ventures/prepared actions/score snapshots,
shadow proposal/tick readers, arena verdicts, account identity lookup, provider
connection evidence, mission listing/draft readback, Paperclip dispatch and
OpenHands launch/reservation/authority/tool/snapshot stores. This is not an
exhaustive service-role audit. Mission approvals are resolved by mission id
and binding/RPC rather than a workspace column; changing that contract is not a
trivial predicate addition and remains outside this diff.

Legacy owner-only routes and other no-argument context callers have NOT all
been converted to tenant-aware boundaries. In particular, allowing additional
configured owners does not establish application-wide isolation for these old
routes. The document-index fixture and other legacy Joris dependencies also
retain their existing single-owner scope. Multi-tenant production readiness is
not claimed. Production environment startup still requires legacy owner config.

## Validation

Targeted executable tests cover two users/two workspaces, foreign HTTP 403,
non-retriable job rejection, unknown identifiers, personal workspace, email and
member roles, malformed config, legacy owner identity, and local/fake Supabase
contact/outcome isolation (recorded workspace filters and foreign-id updates).

Global validation is blocked in this sandbox: Turbopack rejects the external
node_modules symlink; webpack fallback cannot parse a child TypeScript output.
Loopback test servers return EPERM and a minimal spawnSync probe returns EPERM
with empty output. See the final handoff for command results. No commit or push.

Admission: an authenticated user with no configured membership is refused
(403 `NOT_A_MEMBER`), even for `personal:<userId>`, unless
`ORIA_OPEN_PERSONAL_SPACES=true`. This keeps self-signed-up Supabase accounts
out of a single-user deployment while allowing personal spaces without any company.
