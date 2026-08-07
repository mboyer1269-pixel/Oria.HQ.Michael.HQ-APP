# Oria → n8n governed execution rail (dry-run vertical slice)

This is the first **real, end-to-end** slice of the governed execution rail:
Oria prepares an intent, the CEO approves it, Oria fires a **single** signed call
to n8n, n8n confirms (dry-run) and dedups, and Oria records a traceable result.

> Verified locally against a real n8n **2.26.6** container — full matrix below
> (happy / dedup / secret / route / transient) plus the Oria end-to-end proof.
> Re-run the proof against your own n8n before relying on it. The Oria side is
> unit-tested; the n8n side ships as an importable workflow + a proof script.

## ⚠️ No corridor completes end to end today

The two ends of this rail accept **different** routes, so no agent/skill pair
gets through both.

| Corridor | Oria (Sentinelle) | n8n receiver | Result |
|---|---|---|---|
| `hermes/task.create` | ❌ blocked | ✅ accepted | 403 before any dispatch |
| `marketing/content.generate` | ✅ accepted | ❌ rejected | `400 validation_error` at n8n |
| `inventor/concept.generate` | ✅ accepted | ❌ rejected | `400 validation_error` at n8n |

### Why `hermes/task.create` is blocked

`POST /api/agents/hermes/execution-intents` with `skillId: "task.create"`
returns **403 BLOCK**:

```text
Skill task.create is not available to agent hermes.
```

Four sources disagree, and nothing used to check them against each other:

| Source | Says |
|---|---|
| `src/server/runtime/webhook-registry.ts` | `hermes` + `task.create` is an approved binding |
| `src/server/agents/agent-execution-license.ts` | `task.create` is a green action for `hermes` |
| `src/features/skills/seed.ts` | **there is no `task.create` skill** |
| `src/features/agents/seed.ts` | the skills of `hermes` (display name Relay) are `sop.draft`, `workflow.map` |

The Sentinelle resolves the skill from the catalog and checks it is assigned to
the agent, so it refuses the request regardless of the licence and the binding.

### Why the other two are rejected downstream

The shipped workflow's Code node accepts one route only:

```js
if (body.agentId !== 'hermes' || body.skillId !== 'task.create') { /* validation_error */ }
```

`src/server/runtime/webhook-registry.ts` declares that accepted set as
`N8N_RECEIVER_ACCEPTED_ROUTES`, and
`src/server/runtime/execution-corridor-contract.test.mjs` reads the workflow
JSON and fails if the two drift.

### What the cockpit shows

`src/server/runtime/execution-corridors.ts` reports each corridor as `blocked`,
`receiver_rejects` or `not_configured` — never `governed_live` — and the Command
Tower dispatch board renders exactly that. A corridor reads as live only when
policy, receiver **and** dispatch configuration all agree.

**Closing the gap is a decision, not a wiring fix.** Either declare a
`task.create` skill and assign it to `hermes` (an extension of what that agent
may do), or widen the workflow's accepted routes. Both need an explicit CEO
mandate. Until then the proof script below, which calls the dispatch tool
directly and never crosses the Sentinelle, is the only path on which
`hermes/task.create` runs.

## Files

- [`oria-execution-rail.workflow.json`](oria-execution-rail.workflow.json) — importable n8n workflow (dry-run).
- Proof script: `src/scripts/smoke/n8n-execution-slice.mjs` (`npm run smoke:n8n-slice`).
- Oria tool: `src/server/agents/tools/n8n-webhook-trigger.ts` (the single outbound chokepoint).

## What the workflow does

`Webhook → Crypto (HMAC) → IF (secret + HMAC) → Code (validate/route, pure) → IF (pass) → Remove Duplicates (Kept/Discarded) → Respond`

**Task-runner safe** (n8n 2.26+ runs Code nodes in the external JS Task Runner sandbox): the Code node is **pure** — no `require()`, no `$env`, no `$getWorkflowStaticData`.

