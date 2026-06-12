# Memory Vault (file-backed, v0.1)

This directory is the durable, file-backed layer of the Oria HQ Memory Vault.
Every `.md` file here (except `README.md` and `index.md`) is one memory entry,
rendered and connected on `/hq/memory`.

Architecture: `docs/memory-vault/ARCHITECTURE.md` · Chainline semantics: `docs/memory-vault/CHAINLINE.md`

## How to add a memory note

1. Pick the directory matching the entry type (`decisions/`, `notes/`, `sources/`, `agents/`, `ventures/`, `actions/`, `chainlines/`).
2. Create one file per fact/lesson/decision. Kebab-case file name.
3. Use this frontmatter (simple `key: value`, lists are comma-separated — not YAML):

```markdown
---
id: my-entry-id
type: note
title: Human-readable title
status: active
project: oria-hq
tags: tag-one, tag-two
confidence: high
sourceRefs: docs/SOME_DOC.md, src/server/foo.ts
createdAt: 2026-06-12
updatedAt: 2026-06-12
---

# Human-readable title

Body in markdown. Link related entries Obsidian-style:
[[Decision Name]] · [[agent:joris]] · [[venture:loi96]] · [[source:memory-vault-contract]]
```

- `type`: `note | decision | source | sop | doc | agent | venture | action | pr | chainline`
- `id` is optional — defaults to the normalized title. Ids must be unique across the vault.
- Backlinks in the body become graph edges automatically.

## Rules

- One lesson/fact per file. No duplicates — update the existing file instead.
- Every `decision` should link to its source and its next action.
- Every `action` should link to an approval or ledger reference when one exists (`[[ledger:...]]`).
- Chainline entries (`chainlines/`) declare the path source → note → decision → action → ledger → pr → next.

## Boundaries

- This is curated operating memory, not a log (the Action Ledger is the log).
- No secrets, keys, or credentials. Ever.
- Workspace-scoped reads still apply for agent context injection — see `docs/MEMORY_VAULT_CONTRACT.md`.
