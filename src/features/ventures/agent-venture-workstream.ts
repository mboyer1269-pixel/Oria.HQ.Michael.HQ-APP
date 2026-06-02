// src/features/ventures/agent-venture-workstream.ts
//
// Pure model and helpers that transform an AgentOpportunityBrief into a
// structured agent work plan (AgentVentureWorkstream). Nothing here executes,
// persists, or communicates — it only structures the work, deliverables, KPIs,
// and decision points needed to advance a venture toward profitability.
//
// Pipeline:
//   AgentOpportunityBrief → AgentVentureWorkstream
//     → (future) CEO Review → (future) controlled execution
//
// Dependency-free: no Supabase, no DB drivers, no filesystem, no network,
// no server actions, no Action Ledger writes, no UI components.

// ---------------------------------------------------------------------------
// SECTION A — Stage and configuration types
// ---------------------------------------------------------------------------

export type AgentVentureWorkstreamStage =
  | 'discovery'
  | 'validation'
  | 'build'
  | 'launch'
  | 'growth'
  | 'optimization';

export type AgentVentureWorkstreamStatus =
  | 'draft'
  | 'pending_ceo_review'
  | 'approved_for_planning'
  | 'active'
  | 'paused'
  | 'completed'
  | 'abandoned';

export type AgentWorkItemStatus =
  | 'not_started'
  | 'in_progress'
  | 'blocked'
  | 'completed'
  | 'skipped';

export type AgentWorkItemType =
  | 'research'
  | 'validation'
  | 'build'
  | 'outreach'
  | 'analysis'
  | 'synthesis'
  | 'decision_point'
  | 'review'
  | 'launch'
  | 'optimization';

// ---------------------------------------------------------------------------
// SECTION B — Sub-model types
// ---------------------------------------------------------------------------

export type AgentWorkItem = {
  itemId: string;
  title: string;
  description: string;
  type: AgentWorkItemType;
  status: AgentWorkItemStatus;
  estimatedEffortHours: number;
  expectedOutput: string;
  successCriteria: string;
  requiresHumanApproval: boolean;
  agentId: string | null;
};

export type AgentVentureKPI = {
  kpiId: string;
  label: string;
  description: string;
  targetValue: string;
  currentValue: string | null;
  unit: string;
  isCritical: boolean;
};

export type AgentVentureBusinessObjective = {
  objectiveId: string;
  label: string;
  rationale: string;
  expectedRevenueImpactCents: number;
  timeHorizonDays: number;
};

export type AgentVentureApprovalGate = {
  gateId: string;
  label: string;
  description: string;
  stage: AgentVentureWorkstreamStage;
  requiredBefore: string;
  approvalCriteria: string[];
  humanReviewRequired: boolean;
  ledgerEntryRequired: boolean;
};

export type AgentVentureAutonomyBoundary = {
  maxBudgetCents: number;
  allowedActions: string[];
  forbiddenActions: string[];
  requiresHumanApprovalAboveCents: number;
  maxParallelAgents: number;
};

// ---------------------------------------------------------------------------
// SECTION C — Main workstream type
// ---------------------------------------------------------------------------

export type AgentVentureWorkstream = {
  workstreamId: string;
  briefId: string | null; // links back to AgentOpportunityBrief.briefId (null if seeded manually)
  ventureId: string | null; // links to future VentureCard once saved
  agentId: string; // primary agent responsible
  title: string;
  stage: AgentVentureWorkstreamStage;
  status: AgentVentureWorkstreamStatus;
  targetCustomer: string;
  problem: string;
  proposedOffer: string;
  estimatedRevenuePotentialCents: number;
  estimatedTotalBudgetCents: number;
  speedToFirstDollarDays: number;
  businessObjectives: AgentVentureBusinessObjective[];
  workItems: AgentWorkItem[];
  kpis: AgentVentureKPI[];
  approvalGates: AgentVentureApprovalGate[];
  autonomyBoundary: AgentVentureAutonomyBoundary;
  riskFactors: string[];
  killCriteria: string[];
  rationale: string;
  evidence: string[];
  nextRecommendedAction: string;
  createdAt: string;
  updatedAt: string;
  // Safety flags — always true
  humanOnTheLoop: true;
  approvalRequired: true;
  noExecutionAuthorized: true;
};

