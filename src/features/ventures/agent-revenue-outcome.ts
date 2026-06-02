// src/features/ventures/agent-revenue-outcome.ts
//
// Pure TypeScript model for the structured, cash-oriented outcome an agent
// produces for a single venture task. This is the foundation for downstream
// cash scoring and executive selection — it carries evidence, not motivation.
//
// Dependency-free — no Supabase, no database, no network, no UI components,
// no scoring, no auto-approval, no execution authorization, no persistence.
//
// Design intent: prevent agents from submitting vague work. Every cash signal
// must carry a basis, and strong claims must carry evidence. cashGenerated is
// never invented — a positive amount requires supporting evidence and a
// payment signal to back it. Scoring of these fields belongs to a later stage.
//
// Humans remain on the loop at every step: every outcome has humanOnTheLoop,
// approvalRequired, and noExecutionAuthorized locked to literal true.

// ---------------------------------------------------------------------------
// SECTION A — Enum types
// ---------------------------------------------------------------------------

// The six dimensions the cash score engine will weigh. Kept as a named union
// so downstream code can iterate dimensions without re-deriving the list.
export type AgentRevenueOutcomeSignalKey =
  | "customerProof"
  | "paymentSignal"
  | "painClarity"
  | "buyerIdentifiability"
  | "offerTestability"
  | "cashProximity";

// The proposed next cash action a downstream selection engine may act on.
// This is a proposal only — never an execution. The free-form actionLabel is
// intentionally not constrained to an enum here so the model stays additive;
// a later stage may map proposals onto a canonical action set.
export type AgentRevenueOutcomeProposedAction = {
  actionLabel: string;
  rationale: string;
};

// ---------------------------------------------------------------------------
// SECTION B — Sub-model types
// ---------------------------------------------------------------------------

// A single cash dimension. The score is the agent's claimed strength; basis is
// the required justification; evidence backs the claim. A bare number without a
// basis is not acceptable input — that is the anti-fluff contract.
export type AgentRevenueOutcomeSignal = {
  score: number; // 0-100, integer
  basis: string;
  evidence: string[];
};

// Realized cash. Never invented. amountCents must be backed by evidence when
// positive, and verified states whether a human or system has confirmed it.
export type AgentRevenueOutcomeCashGenerated = {
  amountCents: number;
  verified: boolean;
  evidence: string[];
};

// ---------------------------------------------------------------------------
// SECTION C — Main outcome type
// ---------------------------------------------------------------------------

export type AgentRevenueOutcome = {
  outcomeId: string;
  agentId: string;
  ventureId: string;
  taskId: string;

  // The six cash dimensions.
  customerProof: AgentRevenueOutcomeSignal;
  paymentSignal: AgentRevenueOutcomeSignal;
  painClarity: AgentRevenueOutcomeSignal;
  buyerIdentifiability: AgentRevenueOutcomeSignal;
  offerTestability: AgentRevenueOutcomeSignal;
  cashProximity: AgentRevenueOutcomeSignal;

  // Realized cash and the narrative that ties the evidence together.
  cashGenerated: AgentRevenueOutcomeCashGenerated;
  evidenceSummary: string;

  // Proposal only — handed to a later selection/action stage, never executed.
  nextCashAction: AgentRevenueOutcomeProposedAction;

  createdAt: string;
  humanOnTheLoop: true;
  approvalRequired: true;
  noExecutionAuthorized: true;
};

// ---------------------------------------------------------------------------
// SECTION D — Result types
// ---------------------------------------------------------------------------

export type AgentRevenueOutcomeValidation = {
  valid: boolean;
  errors: string[];
};

// ---------------------------------------------------------------------------
// SECTION E — Constants
// ---------------------------------------------------------------------------

export const AGENT_REVENUE_OUTCOME_SIGNAL_KEYS: readonly AgentRevenueOutcomeSignalKey[] = [
  "customerProof",
  "paymentSignal",
  "painClarity",
  "buyerIdentifiability",
  "offerTestability",
  "cashProximity",
];

// At or above this score, a signal must carry at least one piece of evidence.
// Below it, a basis alone is acceptable (early, low-confidence claims).
export const AGENT_REVENUE_OUTCOME_EVIDENCE_REQUIRED_SCORE = 60;

// ---------------------------------------------------------------------------
// SECTION F — validateAgentRevenueOutcome
// ---------------------------------------------------------------------------

function validateSignal(
  key: AgentRevenueOutcomeSignalKey,
  signal: AgentRevenueOutcomeSignal,
  errors: string[],
): void {
  if (
    !Number.isInteger(signal.score) ||
    signal.score < 0 ||
    signal.score > 100
  ) {
    errors.push(`${key}.score must be an integer in [0, 100]`);
  }
  if (typeof signal.basis !== "string" || signal.basis.trim() === "") {
    errors.push(`${key}.basis must be non-empty`);
  }
  if (!Array.isArray(signal.evidence)) {
    errors.push(`${key}.evidence must be an array`);
  } else if (
    Number.isInteger(signal.score) &&
    signal.score >= AGENT_REVENUE_OUTCOME_EVIDENCE_REQUIRED_SCORE &&
    signal.evidence.length === 0
  ) {
    errors.push(
      `${key}.evidence must contain at least one item when score >= ${AGENT_REVENUE_OUTCOME_EVIDENCE_REQUIRED_SCORE}`,
    );
  }
}

