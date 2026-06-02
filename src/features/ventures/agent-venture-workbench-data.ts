// src/features/ventures/agent-venture-workbench-data.ts
//
// Pure TypeScript seed data for the agent venture workbench UI.
// Dependency-free — no Supabase, no database, no network, no UI components,
// no auto-approval, no execution authorization, no save/persist functions.
//
// Humans remain on the loop at every step.

// ---------------------------------------------------------------------------
// SECTION A — Imports
// ---------------------------------------------------------------------------

import {
  type AgentOpportunityBrief,
  type AgentOpportunityBriefScore,
  scoreAgentOpportunityBrief,
  validateAgentOpportunityBrief,
} from './agent-opportunity-brief';

import {
  type AgentVentureWorkstream,
  type AgentVentureWorkstreamReadinessScore,
  scoreAgentVentureWorkstreamReadiness,
  validateAgentVentureWorkstream,
  fromOpportunityBriefToWorkstream,
} from './agent-venture-workstream';

// ---------------------------------------------------------------------------
// SECTION B — AgentVentureWorkbenchItem type
// ---------------------------------------------------------------------------

export type AgentVentureWorkbenchItem = {
  id: string;
  brief: AgentOpportunityBrief;
  workstream: AgentVentureWorkstream;
  briefScore: AgentOpportunityBriefScore;
  workstreamReadiness: AgentVentureWorkstreamReadinessScore;
  briefValid: boolean;
  briefErrors: string[];
  workstreamValid: boolean;
  workstreamErrors: string[];
};

// ---------------------------------------------------------------------------
// SECTION C — buildAgentVentureWorkbenchItem
// ---------------------------------------------------------------------------

export function buildAgentVentureWorkbenchItem(input: {
  id: string;
  brief: AgentOpportunityBrief;
  workstream: AgentVentureWorkstream;
}): AgentVentureWorkbenchItem {
  const briefScore = scoreAgentOpportunityBrief(input.brief);
  const workstreamReadiness = scoreAgentVentureWorkstreamReadiness(input.workstream);
  const bv = validateAgentOpportunityBrief(input.brief);
  const wv = validateAgentVentureWorkstream(input.workstream);

  return {
    id: input.id,
    brief: input.brief,
    workstream: input.workstream,
    briefScore,
    workstreamReadiness,
    briefValid: bv.valid,
    briefErrors: bv.errors,
    workstreamValid: wv.valid,
    workstreamErrors: wv.errors,
  };
}

// ---------------------------------------------------------------------------
// SECTION D — Deterministic sample data
// ---------------------------------------------------------------------------

const SAMPLE_BRIEF: AgentOpportunityBrief = {
  briefId: 'brief-wb-001',
  agentId: 'agent-finance-001',
  source: 'agent_generated',
  title: 'AI Bookkeeping Assistant for Solo Founders',
  targetCustomer: 'Solo founders and freelancers who hate bookkeeping',
  problem: 'Solo founders lose 4-6 hours per week on bookkeeping, invoicing, and tax prep',
  proposedOffer:
    'Automated bookkeeping assistant that categorizes expenses, generates invoices, and prepares quarterly tax summaries',
  revenueModel: 'subscription',
  estimatedRevenuePotentialCents: 60_000_000,
  estimatedValidationCostCents: 300_000,
  speedToFirstDollarDays: 21,
  automationPotentialScore: 82,
  confidenceScore: 71,
  risk: {
    riskLevel: 'medium',
    riskFactors: [
      'existing competitors like QuickBooks',
      'trust barrier for financial data',
    ],
    mitigationNotes: [
      'focus on solo segment ignored by big players',
      'end-to-end encryption, local-first option',
    ],
  },
  validationPlan: {
    hypothesis:
      'Solo founders will pay $49/mo for automated bookkeeping that saves 4+ hours/week',
    firstValidationStep: 'Post a landing page and run 5 founder discovery calls',
    validationChannel: 'Twitter/X founder communities and Indie Hackers',
    successMetric: '3 of 5 founders express willingness to pay before product exists',
    successThreshold: '60% positive response',
    validationWindowDays: 21,
    budgetCapCents: 300_000,
  },
  killCriteria: [
    {
      metric: 'discovery call interest',
      threshold: 'fewer than 2 of 5 willing to pay',
      reason: 'insufficient demand signal',
    },
  ],
  recommendedDecision: 'prepare_validation_plan',
  nextAction: {
    actionLabel: 'Launch discovery landing page and conduct 5 founder calls',
    rationale: 'Validate willingness to pay before any build',
    estimatedEffortHours: 12,
  },
  rationale:
    'High automation potential in an underserved segment. Existing tools serve businesses; solo founders are neglected. Validation cost is low and speed to first dollar is fast.',
  evidence: [
    'Indie Hackers survey: 67% of solo founders do bookkeeping manually',
    'Twitter search: 200+ complaints/week about bookkeeping overhead',
    'No direct competitor for the solo founder segment below $100/mo',
  ],
  createdAt: '2026-06-02T00:00:00.000Z',
  humanOnTheLoop: true,
  approvalRequired: true,
  noExecutionAuthorized: true,
};

