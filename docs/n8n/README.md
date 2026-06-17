# Oria → n8n governed execution rail (dry-run vertical slice)

This is the first **real, end-to-end** slice of the governed execution rail:
Oria prepares an intent, the CEO approves it, Oria fires a **single** signed call
to n8n, n8n confirms (dry-run) and dedups, and Oria records a traceable result.

> Not production-ready until the live test below has actually run against your
> n8n. The Oria side is unit-tested; the n8n side ships as an importable workflow
> + a reproducible proof script.

## Files

- [`oria-execution-rail.workflow.json`](oria-execution-rail.workflow.json) — importable n8n workflow (dry-run).
- Proof script: `src/scripts/smoke/n8n-execution-slice.mjs` (`npm run smoke:n8n-slice`).
- Oria tool: `src/server/agents/tools/n8n-webhook-trigger.ts` (the single outbound chokepoint).

## What the workflow does

`Webhook → Verify, Route & Dedup (Code) → Respond`

1. **Verify** `x-webhook-secret == ORIA_N8N_WEBHOOK_SECRET`.
2. **Verify HMAC** — recompute `HMAC_SHA256(ORIA_WEBHOOK_SIGNING_SECRET, "<x-orya-timestamp>.<canonical body>")` and timing-safe compare to `x-orya-signature`. (Canonical body = `JSON.stringify(parsedBody)`; Oria's tool emits canonical JSON — no whitespace, stable key order — so this matches byte-for-byte.)
3. **Validate** required fields: `actionRef, agentId, skillId, client, email, actionType, missionId`.
4. **Route** — only `hermes` + `task.create` is enabled (matches the Oria binding allowlist).
5. **Dedup** by `actionRef` via workflow static data → a repeat returns `deduped: true` and does **not** re-execute.
6. **Dry-run** — confirms the action *would* have executed. No email, no external mutation.

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
| `config_error` | 500 | n8n env not set | intent → `failed` | terminal until n8n is configured |
| `transient_error` | 503 | downstream hiccup (test hook: `data.simulate="transient"`) | intent → `failed` | **retryable in principle**, but Oria currently marks `failed` as terminal → recreate the intent. (Only an Oria-side rate-limit reverts to `pending` automatically.) |

> Known limitation (documented, not yet fixed): Oria's intent state machine has no
> `failed → pending` retry. A transient n8n error therefore lands as terminal
> `failed` and must be re-queued. A future change could add a bounded retry.

## n8n setup (one-time)

1. **Import** `oria-execution-rail.workflow.json` into n8n; open it and **Activate**.
2. Set n8n **environment variables** (self-hosted):
   - `ORIA_N8N_WEBHOOK_SECRET` = the same value as Oria's `N8N_SECRET`.
   - `ORIA_WEBHOOK_SIGNING_SECRET` = the same value as Oria's `AGENT_WEBHOOK_SIGNING_SECRET`.
   - `NODE_FUNCTION_ALLOW_BUILTIN=crypto` (the Code node needs `require('crypto')` for HMAC).
   Restart n8n so the env takes effect.
3. Copy the production webhook URL (e.g. `https://n8n.michaelhq.com/webhook/oria-execute`).
   The host **must** be in the Oria binding allowlist (`src/server/runtime/webhook-registry.ts`):
   `hooks.n8n.cloud`, `n8n.michaelhq.com`, `localhost`, `127.0.0.1`.

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

```bash
# 1. Prepare (creates a pending intent) — requires an owner Supabase session cookie
curl -X POST http://localhost:3000/api/agents/hermes/execution-intents \
  -H "Content-Type: application/json" -H "Cookie: <owner-session>" \
  -d '{"skillId":"task.create","client":"Acme Corp","email":"buyer@acme.test","actionType":"task.create","missionId":"mission-001","data":{}}'
# -> { "intentId": "intent_...", "status": "pending", ... }

# 2. List pending
curl http://localhost:3000/api/agents/hermes/execution-intents -H "Cookie: <owner-session>"

# 3. Approve (the ONLY trigger that calls n8n)
curl -X POST http://localhost:3000/api/agents/execution-intents/<intentId>/approve -H "Cookie: <owner-session>"
# -> { "intentId": "...", "status": "executed", "actionRef": "n8n_...", "output": { ... } }
```

## Safety boundaries (unchanged)

- Dry-run only: no email, no external mutation; n8n confirms the action *would* run.
- Single authorized route: `hermes` + `task.create` (registry not expanded).
- No secrets in code or in this repo — secrets live in Oria env and n8n env.
- Migration `db/migrations/0024_agent_execution_intents.sql` stays **unapplied**
  until an explicit CEO GO (the proof above runs entirely on the in-memory store).
