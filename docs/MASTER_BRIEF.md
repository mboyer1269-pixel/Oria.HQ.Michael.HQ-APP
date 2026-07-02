# Master Brief — Agentic OS (Architecture v3)

**Date:** 2026-07-02 · **Status:** Proposed — CEO validation required
**Supersedes:** Master Brief v1/v2 (conversation-only; never landed in a repo)

> **Doctrine — the four lines that govern everything below:**
> *Tool Universe infini. Authority finie. Autonomie dans les lignes. CEO-click seulement hors ligne.*

---

## 0. Verified state (build on this, not on memory)

| Item | State | Proof |
|---|---|---|
| Oria PR #317 (n8n rail + architecture + security) | OPEN, MERGEABLE, full gate green, awaiting CEO GO | Final Gate Summary comment on #317 |
| Oria PR #316 (0024 live-apply runbook) | OPEN, **KEEP** — its runbook is not in #317 | `docs/runbooks/0024-execution-intents-live-apply.md` absent from #317 tree |
| Oria PR #319 (OodaWager type foundation) | **DRAFT / ON HOLD** until the Autonomy Lines ADR | Hold comment on #319 |
| Memex Core main | Memory Fabric validated and wired into `check`/`test` | commit `0a5a23b` |
| Migration 0024 live state | **UNKNOWN** until explicit CEO GO | no in-repo apply artifact |
| Migration 0025 live state | **UNKNOWN / claimed-by-doc** | `docs/SECURITY_FINDINGS.md` note (2026-06-18, unmerged branch) |

Anything this brief proposes that contradicts the table above is wrong; fix the brief, not the table.

## 1. The product (corrected)

**Not:** an agent that always asks permission. That is a form with extra steps.

**Is:** an **Agentic OS where agents know when they may act alone** — because the
CEO pre-approved *lines of authority*, and every action either falls inside a
line (act + ledger, no click) or outside it (wager + CEO click). The click is
the exception boundary, not the workflow.

This is already half-built under its real names — no invented codenames in v3:

