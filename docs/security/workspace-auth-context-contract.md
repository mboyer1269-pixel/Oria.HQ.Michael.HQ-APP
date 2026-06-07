# Workspace Auth / Session Context Contract

Status: **Foundation contract — no enforcement change.**
Owner: Security architecture.
Supersedes nothing. Prerequisite for any future workspace-level DB RLS work.

This document defines the contract that MUST exist before Orya HQ adds
**workspace-scoped DB row-level security (RLS)** policies. It records the current
reality, the rules that hold today, and the concrete preconditions a future PR
must satisfy before real workspace RLS is introduced.

It exists because PR #227 (`0020_action_ledger_workspace_scope.sql`,
merge commit `0193d81`) deliberately hardened the `action_ledger` schema
(`workspace_id` NOT NULL, RLS enabled, index) **without** introducing a workspace
claim filter. That was the correct call. This contract explains why, and what has
to be true before that final step is taken.

---

## 1. Current workspace context source

Workspace identity today is **derived in application code from a single-owner
environment identity** — it is NOT carried by an authenticated session claim.

- `src/server/auth/user-context.ts` → `getServerUserContext()` resolves the
  acting user from `serverEnv.michaelHqOwnerId` (falling back to the local
  identity `local-michael` with `storagePreference: "local"`). There is no
  per-request session, JWT, or cookie-derived user in this path.
- `src/core/workspace-context.ts` → `getActiveWorkspaceContext()` wraps that
  single-owner context and resolves the workspace via
  `getDefaultWorkspace({ ownerUserId })`. It always returns the single default
  workspace. The doc comment already flags this as forward-compatible with a
  future "real workspace resolver (e.g. from the URL or a session claim)".

**Consequence:** the database session does not know which workspace a request
belongs to. `workspace_id` is a value the application *writes and filters on*, not
a value the database can independently *verify*.

## 2. Current service-role usage rules

- `src/server/supabase/admin.ts` → `createSupabaseAdminClient()` /
  `createOptionalSupabaseAdminClient()` create a Supabase client with the
  **service-role key** (`persistSession: false`, `autoRefreshToken: false`).
  The service role **bypasses RLS entirely.**
- This admin client is the path the action ledger actually uses at runtime
  (`action-ledger-read.ts`, `action-ledger-repository.ts`), alongside other
  server repositories (ventures, governance, cash-signal intakes).
- `src/lib/supabase/server.ts` → `createServerSupabaseClient()` uses the **anon
  key** with SSR cookies. This is the RLS-respecting, session-bound path. The
  action ledger runtime does **not** currently use it.

**Rules that hold today:**

1. The service-role client is **server-only**. It must never be constructed,
   imported, or reachable from client/browser code.
2. Because the service role bypasses RLS, **DB RLS is not the enforcement
   boundary for service-role paths.** Application code is.
3. The anon/SSR client is the only RLS-respecting path and is the intended home
   for future workspace-scoped enforcement.

## 3. Required app-level workspace filtering (enforced now, in code)

Until DB-level workspace RLS exists, workspace isolation is an **application
invariant** and must be preserved on every service-role read and write:

- **Reads** MUST filter by workspace, e.g.
  `listActionLedgerForWorkspace` calls `.eq("workspace_id", input.workspaceId)`.
- **Writes** MUST set `workspace_id` (and `user_id`) explicitly, as in
  `createSupabaseActionLedgerRepository`.
- Filtering MUST be **AND semantics** (owner identity AND workspace), never a
  widened OR. No read path may return rows for a workspace other than the one
  resolved by `getActiveWorkspaceContext()`.

These invariants are exactly what `0020_action_ledger_workspace_scope.sql`'s
NOT NULL constraint protects: no row may exist without a workspace tag for the
app filter to bind to.

## 4. Why full DB workspace RLS is deferred

A workspace RLS policy (`workspace_id = <verified session workspace>`) requires a
**verifiable workspace identity inside the database session**. Today that does
not exist:

- No JWT carries a `workspace_id` claim (`auth.jwt()` has no workspace).
- Nothing sets a session GUC (`set_config('app.workspace_id', …)`).
- The runtime reads/writes via the **service role**, which bypasses RLS, so any
  workspace policy added now would be **inert for the real runtime path** while
  appearing to enforce isolation — a false sense of security.

Existing RLS policies in `db/schema.sql` are **user-scoped**
(`auth.uid() = user_id`) and apply only to the authenticated anon-key path. There
is currently **no** workspace-level policy, and that is intentional.

## 5. Preconditions a future PR MUST define before real workspace RLS

A future workspace-RLS PR is blocked until all of the following are true:

1. **Verifiable workspace identity in the DB session.** Either a `workspace_id`
   claim in `auth.jwt()`, or a per-transaction `set_config('app.workspace_id', …)`
   that the runtime provably sets on every request. The policy may reference
   `current_setting('app.workspace_id')` **only if** runtime code actually sets
   it — never otherwise.
2. **Runtime moved onto an RLS-respecting path** for workspace-scoped tables, or
   an explicit, audited service path that sets the workspace GUC inside the
   transaction. A workspace policy is meaningless while reads/writes use the
   blanket service-role client.
3. **A workspace membership model** (user ↔ workspace mapping) so `auth.uid()`
   can be resolved to its allowed `workspace_id`s. (Out of scope for this PR; do
   not create membership tables here.)
4. **AND-semantics policies only.** Policies must enforce owner AND workspace.
   No policy may widen access via OR, and none may use `using (true)`.

## 6. Forbidden patterns (binding now)

- ❌ `current_setting('app.workspace_id')` (or any `app.workspace_id` reference)
  **unless** runtime code sets that GUC per request. No "supported by default"
  assumption.
- ❌ `using (true)` on any workspace-scoped table — it disables isolation while
  looking like a policy.
- ❌ Any policy or code path that *pretends* to enforce workspace AND owner
  semantics but actually permits broader access (e.g. OR-widening, or a policy
  that is bypassed by the service role at runtime).
- ❌ Client-side / browser access to the service-role key or admin client.

## 7. Out of scope for this contract PR

No DB RLS policies, no `app.workspace_id` support, no workspace membership
tables, no auth refactor, no agent runtime changes, no migrations. This PR is
**documentation of the contract only.**