const SAMPLE_WORKSTREAM: AgentVentureWorkstream = {
  ...fromOpportunityBriefToWorkstream({
    workstreamId: 'ws-wb-001',
    agentId: 'agent-finance-001',
    briefId: 'brief-wb-001',
    createdAt: '2026-06-02T00:00:00.000Z',
    updatedAt: '2026-06-02T00:00:00.000Z',
    title: 'AI Bookkeeping Assistant for Solo Founders',
    targetCustomer: 'Solo founders and freelancers who hate bookkeeping',
    problem: 'Solo founders lose 4-6 hours per week on bookkeeping, invoicing, and tax prep',
    proposedOffer:
      'Automated bookkeeping assistant that categorizes expenses, generates invoices, and prepares quarterly tax summaries',
    estimatedRevenuePotentialCents: 60_000_000,
    estimatedTotalBudgetCents: 300_000,
    speedToFirstDollarDays: 21,
    rationale:
      'High automation potential in an underserved segment. Existing tools serve businesses; solo founders are neglected. Validation cost is low and speed to first dollar is fast.',
    evidence: [
      'Indie Hackers survey: 67% of solo founders do bookkeeping manually',
      'Twitter search: 200+ complaints/week about bookkeeping overhead',
      'No direct competitor for the solo founder segment below $100/mo',
    ],
    riskFactors: [
      'existing competitors like QuickBooks',
      'trust barrier for financial data',
    ],
  }),
  businessObjectives: [
    {
      objectiveId: 'obj-001',
      label: 'Validate willingness to pay from 10 solo founders',
      rationale: 'Proof of demand before any build investment',
      expectedRevenueImpactCents: 60_000_000,
      timeHorizonDays: 90,
    },
  ],
  workItems: [
    {
      itemId: 'wi-001',
      title: 'Launch discovery landing page',
      description:
        'Build a simple landing page explaining the value prop and capturing emails',
      type: 'build',
      status: 'not_started',
      estimatedEffortHours: 8,
      expectedOutput: 'Landing page live with email capture',
      successCriteria: '50+ email signups in 7 days',
      requiresHumanApproval: true,
      agentId: 'agent-finance-001',
    },
    {
      itemId: 'wi-002',
      title: 'Conduct 5 founder discovery calls',
      description:
        'Talk to 5 solo founders about their bookkeeping pain and willingness to pay',
      type: 'research',
      status: 'not_started',
      estimatedEffortHours: 10,
      expectedOutput: 'Call summaries with pay/no-pay signals',
      successCriteria: '3+ express willingness to pay $49/mo',
      requiresHumanApproval: false,
      agentId: null,
    },
    {
      itemId: 'wi-003',
      title: 'CEO review: proceed to prototype?',
      description: 'Review validation results and decide whether to build MVP',
      type: 'decision_point',
      status: 'not_started',
      estimatedEffortHours: 1,
      expectedOutput: 'Go/no-go decision with rationale',
      successCriteria: 'Written decision by CEO',
      requiresHumanApproval: true,
      agentId: null,
    },
  ],
  kpis: [
    {
      kpiId: 'kpi-001',
      label: 'Discovery calls completed',
      description: 'Number of founder calls completed',
      targetValue: '5',
      currentValue: '0',
      unit: 'calls',
      isCritical: true,
    },
    {
      kpiId: 'kpi-002',
      label: 'Willingness to pay signals',
      description: 'Founders who said yes to $49/mo',
      targetValue: '3',
      currentValue: '0',
      unit: 'founders',
      isCritical: true,
    },
    {
      kpiId: 'kpi-003',
      label: 'Landing page emails',
      description: 'Email signups on discovery landing page',
      targetValue: '50',
      currentValue: '0',
      unit: 'emails',
      isCritical: false,
    },
  ],
  approvalGates: [
    {
      gateId: 'gate-001',
      label: 'CEO validation review',
      description: 'CEO reviews discovery results and approves next stage',
      stage: 'validation',
      requiredBefore: 'Any prototype or code investment',
      approvalCriteria: [
        'At least 3 willingness-to-pay signals',
        'Written call summaries available',
        'CEO signs off',
      ],
      humanReviewRequired: true,
      ledgerEntryRequired: true,
    },
  ],
  killCriteria: ['Fewer than 2 of 5 founders willing to pay $49/mo'],
  nextRecommendedAction:
    'Launch discovery landing page and schedule 5 founder calls',
};

// ---------------------------------------------------------------------------
// SECTION E — Exported seed items
// ---------------------------------------------------------------------------

export const AGENT_VENTURE_WORKBENCH_SEED: AgentVentureWorkbenchItem =
  buildAgentVentureWorkbenchItem({
    id: 'wb-001',
    brief: SAMPLE_BRIEF,
    workstream: SAMPLE_WORKSTREAM,
  });

export const AGENT_VENTURE_WORKBENCH_ITEMS: AgentVentureWorkbenchItem[] = [
  AGENT_VENTURE_WORKBENCH_SEED,
];
