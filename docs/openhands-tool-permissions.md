# OpenHands tool permissions: integration decision

Status: typed identity contract and low-level durable decision store implemented;
authenticated approval service, active-session admission and activation pending.

`openhands-tool-service.ts` now composes admission and the durable store for
approve/consume, with a second admission check after the write. Unknown effects
and cancellation during consumption return cancelled; the consumed record is
not reverted. Its context/request still require a trusted authenticated boundary:
no HTTP route, pending-request transport or owner review UI is connected yet.

The local host CLI accepts `consume_tool` for the server-selected mission/launch,
but deliberately has no approval operation. Python validates the returned offered
per-call option and denies transport uncertainty. A real PostgreSQL qualification
confirmed that this CLI cancels a request on a finished mission even when a
decision exists. The positive live-session/provider path remains unqualified.

Read-only admission is now implemented in `openhands-tool-admission.ts`: the
canonical launch must be running with the exact registered session/container,
unchanged dossier/config, matching actor/runner/workspace, and an unexpired job
deadline. Lifecycle supports host registration of the session after start_requested.
This is not yet a provider event bridge. Admission and consumption are separate
operations; host cancellation must still stop already-admitted work. Runtime
completion must use expected running once session registration is connected.

`openhands-tool-decision-store.ts` persists immutable digest-only decisions and
single-use consumption records in action_ledger. Consumption requires the row
returned by a successful insert-or-ignore; rereading an existing row cannot grant
a second response. Actual PostgreSQL/PostgREST qualification proved one winner
for two concurrent consumers, denial of replay and absence of raw arguments in
ledger rows. This storage test uses a synthetic session independently of a live
launch: it does not establish owner/session authorization. A trusted service must
enforce those checks and supply a fresh server timestamp before storage use.

`src/server/missions/openhands-tool-permission.ts` validates bounded structured
input, exact request identity, short expiry, offered per-call options and matching
decision. Exact JSON text is bound, so a different serialization requires fresh
review. This validator does not establish actor authority, consume decisions or
persist raw input. Three targeted tests cover scope/input/session changes,
expiry, persistent/duplicate options, malformed sizes/numbers and actor mismatch.

## Existing components and boundary

`src/features/agents/execution-intent.ts` requires a client/email payload designed
for n8n. `execution-intent-approval-service.ts` dispatches the approved MCP action
and allows rate-limited actions to return to pending. An ACP permission response
does not itself execute a tool and cannot prove its success. Reusing this service
unchanged would confuse permission granted with action executed, and require
invented client/email fields. Keep the existing n8n path unchanged.

Reuse the action ledger for immutable decisions and the mission's full input/
version compare-and-swap for consumption, as with the launch lifecycle. No new
approval database, provider key, or automatic grant is required.

## Proposed contract

Host supplies workspaceId, missionId, launchId, runnerId and containerId from
the canonical launch. The permission bridge supplies sessionId, toolCallId,
the structured tool input and offered options. Request identity binds all of
those fields plus an input digest and expiry. Tool titles are display text,
never authority. Missing structured input cannot receive an automatic allow.

The review view must show the actual operation/arguments, affected paths,
requested scope, and expiry. Render all provider text as untrusted content.
Do not persist secrets embedded in tool arguments: reject unsupported sensitive
requests or retain only a protected reference plus digest; redaction alone must
not make different operations share an approval identity.

Only an authenticated owner decision or an explicitly approved bounded policy
can grant allow_once. Before responding to ACP, consume the exact decision with
CAS, verify active launch/session and expiry, and record consumption. Only one
consumer wins. Expiry, unknown writes, changed input, stopped jobs, and repeated
consumption deny. A consumed decision is not restored after a lost response:
reconcile the session before any new attempt.

`permission_agent.py` currently allows offered allow_once/reject_once options,
rejects persistent grants and defaults to denial. Its callback deadline is at
most 30 seconds. The UI must therefore show expired requests as expired; clicking
an old request cannot unblock a later call. A renewed request needs a new exact
identity and current approval. Do not silently turn off that timeout to mask an
unfinished asynchronous approval workflow.

## Delivery sequence and acceptance

1. Add typed request/decision contracts and digest binding, with changed-input,
   cross-workspace/session and oversized request rejection.
2. Implement ledger decisions plus single-use CAS and prove competing consumers
   against disposable PostgreSQL, including unknown write outcomes.
3. Connect authenticated HQ review and the instance-specific callback. Keep
   database credentials and Docker socket outside the agent container.
4. Qualify actual file edit and test execution under a bounded mission; then
   verify cancellation, expiry and session restart. Tool-result events record
   execution separately from the permission decision.

Current evidence covers callback mechanics and per-call options only. No durable
tool approval, user interface, automatic policy, or real provider tool execution
is claimed by this document. Account authorization is still required separately.
