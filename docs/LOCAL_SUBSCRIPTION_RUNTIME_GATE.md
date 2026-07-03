# Local Subscription Runtime — Reality Gate

Status: **foundation only** — pure contracts and this analysis. No subprocess,
no fetch, no SDK, no live call of any kind ships with this document.

Date: 2026-07-02. Owner: Michael (CEO). Doctrine: Oria = GOVERN, Memex =
ORIENT, Hermes/Joris = ACT. Providers and runtimes are adapters, never core.
Sentinelle keeps the authority; the Ledger keeps the proof.

---

## 1. Objective

Michael holds personal ChatGPT/Codex and Claude subscriptions. The goal is to
let Oria HQ use those subscriptions **locally, for Michael's personal use**,
without paying per-request API prices — and without building anything fragile
or forbidden (cookies, reverse proxies, session tokens, browser scraping).

This gate decides which paths are real, which are forbidden, and what minimal
foundation (contracts + invariants) the repo can carry today so a future probe
PR lands on rails instead of improvisation.

## 2. What is officially viable

Two vendors ship **official CLIs that authenticate with a subscription
account** and run non-interactively on the owner's machine:

| Runtime | Binary | Subscription auth | Headless mode | Structured output |
|---|---|---|---|---|
| Claude Code CLI | `claude` | Claude Pro / Max / Team / Enterprise (or Console API key) | `claude -p "<prompt>"` | `--output-format json` |
| Codex CLI | `codex` | ChatGPT Plus / Pro / Business / Edu / Enterprise (or `OPENAI_API_KEY`) | `codex exec "<task>"` | JSON output modes |

Both are the vendors' own supported login flows (the CLI drives its own OAuth
device flow — Oria never touches tokens, cookies, or browser sessions). Both
are designed for exactly this: the account owner running the tool on their own
machine. Exact flags and output formats are recorded here as expectations and
must be **re-verified by the probe** at detection time, not trusted from
documentation.

## 3. What is forbidden (no-go)

These are rejected permanently, and the contract makes them inexpressible:

- **Cookie or `session_token` auth** — brittle (rotates, breaks silently), a
  credential-theft surface, and against provider terms.
- **Reverse-proxying a chat UI** — terms violation, ban risk, fragile.
- **Browser scraping / automation of claude.ai or chatgpt.com** — same.
- **OAuth interception** (harvesting tokens from another app's flow) — a
  security hole pretending to be an integration.

If a path requires Oria to *hold* a credential the vendor did not hand it
through an official mechanism, the path is dead. No exceptions.

## 4. Claude Code CLI option

- **Auth**: `claude` login binds to a Claude account; Pro/Max include Claude
  Code usage in the subscription. `account_login` mode — no key in Oria.
- **Invocation (future PR)**: subprocess `claude -p` with argv-passed prompt
  (never shell-interpolated), `--output-format json` for structured replies.
- **Permission modes**: default / plan / accept-edits are acceptable;
  `--dangerously-skip-permissions` is a dangerous mode and is **rejected by
  default** by the invocation policy contract.
- **Limits**: shares the personal plan's rate limits with Michael's own
  interactive use — invocation policy must stay low-frequency and gated.
- **Verdict: GO** for a detection probe (binary present? version? auth mode?).

## 5. Codex CLI option

- **Auth**: "Sign in with ChatGPT" (Plus/Pro/Business/Edu/Enterprise) for
  subscription-included usage, or `OPENAI_API_KEY` for metered use. Both are
  official; the key, if ever used, is referenced by env var **name** only.
- **Invocation (future PR)**: subprocess `codex exec` with argv-passed task.
- **Sandbox/approval modes**: read-only and gated modes acceptable; full-auto
  bypass modes (`--dangerously-bypass-approvals-and-sandbox`) are **rejected
  by default**.
- **Verdict: GO** for a detection probe.

## 6. Zapier MCP option

Zapier MCP exposes thousands of app *actions* over MCP. It is a **tool
corridor, not a model runtime** — no LLM inference flows through it, so it is
irrelevant to the subscription question. If adopted later it must follow the
existing n8n corridor pattern (`src/server/agents/tools/`): strict registry,
execution intents, CEO approval, Ledger. **Verdict: GO LATER** as a dry-run
tool corridor, separate mandate, zero code today.

## 7. OpenAI Responses MCP option

The Responses API can attach remote MCP servers as tools — but it is an **API
route** (metered per request), not a subscription route. It belongs in the
Provider Registry (PR #324) as an `api` provider if API cost ever becomes
acceptable. **Verdict: PARK.**

## 8. Security risks

1. **Subprocess injection** — prompts must be passed as argv, never through a
   shell string. Subprocess execution itself stays `future_pr` until
   explicitly approved (invariant 11).
2. **Dangerous permission modes** — CLI flags that skip approvals or sandboxes
   turn a local runtime into an unattended agent with Michael's account. The
   contract rejects them by default (invariant 9).
3. **Untrusted output** — CLI output is model output: it can carry prompt
   injection aimed at Oria's own pipeline. Output must be structured JSON or
   explicitly marked untrusted (invariant 10); Sentinelle's verdict at
   dispatch remains the only authority (invariant 7).
4. **Account exhaustion** — runaway invocation burns the personal plan's
   limits. Policy stays low-frequency, gated, ledgered.
5. **Tenant leakage** — a personal subscription must never serve workspaces,
   tenants, or customers (invariant 12). It is a personal convenience, not
   Oria capacity.
6. **Secret handling** — `api_key` mode stores an env var NAME, never a value
   (invariant 3). `account_login` stores nothing at all.

## 9. Target architecture

The rule chain is unchanged — a subscription CLI is just one more adapter:

```
Intent -> Agent Profile -> Model Policy -> Provider Registry
      -> Runtime Adapter (kind: cli-subscription) -> Sentinelle -> Ledger
```

- **This PR**: `src/server/agents/runtimes/local-runtime-contract.ts` — pure
  descriptors, probe-result shape, invocation policy, safety boundary, and 12
  tested invariants. Self-contained: no import from the unmerged PR #324
  module; vocabulary deliberately compatible with its
  `RuntimeAdapterKind = "cli-subscription"`.
- **Probe PR (next, needs mandate)**: detection only — is the binary on PATH,
  which version, which auth mode. Produces `LocalRuntimeProbeResult` evidence.
  Still no model invocation.
- **Invocation PR (later, needs explicit approval)**: subprocess execution
  behind Sentinelle + Ledger, structured output contract enforced.
- **Registry wiring (later)**: adapters registered in the PR #324 registry.

Naming note: `src/server/runtime/local-runtime.ts` is the existing **mission
runtime mock** (HMAC-signed instructions, dry-run echo). This module governs
**subscription CLI runtimes**. Same words, different layer — do not merge them.

## 10. Decision

| Path | Verdict |
|---|---|
| Claude Code CLI adapter probe | **GO** |
| Codex CLI adapter probe | **GO** |
| Zapier MCP dry-run tool corridor | **GO LATER** (separate mandate, n8n corridor pattern) |
| OpenAI Responses MCP | **PARK** (API route, revisit if API cost is acceptable) |
| Cookies / reverse proxy / session tokens / scraping | **NO-GO — permanent** |

Final rule: this foundation must not make Oria *depend* on Claude, ChatGPT,
Codex, or Zapier. It makes Oria able to **detect** them, **govern** them,
**use** them locally for Michael, and **disable** them cleanly.
