# n8n Webhook Bridge Setup

## Concept

Oria HQ = brain (governance, Sentinelle gate, ledger, measurement)
n8n = hands (real tool execution: publish post, send email, create Notion doc)

**Governance rule (absolute): the n8n webhook fires ONLY on an explicit CEO
approval.** A Sentinelle `ALLOW` verdict means an action is *eligible* for CEO
approval — never "fire it". The automatic green-lane path (`/execute`) no longer
makes any external call.

The bridge is a two-step, human-in-the-loop flow:

```
1. PREPARE (agent, no network call)
   POST /api/agents/:agentId/execution-intents
     { skillId, client, email, actionType, missionId, ventureId?, data }
   -> Sentinelle eligibility (BLOCK => 403; otherwise eligible)
   -> intent stored as status="pending"
   -> Ledger "decision" (eligible_for_approval)

2. APPROVE (CEO, the ONLY trigger that calls n8n)
   POST /api/agents/execution-intents/:intentId/approve
   -> Sentinelle re-check (BLOCK => 403)
   -> status pending -> executing
   -> Ledger "action" (attempt, BEFORE the call)
   -> n8n_webhook_trigger MCP tool -> POST N8N_WEBHOOK_URL
   -> Ledger "result" (success | failed)
   -> status -> executed | failed   (rate-limited => back to pending, retryable)
```

The dispatch payload is HMAC-signed (`x-orya-signature` / `x-orya-timestamp` via
`AGENT_WEBHOOK_SIGNING_SECRET`) **and** carries a static `x-webhook-secret`
(= `N8N_SECRET`). Configure the single destination and secret:

```bash
N8N_WEBHOOK_URL=https://your-n8n.app.n8n.cloud/webhook/oria-execute
N8N_SECRET=your-shared-secret   # verified by n8n as the x-webhook-secret header
```

The tool refuses to dispatch unless BOTH are set and the URL hostname is in the
approved binding allowlist (`src/server/runtime/webhook-registry.ts`). It is also
internally rate-limited so a bug cannot bomb n8n.

> ⚠️ **Legacy section (superseded).** The step-by-step below documents the
> original auto-dispatch flow where `/execute` forwarded to a per-agent
> `AGENT_*_WEBHOOK_URL` on a green `ALLOW`. That path no longer makes any
> external call (it would violate humanOnTheLoop). Use the two-step
> prepare → CEO-approve flow described under **Concept** above. The n8n
> workflow-building notes (trigger node, response node, ROI queries) remain
> useful; only the Oria-side trigger has moved to the approval route.

## Step-by-step: Wire Agent Marketing to n8n

### 1. Create your n8n workflow

In n8n, create a new workflow with:
- **Trigger node**: Webhook (POST)
- Copy the webhook URL: `https://your-n8n.app.n8n.cloud/webhook/marketing-content`

The webhook receives this payload from Oria:
```json
{
  "actionRef": "action_1234_xyz",
  "agentId": "marketing",
  "skillId": "content.generate",
  "workspaceId": "michael-hq",
  "input": {
    "topic": "Pourquoi Suivia...",
    "format": "post",
    "tone": "professionnel"
  },
  "dispatchedAt": "2026-06-03T..."
}
```

### 2. Build your n8n workflow nodes

**Recommended flow for content.generate:**
```
Webhook trigger
  -> AI Agent (OpenAI/Anthropic) -- generate the content
  -> Notion (or Google Docs) -- save as draft
  -> [Optional] Buffer/Hootsuite -- schedule the post
  -> Respond to Webhook -- return { success: true, draftUrl: "..." }
```

**Recommended flow for social.post.schedule:**
```
Webhook trigger
  -> Validate visibility (must be "internal" or "unlisted" for green zone)
  -> Buffer / Hootsuite / Later -- schedule the post
  -> Respond to Webhook -- return { success: true, scheduledAt: "..." }
```

### 3. Set the webhook URL in your .env.local

```bash
AGENT_MARKETING_WEBHOOK_URL=https://your-n8n.app.n8n.cloud/webhook/marketing-content
```

### 4. Update the execute route to read the env var

The execute route accepts `webhookUrl` in the request body. To use the env-configured
URL automatically (without passing it in each request), update `src/app/api/agents/[agentId]/execute/route.ts`:

```typescript
import { serverEnv } from "@/lib/server-env";

// Resolve webhookUrl: body takes precedence, then env var
const resolvedWebhookUrl = webhookUrl ??
  serverEnv[`agent${agentId.charAt(0).toUpperCase() + agentId.slice(1)}WebhookUrl`];
```

Or add to `serverEnv` in `src/lib/server-env.ts`:
```typescript
agentMarketingWebhookUrl: process.env.AGENT_MARKETING_WEBHOOK_URL,
agentInventorWebhookUrl: process.env.AGENT_INVENTOR_WEBHOOK_URL,
```

### 5. Test the full flow

```bash
# With the dev server running:
curl -X POST http://localhost:3000/api/agents/marketing/execute   -H "Content-Type: application/json"   -H "Cookie: [your-session-cookie]"   -d '{
    "skillId": "content.generate",
    "autonomyLevel": 2,
    "ventureId": "suivia",
    "webhookUrl": "https://your-n8n.../webhook/marketing-content",
    "input": {
      "topic": "Pourquoi Suivia simplifie la comptabilite pour les PME",
      "format": "post",
      "tone": "professionnel et direct"
    }
  }'
```

Expected response (green zone):
```json
{
  "outcome": "ALLOW",
  "zone": "green",
  "agentId": "marketing",
  "skillId": "content.generate",
  "executedAt": "...",
  "result": { ... },
  "actionRef": "action_...",
  "outcomeId": "uuid-...",
  "requiresLedger": true,
  "requiresSentinel": true
}
```

### 6. Evaluate the outcome (CEO step)

After the action runs, evaluate its business result in `agent_outcomes`:

```sql
-- See all pending outcomes
SELECT agent_id, skill_id, venture_id, proposed_at, executed_at
FROM agent_outcomes
WHERE workspace_id = 'michael-hq' AND outcome = 'pending'
ORDER BY created_at DESC;

-- Mark a published outcome
UPDATE agent_outcomes
SET outcome = 'published', notes = 'Post scheduled for Suivia LinkedIn'
WHERE id = 'your-outcome-id';

-- Mark revenue
UPDATE agent_outcomes
SET outcome = 'revenue', revenue_cad = 500, notes = 'Lead from Suivia post converted'
WHERE id = 'your-outcome-id';
```

## ROI Dashboard Query

After 2 weeks of usage:

```sql
SELECT
  agent_id,
  skill_id,
  COUNT(*) AS total_actions,
  COUNT(*) FILTER (WHERE outcome IN ('converted','revenue')) AS conversions,
  SUM(revenue_cad) AS total_revenue_cad,
  ROUND(
    COUNT(*) FILTER (WHERE outcome IN ('converted','revenue'))::numeric
    / NULLIF(COUNT(*), 0) * 100, 1
  ) AS conversion_rate_pct
FROM agent_outcomes
WHERE workspace_id = 'michael-hq'
  AND outcome != 'pending'
GROUP BY agent_id, skill_id
ORDER BY total_revenue_cad DESC;
```

This query is your first real ROI meter.

## Security Notes

- The execute endpoint requires `requireOwnerApiSession` -- no public access.
- Sentinelle gates every request before dispatch -- green zone only executes live.
- `billing.modify` and other hard-blocked actions are rejected before any webhook call.
- n8n webhook URLs should use authentication (header secret) in production.
  Add `Authorization: Bearer $N8N_WEBHOOK_SECRET` in n8n and verify it on receive.
