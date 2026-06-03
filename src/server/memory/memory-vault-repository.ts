import "server-only";

import type {
  MemoryVaultEntry,
  MemoryVaultProposeInput,
  MemoryVaultReadQuery,
  MemoryVaultReadResult,
} from "./memory-vault-types";

// ---------------------------------------------------------------------------
// LOCAL IN-MEMORY STORE
// ---------------------------------------------------------------------------
// This is the local persistence fallback for the Memory Vault.
// Supabase persistence is locked until an explicit migration mandate.
// See docs/MEMORY_VAULT_CONTRACT.md — "What is locked".
//
// The store is module-scoped. Entries persist across requests within a single
// server process but reset on restart. This mirrors the ledger and calendar
// local fallback pattern.
// ---------------------------------------------------------------------------

function createLocalId(): string {
  return `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const ISO_NOW = new Date().toISOString();

/**
 * Seed entries for the default workspace.
 * These are verified operational decisions and SOPs derived from AGENTS.md
 * and the current project state. They are injected into Joris context at
 * invocation start (verified entries only).
 */
const seedEntries: MemoryVaultEntry[] = [
  {
    id: "mem_seed_decision_001",
    workspaceId: "michael-hq",
    type: "decision",
    title: "Phase 1 locked — no start without explicit mandate",
    content:
      "Phase 1 (workspace-specific runtime adapters, permission execution, workspace configuration) must not start until Michael explicitly mandates it. No agent, PR, or refactor may initiate Phase 1 work autonomously.",
    tags: ["governance", "phase-1", "agents", "mandates"],
    author: "human",
    trustLevel: "verified",
    createdAt: "2026-05-20T00:00:00.000Z",
    updatedAt: ISO_NOW,
    sourceRef: "AGENTS.md#what-remains-to-build",
  },
  {
    id: "mem_seed_decision_002",
    workspaceId: "michael-hq",
    type: "decision",
    title: "Live execution is zone-restricted (Green/Yellow/Red)",
    content:
      "Agent live execution is gated by the Sentinelle Policy Engine. Green zone: autonomous execution allowed. Yellow zone: human confirmation required. Red zone: blocked. No execution escapes the zone model.",
    tags: ["runtime", "sentinelle", "execution-guard", "green-zone"],
    author: "human",
    trustLevel: "verified",
    createdAt: "2026-05-22T00:00:00.000Z",
    updatedAt: ISO_NOW,
    sourceRef: "src/server/runtime/execution-guard.ts",
  },
  {
    id: "mem_seed_decision_003",
    workspaceId: "michael-hq",
    type: "decision",
    title: "Local persistence fallback is allowed in dev, blocked in prod",
    content:
      "isLocalPersistenceFallbackAllowed() returns true only when NODE_ENV !== 'production'. Calendar, ledger, and memory vault all follow this pattern. In production, Supabase is required; failing silently is never acceptable.",
    tags: ["persistence", "supabase", "local-fallback", "production"],
    author: "human",
    trustLevel: "verified",
    createdAt: "2026-05-21T00:00:00.000Z",
    updatedAt: ISO_NOW,
    sourceRef: "src/lib/server-env.ts",
  },
  {
    id: "mem_seed_sop_001",
    workspaceId: "michael-hq",
    type: "sop",
    title: "Agent validation before PR: typecheck + lint + build + smoke:joris",
    content:
      "Before any PR is opened from an agent branch: (1) npm run typecheck — 0 errors. (2) npm run lint — 0 errors. (3) npm run build — passes. (4) npm run smoke:joris — PASS (18/18). All four checks must pass. Failing any check blocks the PR.",
    tags: ["pr", "validation", "typecheck", "lint", "smoke"],
    author: "human",
    trustLevel: "verified",
    createdAt: "2026-05-20T00:00:00.000Z",
    updatedAt: ISO_NOW,
    sourceRef: "AGENTS.md#validation-before-completion",
  },
  {
    id: "mem_seed_decision_004",
    workspaceId: "michael-hq",
    type: "decision",
    title: "Memory Vault: Joris reads only verified entries (max 20, workspace-scoped)",
    content:
      "Joris reads from the Memory Vault only at invocation start. Only 'verified' entries are injected. Max 20 entries, ordered by updatedAt DESC. Cross-workspace reads are permanently forbidden. Joris proposes (trustLevel: proposed) but cannot write directly.",
    tags: ["memory-vault", "joris", "context-injection", "trust-level"],
    author: "human",
    trustLevel: "verified",
    createdAt: "2026-06-03T00:00:00.000Z",
    updatedAt: ISO_NOW,
    sourceRef: "docs/MEMORY_VAULT_CONTRACT.md",
  },
];

/** Module-scoped store. Seeded with operational entries on first import. */
const localVaultEntries: MemoryVaultEntry[] = [...seedEntries];

// ---------------------------------------------------------------------------
// READ
// ---------------------------------------------------------------------------

/**
 * Reads Memory Vault entries for a given workspace.
 *
 * Invariants:
 *   - Cross-workspace reads are forbidden: entries are filtered strictly by workspaceId.
 *   - Default trustLevel filter: "verified" (Joris injection path).
 *   - Default limit: 20.
 *   - Results are ordered by updatedAt DESC.
 */
export function readMemoryVaultEntries(query: MemoryVaultReadQuery): MemoryVaultReadResult {
  const trustFilter = query.trustLevel ?? "verified";
  const limit = query.limit ?? 20;

  let results = localVaultEntries.filter((entry) => {
    if (entry.workspaceId !== query.workspaceId) return false;
    if (entry.trustLevel !== trustFilter) return false;
    if (query.types && query.types.length > 0 && !query.types.includes(entry.type)) return false;
    if (query.tags && query.tags.length > 0) {
      const hasTag = query.tags.some((tag) => entry.tags.includes(tag));
      if (!hasTag) return false;
    }
    return true;
  });

  // Sort by updatedAt DESC (most recent first).
  results = results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const truncated = results.length > limit;
  const entries = results.slice(0, limit);

  return {
    entries,
    workspaceId: query.workspaceId,
    retrievedAt: new Date().toISOString(),
    truncated,
  };
}

/**
 * Convenience: reads verified entries for Joris context injection.
 * Always workspace-scoped. Max 20 entries.
 */
export function readVerifiedVaultContext(workspaceId: string): MemoryVaultReadResult {
  return readMemoryVaultEntries({
    workspaceId,
    trustLevel: "verified",
    limit: 20,
  });
}

// ---------------------------------------------------------------------------
// PROPOSE (write path — agent or human propose, CEO approves)
// ---------------------------------------------------------------------------

/**
 * Proposes a new Memory Vault entry.
 *
 * - Human-authored entries are created with trustLevel "verified".
 * - Agent/Joris-authored entries are created with trustLevel "proposed"
 *   and require CEO approval before they become "verified".
 * - This function never writes "verified" for non-human authors.
 */
export function proposeMemoryVaultEntry(input: MemoryVaultProposeInput): MemoryVaultEntry {
  const now = new Date().toISOString();
  const trustLevel = input.author === "human" ? "verified" : "proposed";

  const entry: MemoryVaultEntry = {
    id: createLocalId(),
    workspaceId: input.workspaceId,
    type: input.type,
    title: input.title,
    content: input.content,
    tags: input.tags ?? [],
    author: input.author,
    trustLevel,
    createdAt: now,
    updatedAt: now,
    sourceRef: input.sourceRef,
    expiresAt: input.expiresAt,
  };

  localVaultEntries.push(entry);
  return entry;
}

// ---------------------------------------------------------------------------
// READ ALL (for UI / admin views — not for Joris injection)
// ---------------------------------------------------------------------------

/**
 * Lists all vault entries for a workspace, regardless of trust level.
 * For use by the /hq/memory UI only. Never used for Joris context injection.
 */
export function listAllVaultEntriesForWorkspace(workspaceId: string): MemoryVaultEntry[] {
  return localVaultEntries
    .filter((entry) => entry.workspaceId === workspaceId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Smoke / test helper — returns a snapshot of the in-memory store. */
export function getLocalVaultEntriesForSmoke(): readonly MemoryVaultEntry[] {
  return [...localVaultEntries];
}
