// src/features/cockpit/control-chain-posture.ts
//
// The governance posture shown by the cockpit's control chain.
//
// Three lanes reach execution, and they do not carry the same guarantees:
//
//   approval_rail — Approval Packet → Approval Event → Ledger Entry → Runtime.
//                   Every stage is traversed; the runtime step waits for an
//                   explicit CEO approval.
//   green_lane    — Sentinelle → Ledger Entry → Runtime. A policy verdict and a
//                   ledger record, no approval packet and no approval event.
//   direct_path   — the executor's own gate → Runtime. Never reaches the
//                   Sentinelle at all.
//
// Lane membership is declared per gate rather than derived by negation. A
// binary "approval rail or everything else" split puts the public contact form
// and the scheduled shadow pass behind a Sentinelle stage they never traverse,
// which is the same class of overstatement the lanes exist to remove: only the
// three agent routes call evaluateLiveExecution.
//
// Stage states are evidence-bearing: each carries a file and a marker that must
// be present for the claim to hold, checked by control-chain-posture.test.mjs.
// The runtime stage of each lane is DERIVED from the capability inventory
// rather than written, so it cannot claim a posture the executors contradict.

import {
  deriveRuntimePosture,
  RUNTIME_CAPABILITIES,
  type RuntimeCapability,
  type RuntimeGate,
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

export type ControlLaneKey = "approval_rail" | "green_lane" | "direct_path";

/**
 * Which lane each gate travels. Declared exhaustively: a new gate is a
 * compile error here rather than silently joining a lane by negation.
 *
 * Only sentinelle_green_lane reaches evaluateLiveExecution — it is the gate of
 * the agent execute route. Every other non-approval gate goes straight to its
 * executor.
 */
export const LANE_BY_GATE: Record<RuntimeGate, ControlLaneKey> = {
  ceo_approval: "approval_rail",
  sentinelle_green_lane: "green_lane",
  owner_confirmed: "direct_path",
  owner_session: "direct_path",
  scheduled_pass: "direct_path",
  public_unauthenticated: "direct_path",
};

function capabilitiesOn(lane: ControlLaneKey): RuntimeCapability[] {
  return RUNTIME_CAPABILITIES.filter((capability) => LANE_BY_GATE[capability.gate] === lane);
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
  buildRuntimeStage(capabilitiesOn("approval_rail")),
];

/**
 * Sentinelle → Ledger Entry → Runtime Execution.
 *
 * The path taken by an agent skill the guard zones green. Real guardrails — a
 * policy verdict and a ledger record — and no approval packet, no approval
 * event.
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
  buildRuntimeStage(capabilitiesOn("green_lane")),
];

/**
 * The executor's own gate → Runtime Execution.
 *
 * No Sentinelle verdict and no approval packet. What stands in front differs per
 * capability — an owner session, a confirmation token, a schedule, or nothing at
 * all — so the stage names the gate rather than claiming a shared one.
 */
export const DIRECT_PATH_STAGES: ControlChainStage[] = [
  {
    key: "own_gate",
    label: "Garde propre",
    state: "ready",
    detail:
      "Chaque exécuteur porte sa propre condition d'entrée : session propriétaire, jeton de confirmation, planification, ou aucune. Voir la liste ci-dessous.",
    meta: "Par exécuteur",
    evidence: {
      path: "src/core/runtime-capability-inventory.ts",
      mustContain: "export const RUNTIME_GATES",
      because:
        "Each capability declares the gate in front of it. This lane has no shared guard, so the inventory is the only accurate statement of what stops each one.",
    },
  },
  buildRuntimeStage(capabilitiesOn("direct_path")),
];

export type ControlLane = {
  key: ControlLaneKey;
  label: string;
  /** What this lane actually guarantees, stated without overreach. */
  headline: string;
  stages: ControlChainStage[];
  /** Ids of the capabilities that travel this lane. */
  capabilityIds: string[];
};

/** Every lane, in order of decreasing guarantee. */
export const CONTROL_LANES: ControlLane[] = [
  {
    key: "approval_rail",
    label: "Voie approuvée",
    headline: "Rien ne s'exécute sans franchir chaque garde-fou",
    stages: CONTROL_CHAIN_STAGES,
    capabilityIds: capabilitiesOn("approval_rail").map((capability) => capability.id),
  },
  {
    key: "green_lane",
    label: "Voie verte",
    headline: "Verdict de la Sentinelle puis exécution — sans paquet d'approbation",
    stages: GREEN_LANE_STAGES,
    capabilityIds: capabilitiesOn("green_lane").map((capability) => capability.id),
  },
  {
    key: "direct_path",
    label: "Voies directes",
    headline: "Ni Sentinelle ni approbation — la garde propre à chaque exécuteur",
    stages: DIRECT_PATH_STAGES,
    capabilityIds: capabilitiesOn("direct_path").map((capability) => capability.id),
  },
];
