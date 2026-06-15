# Memory Vault — Contract

> **Status:** implemented — local in-memory · contract 2026-06-03 · updated 2026-06-15<br>
> **Sprint:** Memory Vault foundation (P0)  
> **Canonical types:** `src/server/memory/memory-vault-types.ts`  
> **Implementation:** `src/server/memory/memory-vault-repository.ts` (local store + propose/approve governance), `src/server/joris/brain.ts` (verified-entry injection)<br>
> **Depends on:** nothing (pure contract)  
> **Still locked:** Supabase persistence — see "What is locked".

---

## Purpose

The Memory Vault is the **workspace-bound, typed knowledge layer** for Oria HQ.  
It stores durable, human-controlled memory entries that agents — primarily Joris — can read when building context for a request.

It is **not**:
- An automatic ingestion pipeline.
- A vector database or semantic search index.
- A log of every event (that is the Action Ledger's job).
- A file storage system.

It is:
- A small, curated set of typed entries per workspace.
- A source of truth for decisions, SOPs, notes, and reference documents that Joris should be aware of.
- Human-writable first; agent-proposed entries require CEO approval before persistence.

---

## Memory entry types

| Type | Purpose | Example |
|------|---------|---------|
| `decision` | A recorded strategic or operational decision. | "On n'expose pas de runtime HTTP avant audit." |
| `sop` | A Standard Operating Procedure — repeatable process. | "How to open a new venture sprint." |
| `note` | A free-form operational note from the CEO or an agent. | "Suivia scanner à valider avant activation cron." |
| `source` | A reference document or external source tagged for recall. | URL, doc path, or summary of an external resource. |
| `doc` | An internal document summary — not the full doc, but a digest. | Summary of AGENTS.md rules for Joris context injection. |

---

## Data shape

### `MemoryVaultEntry`

```ts
type MemoryVaultEntryType = "decision" | "sop" | "note" | "source" | "doc";
type MemoryVaultAuthor = "human" | "joris" | "agent";
type MemoryVaultTrustLevel = "verified" | "proposed" | "draft";

type MemoryVaultEntry = {
  id: string;                        // uuid
  workspaceId: string;               // workspace boundary — never cross-read
  type: MemoryVaultEntryType;
  title: string;                     // short label for display
  content: string;                   // the memory content (plain text or markdown)
  tags: string[];                    // free-form tags for recall filtering
  author: MemoryVaultAuthor;
  trustLevel: MemoryVaultTrustLevel; // only "verified" entries are injected into Joris context
  createdAt: string;                 // ISO 8601
  updatedAt: string;
  approvedBy?: string;               // userId of CEO who approved (required for agent-authored entries)
  sourceRef?: string;                // optional: file path, URL, or PR reference
  expiresAt?: string;                // optional: ISO 8601 — entry is stale after this date
};
```

### `MemoryVaultReadQuery`

```ts
type MemoryVaultReadQuery = {
  workspaceId: string;
  types?: MemoryVaultEntryType[];    // filter by type; omit = all
  tags?: string[];                   // filter by tags (OR logic)
  trustLevel?: MemoryVaultTrustLevel; // default: "verified" only for Joris injection
  limit?: number;                    // default: 20
};
```

### `MemoryVaultReadResult`

```ts
type MemoryVaultReadResult = {
  entries: MemoryVaultEntry[];
  workspaceId: string;
  retrievedAt: string;               // ISO 8601
  truncated: boolean;                // true if limit was hit
};
```

---

## Workspace binding rules

1. **Every entry carries a `workspaceId`.** No entry exists without one.
2. **Cross-workspace reads are forbidden.** A query for workspace A must never return entries from workspace B.
3. **Joris reads only from its active workspace context.** `WorkspaceContext.workspaceId` scopes all vault reads.
4. **There is no global memory.** System-level knowledge (AGENTS.md rules, guardrails) is encoded as `doc` entries in the appropriate workspace, not as a shared namespace.

---

## Joris read rules

Joris may read from the Memory Vault **only under these conditions**:

| Condition | Rule |
|-----------|------|
| Trust level | Only `verified` entries are injected into Joris context by default. |
| Entry type | All types (`decision`, `sop`, `note`, `source`, `doc`) may be read. |
| Workspace scope | Joris reads only from `WorkspaceContext.workspaceId`. |
| Injection trigger | Read is triggered at the start of a Joris brain invocation, not on every message. |
| Volume limit | Maximum 20 entries per read. Entries are ordered by `updatedAt` DESC. |
| No write path | Joris may **propose** a new entry (type `note` or `source`, `trustLevel: "proposed"`), but cannot write directly. CEO approval is required before the entry becomes `verified`. |

---

## Trust levels

| Level | Meaning | Joris can use? |
|-------|---------|----------------|
| `verified` | Approved by CEO and confirmed as accurate. | ✅ Yes |
| `proposed` | Proposed by agent; awaiting CEO review. | ❌ No |
| `draft` | Work-in-progress by CEO or agent; not reviewed. | ❌ No |

---

## Author rules

| Author | Can create? | Trust on creation |
|--------|-------------|-------------------|
| `human` (CEO) | Yes — directly. | `verified` |
| `joris` | Propose only — queued for approval. | `proposed` |
| `agent` | Propose only — queued for approval. | `proposed` |

Agent-authored entries that are approved receive `approvedBy: <ceoUserId>` and `trustLevel: "verified"`.

---

## Approval mechanism (implemented — local)

The propose → approve | reject governance path lives in
`src/server/memory/memory-vault-repository.ts`:

| Function | Transition | Rules |
|----------|-----------|-------|
| `proposeMemoryVaultEntry` | new entry | `human` author → `verified`; `joris`/`agent` author → `proposed`. Never writes `verified` for non-human authors. |
| `approveMemoryVaultEntry` | `proposed` → `verified` | Stamps `approvedBy` + refreshes `updatedAt`. Workspace-scoped. Only a currently-`proposed` entry is eligible. |
| `rejectMemoryVaultEntry` | `proposed` → `draft` | Demotes out of the injection set but keeps the entry visible for revision. Workspace-scoped, proposed-only. |
| `listPendingProposals` | read | The CEO approval queue — `proposed` entries for one workspace, `updatedAt` DESC. Never injected into Joris. |

Invariants enforced:

- **Workspace isolation.** An entry can only be approved or rejected from within
  its own workspace; a cross-workspace id resolves to `not_found`.
- **Proposed-only.** Approving or rejecting a non-`proposed` entry returns
  `not_proposed` — there is no silent re-promotion of an already-`verified` entry.
- **Verified is the only injectable state.** Approval is the single path that
  makes an entry eligible for Joris context injection.

This path is **local and in-memory** (resets on server restart). A write/approval
UI and an HTTP API surface are not built yet; Supabase persistence stays locked.

---

## What is locked (not built yet)

| Capability | Status | Gate |
|------------|--------|------|
| Supabase persistence for vault entries | Locked | Explicit mandate + migration sign-off |
| Vector search / semantic recall | Locked | Not planned — keyword/tag only |
| Automatic ingestion from ledger or PRs | Locked | Never automatic — always human-proposed or agent-proposed + approved |
| Cross-workspace reads | Locked permanently | Architectural invariant |
| Joris writing directly to vault | Locked | Propose-only path only |
| Vault entries triggering actions | Locked | Memory is read-only context, never a trigger |

---

## Relationship to existing modules

| Module | Relationship |
|--------|-------------|
| Action Ledger | Ledger records events (what happened). Vault stores curated knowledge (what to remember). Separate concerns — do not merge. |
| `src/features/memory/types.ts` | Existing view-model types for the Memory Wiki UI (mock data). Vault types live server-side (`src/server/memory/`). These are complementary, not duplicates. |
| Mission Draft | A confirmed mission may eventually propose a `note` entry to the vault, pending CEO review. Not wired yet. |
| Joris brain (`brain.ts`) | Implemented: reads verified entries at invocation start (`readVerifiedVaultContext`, workspace-scoped, max 20) and injects them as a context note plus the verified-lessons rail (`composeVerifiedLessonsContext`). |

---

## Implementation sequence (when mandate given)

1. ✅ **This doc** — contract definition (no code).
2. ✅ **`src/server/memory/memory-vault-types.ts`** — pure TypeScript types (no imports, no DB).
3. ✅ **`src/server/memory/memory-vault-repository.ts`** — in-memory implementation (local fallback), mirroring existing ledger pattern. Includes the propose → approve | reject governance path (`approveMemoryVaultEntry`, `rejectMemoryVaultEntry`, `listPendingProposals`).
4. ✅ **Joris context injection** — `brain.ts` reads vault at invocation start (workspace-scoped, verified only).
5. ◻ **`/hq` panel** — read explorer is live (read-only). A write/approval UI and an HTTP API surface are **not built yet**.
6. ⬜ **Supabase migration** — locked. Only after the write surface is validated locally and an explicit migration mandate is given.

Each remaining step requires an explicit mandate before starting.
