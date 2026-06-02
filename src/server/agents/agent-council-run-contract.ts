// src/server/agents/agent-council-run-contract.ts

/**
 * Pure local contract for Agent Council Runs — durable, auditable multi-agent
 * evaluation sessions without runtime dispatch, Temporal, or external execution.
 *
 * A council run is proposal-only: Joris orchestrates specialist roles that
 * debate cash-oriented moves, evidence, and risk. The verdict may inform a
 * Next Action Mandate or Money Strategy routing pass, but never authorizes
 * live execution.
 */

import type { BuildNextActionMandateInput } from "./next-action-mandate-contract";
import {
  NextActionMandateStatus,
  NextActionMandateType,
} from "./next-action-mandate-contract";
import type { RouteMoneyStrategyInput } from "./money-strategy-routing-graph-contract";
import {
  MoneyStrategyEvidenceQuality,
  MoneyStrategyState,
} from "./money-strategy-routing-graph-contract";

// ---------------------------------------------------------------------------
// Enumerations & supporting types
// ---------------------------------------------------------------------------

export const AGENT_COUNCIL_ORCHESTRATOR_ID = "joris" as const;

export type AgentCouncilSourceType =
  | "raw_idea"
  | "cash_action_packet"
  | "venture_workbench_item"
  | "next_action_mandate";

export type AgentCouncilRunStatus =
  | "draft"
  | "running"
  | "waiting_for_agent"
  | "ready_for_ceo"
  | "blocked"
  | "completed"
  | "failed";

export type AgentCouncilRoleId =
  | "joris_orchestrator"
  | "t_gravity"
  | "hermes"
  | "orient"
  | "builder"
  | "scribe"
  | "closer"
  | "auditor"
  | "operator";

export type AgentCouncilTurnStatus = "pending" | "completed" | "failed" | "skipped";

export type AgentCouncilTurnRecommendation =
  | "proceed"
  | "refine"
  | "pause"
  | "kill_candidate"
  | "veto"
  | "needs_ceo_decision"
  | "support"
  | "abstain";

export type AgentCouncilVerdictDecision =
  | "proceed"
  | "refine"
  | "pause"
  | "kill_candidate"
  | "needs_ceo_decision";

export type AgentCouncilValidationSeverity = "error" | "warning";

export interface AgentCouncilEvidenceRef {
  kind: string;
  referenceId: string;
  summary: string;
  isVerified?: boolean;
}

export interface AgentCouncilRetryPolicy {
  maxRetriesPerRole: number;
  retryFailedTurns: boolean;
}

export interface AgentCouncilIssue {
  code: string;
  message: string;
  path?: string;
  severity: AgentCouncilValidationSeverity;
}

export interface AgentCouncilValidation {
  valid: boolean;
  issues: AgentCouncilIssue[];
}

// ---------------------------------------------------------------------------
// Role catalog
// ---------------------------------------------------------------------------

export interface AgentCouncilRole {
  roleId: AgentCouncilRoleId;
  mission: string;
  allowedOutputs: string[];
  forbiddenActions: string[];
  canVeto: boolean;
  noExecutionAuthorized: true;
}

export const AGENT_COUNCIL_ROLE_IDS: readonly AgentCouncilRoleId[] = [
  "joris_orchestrator",
  "t_gravity",
  "hermes",
  "orient",
  "builder",
  "scribe",
  "closer",
  "auditor",
  "operator",
] as const;

