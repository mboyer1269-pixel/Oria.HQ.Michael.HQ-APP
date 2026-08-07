// src/features/cockpit/control-chain-posture.ts
//
// The governance posture shown by the cockpit's control chain.
//
// This file exists because the posture used to live as a hardcoded array inside
// the component, and it rotted: it still announced "Ledger Entry — à venir"
// months after the ledger had gone live and acquired a dozen writers. Nothing
// failed, because nothing was checking. A cockpit that misreports its own
// guardrails is worse than one that shows nothing.
//
// So every stage now carries the evidence that justifies its state — a file and
// a marker that must be present for the claim to hold. `control-chain-posture.test.mjs`
// reads this repository and fails when a claim outlives its proof. The posture
// can still be edited by hand; it just cannot silently drift from the code.
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
        "The repository writes to the live table — this stage was 'à venir' long after that stopped being true.",
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