- **Decision Spine** (`src/server/decision-spine/next-best-action.ts`) — pure engine answering "what next?".
- **Sentinelle** (`src/server/runtime/execution-guard.ts`) — `ALLOW | REQUIRE_APPROVAL | BLOCK` before any live effect.
- **Autonomy gates** (`src/server/agents/autonomy-tier.ts`) — `full_autonomous | supervised | blocked`; composition rule: gates only downgrade, never promote.
- **Execution rail** (#317) — intent → CEO approve → single signed n8n chokepoint → ledger.
- **Action Ledger** — append-only record; hash-chain integrity in shadow.
- **Memory Fabric** (Memex `src/fabric/`) — admission policy + context packs.
- **Operating lines + wagers** (#319, held) — `PersonalOperatingLine` shape, `evaluateWagerAgainstLine()`, zero policy values until the ADR.

## 2. The three pillars — kept, reordered

The v1/v2 pillars survive: **tool acceleration**, **passive ingest**, **identity
isolation**. What changes is the order of construction, because authority must
exist before reach:

1. **Authority first** — the *Autonomy Lines ADR* (the CEO writes the numbers: max stake per line, concurrency, what is never autonomous). Everything else binds to it.
2. **Adapters second** — tools and inboxes enter through the execution rail chokepoint, one corridor at a time, dry-run first.
3. **Providers never core** — no provider type, import, or assumption in `core/`, `decision-spine/`, or `runtime/`. Providers live and die in adapter modules.

## 3. Autonomy model — the lines

- A **line** is a CEO-authored budget of authority per stake kind (money, time, reputation, opportunity): max stake per action, max concurrent active, irreversibility policy. The SHAPE already exists in #319; the VALUES come only from the ADR.
- **Inside the line:** the agent acts alone. Sentinelle still evaluates, the ledger still records — autonomy is audited, not blind.
- **Outside the line:** the action must carry a **wager** (falsifiable hypothesis, bounded max loss, kill criteria) and route to a CEO click.
- **Irreversible:** always a CEO click. No line overrides this; no gate promotes.
- **Fail-safe:** no line ⇒ CEO click. Unknown ⇒ blocked. Ambiguity closes gates.

## 4. Tool universe — infinite reach, finite trust

**Why Composio-class providers are interesting:** delegated auth, sandboxed
execution, parallel tool calls, ~1,000+ app integrations without writing each
one. **Why AgentMail-class providers are interesting:** API-native inboxes per
agent — threads, replies, events, custom domains — an identity surface for
agents that is not the CEO's mailbox.

**Why they are a danger zone:** 2026 research finds ~97% of analyzed MCP tools
carry at least one *description smell* that can misguide agent tool selection,
and the MCP threat literature documents tool poisoning, prompt injection via
tool descriptions, privilege escalation, and supply-chain attacks.

**Rules of engagement (non-negotiable):**

1. Every external tool call passes the existing rail chokepoint (signed, allowlisted, rate-limited, ledgered) — the pattern `n8n-webhook-trigger.ts` already sets.
2. Tool descriptions and outputs are **untrusted input** — never authority. A tool cannot widen its own line.
3. Allowlist-by-default (the `webhook-registry.ts` pattern): a new tool/route is a diff, reviewable, revertible.
4. Pin tool manifests; treat manifest drift as a supply-chain event, not an update.
5. One corridor per adapter, dry-run before live, per-corridor kill switch.
6. Delegated, scoped, per-agent credentials only — no shared super-token, nothing in the repo.

## 5. Passive ingest — Memex is ORIENT

- **Oria HQ = GOVERN**: display, approve, audit, execute under guard.
- **Memex Core = ORIENT**: retain, contextualize, assemble context packs under the Memory Fabric admission policy (verified-only injection).
- **Hermes/Joris = ACT**: propose and execute under governance.
- Oria never becomes long-term memory truth; Memex never clicks for the CEO; Oria requests context packs read-only and never writes into Memex directly.

## 6. Identity isolation

Each agent gets its own identity surface: its own inbox (AgentMail-class,
behind an adapter), its own delegated credentials (Composio-class, scoped),
its own ledger trail. Compromise of one agent's surface must not reach the
CEO's identity or another agent's authority. Identity is per-agent, authority
is per-line, and the two never merge.

## 7. Build order (the only roadmap)

| # | Step | Gate to pass |
|---|---|---|
| 0 | CEO GO: merge #317 · confirm 0024/0025 live state · keep #316 | explicit CEO GO |
| 1 | **ADR-001 Autonomy Lines** (docs-only, on fresh main) — the CEO writes the numbers | #317 merged |
| 2 | Unhold #319; align types to ADR vocabulary if needed; merge | ADR merged |
| 3 | Sentinelle REQUIRE_APPROVAL **wager packet** (approval carries the wager) | #319 merged |
| 4 | Wager review UI (the CEO clicks on evidence, not on vibes) | packet merged |
| 5 | Memex↔Oria **context-pack adapter** (read-only ORIENT) | fabric contract decisions made |
| 6 | First external adapter behind the rail — ONE corridor, dry-run first (candidate: agent inbox or tool provider) | steps 1–5 green |

No step starts before its gate. No step skips the rail.

## 8. Non-goals — permanent

No providers in core. No direct Memex writes from Oria. No unattended
irreversible action, ever. No secrets in any repo. No migration applied by
code. No notification channel outside the Decision Spine. No new venture,
client, or project hardcoded in engine code.

## 9. Kill criteria — this brief is itself a wager

- If, 30 days after the first lines are live, **>50% of in-line actions still route to a CEO click**, the lines are mis-sized — revise the ADR, not the doctrine.
- If a single adapter corridor produces **one** unledgered external effect, freeze all adapters and treat it as an incident.
- If wagers stop being settled with evidence, the wager system is theater — stop adding corridors until settlement discipline returns.

*A bet you cannot lose is not a wager; a brief you cannot falsify is not a plan.*
