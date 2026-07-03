# Tool Universe Corridor

**Status:** contracts landed (shape only, zero providers) · **Depends on:** ADR-001 (merged)
**Doctrine:** *Tool Universe infini. Authority finie. Autonomie dans les lignes. CEO-click seulement hors ligne.*

The corridor is the sas — not a cage, not a spaghetti — through which Oria can
absorb the best external tools without ever handing them the wheel:

```
provider → adapter → skillId → Sentinelle zone → Autonomy Line
        → Wager if required → Ledger
```

Sentinelle keeps the authority. The ledger keeps the proof. The Autonomy
Lines grant the freedom.

## What exists (src/server/agents/providers/)

| Module | Covers | Key invariant |
|---|---|---|
| `adapter-provider-contract.ts` | Base shape for all adapters | The eligible arm of `resolveAdapterInvocation` carries the literal `nextGate: "sentinelle"` — **no execute path exists in this layer** |
| `tool-provider-contract.ts` | Composio-class tool catalogs | Manifest = untrusted input (descriptions never read for authority); allowlist mandatory; admission per-tool, no bulk; each tool = explicit skillId |
| `mailbox-provider-contract.ts` | AgentMail-class agent inboxes | Inbox isolated per workspace/namespace; outbound via skillId only; auto-send requires active line **and** Sentinelle ALLOW; positive reply = DecisionSignal; ambiguity = CEO handoff |
| `web-automation-provider-contract.ts` | Browser / web agents | Proof (screenshot/log/result) mandatory; destructive or undeclared effects = CEO click only |
| `cli-runtime-provider-contract.ts` | Claude-/Codex-/Gemini-class CLIs on subscription auth | No API key in repo; local machine = documented SPOF; secret-shaped args rejected; every call = skillId → Sentinelle |
| `workflow-runtime-provider-contract.ts` | n8n-class rails | HMAC + host allowlist + idempotency key mandatory; resilience gaps declared as visible `future_pr` literals |

## Security model

1. **Nothing in this layer executes.** Contracts admit, bind, and classify;
   only the existing rail (behind Sentinelle) acts.
2. **Untrusted by default.** Tool manifests, mail content, and web pages are
   input, never instructions. An untrusted manifest cannot even claim a
   green-zone binding.
3. **Explicit or nonexistent.** No wildcards — in skillIds, operations, or
   allowlists. Unknown → ineligible. Ambiguous → CEO.
4. **Forbidden wins.** An operation both allowed and forbidden invalidates
   the whole descriptor rather than resolving silently.
5. **Secrets are names.** `AdapterSecretRef` carries env-var *names*;
   value-shaped refs invalidate the descriptor, secret-shaped CLI arguments
   are rejected before anything else sees them.
6. **Every action is ledgered.** `ledgerRequired: true` is part of the
   eligibility type, not a convention.

## What this deliberately does NOT do

No provider package or dependency. No external call. No live webhook. No
migration. No `.env`. No OodaWager runtime wiring (`requiresWager` is a
declaration the Sentinelle wager packet will enforce). No hardcoded venture,
client, or vendor.

## Next PRs (in order)

1. **n8n hardening** — retries with backoff+jitter, dead-letter queue,
   circuit breaker, observability, bounded `failed → pending` retry (the
   `future_pr` literals in the workflow contract become code).
2. **Mailbox adapter spike** — one inbox, dry-run, inbound → DecisionSignal.
3. **Tool provider (Composio-class) spike** — one corridor, one allowlisted
   tool, dry-run first.
4. **CLI runtime adapter** — `claude`-class headless invocation behind a
   skillId, subscription auth, local runner.
5. **A3 autonomous execution line** — score + wager + line + Sentinelle
   ALLOW + rate limit + ledger = auto-execute for reversible actions.
