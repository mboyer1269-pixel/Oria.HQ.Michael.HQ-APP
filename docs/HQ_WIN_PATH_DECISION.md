# HQ Win Path Decision — 2026-07-02

Operation Win Path: one honest pass over the repo, the open PR train, and the
fastest credible route to daily use and revenue. Decisions below follow the
five tests: **A** Revenue Path, **B** Daily Use, **C** Speed, **D** Reliability,
**E** Leverage.

## Phase 0 — Truth check

- `main` @ `e383ac2`, working branch `feat/local-subscription-runtime-gate` @ `6c4b7ab`.
- Full validation suite green on the working tree: `typecheck`, `lint`,
  `test` (0 failures), `smoke:joris` PASS, `check:layering` OK,
  `map:check` up to date, `build` OK.
- 13 open PRs at audit start. 4 stale PRs closed during this pass
  (#300, #299, #155, #156 — all conflicting or superseded; branches intact,
  reopenable). 9 remain.

## Phase 1 — Business impact audit

Scores are 1–5 (higher = better; risk and effort inverted so higher = safer/cheaper).

| Option | Rev | Daily | Speed | Risk | Effort | Rever. | Total | Smallest PR | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| 7. Merge train cleanup | 2 | 3 | 5 | 5 | 5 | 5 | **25** | this doc + merges | **DO_NOW** |
| 1. Daily HQ Cockpit (Morning Brief cut) | 3 | 5 | 4 | 4 | 4 | 5 | **25** | one `/hq` view composing existing engines | **DO_AFTER_MERGE_TRAIN** |
| 2. Démo client claire | 5 | 2 | 3 | 4 | 3 | 5 | 22 | scripted 10-min demo doc + seeded data | DO_AFTER_MERGE_TRAIN (after cockpit) |
| 4. Local Claude/Codex runtime | 2 | 4 | 4 | 4 | 4 | 4 | 22 | #325 (contracts, done) → probe PR | DO_NOW (merge #325), probe = next mandate |
| 6. OpenRouter low-cost routing | 2 | 2 | 3 | 2 | 3 | 4 | 16 | rework #323 on top of #324 | DO_AFTER_MERGE_TRAIN + explicit CEO call |
| 5. Zapier MCP dry-run actions | 3 | 2 | 2 | 3 | 2 | 4 | 16 | one dry-run action behind Sentinelle | PARK (until a real business action needs it) |
| 3. Lead Rescue / réceptionniste AI | 5 | 1 | 1 | 2 | 1 | 3 | 13 | none small — needs a real client + telephony | PARK (revisit with a named prospect) |

**Read of the board:** the repo's problem is not missing foundations — it is
9 open PRs and no single surface Michael uses every morning. The fastest
credible route to value is: flush the merge train today, then ship one
Morning Brief view that composes what is ALREADY merged (NextBestAction
engine, execution-intent approval panel, action ledger, memory vault). No new
backend is required for daily use.

## Phase 2 — PR train decisions

| PR | Decision | Business impact | Risk | Exact action |
|---|---|---|---|---|
| #316 runbook 0024 live-apply | **MERGE_NOW** | Unblocks live execution-intent persistence when mandated (test D) | None — docs only, checks green | `gh pr merge 316 --squash --delete-branch` |
| #320 Master Brief v3 | **MERGE_NOW** | Doctrine anchor the whole train references (test E) | None — one docs file, checks green | `gh pr merge 320 --squash --delete-branch` |
| #322 Tool Universe corridor | **MERGE_NOW** | Provider adapter contracts; unlocks #324/#323 lane (test E) | Low — pure contracts + tests, checks green, zero review findings | `gh pr merge 322 --squash --delete-branch` |
| #325 Local runtime gate | **MERGE_NOW** (after CI on `6c4b7ab`) | Foundation for subscription-CLI cost reduction (tests C+E) | Low — pure contracts; all 3 Codex P2s fixed 2026-07-02 | merge #322 first; if system-map conflicts, regen map on branch, then `gh pr merge 325 --squash --delete-branch` |
| #324 Model/provider registry | **FIX_THEN_MERGE** | Registry that makes provider choice governable (test E) | Medium — 4 Codex P2s + 1 CodeRabbit major (prototype-chain route lookup) still open | fix findings on branch, re-validate, then merge; this is the next work PR |
| #323 OpenRouter free-first | **REBASE_AFTER_FOUNDATION** | Cost reduction on Joris replies (test C) | **High** — routes live Joris replies through free models, contradicting the ratified display-only doctrine (PR #308); bypasses the #324 registry; 4 Codex findings | park until #324 merges; then rework as registry-compliant route + explicit CEO mandate for live free-model dispatch |
| #298 HQ UI uplift | **REPLACE_WITH_SMALLER_PR** | The daily-use goal is right; the PR is wrong-sized | High — `verify` FAILING, +4324 lines, mixes live outbound send routes with UI | extract the Morning Brief cut (below) as a fresh small PR; park #298 as a parts bin |
| #319 OodaWager (draft) | **PARK** | Real differentiator (decisions as falsifiable bets) but P3b has no mandate | Low — pure types + tests, draft | keep draft; revisit as part of the Decision Fabric lane when mandated |
| #318 ECC bundle | **PARK** | Agent tooling config, not product | Medium — 1.5k lines of `.codex/.claude/.agents` config sprawl; anti-dispersion rule applies | leave open, do not merge; extract only pieces proven useful |
| #300, #299, #155, #156 | **CLOSED** (this pass) | Stale/conflicting, superseded | — | done; branches recoverable |

**Merge order matters:** #316 → #320 → #322 → #325. #322 and #325 both touch
`docs/system-map.json`; after #322 lands, #325 may need a `main` merge +
`npm run map` regen on its branch before merging.

## Phase 3 — Chosen priority

**C. Merge Train Foundation today, then A. Daily HQ Cockpit as the next build PR.**

Chosen on impact: nothing else compounds while 9 PRs sit open, and the
cockpit is the only option that makes Oria used every morning without new
backend risk.

### Next PR recommended — "HQ Morning Brief"

One view at the top of `/hq` that answers, in 60 seconds:

1. **Morning Brief** — one-paragraph state of play (composed, not generated).
2. **Decisions Waiting** — pending execution intents (approve/reject already wired).
3. **Money / Revenue Moves** — top NextBestAction items tagged revenue.
4. **Active Agents** — what ran, what's parked (from ledger).
5. **Proof / Ledger** — last N ledger entries.
6. **Next Action** — the single top NextBestAction.

Composes only merged engines. No migrations, no new providers, no live sends.
Rollback = revert one squash commit.

## Success measures

- Open PRs: 13 → ≤ 5 within the week.
- Michael opens `/hq` each morning and can state his next action in ≤ 60s.
- One scripted client demo runs end-to-end in ≤ 10 minutes using the cockpit.
- Zero validation regressions on `main` (all 7 checks stay green).

## Rollback

Every merge is a squash commit (`git revert <sha>`). Closed PRs are
reopenable. Parked branches are untouched.
