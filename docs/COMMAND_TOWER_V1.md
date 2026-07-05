# Command Tower v1 — daily dispatch cockpit

The Command Tower is the first thing Michael sees on `/hq`: one surface to
**see, decide, prepare a dispatch, and check proof** in under 60 seconds. It
is a composition layer — every number it shows comes from an engine that is
already merged. It adds **no** backend, no migration, no live runtime, no
subprocess, no provider call, no secret.

Doctrine: Oria = GOVERN. Runtimes are means, never the product. Sentinelle
keeps the authority; the Ledger keeps the proof. The tower shows reality or
says explicitly that it can't (`not_configured`, `pending`, `unavailable`,
`blocked`, `ready`).

## Sections

| # | Card | Data source (all read-only) | Action |
|---|---|---|---|
| 1 | **Mission Brief** | Decision Spine (`collectDecisionSignalSnapshot` → `computeNextBestActions`) + pending intent count | Follow the single highlighted next action (read-only deep link) |
| 2 | **Decision Queue** | `listPendingAgentExecutionIntents` — max 3 shown, overflow counted | Jump to the Approval Rail |
| 3 | **Runtime Dispatch Board** | Static corridor registry (pure data, evidence-cited) | Prepare an intent on the only governed corridor (n8n); others say why they can't |
| 4 | **Evidence Feed** | `listActionLedgerForWorkspace` (last 5) | Open full Ledger Activity |
| 5 | **Approval Rail** | Existing `ExecutionIntentReviewPanel` (hermes) | Approve / Reject — the only real triggers on the page |
| 6 | **Runtime Status** | Static registry: Claude Code CLI, Codex CLI, Gemini CLI, Zapier MCP | None — displays honest status until the Runtime Gate (#325) merges and a probe exists |
| 7 | **Parking Lot** | Static registry mirroring `docs/HQ_WIN_PATH_DECISION.md` | None — shows what is deliberately parked and why |

## Daily flow

1. Michael opens `/hq` — the tower is the first section.
2. Mission Brief: one headline, one highlighted next action.
3. Decision Queue: what waits on him (≤ 3 + overflow count).
4. Runtime Status: which runtimes could act, and why none is `ready` yet.
5. Dispatch Board: preparing a dispatch = creating an execution intent; the
   CEO approval stays the only trigger. No button pretends to execute.
6. Evidence Feed: last ledger entries with storage source (supabase/local).
7. Approval Rail: approve or reject pending intents — real, already-wired
   actions with atomic transitions.

## Honest-state rules

- A runtime is never shown `ready` without probe evidence (invariant 1 of the
  Runtime Gate). Until #325 merges and a probe PR is mandated, all local
  runtimes display `not_configured` with the reason.
- Every dispatch corridor carries `requiresApproval: true` — the type forbids
  anything else.
- If a data source throws, its card shows `unavailable` — never a blank or a
  fake zero.
- Empty is a state, not an error: zero pending intents renders "rien à
  décider" with the next place to look.

## Explicitly not implemented (future PRs, each needs a mandate)

1. Local runtime probe implementation (produces real `ready`/`unavailable`).
2. Claude Code dry-run dispatch. 3. Codex CLI dry-run dispatch.
4. Zapier MCP dry-run corridor. 5. Evidence Pack export. 6. Mobile pass.

## Files

- `src/features/hq/command-tower/command-tower-model.ts` — pure view-model +
  static registries (capability-status idiom: every status cites evidence).
- `src/features/hq/command-tower/command-tower-model.test.mjs` — invariants:
  never-ready-without-probe, ≤3 intents per card, honest empty/unavailable
  states, determinism.
- `src/features/hq/components/command-tower.tsx` — server component; fetches
  read-only, builds the model, renders the seven cards.
- `src/app/hq/page.tsx` — mounts `<CommandTower />` as the first section.