1. **Crypto (HMAC)** node recomputes `HMAC_SHA256(ORIA_WEBHOOK_SIGNING_SECRET, "<x-orya-timestamp>.<JSON.stringify(body)>")` (hex). Oria emits canonical JSON (no whitespace, stable key order) so it matches byte-for-byte. Secret read via `{{ $env… }}` (Crypto v1 `secret` param — no credential needed).
2. **IF** node verifies `x-webhook-secret == ORIA_N8N_WEBHOOK_SECRET` **and** recomputed HMAC == `x-orya-signature`. Mismatch → `401 secret_error`.
3. **Code** (pure) validates required fields (`actionRef, agentId, skillId, client, email, actionType, missionId`), enforces the route (`hermes` + `task.create` only), and a `data.simulate="transient"` test hook → builds the standardized response + httpCode. Failures → `400 validation_error` / `503 transient_error`.
4. **Remove Duplicates** ("Items Seen in Previous Executions", key = `actionRef`) routes **Kept** (new) → `200 ok` and **Discarded** (already seen) → `200 deduped:true`. Persistence is native to n8n — no Data Table provisioning, no static data.
5. **Dry-run** — confirms the action *would* have executed. No email, no external mutation.

### Standardized JSON response

```json
{ "ok": true, "actionRef": "n8n_...", "status": "ok", "message": "...", "result": { "...": "..." }, "deduped": false }
```

| status | HTTP | meaning | Oria-side outcome | retryable? |
|---|---|---|---|---|
| `ok` | 200 | accepted, dry-run recorded | intent → `executed` | n/a |
| `deduped` | 200 | actionRef already processed | intent → `executed` | n/a (idempotent) |
| `validation_error` | 400 | missing field / unsupported route | intent → `failed` | **terminal** — fix the payload, recreate the intent |
| `secret_error` | 401 | bad/missing `x-webhook-secret` or HMAC | intent → `failed` | **terminal** — fix secrets, recreate the intent |
| `transient_error` | 503 | downstream hiccup (test hook: `data.simulate="transient"`) | intent → `failed` | **retryable in principle**, but Oria currently marks `failed` as terminal → recreate the intent. (Only an Oria-side rate-limit reverts to `pending` automatically.) |

> If the n8n env is misconfigured (missing `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` or
> the secrets), the Crypto/IF nodes raise an `ExpressionError` and n8n returns an
> empty `200` — set the env vars in the next section to avoid this.

> Known limitation (documented, not yet fixed): Oria's intent state machine has no
> `failed → pending` retry. A transient n8n error therefore lands as terminal
> `failed` and must be re-queued. A future change could add a bounded retry.

## n8n setup (one-time)

1. **Import** `oria-execution-rail.workflow.json` into n8n; open it and **Activate**.
2. Set n8n **environment variables** (self-hosted):
   - `ORIA_N8N_WEBHOOK_SECRET` = the same value as Oria's `N8N_SECRET`.
   - `ORIA_WEBHOOK_SIGNING_SECRET` = the same value as Oria's `AGENT_WEBHOOK_SIGNING_SECRET`.
   - `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` — the Crypto/IF nodes read the two secrets
     via `{{ $env… }}` expressions; n8n blocks env access in nodes by default.
   Restart n8n so the env takes effect.
3. Copy the production webhook URL (e.g. `https://n8n.michaelhq.com/webhook/oria-execute`).
   The host **must** be in the Oria binding allowlist (`src/server/runtime/webhook-registry.ts`):
   `hooks.n8n.cloud`, `n8n.michaelhq.com`, `localhost`, `127.0.0.1`.
4. Set **all three** Oria variables. A corridor whose `N8N_SECRET` or
   `AGENT_WEBHOOK_SIGNING_SECRET` is missing is reported as `not_configured`,
   because the dispatcher refuses before sending.

## Reproducible end-to-end proof

### Required env (Oria side, for the proof script)

```bash
N8N_WEBHOOK_URL=http://localhost:5678/webhook/oria-execute   # or your prod URL
N8N_SECRET=<same value as n8n ORIA_N8N_WEBHOOK_SECRET>
AGENT_WEBHOOK_SIGNING_SECRET=<same value as n8n ORIA_WEBHOOK_SIGNING_SECRET>
```