export function validateAgentRevenueOutcome(
  outcome: AgentRevenueOutcome,
): AgentRevenueOutcomeValidation {
  const errors: string[] = [];

  // Required identity fields.
  if (!outcome.outcomeId) errors.push("outcomeId must be non-empty");
  if (!outcome.agentId) errors.push("agentId must be non-empty");
  if (!outcome.ventureId) errors.push("ventureId must be non-empty");
  if (!outcome.taskId) errors.push("taskId must be non-empty");

  // Cash dimensions.
  for (const key of AGENT_REVENUE_OUTCOME_SIGNAL_KEYS) {
    validateSignal(key, outcome[key], errors);
  }

  // Realized cash — never invented.
  const cash = outcome.cashGenerated;
  if (typeof cash.amountCents !== "number" || cash.amountCents < 0) {
    errors.push("cashGenerated.amountCents must be >= 0");
  }
  if (typeof cash.verified !== "boolean") {
    errors.push("cashGenerated.verified must be a boolean");
  }
  if (!Array.isArray(cash.evidence)) {
    errors.push("cashGenerated.evidence must be an array");
  } else if (
    typeof cash.amountCents === "number" &&
    cash.amountCents > 0 &&
    cash.evidence.length === 0
  ) {
    errors.push("cashGenerated.evidence must be non-empty when amountCents > 0");
  }

  // Coherence: cash cannot be generated with no payment signal at all.
  if (
    typeof cash.amountCents === "number" &&
    cash.amountCents > 0 &&
    Number.isInteger(outcome.paymentSignal.score) &&
    outcome.paymentSignal.score === 0
  ) {
    errors.push(
      "cashGenerated.amountCents > 0 requires a non-zero paymentSignal.score",
    );
  }

  // Narrative and proposal.
  if (!outcome.evidenceSummary || outcome.evidenceSummary.trim() === "") {
    errors.push("evidenceSummary must be non-empty");
  }
  if (
    !outcome.nextCashAction.actionLabel ||
    outcome.nextCashAction.actionLabel.trim() === ""
  ) {
    errors.push("nextCashAction.actionLabel must be non-empty");
  }
  if (
    !outcome.nextCashAction.rationale ||
    outcome.nextCashAction.rationale.trim() === ""
  ) {
    errors.push("nextCashAction.rationale must be non-empty");
  }

  // createdAt — valid ISO string.
  if (!outcome.createdAt || isNaN(+new Date(outcome.createdAt))) {
    errors.push("createdAt must be a valid ISO date string");
  }

  // Governance locks.
  if (outcome.humanOnTheLoop !== true) errors.push("humanOnTheLoop must be true");
  if (outcome.approvalRequired !== true) errors.push("approvalRequired must be true");
  if (outcome.noExecutionAuthorized !== true) {
    errors.push("noExecutionAuthorized must be true");
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// SECTION G — buildAgentRevenueOutcome
// ---------------------------------------------------------------------------

export type BuildAgentRevenueOutcomeInput = Omit<
  AgentRevenueOutcome,
  "humanOnTheLoop" | "approvalRequired" | "noExecutionAuthorized"
>;

function copySignal(signal: AgentRevenueOutcomeSignal): AgentRevenueOutcomeSignal {
  return {
    score: signal.score,
    basis: signal.basis,
    evidence: [...signal.evidence],
  };
}

export function buildAgentRevenueOutcome(
  input: BuildAgentRevenueOutcomeInput,
): AgentRevenueOutcome {
  return {
    outcomeId: input.outcomeId,
    agentId: input.agentId,
    ventureId: input.ventureId,
    taskId: input.taskId,
    customerProof: copySignal(input.customerProof),
    paymentSignal: copySignal(input.paymentSignal),
    painClarity: copySignal(input.painClarity),
    buyerIdentifiability: copySignal(input.buyerIdentifiability),
    offerTestability: copySignal(input.offerTestability),
    cashProximity: copySignal(input.cashProximity),
    cashGenerated: {
      amountCents: input.cashGenerated.amountCents,
      verified: input.cashGenerated.verified,
      evidence: [...input.cashGenerated.evidence],
    },
    evidenceSummary: input.evidenceSummary,
    nextCashAction: {
      actionLabel: input.nextCashAction.actionLabel,
      rationale: input.nextCashAction.rationale,
    },
    createdAt: input.createdAt,
    humanOnTheLoop: true,
    approvalRequired: true,
    noExecutionAuthorized: true,
  };
}