export const AGENT_COUNCIL_ROLES: Readonly<Record<AgentCouncilRoleId, AgentCouncilRole>> = {
  joris_orchestrator: {
    roleId: "joris_orchestrator",
    mission:
      "Orchestrate the council session, frame the objective, and synthesize role inputs into a CEO-ready verdict without dispatching runtime work.",
    allowedOutputs: [
      "session_framing",
      "role_sequencing",
      "verdict_synthesis",
      "counter_proposal_summary",
    ],
    forbiddenActions: [
      "runtime_dispatch",
      "external_execution",
      "auto_approve_live_actions",
    ],
    canVeto: false,
    noExecutionAuthorized: true,
  },
  t_gravity: {
    roleId: "t_gravity",
    mission:
      "Prioritize ROI, evidence quality, speed-to-cash, and risk. Recommend proceed, refine, pause, or kill_candidate based on economic gravity — never execution.",
    allowedOutputs: [
      "roi_prioritization",
      "evidence_gap_analysis",
      "speed_to_cash_assessment",
      "risk_weighting",
      "kill_candidate_recommendation",
    ],
    forbiddenActions: [
      "runtime_dispatch",
      "external_execution",
      "contact_customers",
      "send_messages",
      "spend_funds",
    ],
    canVeto: false,
    noExecutionAuthorized: true,
  },
  hermes: {
    roleId: "hermes",
    mission:
      "Prepare outreach and cash-oriented operator work packets. Draft angles and targets only — never send or contact.",
    allowedOutputs: [
      "outreach_draft",
      "target_list_prep",
      "cash_work_packet_outline",
      "channel_strategy_note",
    ],
    forbiddenActions: [
      "send_email",
      "send_message",
      "contact_customer",
      "runtime_dispatch",
      "external_execution",
    ],
    canVeto: false,
    noExecutionAuthorized: true,
  },
  orient: {
    roleId: "orient",
    mission:
      "Clarify buyer context, pain, and positioning so cash moves stay aligned with venture reality.",
    allowedOutputs: [
      "buyer_context_summary",
      "pain_clarity_note",
      "positioning_hypothesis",
    ],
    forbiddenActions: [
      "runtime_dispatch",
      "external_execution",
      "contact_customers",
    ],
    canVeto: false,
    noExecutionAuthorized: true,
  },
  builder: {
    roleId: "builder",
    mission:
      "Propose minimal build or experiment steps that produce evidence faster without shipping live product changes.",
    allowedOutputs: [
      "experiment_outline",
      "artifact_spec",
      "evidence_collection_plan",
    ],
    forbiddenActions: [
      "deploy_production",
      "runtime_dispatch",
      "external_execution",
      "modify_live_systems",
    ],
    canVeto: false,
    noExecutionAuthorized: true,
  },
  scribe: {
    roleId: "scribe",
    mission:
      "Draft narratives, briefs, and operator-ready copy. Never send or publish on behalf of the CEO.",
    allowedOutputs: [
      "brief_draft",
      "ceo_memo_draft",
      "evidence_summary",
      "offer_copy_draft",
    ],
    forbiddenActions: [
      "send_email",
      "send_message",
      "publish_content",
      "runtime_dispatch",
      "external_execution",
    ],
    canVeto: false,
    noExecutionAuthorized: true,
  },
  closer: {
    roleId: "closer",
    mission:
      "Prepare commercial motion, pricing hypotheses, and deal structure — never contact customers or close deals.",
    allowedOutputs: [
      "commercial_motion_outline",
      "pricing_hypothesis",
      "deal_structure_note",
      "objection_handling_prep",
    ],
    forbiddenActions: [
      "contact_customer",
      "send_proposal",
      "sign_contract",
      "runtime_dispatch",
      "external_execution",
    ],
    canVeto: false,
    noExecutionAuthorized: true,
  },
  auditor: {
    roleId: "auditor",
    mission:
      "Audit evidence, compliance risk, and governance boundaries. A veto forces CEO decision — never execution.",
    allowedOutputs: [
      "evidence_audit",
      "compliance_risk_note",
      "governance_veto",
      "ceo_escalation",
    ],
    forbiddenActions: [
      "runtime_dispatch",
      "external_execution",
      "override_human_on_the_loop",
    ],
    canVeto: true,
    noExecutionAuthorized: true,
  },
  operator: {
    roleId: "operator",
    mission:
      "Prepare the next internal work sequence and handoff artifacts. Never dispatch runtime or external operators.",
    allowedOutputs: [
      "next_work_outline",
      "handoff_checklist",
      "operator_packet_prep",
    ],
    forbiddenActions: [
      "runtime_dispatch",
      "external_execution",
      "auto_assign_live_work",
      "contact_customers",
    ],
    canVeto: false,
    noExecutionAuthorized: true,
  },
};

// ---------------------------------------------------------------------------
// Core contracts
// ---------------------------------------------------------------------------

export interface AgentCouncilTurn {
  turnId: string;
  runId: string;
  roleId: AgentCouncilRoleId;
  inputSummary: string;
  outputSummary: string;
  recommendation: AgentCouncilTurnRecommendation;
  confidenceScore: number;
  riskFlags: string[];
  evidenceRefs: AgentCouncilEvidenceRef[];
  retryCount: number;
  status: AgentCouncilTurnStatus;
  createdAt: string;
}

export interface AgentCouncilVerdict {
  verdictId: string;
  runId: string;
  recommendedAction: string;
  decision: AgentCouncilVerdictDecision;
  selectedContributions: string[];
  counterProposals: string[];
  riskFlags: string[];
  nextMandateInput?: BuildNextActionMandateInput;
  moneyStrategyInput?: AgentCouncilMoneyStrategyInput;
  approvalRequired: true;
  noExecutionAuthorized: true;
}

