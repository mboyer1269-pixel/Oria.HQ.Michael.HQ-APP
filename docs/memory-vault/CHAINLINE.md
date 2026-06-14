# Chainline — semantics

> **Status:** implemented · 2026-06-12
> **Code:** `buildChainlineGraph` / `chainlineStageForLink` in `src/server/memory/memory-graph.ts`
> **Voir aussi:** `docs/HQ_CHAINS.md` — chainline (lignée) vs ledger hash-chain (intégrité), et où elles se rejoignent.

A **chainline** is the audit path from where knowledge came from to what it
caused. Every significant decision in Oria HQ should be traceable along:

```
source → note → decision → action → ledger → pr → next
```

| Stage | Meaning | Link form |
|-------|---------|-----------|
| `source` | Where the knowledge came from (doc, contract, external ref) | `[[source:id]]` or link to a `source`/`doc` entry |
| `note` | The operational note or SOP distilled from the source | `[[note:id]]`, `[[sop:id]]` |
| `decision` | The recorded decision | `[[decision:id]]` |
| `action` | The action proposal / implementation work | `[[action:id]]` |
| `ledger` | Action Ledger reference proving execution | `[[ledger:event-ref]]` |
| `pr` | PR / implementation reference | `[[pr:ref]]` |
| `next` | The declared next action | `[[next:ref]]` |

## How it works

- A chainline is declared as a vault entry with `type: chainline`
  (directory `memory/chainlines/`). Its `[[...]]` links, **in order of
  appearance**, become the steps of the path.
- Each link is mapped to a stage: `ledger:`/`pr:`/`next:` prefixes map
  directly; other links map via the target entry's type (`source`/`doc` →
  source, `note`/`sop` → note, `decision` → decision, `action` → action).
- Links to agents and ventures inside a chainline are **context, not steps** —
  they are skipped by the stage mapper but still appear as graph edges.
- Steps pointing at refs with no vault entry (typically `ledger:` and `next:`)
  are rendered as **unresolved** — expected for in-flight work.
- `missingStages` lists the stages a path does not cover yet. A complete
  chainline has none.

## Rules

1. One chainline per initiative/wave, named `chainline-<initiative>`.
2. Fill the `ledger` step once a ledger event exists; fill `pr` once the PR is open.
3. A chainline with a `decision` but no `next` is a red flag: decided, going nowhere.
4. Chainlines are append-forward: when `next` becomes real work, it becomes the
   `action` of the *next* chainline.

Example: `memory/chainlines/memory-vault-v0-1.md`.
