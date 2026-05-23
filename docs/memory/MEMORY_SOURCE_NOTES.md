# Memory Wiki — Source Notes

> **Branch:** `docs/memory-source-notes-2026-05-23`
> **UI surface:** [`/hq/memory`](../../src/app/hq/memory/page.tsx) (read-only mock)
> **Seed data:** [`src/features/memory/seed.ts`](../../src/features/memory/seed.ts)
> **Parent doctrine:** [`SOVRA_INDEX.md`](../SOVRA_INDEX.md)
> **Last updated:** 2026-05-23

---

## 0. Purpose

Source notes are the **canonical markdown trail** behind the Memory Wiki. They record what happened, which PRs landed, decisions taken, and blockers—without raw chat dumps or automatic ingestion.

| Layer | Role | Writable today |
|-------|------|----------------|
| **Source notes** (`docs/memory/`) | Human/agent-curated operational memory | Yes (PR) |
| **Memory Wiki UI** | Read-only scoreboard + daily log cards | Mock from seed |
| **Future persistence** | Memory Log Contract → Supabase | Not yet |

**Rules (aligned with Memory Wiki seed decisions):**

1. Memory Wiki before Workboard—know what happened first.
2. No automatic raw storage—operational summaries only.
3. Every figure in a daily log should trace to a source (PR, doc, or ledger ref when live).
4. One daily log file per calendar day: `docs/memory/daily-logs/YYYY-MM-DD.md`.
5. When the UI mock is updated, add a matching entry at the top of `recentDailyLogs` in `seed.ts`.

---

## 1. File layout

```
docs/memory/
├── MEMORY_SOURCE_NOTES.md    ← this file (conventions + index)
├── README.md                   ← quick pointer for agents
└── daily-logs/
    └── YYYY-MM-DD.md           ← daily operational log
```

---

## 2. Daily log template

Use the same sections as the mock `DailyLog` type:

- **Summary** — one paragraph, no fluff.
- **Merged PRs** — `#NN title` or short label.
- **Decisions** — bullet list.
- **Blockers** — bullet list (include open PRs if relevant).
- **Next actions** — bullet list.
- **Related refs** — paths to docs or code touched.

Optional front matter (for tooling later):

```yaml
date: YYYY-MM-DD
top_agent_id: hermes-builder
money_in_cents: 0
money_out_cents: 0
```

---

## 3. Index of daily logs

| Date | File | Highlights |
|------|------|------------|
| 2026-05-23 | [`daily-logs/2026-05-23.md`](daily-logs/2026-05-23.md) | SOVRA doctrine stack merged (#52–#56, #54); Memory Source Notes PR |
| 2026-05-22 | (seed only) | Memory Wiki foundation decision; runtime stabilisation |
| 2026-05-21 | (seed only) | Codex reintegration lots A–B |
| 2026-05-20 | (seed only) | Codex additions audit |

---

## 4. Related SOVRA docs (post-merge main)

After the 2026-05-23 merge sequence, primary references:

- [`AGENTIC_HOLDING_COMPANY_OPERATING_MODEL.md`](../AGENTIC_HOLDING_COMPANY_OPERATING_MODEL.md)
- [`CEO_REPORT_TEMPLATE.md`](../CEO_REPORT_TEMPLATE.md)
- [`HQ_SIGNAL_WIRING.md`](../HQ_SIGNAL_WIRING.md)
- [`OPERATIONAL_SAFEGUARDS_V1.md`](../OPERATIONAL_SAFEGUARDS_V1.md)
- [`SOVRA_INDEX.md`](../SOVRA_INDEX.md)

---

*Append-only discipline: edit same-day logs in place; older days are historical.*