export interface AgentCouncilRun {
  runId: string;
  orchestratorAgentId: typeof AGENT_COUNCIL_ORCHESTRATOR_ID;
  objective: string;
  sourceType: AgentCouncilSourceType;
  sourceId?: string;
  ventureId?: string;
  status: AgentCouncilRunStatus;
  rolesRequested: AgentCouncilRoleId[];
  turns: AgentCouncilTurn[];
  finalVerdict?: AgentCouncilVerdict;
  retryPolicy: AgentCouncilRetryPolicy;
  createdAt: string;
  updatedAt: string;
  humanOnTheLoop: true;
  noExecutionAuthorized: true;
}

export interface BuildAgentCouncilRunInput {
  runId: string;
  objective: string;
  sourceType: AgentCouncilSourceType;
  sourceId?: string;
  ventureId?: string;
  status?: AgentCouncilRunStatus;
  rolesRequested: AgentCouncilRoleId[];
  turns?: AgentCouncilTurn[];
  finalVerdict?: AgentCouncilVerdict;
  retryPolicy?: AgentCouncilRetryPolicy;
  createdAt?: string;
  updatedAt?: string;
}

export interface BuildAgentCouncilTurnInput {
  turnId: string;
  runId: string;
  roleId: AgentCouncilRoleId;
  inputSummary: string;
  outputSummary: string;
  recommendation: AgentCouncilTurnRecommendation;
  confidenceScore: number;
  riskFlags?: string[];
  evidenceRefs?: AgentCouncilEvidenceRef[];
  retryCount?: number;
  status?: AgentCouncilTurnStatus;
  createdAt?: string;
}

export interface BuildAgentCouncilVerdictInput {
  verdictId: string;
  runId: string;
  recommendedAction: string;
  decision?: AgentCouncilVerdictDecision;
  selectedContributions?: string[];
  counterProposals?: string[];
  riskFlags?: string[];
  turns?: AgentCouncilTurn[];
  run?: Pick<
    AgentCouncilRun,
    "runId" | "ventureId" | "sourceId" | "sourceType" | "objective"
  >;
  nextMandateInput?: BuildNextActionMandateInput;
  moneyStrategyInput?: AgentCouncilMoneyStrategyInput;
}

/**
 * Bridge input for money-strategy routing: carries mandate build fields plus
 * routing context without duplicating RouteMoneyStrategyInput or NextActionMandate.
 */