// ---------------------------------------------------------------------------
// SECTION D — Score and validation types
// ---------------------------------------------------------------------------

export type AgentVentureWorkstreamReadinessScore = {
  stageReadinessScore: number; // 0-100: how ready is this for the current stage
  workItemCompletionRate: number; // 0-100: % of work items completed
  kpiDefinitionScore: number; // 0-100: are KPIs well-defined
  approvalGateScore: number; // 0-100: are approval gates well-defined
  businessObjectiveScore: number; // 0-100: are objectives clear and realistic
  overallReadinessScore: number; // 0-100: weighted composite
  isReadyForCEOReview: boolean; // true if overallReadinessScore >= 70
  blockers: string[]; // human-readable list of what is missing
};

export type AgentVentureWorkstreamValidation = {
  valid: boolean;
  errors: string[];
};

// ---------------------------------------------------------------------------
// SECTION E — Constants
// ---------------------------------------------------------------------------

export const AGENT_VENTURE_WORKSTREAM_STAGES: readonly AgentVentureWorkstreamStage[] = [
  'discovery',
  'validation',
  'build',
  'launch',
  'growth',
  'optimization',
];

export const AGENT_VENTURE_WORKSTREAM_STATUSES: readonly AgentVentureWorkstreamStatus[] = [
  'draft',
  'pending_ceo_review',
  'approved_for_planning',
  'active',
  'paused',
  'completed',
  'abandoned',
];

export const AGENT_WORK_ITEM_TYPES: readonly AgentWorkItemType[] = [
  'research',
  'validation',
  'build',
  'outreach',
  'analysis',
  'synthesis',
  'decision_point',
  'review',
  'launch',
  'optimization',
];

export const AGENT_WORK_ITEM_STATUSES: readonly AgentWorkItemStatus[] = [
  'not_started',
  'in_progress',
  'blocked',
  'completed',
  'skipped',
];

// ---------------------------------------------------------------------------
// SECTION F — validateAgentVentureWorkstream
// ---------------------------------------------------------------------------

