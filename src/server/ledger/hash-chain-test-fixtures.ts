// src/server/ledger/hash-chain-test-fixtures.ts
//
// Pre-sealed chain arrays for reuse across hash-chain tests.
//
// All chains are built at module load with deterministic, in-memory sealing —
// no DB, no env, no randomness, no timestamps generated here.  Import what you
// need; the arrays are frozen so tests cannot accidentally mutate them.
//
// Three exports:
//   chain1  — 1 entry  (genesis only)
//   chain3  — 3 entries (genesis + 2)
//   chain5  — 5 entries (genesis + 4)
//
// All use TEST_HMAC_KEY; pass it to verifyChain({ hmacKey: TEST_HMAC_KEY })
// when exercising full verification.

import { appendSealedEntry } from "./hash-chain-sealer.ts";
import type { LedgerChainEntry } from "./hash-chain-verifier.ts";
import type { CanonicalLedgerFields } from "./hash-chain-canonicalizer.ts";

// ---------------------------------------------------------------------------
// Test key — never use in production.
// ---------------------------------------------------------------------------

/** Deterministic HMAC key used only in test fixtures. */
export const TEST_HMAC_KEY = "test-only-hmac-key-do-not-use-in-production";

// ---------------------------------------------------------------------------
// Raw entry definitions (canonical content fields only; chain fields omitted).
// ---------------------------------------------------------------------------

const RAW_ENTRIES: readonly CanonicalLedgerFields[] = [
  {
    id: "00000000-0000-0000-0000-000000000001",
    workspace_id: "ws-fixture-001",
    user_id: "user-fixture-001",
    agent_id: null,
    skill_id: null,
    mission_id: null,
    action_type: "fixture.genesis",
    event_type: null,
    summary: "Fixture genesis entry",
    autonomy_level: 0,
    requires_confirmation: false,
    payload: {},
    metadata: {},
    created_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "00000000-0000-0000-0000-000000000002",
    workspace_id: "ws-fixture-001",
    user_id: "user-fixture-001",
    agent_id: "agent-fixture-001",
    skill_id: null,
    mission_id: null,
    action_type: "fixture.step",
    event_type: "step.started",
    summary: "Fixture chain step 2",
    autonomy_level: 1,
    requires_confirmation: false,
    payload: { step: 2 },
    metadata: { source: "fixture" },
    created_at: "2026-01-01T00:01:00.000Z",
  },
  {
    id: "00000000-0000-0000-0000-000000000003",
    workspace_id: "ws-fixture-001",
    user_id: "user-fixture-001",
    agent_id: "agent-fixture-001",
    skill_id: "skill-fixture-001",
    mission_id: null,
    action_type: "fixture.step",
    event_type: "step.completed",
    summary: "Fixture chain step 3",
    autonomy_level: 1,
    requires_confirmation: true,
    payload: { step: 3, result: "ok" },
    metadata: { source: "fixture" },
    created_at: "2026-01-01T00:02:00.000Z",
  },
  {
    id: "00000000-0000-0000-0000-000000000004",
    workspace_id: "ws-fixture-001",
    user_id: "user-fixture-002",
    agent_id: "agent-fixture-001",
    skill_id: "skill-fixture-001",
    mission_id: "mission-fixture-001",
    action_type: "fixture.approval",
    event_type: "approval.granted",
    summary: "Fixture chain approval step 4",
    autonomy_level: 2,
    requires_confirmation: true,
    payload: { approved_by: "user-fixture-002" },
    metadata: { source: "fixture", tags: ["approval"] },
    created_at: "2026-01-01T00:03:00.000Z",
  },
  {
    id: "00000000-0000-0000-0000-000000000005",
    workspace_id: "ws-fixture-001",
    user_id: "user-fixture-001",
    agent_id: null,
    skill_id: null,
    mission_id: "mission-fixture-001",
    action_type: "fixture.complete",
    event_type: "mission.closed",
    summary: "Fixture chain final entry 5",
    autonomy_level: 0,
    requires_confirmation: false,
    payload: { outcome: "success" },
    metadata: { source: "fixture" },
    created_at: "2026-01-01T00:04:00.000Z",
  },
] as const;

// ---------------------------------------------------------------------------
// Chain builder — append each raw entry in order, fully sealed.
// ---------------------------------------------------------------------------

const SEAL_OPTIONS = { hmacKey: TEST_HMAC_KEY } as const;

function buildChain(length: number): readonly LedgerChainEntry[] {
  if (length < 1 || length > RAW_ENTRIES.length) {
    throw new Error(
      `buildChain: length must be 1..${RAW_ENTRIES.length}, got ${length}`,
    );
  }
  let chain: LedgerChainEntry[] = [];
  for (let i = 0; i < length; i++) {
    chain = appendSealedEntry(chain, RAW_ENTRIES[i]!, SEAL_OPTIONS);
  }
  return Object.freeze(chain);
}

// ---------------------------------------------------------------------------
// Exported pre-sealed chains — computed once at module load.
// ---------------------------------------------------------------------------

/** Single-entry chain (genesis only). */
export const chain1: readonly LedgerChainEntry[] = buildChain(1);

/** Three-entry chain (genesis + 2 steps). */
export const chain3: readonly LedgerChainEntry[] = buildChain(3);

/** Five-entry chain (genesis + 4 steps). Full fixture set. */
export const chain5: readonly LedgerChainEntry[] = buildChain(5);
