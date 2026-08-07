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
// Pure data. No imports, no I/O — the component renders it, the test verifies it.

export type StageState = "ready" | "future" | "locked";

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
  {
    key: "runtime",
    label: "Runtime Execution",
    state: "locked",
    detail:
      "Exécution bornée et réversible. Verrouillée : aucune action conséquente ne part sans approbation explicite du CEO.",
    meta: "Verrouillé",
    evidence: {
      path: "src/server/ventures/shadow-pass.ts",
      mustContain: "it executes nothing",
      because:
        "The most autonomous agent on the system proposes and records; it does not act. If that changes, this stage is no longer locked.",
    },
  },
];

/** The ledger stage, whose staleness is the reason this module exists. */
export const LEDGER_STAGE_KEY = "ledger";
