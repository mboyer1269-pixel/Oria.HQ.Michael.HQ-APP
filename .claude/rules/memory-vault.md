# Memory Vault rules

The file-backed Memory Vault lives in `memory/` (authoring guide: `memory/README.md`;
architecture: `docs/memory-vault/ARCHITECTURE.md`).

1. One lesson/fact/decision per file. Check for an existing entry before
   creating one — update it instead of duplicating (`detectDuplicateMemory`
   flags collisions on `/hq/memory`).
2. Link related entries Obsidian-style: `[[id]]`, `[[agent:joris]]`,
   `[[venture:loi96]]`, `[[decision:...]]`. Unlinked entries show up as
   orphans on `/hq/memory`.
3. Every `decision` entry must link to its source and to a next action.
4. Every `action` entry must link to an approval or ledger reference
   (`[[ledger:...]]`) when one exists.
5. Frontmatter is flat `key: value` with comma-separated lists — not YAML.
   Required: `type`, `title`. Ids are kebab-case and unique.
6. Never put secrets, keys, or credentials in vault entries.
7. The runtime vault contract (`docs/MEMORY_VAULT_CONTRACT.md`) is unchanged:
   Supabase persistence, pgvector, and automatic ingestion stay locked until
   an explicit CEO mandate.