export function validateAgentVentureWorkstream(
  ws: AgentVentureWorkstream,
): AgentVentureWorkstreamValidation {
  const errors: string[] = [];

  // Required non-empty string fields
  const requiredStrings: Array<keyof AgentVentureWorkstream> = [
    'workstreamId',
    'agentId',
    'title',
    'targetCustomer',
    'problem',
    'proposedOffer',
    'rationale',
    'nextRecommendedAction',
  ];
  for (const field of requiredStrings) {
    const value = ws[field];
    if (typeof value !== 'string' || value.trim() === '') {
      errors.push(`${field} must be a non-empty string`);
    }
  }

  // Stage
  if (!AGENT_VENTURE_WORKSTREAM_STAGES.includes(ws.stage)) {
    errors.push(`stage must be one of: ${AGENT_VENTURE_WORKSTREAM_STAGES.join(', ')}`);
  }

  // Status
  if (!AGENT_VENTURE_WORKSTREAM_STATUSES.includes(ws.status)) {
    errors.push(`status must be one of: ${AGENT_VENTURE_WORKSTREAM_STATUSES.join(', ')}`);
  }

  // Numeric bounds
  if (typeof ws.estimatedRevenuePotentialCents !== 'number' || ws.estimatedRevenuePotentialCents < 0) {
    errors.push('estimatedRevenuePotentialCents must be >= 0');
  }
  if (typeof ws.estimatedTotalBudgetCents !== 'number' || ws.estimatedTotalBudgetCents < 0) {
    errors.push('estimatedTotalBudgetCents must be >= 0');
  }
  if (typeof ws.speedToFirstDollarDays !== 'number' || ws.speedToFirstDollarDays < 0) {
    errors.push('speedToFirstDollarDays must be >= 0');
  }

  // businessObjectives
  if (!Array.isArray(ws.businessObjectives)) {
    errors.push('businessObjectives must be an array');
  } else {
    if (ws.status !== 'draft' && ws.businessObjectives.length < 1) {
      errors.push('businessObjectives requires at least 1 entry for non-draft status');
    }
    ws.businessObjectives.forEach((obj, i) => {
      if (typeof obj.objectiveId !== 'string' || obj.objectiveId.trim() === '') {
        errors.push(`businessObjectives[${i}].objectiveId must be a non-empty string`);
      }
      if (typeof obj.label !== 'string' || obj.label.trim() === '') {
        errors.push(`businessObjectives[${i}].label must be a non-empty string`);
      }
      if (typeof obj.rationale !== 'string' || obj.rationale.trim() === '') {
        errors.push(`businessObjectives[${i}].rationale must be a non-empty string`);
      }
      if (typeof obj.expectedRevenueImpactCents !== 'number' || obj.expectedRevenueImpactCents < 0) {
        errors.push(`businessObjectives[${i}].expectedRevenueImpactCents must be >= 0`);
      }
      if (typeof obj.timeHorizonDays !== 'number' || obj.timeHorizonDays < 1) {
        errors.push(`businessObjectives[${i}].timeHorizonDays must be >= 1`);
      }
    });
  }

  // workItems
  if (!Array.isArray(ws.workItems)) {
    errors.push('workItems must be an array');
  } else {
    ws.workItems.forEach((item, i) => {
      const requiredItemStrings: Array<keyof AgentWorkItem> = [
        'itemId',
        'title',
        'description',
        'expectedOutput',
        'successCriteria',
      ];
      for (const field of requiredItemStrings) {
        const value = item[field];
        if (typeof value !== 'string' || (value as string).trim() === '') {
          errors.push(`workItems[${i}].${field} must be a non-empty string`);
        }
      }
      if (typeof item.estimatedEffortHours !== 'number' || item.estimatedEffortHours < 0) {
        errors.push(`workItems[${i}].estimatedEffortHours must be >= 0`);
      }
      if (!AGENT_WORK_ITEM_TYPES.includes(item.type)) {
        errors.push(`workItems[${i}].type must be one of: ${AGENT_WORK_ITEM_TYPES.join(', ')}`);
      }
      if (!AGENT_WORK_ITEM_STATUSES.includes(item.status)) {
        errors.push(`workItems[${i}].status must be one of: ${AGENT_WORK_ITEM_STATUSES.join(', ')}`);
      }
    });
  }

  // kpis
  if (!Array.isArray(ws.kpis)) {
    errors.push('kpis must be an array');
  } else {
    if (ws.status !== 'draft' && ws.kpis.length < 1) {
      errors.push('kpis requires at least 1 entry for non-draft status');
    }
    ws.kpis.forEach((kpi, i) => {
      const requiredKpiStrings: Array<keyof AgentVentureKPI> = [
        'kpiId',
        'label',
        'description',
        'targetValue',
        'unit',
      ];
      for (const field of requiredKpiStrings) {
        const value = kpi[field];
        if (typeof value !== 'string' || (value as string).trim() === '') {
          errors.push(`kpis[${i}].${field} must be a non-empty string`);
        }
      }
    });
  }

  // approvalGates
  if (!Array.isArray(ws.approvalGates)) {
    errors.push('approvalGates must be an array');
  } else {
    if (ws.status !== 'draft' && ws.approvalGates.length < 1) {
      errors.push('approvalGates requires at least 1 entry for non-draft status');
    }
    ws.approvalGates.forEach((gate, i) => {
      if (typeof gate.gateId !== 'string' || gate.gateId.trim() === '') {
        errors.push(`approvalGates[${i}].gateId must be a non-empty string`);
      }
      if (typeof gate.label !== 'string' || gate.label.trim() === '') {
        errors.push(`approvalGates[${i}].label must be a non-empty string`);
      }
      if (typeof gate.description !== 'string' || gate.description.trim() === '') {
        errors.push(`approvalGates[${i}].description must be a non-empty string`);
      }
      if (typeof gate.requiredBefore !== 'string' || gate.requiredBefore.trim() === '') {
        errors.push(`approvalGates[${i}].requiredBefore must be a non-empty string`);
      }
      if (!AGENT_VENTURE_WORKSTREAM_STAGES.includes(gate.stage)) {
        errors.push(`approvalGates[${i}].stage must be a valid stage`);
      }
      if (!Array.isArray(gate.approvalCriteria) || gate.approvalCriteria.length < 1) {
        errors.push(`approvalGates[${i}].approvalCriteria must have at least 1 entry`);
      }
      if (gate.humanReviewRequired !== true) {
        errors.push(`approvalGates[${i}].humanReviewRequired must be true`);
      }
      if (gate.ledgerEntryRequired !== true) {
        errors.push(`approvalGates[${i}].ledgerEntryRequired must be true`);
      }
    });
  }

  // autonomyBoundary
  if (ws.autonomyBoundary == null || typeof ws.autonomyBoundary !== 'object') {
    errors.push('autonomyBoundary must be an object');
  } else {
    const ab = ws.autonomyBoundary;
    if (typeof ab.maxBudgetCents !== 'number' || ab.maxBudgetCents < 0) {
      errors.push('autonomyBoundary.maxBudgetCents must be >= 0');
    }
    if (typeof ab.requiresHumanApprovalAboveCents !== 'number' || ab.requiresHumanApprovalAboveCents < 0) {
      errors.push('autonomyBoundary.requiresHumanApprovalAboveCents must be >= 0');
    }
    if (typeof ab.maxParallelAgents !== 'number' || ab.maxParallelAgents < 1) {
      errors.push('autonomyBoundary.maxParallelAgents must be >= 1');
    }
    if (!Array.isArray(ab.allowedActions)) {
      errors.push('autonomyBoundary.allowedActions must be an array');
    }
    if (!Array.isArray(ab.forbiddenActions)) {
      errors.push('autonomyBoundary.forbiddenActions must be an array');
    }
  }

  // evidence, riskFactors, killCriteria
  if (!Array.isArray(ws.evidence)) {
    errors.push('evidence must be an array');
  }
  if (!Array.isArray(ws.riskFactors)) {
    errors.push('riskFactors must be an array');
  }
  if (!Array.isArray(ws.killCriteria)) {
    errors.push('killCriteria must be an array');
  } else if (ws.killCriteria.length < 1) {
    errors.push('killCriteria must have at least 1 entry');
  }

  // Date fields
  if (!ws.createdAt || isNaN(+new Date(ws.createdAt))) {
    errors.push('createdAt must be a valid ISO date string');
  }
  if (!ws.updatedAt || isNaN(+new Date(ws.updatedAt))) {
    errors.push('updatedAt must be a valid ISO date string');
  }

  // Safety flags
  if (ws.humanOnTheLoop !== true) {
    errors.push('humanOnTheLoop must be true');
  }
  if (ws.approvalRequired !== true) {
    errors.push('approvalRequired must be true');
  }
  if (ws.noExecutionAuthorized !== true) {
    errors.push('noExecutionAuthorized must be true');
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// SECTION G — scoreAgentVentureWorkstreamReadiness
// ---------------------------------------------------------------------------

export function scoreAgentVentureWorkstreamReadiness(
  ws: AgentVentureWorkstream,
): AgentVentureWorkstreamReadinessScore {
  // stageReadinessScore
  let stageReadinessScore: number;
  switch (ws.stage) {
    case 'discovery':
      stageReadinessScore =
        ws.workItems.length >= 1 && ws.rationale.trim() !== '' ? 100 : 50;
      break;
    case 'validation':
      stageReadinessScore =
        ws.workItems.length >= 2 && ws.evidence.length >= 1 && ws.kpis.length >= 1 ? 100 : 40;
      break;
    case 'build':
      stageReadinessScore =
        ws.workItems.length >= 3 &&
        ws.kpis.length >= 2 &&
        ws.approvalGates.length >= 1 &&
        ws.businessObjectives.length >= 1
          ? 100
          : 30;
      break;
    case 'launch':
      stageReadinessScore =
        ws.workItems.length >= 3 &&
        ws.kpis.length >= 2 &&
        ws.businessObjectives.length >= 1 &&
        ws.evidence.length >= 1
          ? 100
          : 25;
      break;
    case 'growth':
      stageReadinessScore =
        ws.kpis.length >= 3 && ws.businessObjectives.length >= 2 ? 100 : 30;
      break;
    case 'optimization':
      stageReadinessScore =
        ws.kpis.length >= 3 && ws.businessObjectives.length >= 2 && ws.evidence.length >= 2
          ? 100
          : 30;
      break;
    default:
      stageReadinessScore = 0;
  }

  // workItemCompletionRate
  let workItemCompletionRate: number;
  if (ws.workItems.length === 0) {
    workItemCompletionRate = 0;
  } else {
    const completed = ws.workItems.filter((item) => item.status === 'completed').length;
    workItemCompletionRate = Math.round((completed / ws.workItems.length) * 100);
  }

  // kpiDefinitionScore
  let kpiDefinitionScore: number;
  if (ws.kpis.length === 0) {
    kpiDefinitionScore = 0;
  } else if (ws.kpis.length === 1) {
    kpiDefinitionScore = 40;
  } else if (ws.kpis.length === 2) {
    kpiDefinitionScore = 70;
  } else {
    // >= 3
    const hasCritical = ws.kpis.some((kpi) => kpi.isCritical);
    kpiDefinitionScore = hasCritical ? 100 : 85;
  }

  // approvalGateScore
  let approvalGateScore: number;
  if (ws.approvalGates.length === 0) {
    approvalGateScore = 0;
  } else if (ws.approvalGates.length === 1) {
    approvalGateScore = 60;
  } else {
    approvalGateScore = 100;
  }

  // businessObjectiveScore
  let businessObjectiveScore: number;
  if (ws.businessObjectives.length === 0) {
    businessObjectiveScore = 0;
  } else if (ws.businessObjectives.length === 1) {
    businessObjectiveScore = 50;
  } else if (ws.businessObjectives.length === 2) {
    businessObjectiveScore = 80;
  } else {
    businessObjectiveScore = 100;
  }

  // overallReadinessScore (weighted composite)
  const weighted =
    stageReadinessScore * 0.3 +
    workItemCompletionRate * 0.2 +
    kpiDefinitionScore * 0.2 +
    approvalGateScore * 0.15 +
    businessObjectiveScore * 0.15;
  const overallReadinessScore = Math.round(Math.min(100, Math.max(0, weighted)));

  const isReadyForCEOReview = overallReadinessScore >= 70;

  // blockers
  const blockers: string[] = [];
  if (stageReadinessScore === 0) {
    blockers.push('stage readiness score is 0 — review requirements for the current stage');
  }
  if (workItemCompletionRate === 0) {
    blockers.push('no work items have been completed');
  }
  if (kpiDefinitionScore === 0) {
    blockers.push('no KPIs defined');
  }
  if (approvalGateScore === 0) {
    blockers.push('no approval gates defined');
  }
  if (businessObjectiveScore === 0) {
    blockers.push('no business objectives defined');
  }
  if (ws.humanOnTheLoop !== true) {
    blockers.push('humanOnTheLoop must be true');
  }
  if (ws.approvalRequired !== true) {
    blockers.push('approvalRequired must be true');
  }
  if (ws.noExecutionAuthorized !== true) {
    blockers.push('noExecutionAuthorized must be true');
  }
  if (!Array.isArray(ws.killCriteria) || ws.killCriteria.length === 0) {
    blockers.push('at least one kill criterion required');
  }

  return {
    stageReadinessScore,
    workItemCompletionRate,
    kpiDefinitionScore,
    approvalGateScore,
    businessObjectiveScore,
    overallReadinessScore,
    isReadyForCEOReview,
    blockers,
  };
}

// ---------------------------------------------------------------------------
// SECTION H — buildAgentVentureWorkstream
// ---------------------------------------------------------------------------

export type BuildAgentVentureWorkstreamInput = Omit<
  AgentVentureWorkstream,
  'humanOnTheLoop' | 'approvalRequired' | 'noExecutionAuthorized'
>;

export function buildAgentVentureWorkstream(
  input: BuildAgentVentureWorkstreamInput,
): AgentVentureWorkstream {
  return {
    workstreamId: input.workstreamId,
    briefId: input.briefId,
    ventureId: input.ventureId,
    agentId: input.agentId,
    title: input.title,
    stage: input.stage,
    status: input.status,
    targetCustomer: input.targetCustomer,
    problem: input.problem,
    proposedOffer: input.proposedOffer,
    estimatedRevenuePotentialCents: input.estimatedRevenuePotentialCents,
    estimatedTotalBudgetCents: input.estimatedTotalBudgetCents,
    speedToFirstDollarDays: input.speedToFirstDollarDays,
    businessObjectives: [...input.businessObjectives],
    workItems: [...input.workItems],
    kpis: [...input.kpis],
    approvalGates: [...input.approvalGates],
    autonomyBoundary: {
      maxBudgetCents: input.autonomyBoundary.maxBudgetCents,
      allowedActions: [...input.autonomyBoundary.allowedActions],
      forbiddenActions: [...input.autonomyBoundary.forbiddenActions],
      requiresHumanApprovalAboveCents: input.autonomyBoundary.requiresHumanApprovalAboveCents,
      maxParallelAgents: input.autonomyBoundary.maxParallelAgents,
    },
    riskFactors: [...input.riskFactors],
    killCriteria: [...input.killCriteria],
    rationale: input.rationale,
    evidence: [...input.evidence],
    nextRecommendedAction: input.nextRecommendedAction,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    humanOnTheLoop: true,
    approvalRequired: true,
    noExecutionAuthorized: true,
  };
}

// ---------------------------------------------------------------------------
// SECTION I — fromOpportunityBriefToWorkstream
// ---------------------------------------------------------------------------

export type FromOpportunityBriefInput = {
  workstreamId: string;
  agentId: string;
  createdAt: string;
  updatedAt: string;
  briefId: string;
  title: string;
  targetCustomer: string;
  problem: string;
  proposedOffer: string;
  estimatedRevenuePotentialCents: number;
  estimatedTotalBudgetCents: number;
  speedToFirstDollarDays: number;
  rationale: string;
  evidence: string[];
  riskFactors: string[];
};

export function fromOpportunityBriefToWorkstream(
  input: FromOpportunityBriefInput,
): AgentVentureWorkstream {
  return {
    workstreamId: input.workstreamId,
    briefId: input.briefId,
    ventureId: null,
    agentId: input.agentId,
    title: input.title,
    stage: 'discovery',
    status: 'draft',
    targetCustomer: input.targetCustomer,
    problem: input.problem,
    proposedOffer: input.proposedOffer,
    estimatedRevenuePotentialCents: input.estimatedRevenuePotentialCents,
    estimatedTotalBudgetCents: input.estimatedTotalBudgetCents,
    speedToFirstDollarDays: input.speedToFirstDollarDays,
    businessObjectives: [],
    workItems: [],
    kpis: [],
    approvalGates: [],
    autonomyBoundary: {
      maxBudgetCents: 0,
      allowedActions: [],
      forbiddenActions: [],
      requiresHumanApprovalAboveCents: 0,
      maxParallelAgents: 1,
    },
    riskFactors: [...input.riskFactors],
    killCriteria: [],
    rationale: input.rationale,
    evidence: [...input.evidence],
    nextRecommendedAction:
      'Define business objectives and initial work items for discovery stage',
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    humanOnTheLoop: true,
    approvalRequired: true,
    noExecutionAuthorized: true,
  };
}