### Command

```bash
N8N_WEBHOOK_URL=... N8N_SECRET=... AGENT_WEBHOOK_SIGNING_SECRET=... npm run smoke:n8n-slice
```

(With no env set, the script SKIPS cleanly — it never fires by accident.)
The script forces the **in-memory** intent repository, so it needs **no Supabase
and no migration**. The only real network call is to your n8n.

### Test payload (the intent the script prepares)

```json
{
  "agentId": "hermes", "skillId": "task.create",
  "client": "Acme Corp", "email": "buyer@acme.test",
  "actionType": "task.create", "missionId": "mission-slice-001",
  "data": { "title": "Follow up with Acme", "note": "dry-run slice" }
}
```

### Expected result — n8n side
- First call: `200` `{ ok:true, status:"ok", deduped:false, result.wouldExecute:true, result.dryRun:true }`.
- Re-send with the **same** `actionRef`: `200` `{ deduped:true, status:"deduped" }`.
- `data.simulate:"transient"`: `503` `{ status:"transient_error" }`.

### Expected result — Oria side
- `result.ok === true`; ledger order recorded `attempt` **before** `result:success`.
- The intent transitions `pending → executing → executed`.

### Expected final state of the intent
- `status: "executed"`, with `actionRef` set to the dispatched `n8n_...` reference.

### Logs / proofs to verify
- Oria stdout: `mcp.n8n_webhook_trigger.success { actionRef }`, then
  `[A] approved -> n8n -> executed`, `[B] dedup OK`, `[C] transient ... OK`, `PASS`.
- n8n: two executions for the same `actionRef` — the second hits the dedup branch
  (no dry-run "execution" recorded twice).

## Without the script — raw curl (when the HTTP routes are wired with auth + Supabase + migration applied)

> The `hermes`/`task.create` call below returns **403 BLOCK** today — see the
> warning at the top. It is kept verbatim because it is what the rail was
> designed for. Substituting `marketing`/`content.generate` exercises the Oria
> half (the intent is created, approved and dispatched), and then n8n answers
> `400 validation_error` because its Code node does not accept that route. No
> corridor completes both halves.

```bash
# 1. Prepare (creates a pending intent) — requires an owner Supabase session cookie
curl -X POST http://localhost:3000/api/agents/hermes/execution-intents \
  -H "Content-Type: application/json" -H "Cookie: <owner-session>" \
  -d '{"skillId":"task.create","client":"Acme Corp","email":"buyer@acme.test","actionType":"task.create","missionId":"mission-001","data":{}}'
# -> 403 { "outcome": "BLOCK", "reason": "Skill task.create is not available to agent hermes." }

# 2. List pending
curl http://localhost:3000/api/agents/hermes/execution-intents -H "Cookie: <owner-session>"

# 3. Approve (the ONLY trigger that calls n8n)
curl -X POST http://localhost:3000/api/agents/execution-intents/<intentId>/approve -H "Cookie: <owner-session>"
# -> { "intentId": "...", "status": "executed", "actionRef": "n8n_...", "output": { ... } }
```

## Safety boundaries (unchanged)

- Dry-run only: no email, no external mutation; n8n confirms the action *would* run.
- Single authorized route **on the n8n side**: `hermes` + `task.create`. On the
  Oria side that pair is blocked by the Sentinelle (see the warning at the top),
  so the two ends of this rail do not currently meet over HTTP.
- No secrets in code or in this repo — secrets live in Oria env and n8n env.
- Migration `db/migrations/0024_agent_execution_intents.sql` is **applied and
  verified on the live `Oria.hq` project**: applied 2026-06-19 (version
  `20260619022503`), formally verified 2026-08-04 on explicit CEO GO — every
  check of `0024_agent_execution_intents_verify.sql` matches Expected (see
  `docs/runbooks/0024-live-verification-2026-08-04.md` and `ARCHITECTURE.md`).
  The table holds 0 rows: durable persistence is ready, and the rail has never
  dispatched live. The proof script above still runs entirely on the in-memory
  store, so it needs neither Supabase nor that migration.
