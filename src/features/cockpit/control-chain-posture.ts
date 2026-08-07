// src/features/cockpit/control-chain-posture.ts
//
// The governance posture shown by the cockpit's control chain.
//
// A cockpit that misreports its own guardrails is worse than one showing
// nothing, so no stage may assert a state on its own authority: each carries
// the evidence justifying it — a file and a marker that must be present for
// the claim to hold. `control-chain-posture.test.mjs` reads the repository and
// fails when a claim outlives its proof.
//
// The posture is still edited by hand. It simply cannot drift from the code in
// silence, which is what happens when these values live inline in the
// component that renders them.
//
// One exception, and it is deliberate: the runtime stage is DERIVED, not
// written. It used to read "verrouillé" on the strength of a single marker in
// shadow-pass.ts — a claim about one agent, standing in for the whole runtime.
// It stayed true while an unrelated executor that calls a model API shipped and
// became reachable. The stage now comes from the central capability inventory,
// which knows every executor and the gate in front of each.
//
// The other three stages are pure data. No I/O anywhere — the component renders
// this, the test verifies it.

import {
  deriveRuntimePosture,
  RUNTIME_CAPABILITIES,
} from "@/core/runtime-capability-inventory";

// "gated" and "bounded" exist because the runtime stage is derived: they are
// the posture states the inventory can produce, carried through unchanged
// rather than flattened into "locked", which is what made the old claim wrong.
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

/** The ledger stage, whose staleness is the reason this module exists. */
export const LEDGER_STAGE_KEY = "ledger";

/** The runtime stage, the one derived from the capability inventory. */
export const RUNTIME_STAGE_KEY = "runtime";

/**
 * The runtime stage, derived from the capability inventory rather than written.
 *
 * Its evidence deliberately points at the inventory itself: the proof that the
 * claim is current is that the inventory is complete, and completeness is what
 * runtime-capability-inventory.test.mjs enforces against the real executor
 * registries.
 */
function buildRuntimeStage(): ControlChainStage {
  const posture = deriveRuntimePosture(RUNTIME_CAPABILITIES);

  return {
    key: RUNTIME_STAGE_KEY,
    label: "Runtime Execution",
    state: posture.state,
    detail: `Exécution bornée et réversible. ${posture.detail}`,
    meta: posture.meta,
    evidence: {
      path: "src/core/runtime-capability-inventory.ts",
      mustContain: "export const RUNTIME_CAPABILITIES",
      because:
        "The stage is derived from the central inventory of executors, not from any single agent's self-description. Its accuracy depends on the inventory staying complete, which the inventory test enforces against the real executor registries.",
    },
  };
}

/**
 * Approval Packet → Approval Event → Ledger Entry → Runtime Execution.
 *
 * The order is the guarantee: nothing executes without traversing all four.
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
    key: "ledger",
    label: "Ledger Entry",
    state: "ready",
    detail:
      "Enregistrement auditable de ce qui a été décidé. Pré-condition obligatoire avant toute exécution.",
    meta: "Actif",
    evidence: {
      path: "src/server/actions/action-ledger-repository.ts",
      mustContain: '.from("action_ledger")',
      because:
        "The repository inserts into the live table. This stage is 'actif' only for as long as a writer exists — the test looks for the insert, not the mention.",
    },
  },
  buildRuntimeStage(),
];
