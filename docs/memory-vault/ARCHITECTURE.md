# Memory Vault v0.1 — Architecture

> **Status:** implemented · 2026-06-12
> **Contract:** `docs/MEMORY_VAULT_CONTRACT.md` (trust levels, Joris read rules — unchanged)
> **Chainline semantics:** `docs/memory-vault/CHAINLINE.md`

## Layers

| Layer | Location | Persistence | Role |
|-------|----------|-------------|------|
| File vault | `memory/**/*.md` | Git (durable) | Curated operating memory: decisions, notes, sources, agents, ventures, actions, chainlines |
| Runtime vault | `src/server/memory/memory-vault-repository.ts` | In-memory (resets on restart) | Workspace-scoped entries with trust levels; Joris context injection path |
| Graph contracts | `src/server/memory/memory-graph.ts` | Pure code | Parsing, backlinks, graph build, duplicates, chainline mapping |
| Loader | `src/server/memory/memory-file-vault.ts` | server-only | Reads `memory/`, merges file + runtime entries (files win on id collision) |
| UI | `/hq/memory` + `src/features/memory/components/memory-vault-explorer.tsx` | — | Graph explorer, detail panel, backlinks, chainline rails |

## Pure module: `memory-graph.ts`

No fs, no `server-only`, no framework imports — fully unit-tested
(`memory-graph.test.mjs`) and serializable, so the server page can pass its
outputs straight to the client explorer.

- `normalizeMemoryId(input)` — lowercase, diacritics stripped, kebab-case.
- `extractBacklinks(markdown)` — `[[Name]]`, `[[type:id]]`, `[[ledger:ref]]`, `[[pr:ref]]`, `[[next:ref]]`; deduped, order preserved.
- `parseMemoryEntryMarkdown(raw, filePath?)` — simple `key: value` frontmatter (lists comma-separated), title fallback to first `#` heading, unknown types fall back to `note`, unparseable files return `null` (never throw).
- `buildMemoryGraph(entries)` — nodes (link targets without entries become `missing: true` nodes), deduped edges, backlink map, orphan list.
- `detectDuplicateMemory(entries)` — collisions on normalized id, or normalized title within the same type.
- `buildChainlineGraph(entries)` / `chainlinesForEntry(id, paths)` — see CHAINLINE.md.

## File entry format

See `memory/README.md` for the authoring guide. Frontmatter is intentionally
**not YAML** — a flat `key: value` grammar parsed by `parseMemoryEntryMarkdown`,
keeping the vault zero-dependency.

## Failure policy

The vault must never take down `/hq/memory`:

- Missing/unreadable `memory/` directory → empty file vault, runtime entries still render.
- Unparseable file → skipped.
- Broken `[[link]]` → visible `missing` node in the graph (a signal, not an error).

## Deployment note

`loadFileVaultEntries()` reads `memory/` from `process.cwd()` at request time.
On Vercel, files outside the traced bundle may be absent — the loader degrades
to an empty file vault. If file entries must render in production, add
`memory/**` to `outputFileTracingIncludes` in `next.config.ts` (separate,
explicit PR — deployment-config adjacent).

## Path to P5 RAG (not implemented)

The vault is already the right substrate for retrieval later:

1. Entries are typed, tagged, workspace-scopable, and id-stable.
2. A future embedding pass can index `MemoryEntry.body` per id — pgvector or
   external index — **behind the existing trust-level gate** (verified only).
3. Graph edges give retrieval re-ranking signals (backlink count, chainline membership) for free.

Locked until explicit CEO mandate: pgvector, Supabase persistence, automatic ingestion.