export interface AgentCouncilMoneyStrategyInput {
  mandateBuildInput: BuildNextActionMandateInput;
  routing: Pick<
    RouteMoneyStrategyInput,
    "currentState" | "evidenceQuality" | "createdAt"
  >;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_SOURCE_TYPES: ReadonlySet<string> = new Set([
  "raw_idea",
  "cash_action_packet",
  "venture_workbench_item",
  "next_action_mandate",
]);

const VALID_RUN_STATUSES: ReadonlySet<string> = new Set([
  "draft",
  "running",
  "waiting_for_agent",
  "ready_for_ceo",
  "blocked",
  "completed",
  "failed",
]);

const VALID_TURN_STATUSES: ReadonlySet<string> = new Set([
  "pending",
  "completed",
  "failed",
  "skipped",
]);

const VALID_TURN_RECOMMENDATIONS: ReadonlySet<string> = new Set([
  "proceed",
  "refine",
  "pause",
  "kill_candidate",
  "veto",
  "needs_ceo_decision",
  "support",
  "abstain",
]);

const VALID_VERDICT_DECISIONS: ReadonlySet<string> = new Set([
  "proceed",
  "refine",
  "pause",
  "kill_candidate",
  "needs_ceo_decision",
]);

const ISO_DATE_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

const DEFAULT_RETRY_POLICY: AgentCouncilRetryPolicy = {
  maxRetriesPerRole: 1,
  retryFailedTurns: true,
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function councilIssue(
  code: string,
  message: string,
  severity: AgentCouncilValidationSeverity = "error",
  path?: string,
): AgentCouncilIssue {
  const result: AgentCouncilIssue = { code, message, severity };
  if (path !== undefined) result.path = path;
  return result;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isIsoDateString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    ISO_DATE_PATTERN.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function isBoundedConfidence(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

function isValidRoleId(value: unknown): value is AgentCouncilRoleId {
  return typeof value === "string" && value in AGENT_COUNCIL_ROLES;
}

function copyEvidenceRefs(refs: AgentCouncilEvidenceRef[]): AgentCouncilEvidenceRef[] {
  return refs.map((ref) => {
    const copy: AgentCouncilEvidenceRef = {
      kind: ref.kind,
      referenceId: ref.referenceId,
      summary: ref.summary,
    };
    if (ref.isVerified !== undefined) copy.isVerified = ref.isVerified;
    return copy;
  });
}

function copyTurn(turn: AgentCouncilTurn): AgentCouncilTurn {
  return {
    turnId: turn.turnId,
    runId: turn.runId,
    roleId: turn.roleId,
    inputSummary: turn.inputSummary,
    outputSummary: turn.outputSummary,
    recommendation: turn.recommendation,
    confidenceScore: turn.confidenceScore,
    riskFlags: [...turn.riskFlags],
    evidenceRefs: copyEvidenceRefs(turn.evidenceRefs),
    retryCount: turn.retryCount,
    status: turn.status,
    createdAt: turn.createdAt,
  };
}

function sortTurnsDeterministically(turns: AgentCouncilTurn[]): AgentCouncilTurn[] {
  return [...turns].sort((left, right) => {
    const timeDelta = left.createdAt.localeCompare(right.createdAt);
    if (timeDelta !== 0) return timeDelta;
    return left.turnId.localeCompare(right.turnId);
  });
}

function hasAuditorVeto(turns: AgentCouncilTurn[]): boolean {
  return turns.some(
    (turn) =>
      turn.status === "completed" &&
      turn.roleId === "auditor" &&
      (turn.recommendation === "veto" ||
        turn.recommendation === "needs_ceo_decision" ||
        turn.riskFlags.includes("auditor_veto")),
  );
}

function hasGravityKillRecommendation(turns: AgentCouncilTurn[]): boolean {
  return turns.some(
    (turn) =>
      turn.status === "completed" &&
      turn.roleId === "t_gravity" &&
      turn.recommendation === "kill_candidate",
  );
}

function deriveEvidenceQuality(
  turns: AgentCouncilTurn[],
): (typeof MoneyStrategyEvidenceQuality)[keyof typeof MoneyStrategyEvidenceQuality] {
  const refs = turns.flatMap((turn) => turn.evidenceRefs);
  const hasVerifiedFinancial = refs.some(
    (ref) =>
      ref.isVerified === true &&
      (ref.kind === "stripe_charge" || ref.kind === "signed_loi"),
  );
  if (hasVerifiedFinancial) return MoneyStrategyEvidenceQuality.VERIFIED_FINANCIAL;

  const hasAnyEvidence = refs.length > 0 || turns.some((turn) => turn.evidenceRefs.length > 0);
  if (hasAnyEvidence) return MoneyStrategyEvidenceQuality.WEAK_SIGNAL;

  return MoneyStrategyEvidenceQuality.NONE;
}

function deriveMoneyStrategyState(
  decision: AgentCouncilVerdictDecision,
): (typeof MoneyStrategyState)[keyof typeof MoneyStrategyState] {
  switch (decision) {
    case "proceed":
      return MoneyStrategyState.VALIDATION_IN_PROGRESS;
    case "refine":
      return MoneyStrategyState.EVIDENCE_COLLECTION;
    case "pause":
      return MoneyStrategyState.BLOCKED;
    case "kill_candidate":
      return MoneyStrategyState.CEO_REVIEW;
    case "needs_ceo_decision":
      return MoneyStrategyState.CEO_REVIEW;
    default:
      return MoneyStrategyState.HYPOTHESIS;
  }
}

function deriveMandateTypeForDecision(
  decision: AgentCouncilVerdictDecision,
): (typeof NextActionMandateType)[keyof typeof NextActionMandateType] {
  switch (decision) {
    case "kill_candidate":
    case "needs_ceo_decision":
      return NextActionMandateType.CEO_DECISION;
    case "pause":
      return NextActionMandateType.COLLECT_EVIDENCE;
    case "refine":
      return NextActionMandateType.VALIDATE_PAIN;
    case "proceed":
      return NextActionMandateType.TEST_OFFER;
    default:
      return NextActionMandateType.COLLECT_EVIDENCE;
  }
}

function deriveMandateStatusForDecision(
  decision: AgentCouncilVerdictDecision,
): (typeof NextActionMandateStatus)[keyof typeof NextActionMandateStatus] {
  switch (decision) {
    case "proceed":
      return NextActionMandateStatus.ACCEPTED_FOR_NEXT_WORK;
    case "refine":
      return NextActionMandateStatus.COUNTER_PROPOSED;
    case "pause":
      return NextActionMandateStatus.REFUTED;
    case "kill_candidate":
      return NextActionMandateStatus.NEEDS_CEO_DECISION;
    case "needs_ceo_decision":
      return NextActionMandateStatus.NEEDS_CEO_DECISION;
    default:
      return NextActionMandateStatus.PENDING;
  }
}

function deriveRunStatusAfterTurn(
  run: AgentCouncilRun,
  turns: AgentCouncilTurn[],
): AgentCouncilRunStatus {
  if (run.status === "failed" || run.status === "blocked") return run.status;

  const pendingRole = run.rolesRequested.find((roleId) => {
    const roleTurns = turns.filter((turn) => turn.roleId === roleId);
    if (roleTurns.length === 0) return true;
    const latest = roleTurns[roleTurns.length - 1];
    return latest.status === "pending" || latest.status === "failed";
  });

  if (pendingRole !== undefined) {
    const failedExists = turns.some((turn) => turn.status === "failed");
    return failedExists ? "waiting_for_agent" : "running";
  }

  if (hasAuditorVeto(turns) || hasGravityKillRecommendation(turns)) {
    return "ready_for_ceo";
  }

  return "ready_for_ceo";
}

function validateEvidenceRef(ref: unknown, path: string): AgentCouncilIssue[] {
  const issues: AgentCouncilIssue[] = [];
  if (!ref || typeof ref !== "object" || Array.isArray(ref)) {
    issues.push(councilIssue("invalid_evidence_ref", "evidenceRefs entries must be objects", "error", path));
    return issues;
  }

  const record = ref as Record<string, unknown>;
  if (!isNonEmptyString(record.kind)) {
    issues.push(councilIssue("invalid_evidence_ref", "evidenceRef.kind is required", "error", `${path}.kind`));
  }
  if (!isNonEmptyString(record.referenceId)) {
    issues.push(
      councilIssue("invalid_evidence_ref", "evidenceRef.referenceId is required", "error", `${path}.referenceId`),
    );
  }
  if (!isNonEmptyString(record.summary)) {
    issues.push(councilIssue("invalid_evidence_ref", "evidenceRef.summary is required", "error", `${path}.summary`));
  }

  return issues;
}

function validateTurn(turn: AgentCouncilTurn, index: number): AgentCouncilIssue[] {
  const issues: AgentCouncilIssue[] = [];
  const basePath = `turns[${index}]`;

  if (!isNonEmptyString(turn.turnId)) {
    issues.push(councilIssue("turn_id_required", "turnId is required", "error", `${basePath}.turnId`));
  }
  if (!isNonEmptyString(turn.runId)) {
    issues.push(councilIssue("run_id_required", "runId is required on each turn", "error", `${basePath}.runId`));
  }
  if (!isValidRoleId(turn.roleId)) {
    issues.push(councilIssue("invalid_role_id", "turn.roleId must be a canonical council role", "error", `${basePath}.roleId`));
  }
  if (!VALID_TURN_STATUSES.has(turn.status)) {
    issues.push(councilIssue("invalid_turn_status", "turn.status is invalid", "error", `${basePath}.status`));
  }
  if (!VALID_TURN_RECOMMENDATIONS.has(turn.recommendation)) {
    issues.push(
      councilIssue("invalid_turn_recommendation", "turn.recommendation is invalid", "error", `${basePath}.recommendation`),
    );
  }
  if (!isBoundedConfidence(turn.confidenceScore)) {
    issues.push(
      councilIssue("invalid_confidence_score", "confidenceScore must be between 0 and 100", "error", `${basePath}.confidenceScore`),
    );
  }
  if (!isIsoDateString(turn.createdAt)) {
    issues.push(councilIssue("invalid_created_at", "turn.createdAt must be an ISO-8601 timestamp", "error", `${basePath}.createdAt`));
  }
  if (!Number.isInteger(turn.retryCount) || turn.retryCount < 0) {
    issues.push(councilIssue("invalid_retry_count", "retryCount must be a non-negative integer", "error", `${basePath}.retryCount`));
  }

  turn.evidenceRefs.forEach((ref, refIndex) => {
    issues.push(...validateEvidenceRef(ref, `${basePath}.evidenceRefs[${refIndex}]`));
  });

  return issues;
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

export function buildAgentCouncilTurn(input: BuildAgentCouncilTurnInput): AgentCouncilTurn {
  return {
    turnId: input.turnId,
    runId: input.runId,
    roleId: input.roleId,
    inputSummary: input.inputSummary,
    outputSummary: input.outputSummary,
    recommendation: input.recommendation,
    confidenceScore: input.confidenceScore,
    riskFlags: Array.isArray(input.riskFlags) ? [...input.riskFlags] : [],
    evidenceRefs: Array.isArray(input.evidenceRefs) ? copyEvidenceRefs(input.evidenceRefs) : [],
    retryCount: input.retryCount ?? 0,
    status: input.status ?? "pending",
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

export function buildAgentCouncilRun(input: BuildAgentCouncilRunInput): AgentCouncilRun {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const turns = sortTurnsDeterministically(
    (input.turns ?? []).map((turn) => copyTurn(turn)),
  );

  const run: AgentCouncilRun = {
    runId: input.runId,
    orchestratorAgentId: AGENT_COUNCIL_ORCHESTRATOR_ID,
    objective: input.objective,
    sourceType: input.sourceType,
    status: input.status ?? "draft",
    rolesRequested: [...input.rolesRequested],
    turns,
    retryPolicy: input.retryPolicy ?? { ...DEFAULT_RETRY_POLICY },
    createdAt,
    updatedAt: input.updatedAt ?? createdAt,
    humanOnTheLoop: true,
    noExecutionAuthorized: true,
  };

  if (input.sourceId !== undefined) run.sourceId = input.sourceId;
  if (input.ventureId !== undefined) run.ventureId = input.ventureId;
  if (input.finalVerdict !== undefined) run.finalVerdict = input.finalVerdict;

  return run;
}

export function validateAgentCouncilRun(run: AgentCouncilRun): AgentCouncilValidation {
  const issues: AgentCouncilIssue[] = [];

  if (!isNonEmptyString(run.runId)) {
    issues.push(councilIssue("run_id_required", "runId is required", "error", "runId"));
  }
  if (run.orchestratorAgentId !== AGENT_COUNCIL_ORCHESTRATOR_ID) {
    issues.push(
      councilIssue(
        "invalid_orchestrator",
        `orchestratorAgentId must be "${AGENT_COUNCIL_ORCHESTRATOR_ID}"`,
        "error",
        "orchestratorAgentId",
      ),
    );
  }
  if (!isNonEmptyString(run.objective)) {
    issues.push(councilIssue("objective_required", "objective is required", "error", "objective"));
  }
  if (!VALID_SOURCE_TYPES.has(run.sourceType)) {
    issues.push(councilIssue("invalid_source_type", "sourceType is invalid", "error", "sourceType"));
  }
  if (!VALID_RUN_STATUSES.has(run.status)) {
    issues.push(councilIssue("invalid_run_status", "status is invalid", "error", "status"));
  }
  if (!Array.isArray(run.rolesRequested) || run.rolesRequested.length === 0) {
    issues.push(councilIssue("roles_required", "rolesRequested must include at least one role", "error", "rolesRequested"));
  } else {
    run.rolesRequested.forEach((roleId, index) => {
      if (!isValidRoleId(roleId)) {
        issues.push(
          councilIssue("invalid_role_id", "rolesRequested contains an unknown role", "error", `rolesRequested[${index}]`),
        );
      }
    });
  }
  if (!isIsoDateString(run.createdAt)) {
    issues.push(councilIssue("invalid_created_at", "createdAt must be an ISO-8601 timestamp", "error", "createdAt"));
  }
  if (!isIsoDateString(run.updatedAt)) {
    issues.push(councilIssue("invalid_updated_at", "updatedAt must be an ISO-8601 timestamp", "error", "updatedAt"));
  }
  if (run.humanOnTheLoop !== true) {
    issues.push(councilIssue("human_on_the_loop_required", "humanOnTheLoop must be true", "error", "humanOnTheLoop"));
  }
  if (run.noExecutionAuthorized !== true) {
    issues.push(
      councilIssue("no_execution_required", "noExecutionAuthorized must be true", "error", "noExecutionAuthorized"),
    );
  }
  if (
    !Number.isInteger(run.retryPolicy.maxRetriesPerRole) ||
    run.retryPolicy.maxRetriesPerRole < 0
  ) {
    issues.push(
      councilIssue(
        "invalid_retry_policy",
        "retryPolicy.maxRetriesPerRole must be a non-negative integer",
        "error",
        "retryPolicy.maxRetriesPerRole",
      ),
    );
  }

  run.turns.forEach((turn, index) => {
    issues.push(...validateTurn(turn, index));
    if (turn.runId !== run.runId) {
      issues.push(
        councilIssue(
          "turn_run_mismatch",
          "every turn.runId must match the parent run.runId",
          "error",
          `turns[${index}].runId`,
        ),
      );
    }
  });

  if (run.finalVerdict !== undefined) {
    if (run.finalVerdict.runId !== run.runId) {
      issues.push(
        councilIssue("verdict_run_mismatch", "finalVerdict.runId must match run.runId", "error", "finalVerdict.runId"),
      );
    }
    if (!VALID_VERDICT_DECISIONS.has(run.finalVerdict.decision)) {
      issues.push(
        councilIssue("invalid_verdict_decision", "finalVerdict.decision is invalid", "error", "finalVerdict.decision"),
      );
    }
    if (run.finalVerdict.approvalRequired !== true || run.finalVerdict.noExecutionAuthorized !== true) {
      issues.push(
        councilIssue(
          "verdict_governance_required",
          "finalVerdict must keep approvalRequired and noExecutionAuthorized true",
          "error",
          "finalVerdict",
        ),
      );
    }
  }

  return { valid: issues.every((issue) => issue.severity !== "error"), issues };
}

export function appendAgentCouncilTurn(
  run: AgentCouncilRun,
  turn: AgentCouncilTurn,
): AgentCouncilRun {
  if (turn.runId !== run.runId) {
    throw new Error("appendAgentCouncilTurn: turn.runId must match run.runId");
  }

  const existingForRole = run.turns.filter((existing) => existing.roleId === turn.roleId);
  const latestForRole = existingForRole[existingForRole.length - 1];
  let nextTurn = copyTurn(turn);

  if (
    latestForRole?.status === "failed" &&
    run.retryPolicy.retryFailedTurns &&
    latestForRole.retryCount < run.retryPolicy.maxRetriesPerRole
  ) {
    nextTurn = {
      ...nextTurn,
      retryCount: latestForRole.retryCount + 1,
    };
  }

  const turns = sortTurnsDeterministically([...run.turns, nextTurn]);
  const updatedAt = nextTurn.createdAt;

  return {
    ...run,
    turns,
    status: deriveRunStatusAfterTurn(run, turns),
    updatedAt,
    rolesRequested: [...run.rolesRequested],
    retryPolicy: { ...run.retryPolicy },
  };
}

/**
 * Derives a council-level decision from completed turns.
 * Auditor veto always escalates to needs_ceo_decision.
 * t_gravity kill_candidate is a recommendation only (never execution).
 */
export function deriveCouncilDecision(turns: AgentCouncilTurn[]): AgentCouncilVerdictDecision {
  const completedTurns = turns.filter((turn) => turn.status === "completed");

  if (hasAuditorVeto(completedTurns)) {
    return "needs_ceo_decision";
  }

  if (hasGravityKillRecommendation(completedTurns)) {
    return "kill_candidate";
  }

  if (completedTurns.some((turn) => turn.recommendation === "needs_ceo_decision")) {
    return "needs_ceo_decision";
  }

  if (completedTurns.some((turn) => turn.recommendation === "pause")) {
    return "pause";
  }

  const refineCount = completedTurns.filter((turn) => turn.recommendation === "refine").length;
  const proceedCount = completedTurns.filter((turn) => turn.recommendation === "proceed").length;

  if (refineCount > proceedCount) return "refine";
  if (proceedCount > 0 && refineCount === 0) return "proceed";

  return "refine";
}

export function mapCouncilVerdictToNextActionMandateInput(
  verdict: AgentCouncilVerdict,
  context: {
    mandateId: string;
    previousActionId: string;
    agentId?: string;
    ventureId?: string;
    workOrderId?: string;
    createdAt?: string;
  },
): BuildNextActionMandateInput {
  const mandateType = deriveMandateTypeForDecision(verdict.decision);
  const status = deriveMandateStatusForDecision(verdict.decision);

  const input: BuildNextActionMandateInput = {
    mandateId: context.mandateId,
    previousActionId: context.previousActionId,
    agentId: context.agentId ?? AGENT_COUNCIL_ORCHESTRATOR_ID,
    mandateType,
    recommendedAction: verdict.recommendedAction,
    cashHypothesis: `Council verdict (${verdict.decision}) for run ${verdict.runId}`,
    requiredEvidence: verdict.riskFlags.length > 0
      ? [...verdict.riskFlags]
      : ["council_consensus", "venture_evidence"],
    status,
    riskLevel: verdict.decision === "needs_ceo_decision" ? "critical" : "medium",
    requiresCeoApproval: councilRunRequiresCeoApproval(verdict),
    createdAt: context.createdAt,
  };

  if (context.ventureId !== undefined) input.ventureId = context.ventureId;
  if (context.workOrderId !== undefined) input.workOrderId = context.workOrderId;

  if (status === NextActionMandateStatus.REFUTED) {
    input.refutationRationale = verdict.counterProposals[0] ?? "Council recommends pausing until evidence improves.";
  }

  if (status === NextActionMandateStatus.COUNTER_PROPOSED && verdict.counterProposals.length > 0) {
    input.counterProposal = {
      recommendedAction: verdict.counterProposals[0],
      rationale: verdict.selectedContributions.join("; ") || "Council counter-proposal",
    };
  }

  return input;
}

export function mapCouncilVerdictToMoneyStrategyInput(
  verdict: AgentCouncilVerdict,
  context: {
    mandateId: string;
    previousActionId: string;
    agentId?: string;
    ventureId?: string;
    workOrderId?: string;
    turns: AgentCouncilTurn[];
    createdAt?: string;
  },
): AgentCouncilMoneyStrategyInput {
  const mandateBuildInput = mapCouncilVerdictToNextActionMandateInput(verdict, context);

  return {
    mandateBuildInput,
    routing: {
      currentState: deriveMoneyStrategyState(verdict.decision),
      evidenceQuality: deriveEvidenceQuality(context.turns),
      createdAt: context.createdAt,
    },
  };
}

export function buildAgentCouncilVerdict(input: BuildAgentCouncilVerdictInput): AgentCouncilVerdict {
  const turns = input.turns ?? [];
  const decision = input.decision ?? deriveCouncilDecision(turns);
  const riskFlags = Array.isArray(input.riskFlags) ? [...input.riskFlags] : [];

  if (decision === "needs_ceo_decision" && !riskFlags.includes("ceo_approval_required")) {
    riskFlags.push("ceo_approval_required");
  }
  if (decision === "kill_candidate" && !riskFlags.includes("kill_candidate_recommendation_only")) {
    riskFlags.push("kill_candidate_recommendation_only");
  }

  const verdict: AgentCouncilVerdict = {
    verdictId: input.verdictId,
    runId: input.runId,
    recommendedAction: input.recommendedAction,
    decision,
    selectedContributions: Array.isArray(input.selectedContributions)
      ? [...input.selectedContributions]
      : [],
    counterProposals: Array.isArray(input.counterProposals) ? [...input.counterProposals] : [],
    riskFlags,
    approvalRequired: true,
    noExecutionAuthorized: true,
  };

  const mappingContext = {
    mandateId: `mandate_from_${input.runId}`,
    previousActionId: input.run?.sourceId ?? `council_${input.runId}`,
    ventureId: input.run?.ventureId,
    createdAt: new Date().toISOString(),
  };

  verdict.nextMandateInput =
    input.nextMandateInput ??
    mapCouncilVerdictToNextActionMandateInput(verdict, mappingContext);

  verdict.moneyStrategyInput =
    input.moneyStrategyInput ??
    mapCouncilVerdictToMoneyStrategyInput(verdict, {
      ...mappingContext,
      turns,
    });

  return verdict;
}

export function councilRunRequiresCeoApproval(
  runOrVerdict: AgentCouncilRun | AgentCouncilVerdict,
): boolean {
  if ("decision" in runOrVerdict) {
    return (
      runOrVerdict.decision === "needs_ceo_decision" ||
      runOrVerdict.decision === "kill_candidate" ||
      runOrVerdict.riskFlags.includes("ceo_approval_required") ||
      runOrVerdict.riskFlags.includes("auditor_veto")
    );
  }

  if (runOrVerdict.finalVerdict !== undefined) {
    return councilRunRequiresCeoApproval(runOrVerdict.finalVerdict);
  }

  return (
    runOrVerdict.status === "ready_for_ceo" ||
    hasAuditorVeto(runOrVerdict.turns) ||
    hasGravityKillRecommendation(runOrVerdict.turns)
  );
}

export function gravityRolePrioritizesRoiEvidenceSpeedAndRisk(): boolean {
  const role = AGENT_COUNCIL_ROLES.t_gravity;
  const haystack = `${role.mission} ${role.allowedOutputs.join(" ")}`.toLowerCase();
  return (
    haystack.includes("roi") &&
    haystack.includes("evidence") &&
    (haystack.includes("speed-to-cash") || haystack.includes("speed to cash")) &&
    haystack.includes("risk")
  );
}
