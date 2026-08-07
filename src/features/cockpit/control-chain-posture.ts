// src/features/cockpit/control-chain-posture.ts
//
// The governance posture shown by the cockpit's control chain.
//
// Two lanes reach execution, and they do not carry the same guarantees:
//
//   approval_rail — Approval Packet → Approval Event → Ledger Entry → Runtime.
//                   Every stage is traversed; the runtime step waits for an
//                   explicit CEO approval.
//   green_lane    — Sentinelle → Ledger Entry → Runtime. No approval packet,
//                   no approval event. An owner-authenticated request the
//                   Sentinelle zones green executes directly.
//
// Rendering only the approval rail states that nothing executes without every
// gate, which the green lane contradicts. Both lanes are declared here so the
// screen can show which capabilities travel which path.
//
// Stage states are evidence-bearing: each carries a file and a marker that must
// be present for the claim to hold, checked by control-chain-posture.test.mjs.
// The runtime stage of each lane is DERIVED from the capability inventory
// rather than written, so it cannot claim a posture the executors contradict.

import {
  deriveRuntimePosture,
  isApprovalRailGate,
  RUNTIME_CAPABILITIES,
  type RuntimeCapability,
} from "@/core/runtime-capability-inventory";

export type StageState = "ready" | "future" | "locked" | "gated" | "bounded";

export type StageEvidence = {
  /** Repo-relative file that proves the claim. */
  path: string;
  /** Substring that must appear in that file. */
  mustContain: string;
  /** Why this proves the state — read by a human reviewing a failure. */
  because: string;
};

export type ControlChainStage = {
  key: string;
  label: string;
  state: StageState;
  detail: string;
  meta: string;
  evidence: StageEvidence;
};

/** The ledger stage of the approval rail. */
export const LEDGER_STAGE_KEY = "ledger";
/** The runtime stage of each lane — the derived one. */
export const RUNTIME_STAGE_KEY = "runtime";

const INVENTORY_EVIDENCE: StageEvidence = {
  path: "src/core/runtime-capability-inventory.ts",
  mustContain: "export const RUNTIME_CAPABILITIES",
  because:
    "The stage is derived from the central inventory of executors. Its accuracy depends on the inventory staying complete, which the inventory test enforces against the real executor registries and route surfaces.",
};

function capabilitiesOnApprovalRail(): RuntimeCapability[] {
  return RUNTIME_CAPABILITIES.filter((capability) => isApprovalRailGate(capability.gate));
}

function capabilitiesOnGreenLane(): RuntimeCapability[] {
  return RUNTIME_CAPABILITIES.filter((capability) => !isApprovalRailGate(capability.gate));
}

/** Runtime stage for a lane, derived from the capabilities that travel it. */
function buildRuntimeStage(capabilities: readonly RuntimeCapability[]): ControlChainStage {
  const posture = deriveRuntimePosture(capabilities);
  return {
    key: RUNTIME_STAGE_KEY,
    label: "Runtime Execution",
    state: posture.state,
    detail: posture.detail,
    meta: posture.meta,
    evidence: INVENTORY_EVIDENCE,
  };
}

/**
 * Approval Packet → Approval Event → Ledger Entry → Runtime Execution.
 *
 * The order is the guarantee FOR THIS LANE only. Capabilities on the green lane
 * never enter it.
 */
export const CONTROL_CHAIN_STAGES: ControlChainStage[] = [
  {
    key: "packet",
    label: "Approval Packet",
    state: "ready",
    detail: "Prépare une décision humaine. N'approuve rien, n'exécute rien.",
    meta: "En place",
    evidence: {
      path: "src/server/actions/ledger-events.ts",
      mustContain: "requiresConfirmation",
      because: "A packet is what carries the confirmation requirement to the owner.",
    },
  },
  {
    key: "event",
    label: "Approval Event",
    state: "ready",
    detail: "Décision humaine explicite. Même approuvée, elle n'autorise pas l'exécution.",
    meta: "En place",
    evidence: {
      path: "src/server/actions/action-ledger-repository.ts",
      mustContain: "action_ledger",
      because: "An approval is only real once it is recorded against the ledger table.",
    },
  },
  {
    key: LEDGER_STAGE_KEY,
    label: "Ledger Entry",
    state: "ready",
    detail:
      "Enregistrement auditable de ce qui a été décidé. Pré-condition obligatoire avant toute exécution.",
    meta: "Actif",
    evidence: {
      path: "src/server/actions/action-ledger-repository.ts",
      mustContain: '.from("action_ledger")',
      because:
        "The repository inserts into the live table. This stage is 'actif' only while a writer exists — the test looks for the insert, not the mention.",
    },
  },
  buildRuntimeStage(capabilitiesOnApprovalRail()),
];

/**
 * Sentinelle → Ledger Entry → Runtime Execution.
 *
 * The path taken by everything the approval rail does not cover. It has real
 * guardrails — a policy verdict and a ledger record — and it has no approval
 * packet and no approval event.
 */
export const GREEN_LANE_STAGES: ControlChainStage[] = [
  {
    key: "sentinelle",
    label: "Sentinelle",
    state: "ready",
    detail:
      "Verdict de politique avant tout effet. ALLOW autorise l'exécution directe : aucun paquet d'approbation n'est produit.",
    meta: "En place",
    evidence: {
      path: "src/server/runtime/execution-guard.ts",
      mustContain: "export function evaluateLiveExecution",
      because:
        "The guard is the only gate on this lane. An ALLOW here reaches the executor with no further human step.",
    },
  },
  {
    key: LEDGER_STAGE_KEY,
    label: "Ledger Entry",
    state: "ready",
    detail: "L'action est journalisée avant et après l'exécution. Traçable, non approuvée.",
    meta: "Actif",
    evidence: {
      path: "src/server/runtime/green-lane-execution-service.ts",
      mustContain: "recordPendingDispatch",
      because:
        "The green-lane service records the attempt before dispatching, which is what makes this lane auditable despite having no approval.",
    },
  },
  buildRuntimeStage(capabilitiesOnGreenLane()),
];

export type ControlLane = {
  key: "approval_rail" | "green_lane";
  label: string;
  /** What this lane actually guarantees, stated without overreach. */
  headline: string;
  stages: ControlChainStage[];
  /** Ids of the capabilities that travel this lane. */
  capabilityIds: string[];
};

/** Both lanes, in order of decreasing guarantee. */
export const CONTROL_LANES: ControlLane[] = [
  {
    key: "approval_rail",
    label: "Voie approuvée",
    headline: "Rien ne s'exécute sans franchir chaque garde-fou",
    stages: CONTROL_CHAIN_STAGES,
    capabilityIds: capabilitiesOnApprovalRail().map((capability) => capability.id),
  },
  {
    key: "green_lane",
    label: "Voie verte",
    headline: "Exécution directe après verdict — sans paquet d'approbation",
    stages: GREEN_LANE_STAGES,
    capabilityIds: capabilitiesOnGreenLane().map((capability) => capability.id),
  },
];
