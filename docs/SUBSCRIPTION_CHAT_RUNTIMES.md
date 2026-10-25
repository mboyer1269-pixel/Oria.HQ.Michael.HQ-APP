# Local subscription chat turns

The authenticated owner chat can explicitly select `subscription` (Codex CLI or
Claude Code) or `pay_per_use_api` (the existing qualified API path). This is a
personal, local-only opt-in, not a tenant service or an OpenHands runner adapter.
PR #400 connection status does not enable this adapter. PR #388 API policy remains
independent; the subscription path uses the existing pinned registry policy.

Set `ORIA_HQ_SUBSCRIPTION_RUNTIMES=1` in the server process environment to enable
local execution. Cloud markers override the opt-in. No environment files are
changed by this feature. Install official CLIs separately and sign in using
`codex login` (ChatGPT) / `claude auth login` (claude.ai). Oria never supplies keys,
reads credential files, or drives login. API-key, third-party and unknown auth are
blocked. CLI versions without usable auth status are blocked too.

Models are entries in `src/server/ai/catalogs/subscription-runtimes.json`. An
absolute `ORIA_HQ_SUBSCRIPTION_RUNTIMES_FILE` can replace the catalog with the same
strict JSON schema: `{ "revision": "my-revision", "entries": [ { "runtimeId":
"codex", "modelId": "your-entitled-model" } ] }`. Runtime ids are `codex` and
`claude-code`; adding a model requires only an entry. Catalog entries are not proof
of account entitlement. A hash of the entire validated catalog rejects stale UI
selections even if an operator forgets to update the revision label.

Each run snapshots and freezes its model, runtime, provider, binary, mode, execution
id, start timestamp and catalog/adapter revisions before authentication. Only those
fields and prompt length are logged. The result includes this snapshot and the
model reported by the CLI (null when not reported, never inferred from the request).
No raw auth output, stderr, credentials or prompt text is logged. Environment
inheritance is allowlisted to OS lookup/home/temp/locale variables; API credentials,
provider overrides, proxy variables and NODE_OPTIONS are excluded.

Prompts travel over stdin; no shell is used. Each run gets a temporary working
directory outside the repository. Codex uses `exec --skip-git-repo-check --sandbox
read-only -m MODEL --json -`, forces the OpenAI provider and ChatGPT login, and
disables its shell tool and web search, and overrides MCP servers with an empty table. Claude uses print JSON mode, an empty tools list, strict
empty MCP config, no settings sources, disabled hooks and no session persistence.
The installed CLI and its trusted user/admin configuration remain part of the local
trust boundary; operators must use a trusted CLI installation and configuration. Read-only sandboxing alone is not a network isolation boundary.
Timeouts kill the process; bounded output, errors, malformed results and missing
binaries produce a French BLOCKED result. No paid API fallback exists.

This path replies to a single message. It does not resume a CLI session, run Oria
calendar/mission commands, or grant tool execution authority. The existing API path
continues to serve those deterministic commands. Subscription limits still apply;
this feature neither measures quota nor claims unlimited usage.

## Operator smoke

No dev server or API key is needed. Tests use only fake subprocesses. To inspect
installed help without issuing a model request:

```
node src/scripts/smoke/subscription-runtime-turn.mjs codex --check-help
node src/scripts/smoke/subscription-runtime-turn.mjs claude-code --check-help
```

With the opt-in set, run **one** tiny real turn (uses subscription allowance):

```
node src/scripts/smoke/subscription-runtime-turn.mjs codex
node src/scripts/smoke/subscription-runtime-turn.mjs claude-code claude-sonnet-4-6
```

The smoke prints the recorded config, observed model and reply. It is never run by
`npm test` or `smoke:joris`.

Official invocation references: [Codex CLI](https://developers.openai.com/codex/cli/reference)
and [Claude Code CLI](https://code.claude.com/docs/en/cli-reference).

## Holder-only access

Selecting a subscription runtime (POST `subscriptionSelection`) and listing the
subscription options (GET) are reserved to the subscription holder:
`ORIA_SUBSCRIPTION_OWNERS` (comma-separated user ids), defaulting to
`MICHAEL_HQ_OWNER_ID`. Anyone else gets 403 `{ error, code: "SUBSCRIPTION_OWNER_ONLY" }`
before any CLI is spawned; an empty configuration admits nobody. This keeps the
path safe once #410 opens `/api/joris/chat` to other workspace owners and members.
