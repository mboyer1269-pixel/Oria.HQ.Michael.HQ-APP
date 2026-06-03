// src/server/ventures/hermes-prep-tick.ts
//
// Server-side orchestration of one Hermès prep tick. It does NOT own the
// decision logic — that lives in the pure planner (computeHermesPrepPlan). This
// wrapper only wires the side-effecting pieces around it:
//   1. read the existing prepared-action queue (for dedup),
//   2. for each input packet, compose the Council summary (pure TypeScript, no
//      LLM) and the Hermès outreach plan,
//   3. run the pure planner to decide what to enqueue (new / refresh / dedupe),
//   4. persist the enqueued entries.
//
// Hard boundaries: it never sends, contacts, scrapes, or executes. It does not
// generate packets with an LLM (packets are passed in) and it never auto-sends.
//
// Testability: every side-effecting dependency is injectable. With no overrides
// it uses the prepared-action repository (which has an in-memory dev fallback)
// and the venture council composer — so it runs in tests WITHOUT a real
// database and WITHOUT migration 0013 being applied in production.

import type { CashActionPacket } from "@/features/ventures/cash-action-packet";
import type { HermesOutreachPlan } from "@/features/ventures/hermes-outreach-plan";
import { buildHermesOutreachPlanFromCashActionPacket } from "@/features/ventures/hermes-outreach-plan";
import type {
  HermesPrepCandidate,
  HermesPrepPlanResult,
} from "@/features/ventures/hermes-prep-plan";
import { computeHermesPrepPlan } from "@/features/ventures/hermes-prep-plan";
import type {
  PreparedAction,
  PreparedActionCouncilSummary,
} from "@/features/ventures/prepared-action";
import { composeVentureCouncilCashRun } from "@/features/ventures/venture-council-cash-run-composer";
import {
  createPreparedAction,
  listPreparedActionsForWorkspace,
} from "./prepared-action-repository";
import { snapshotWorkspaceAgentScores } from "./snapshot-workspace-agent-scores";

// ---------------------------------------------------------------------------
// Dependencies (injectable for tests)
// ---------------------------------------------------------------------------

export type HermesPrepTickDeps = {
  /** Compose a compact Council summary for a packet. Default: venture council composer. */
  composeCouncil: (packet: CashActionPacket, createdAt: string) => PreparedActionCouncilSummary;
  /** Compose the Hermès outreach plan for a packet. Default: pure builder. */
  buildPlan: (packet: CashActionPacket) => HermesOutreachPlan;
  /** Read the existing prepared-action queue for a workspace. Default: repository. */
  listExisting: (workspaceId: string) => Promise<PreparedAction[]>;
  /** Persist one prepared action. Default: repository. */
  enqueue: (workspaceId: string, userId: string, action: PreparedAction) => Promise<PreparedAction>;
  /**
   * Refresh agent score snapshots from captured proof after enqueueing. Returns
   * the number of snapshots written. BEST-EFFORT — a failure never breaks the
   * prep tick. Default: score every agent with captured signals and persist a
   * snapshot per agent (no-op when there is no captured proof yet).
   */
  snapshotScores: (workspaceId: string, userId: string) => Promise<number>;
  /** Clock. Default: real ISO now. */
  now: () => string;
};

async function defaultSnapshotScores(workspaceId: string, userId: string): Promise<number> {
  const result = await snapshotWorkspaceAgentScores({ workspaceId, userId });
  return result.snapshots.length;
}

function defaultComposeCouncil(
  packet: CashActionPacket,
  createdAt: string,
): PreparedActionCouncilSummary {
  const result = composeVentureCouncilCashRun({
    runId: `prep:${packet.packetId}`,
    cashActionPacket: packet,
    createdAt,
  });
  return {
    readiness: result.readiness,
    verdictDecision: result.verdict.decision,
    recommendedManualAction: result.recommendedManualAction,
  };
}

function resolveDeps(overrides?: Partial<HermesPrepTickDeps>): HermesPrepTickDeps {
  return {
    composeCouncil: overrides?.composeCouncil ?? defaultComposeCouncil,
    buildPlan: overrides?.buildPlan ?? ((packet) => buildHermesOutreachPlanFromCashActionPacket(packet)),
    listExisting: overrides?.listExisting ?? listPreparedActionsForWorkspace,
    enqueue: overrides?.enqueue ?? createPreparedAction,
    snapshotScores: overrides?.snapshotScores ?? defaultSnapshotScores,
    now: overrides?.now ?? (() => new Date().toISOString()),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type HermesPrepTickInput = {
  workspaceId: string;
  userId: string;
  packets: readonly CashActionPacket[];
};

export type HermesPrepTickResult = {
  plan: HermesPrepPlanResult;
  /** The prepared actions actually persisted, highest priority first. */
  enqueued: PreparedAction[];
  createdAt: string;
  /** Agent score snapshots written this tick (best-effort; 0 if none/failed). */
  snapshotsWritten: number;
};

/**
 * Runs one prep tick: compose candidates, plan (dedup + prioritize), and
 * persist. Returns the plan summary and the persisted actions. Never sends or
 * executes anything.
 */
export async function runHermesPrepTick(
  input: HermesPrepTickInput,
  overrides?: Partial<HermesPrepTickDeps>,
): Promise<HermesPrepTickResult> {
  const deps = resolveDeps(overrides);
  const createdAt = deps.now();

  const existing = await deps.listExisting(input.workspaceId);

  const candidates: HermesPrepCandidate[] = input.packets.map((packet) => ({
    packet,
    council: deps.composeCouncil(packet, createdAt),
    hermesPlan: deps.buildPlan(packet),
  }));

  const plan = computeHermesPrepPlan({ candidates, existing, createdAt });

  const enqueued: PreparedAction[] = [];
  for (const entry of plan.toEnqueue) {
    enqueued.push(await deps.enqueue(input.workspaceId, input.userId, entry.action));
  }

  // Best-effort: refresh the agent performance curve from captured proof. This
  // must never break preparation, so a failure is swallowed and reported as 0.
  let snapshotsWritten = 0;
  try {
    snapshotsWritten = await deps.snapshotScores(input.workspaceId, input.userId);
  } catch {
    snapshotsWritten = 0;
  }

  return { plan, enqueued, createdAt, snapshotsWritten };
}
