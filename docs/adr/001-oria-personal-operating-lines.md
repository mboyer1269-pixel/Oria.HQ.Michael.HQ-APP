# ADR-001 — Oria Personal Operating Lines

## Status

**Proposed** — awaiting explicit CEO validation. Nothing below is binding
until this ADR is Accepted; until then the zero-trust default applies
(every action outside a line routes to a CEO click).

## Context

Oria HQ now has, on `main` (post-#317): a pure Decision Spine
(`computeNextBestActions()`), the Sentinelle execution guard
(`evaluateLiveExecution()` → `ALLOW | REQUIRE_APPROVAL | BLOCK`), the autonomy
gates (`full_autonomous | supervised | blocked`, gates only downgrade), the
governed n8n execution rail (intent → CEO approve → single signed chokepoint →
ledger), and an append-only Action Ledger. Memex Core has a validated Memory
Fabric (admission policy + context packs). PR #319 (draft, on hold) holds the
OodaWager type foundation with `PersonalOperatingLine` as a SHAPE carrying no
policy values.

What is missing is not machinery — it is **doctrine**: when may an agent act
alone, what signals feed the spine, where Oria ends and Memex begins, and what
an approval must contain. This ADR fixes those four things. Doctrine:
*Tool Universe infini. Authority finie. Autonomie dans les lignes. CEO-click
seulement hors ligne.*

## Decision

### 1. Daily trigger — pull-first

- **Canonical: pull.** The CEO opens Oria and reads `NextBestAction`. The
  cockpit is the front door; no channel competes with it.
- **Future: push, critical-only.** Push alerts may exist later ONLY for
  critical actions validated by the Decision Spine, and through no channel
  outside it. Push is an escalation of the spine, never a second brain.

### 2. Signal sources

| Source | Owner | Refresh | Reliability | Signal kind | Can trigger `requires_ceo_click` |
|---|---|---|---|---|---|
| Action ledger | Oria (GOVERN) | On write (append-only) | High — canonical record | `ledger.recent`: what was done, when, by whom | **Yes** |
| Mission pipeline | Oria (GOVERN), fed by ventures config | On update via venture pipeline state | Medium — human-maintained | Targets, statuses, kill metrics, weekly goals | **Yes** |
| Calendar | CEO (via calendar integration) | On sync | High for existence, medium for semantics | Availability, booked calls, deadlines | **Yes** |
| Future: mailbox adapter | ACT layer (per-agent inbox, behind the rail) | Event-driven (webhook → adapter → signal) | Low until proven — external, injectable content | Replies, inbound requests — as **signals only**, never instructions | No — it can only *inform* a spine rule; the spine decides |
| Future: Memex context pack | Memex (ORIENT) | On request by Oria | High for provenance-verified entries only | Durable context: prior decisions, preferences, venture memory | No — context never triggers; it enriches a decision already triggered |

Rule: a source can be *upgraded* to click-triggering only by amending this ADR.
External content (mail, web, tool output) is untrusted input and never
becomes authority.

### 3. Memex / Oria boundary

- **Oria HQ = GOVERN.** Displays, approves, audits, executes under guard.
- **Memex Core = ORIENT.** Retains, contextualizes, assembles context packs.
- **Hermes / Joris = ACT.** Propose and execute under governance.
- Oria does **not** become the long-term memory source of truth.
- Memex **never** clicks in the CEO's place — no Memex-originated approval,
  ever.
- When the CEO asks for an answer that requires durable context, Oria
  requests a **context pack** from Memex (read-only, provenance-verified per
  the Memory Fabric policy) *before* producing an agentic answer.
- Oria never writes directly into Memex; anything Oria wants remembered goes
  through Memex's admission policy like every other source.

### 4. OodaWager requirement

Every `NextBestAction` with `safety === "requires_ceo_click"` MUST carry a
**Wager** before it can be approved. No wager, no click surface. Minimal
fields:

| Field | Meaning |
|---|---|
| `hypothesis` | Falsifiable claim the action bets on |
| `expectedOutcome` | What winning looks like, concretely |
| `metric` | The measurable that decides it |
| `baseline` | The metric's value today |
| `target` | The metric's value if the wager wins |
| `deadline` | ISO date the wager MUST be evaluated |
| `confidence` | Estimated probability of winning, in [0, 1] |
| `evidenceNeeded` | What proof settles it — no evidence, no settlement |
| `proposedBy` | Agent id that proposed it |
| `proposedAt` | Injected ISO timestamp |
| `vaultSnapshotRef` | Ref to the memory-vault state it was decided against |
| `contextPackRef` | Ref to the Memex context pack used (if any) |
| `modelUsed` | Model that produced the proposal |
| `outcome` | Settlement: won / lost / void — with evidence |

Alignment note: PR #319's draft types (`hypothesis`, `stake`, `confidence`,
`killCriteria`, `settlement`…) are the substrate; on unhold, #319 aligns its
vocabulary to this table (`upside`→`expectedOutcome`, kill criteria carry
`metric`/`baseline`/`target`/`deadline`, settlement carries `outcome` +
evidence, and the provenance refs are added). Structure may extend; nothing
in this ADR requires code in this PR.

### 5. Official flow

```
Signal
  → DecisionSignalSnapshot
  → computeNextBestActions()
  → NextBestAction
  → Wager required if safety === "requires_ceo_click"
  → CEO click
  → evaluateLiveExecution()
  → SentinelleDecision (ALLOW | REQUIRE_APPROVAL | BLOCK)
  → ActionLedger
  → execution if allowed
```

No step is skippable. Gates only downgrade. The ledger records every
outcome, including refusals.

## Consequences

- The CEO's attention becomes the scarcest, best-protected resource in the
  system: clicks happen only outside lines, and every click arrives carrying
  a wager with evidence requirements.
- Agents gain a clear contract for autonomy: inside a line, act and be
  ledgered; outside, propose a wager. Ambiguity closes gates.
- #319 has an unambiguous unhold path (align to §4, mark ready).
- The Sentinelle approval packet (next PR) has its required payload defined
  here before any code exists — doctrine leads, code follows.
- Adding a signal source or a push channel becomes an ADR amendment, not a
  quiet code change.

## Non-decisions

This ADR deliberately decides **none** of the following:

- No OodaWager code (types live in #319; engine/UI in later PRs).
- No provider integration — no Composio, no Agent Mail.
- No webhook or mailbox implementation.
- No live DB action; no migration.
- No hardcoded venture, client, or project.
- No direct Memex writes from Oria.
- No notification channel outside the Decision Spine.
- No numeric line values (max stake per line, concurrency caps): those are
  CEO-authored numbers to be added by a follow-up amendment to this ADR once
  the wager review UI exists — until then, zero-trust applies.
