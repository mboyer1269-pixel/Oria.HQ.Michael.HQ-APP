"use client";

import { useState } from "react";
import { AlertCircle, BarChart2, CheckCircle, RefreshCw, Zap } from "lucide-react";
import {
  type AgentOpportunityBriefScore,
  type AgentOpportunityDecisionRecommendation,
  type AgentOpportunityRiskLevel,
  type AgentOpportunityRevenueModel,
  type AgentOpportunitySource,
  AGENT_OPPORTUNITY_REVENUE_MODELS,
  AGENT_OPPORTUNITY_RISK_LEVELS,
  AGENT_OPPORTUNITY_SOURCES,
  scoreAgentOpportunityBrief,
  validateAgentOpportunityBrief,
} from "../agent-opportunity-brief";
import {
  buildAgentVentureWorkbenchItem,
  type AgentVentureWorkbenchItem,
} from "../agent-venture-workbench-data";
import { fromOpportunityBriefToWorkstream } from "../agent-venture-workstream";

// ---------------------------------------------------------------------------
// Styling constants — match venture-intake-form.tsx
// ---------------------------------------------------------------------------

const inputClass =
  "w-full rounded-lg border border-neutral-800 bg-neutral-900/70 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-amber-500/50 focus:outline-none";
const labelClass =
  "text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500";
const sectionTitleClass =
  "text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500 mb-3";

// ---------------------------------------------------------------------------
// Form draft state
// ---------------------------------------------------------------------------

type FormDraft = {
  title: string;
  targetCustomer: string;
  problem: string;
  proposedOffer: string;
  rationale: string;
  evidenceText: string;
  source: AgentOpportunitySource;
  revenueModel: AgentOpportunityRevenueModel;
  riskLevel: AgentOpportunityRiskLevel;
  revenueUSD: string;
  validationCostUSD: string;
  speedDays: string;
  automationScore: string;
  confidenceScore: string;
};

const EMPTY_DRAFT: FormDraft = {
  title: "",
  targetCustomer: "",
  problem: "",
  proposedOffer: "",
  rationale: "",
  evidenceText: "",
  source: "agent_generated",
  revenueModel: "subscription",
  riskLevel: "medium",
  revenueUSD: "",
  validationCostUSD: "",
  speedDays: "",
  automationScore: "",
  confidenceScore: "",
};

// ---------------------------------------------------------------------------
// Recommendation badge
// ---------------------------------------------------------------------------

const RECOMMENDATION_STYLES: Record<
  AgentOpportunityDecisionRecommendation,
  { label: string; className: string }
> = {
  save_as_candidate: {
    label: "Save as candidate",
    className:
      "border border-green-500/30 bg-green-500/10 text-green-300",
  },
  needs_more_research: {
    label: "Needs more research",
    className:
      "border border-amber-500/30 bg-amber-500/10 text-amber-300",
  },
  reject_opportunity: {
    label: "Reject opportunity",
    className:
      "border border-red-500/30 bg-red-500/10 text-red-300",
  },
  prepare_validation_plan: {
    label: "Prepare validation plan",
    className:
      "border border-blue-500/30 bg-blue-500/10 text-blue-300",
  },
  request_ceo_review: {
    label: "Request CEO review",
    className:
      "border border-purple-500/30 bg-purple-500/10 text-purple-300",
  },
};

function RecommendationBadge({
  recommendation,
}: {
  recommendation: AgentOpportunityDecisionRecommendation;
}) {
  const style = RECOMMENDATION_STYLES[recommendation];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${style.className}`}
    >
      {style.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Source label helpers
// ---------------------------------------------------------------------------

function sourceLabelFor(s: AgentOpportunitySource): string {
  const MAP: Record<AgentOpportunitySource, string> = {
    agent_generated: "Agent Generated",
    research_observed: "Research Observed",
    customer_signal: "Customer Signal",
    competitor_gap: "Competitor Gap",
    internal_efficiency: "Internal Efficiency",
    market_trend: "Market Trend",
    manual_seed: "Manual Seed",
  };
  return MAP[s];
}

function revenueModelLabelFor(m: AgentOpportunityRevenueModel): string {
  const MAP: Record<AgentOpportunityRevenueModel, string> = {
    one_time_sale: "One-time Sale",
    subscription: "Subscription",
    retainer: "Retainer",
    usage_based: "Usage-based",
    affiliate: "Affiliate",
    marketplace: "Marketplace",
    service: "Service",
    unknown: "Unknown",
  };
  return MAP[m];
}

function riskLabelFor(r: AgentOpportunityRiskLevel): string {
  const MAP: Record<AgentOpportunityRiskLevel, string> = {
    low: "Low",
    medium: "Medium",
    high: "High",
    critical: "Critical",
  };
  return MAP[r];
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AgentOpportunityBriefForm({
  onBriefChange,
}: {
  onBriefChange: (item: AgentVentureWorkbenchItem | null) => void;
}) {
  const [draft, setDraft] = useState<FormDraft>(EMPTY_DRAFT);
  const [currentScore, setCurrentScore] =
    useState<AgentOpportunityBriefScore | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  function update<K extends keyof FormDraft>(key: K, value: FormDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function handleAnalyse() {
    // 1. Parse numerics
    const parsedRevenueUSD = parseFloat(draft.revenueUSD);
    const parsedValidationCostUSD = parseFloat(draft.validationCostUSD);
    const parsedSpeedDays = parseInt(draft.speedDays, 10);
    const parsedAutomation = parseInt(draft.automationScore, 10);
    const parsedConfidence = parseInt(draft.confidenceScore, 10);

    const revenueCents = Number.isFinite(parsedRevenueUSD)
      ? Math.max(0, Math.round(parsedRevenueUSD * 100))
      : 0;
    const validationCostCents = Number.isFinite(parsedValidationCostUSD)
      ? Math.max(0, Math.round(parsedValidationCostUSD * 100))
      : 0;
    const speedDays = Number.isFinite(parsedSpeedDays) ? Math.max(0, parsedSpeedDays) : 0;
    const automationPct = Number.isFinite(parsedAutomation)
      ? Math.min(100, Math.max(0, parsedAutomation))
      : 0;
    const confidencePct = Number.isFinite(parsedConfidence)
      ? Math.min(100, Math.max(0, parsedConfidence))
      : 0;

    // 2. Parse evidence lines
    const evidence = draft.evidenceText
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    // 3. Build brief with placeholder recommendedDecision
    const briefBase = {
      briefId: "draft-brief",
      agentId: "agent-draft",
      source: draft.source,
      title: draft.title,
      targetCustomer: draft.targetCustomer,
      problem: draft.problem,
      proposedOffer: draft.proposedOffer,
      revenueModel: draft.revenueModel,
      estimatedRevenuePotentialCents: revenueCents,
      estimatedValidationCostCents: validationCostCents,
      speedToFirstDollarDays: speedDays,
      automationPotentialScore: automationPct,
      confidenceScore: confidencePct,
      risk: {
        riskLevel: draft.riskLevel,
        riskFactors: ["To be defined"],
        mitigationNotes: [] as string[],
      },
      validationPlan: {
        hypothesis: draft.rationale || "TBD",
        firstValidationStep: "TBD",
        validationChannel: "TBD",
        successMetric: "TBD",
        successThreshold: "TBD",
        validationWindowDays: 30,
        budgetCapCents: validationCostCents,
      },
      killCriteria: [
        {
          metric: "customer interest",
          threshold: "fewer than 2 of 5 willing to pay",
          reason: "insufficient demand signal",
        },
      ],
      nextAction: {
        actionLabel: "Define first validation step",
        rationale: draft.rationale || "TBD",
        estimatedEffortHours: 8,
      },
      recommendedDecision:
        "prepare_validation_plan" as AgentOpportunityDecisionRecommendation,
      humanOnTheLoop: true as const,
      approvalRequired: true as const,
      noExecutionAuthorized: true as const,
      rationale: draft.rationale,
      evidence,
      createdAt: "2026-06-02T00:00:00.000Z",
    };

    // 4. Validate
    const validation = validateAgentOpportunityBrief(briefBase);
    setValidationErrors(validation.errors);

    // 5. Score
    const score = scoreAgentOpportunityBrief(briefBase);
    setCurrentScore(score);

    // 6. Rebuild brief with real recommendation from score
    const finalBrief = {
      ...briefBase,
      recommendedDecision: score.recommendation,
    };

    // 7. Seed workstream from brief
    const baseWorkstream = fromOpportunityBriefToWorkstream({
      workstreamId: "ws-draft",
      agentId: "agent-draft",
      briefId: "draft-brief",
      createdAt: "2026-06-02T00:00:00.000Z",
      updatedAt: "2026-06-02T00:00:00.000Z",
      title: draft.title || "Draft opportunity",
      targetCustomer: draft.targetCustomer,
      problem: draft.problem,
      proposedOffer: draft.proposedOffer,
      estimatedRevenuePotentialCents: revenueCents,
      estimatedTotalBudgetCents: validationCostCents,
      speedToFirstDollarDays: speedDays,
      rationale: draft.rationale || "TBD",
      evidence,
      riskFactors: ["To be defined"],
    });

    // Enrich workstream with minimal required items
    const enrichedWorkstream = {
      ...baseWorkstream,
      businessObjectives: [
        {
          objectiveId: "obj-draft-001",
          label: draft.title
            ? `Validate ${draft.title}`
            : "Validate opportunity",
          rationale: draft.rationale || "TBD",
          expectedRevenueImpactCents: revenueCents,
          timeHorizonDays: 90,
        },
      ],
      workItems: [
        {
          itemId: "wi-draft-001",
          title: "First validation research step",
          description: draft.problem
            ? `Research and validate: ${draft.problem}`
            : "Conduct initial research to validate the opportunity",
          type: "research" as const,
          status: "not_started" as const,
          estimatedEffortHours: 8,
          expectedOutput: "Research summary with demand signals",
          successCriteria: "At least 2 customer signals identified",
          requiresHumanApproval: true,
          agentId: null,
        },
      ],
      kpis: [
        {
          kpiId: "kpi-draft-001",
          label: "Validation signals",
          description: "Number of positive validation signals collected",
          targetValue: "3",
          currentValue: null,
          unit: "signals",
          isCritical: true,
        },
      ],
      approvalGates: [
        {
          gateId: "gate-draft-001",
          label: "CEO validation review",
          description: "Required before proceeding to build",
          stage: "validation" as const,
          requiredBefore: "any build",
          approvalCriteria: ["CEO reviews evidence"],
          humanReviewRequired: true as const,
          ledgerEntryRequired: true as const,
        },
      ],
      killCriteria: [
        "Fewer than 2 of 5 prospects willing to pay",
      ],
      nextRecommendedAction: score.recommendation,
    };

    // 8. Build workbench item
    const item = buildAgentVentureWorkbenchItem({
      id: "draft-wb",
      brief: finalBrief,
      workstream: enrichedWorkstream,
    });

    onBriefChange(item);
  }

  function handleClear() {
    setDraft(EMPTY_DRAFT);
    setCurrentScore(null);
    setValidationErrors([]);
    onBriefChange(null);
  }

  return (
    <div className="flex flex-col gap-5 rounded-3xl border border-neutral-800 bg-neutral-950/80 p-5">
      {/* Section: Opportunity */}
      <section className="flex flex-col gap-3">
        <h3 className={sectionTitleClass}>Opportunity</h3>
        <div className="grid gap-3">
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Title</span>
            <input
              className={inputClass}
              value={draft.title}
              onChange={(e) => update("title", e.target.value)}
              placeholder="Name of the opportunity"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Target Customer</span>
            <textarea
              className={`${inputClass} min-h-14 resize-y`}
              value={draft.targetCustomer}
              onChange={(e) => update("targetCustomer", e.target.value)}
              placeholder="Who is this for?"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Problem</span>
            <textarea
              className={`${inputClass} min-h-14 resize-y`}
              value={draft.problem}
              onChange={(e) => update("problem", e.target.value)}
              placeholder="What problem does this solve?"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Proposed Offer</span>
            <textarea
              className={`${inputClass} min-h-14 resize-y`}
              value={draft.proposedOffer}
              onChange={(e) => update("proposedOffer", e.target.value)}
              placeholder="What is being offered?"
            />
          </label>
        </div>
      </section>

      {/* Section: Business Model */}
      <section className="flex flex-col gap-3">
        <h3 className={sectionTitleClass}>Business Model</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Source</span>
            <select
              className={inputClass}
              value={draft.source}
              onChange={(e) =>
                update("source", e.target.value as AgentOpportunitySource)
              }
            >
              {AGENT_OPPORTUNITY_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {sourceLabelFor(s)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Revenue Model</span>
            <select
              className={inputClass}
              value={draft.revenueModel}
              onChange={(e) =>
                update(
                  "revenueModel",
                  e.target.value as AgentOpportunityRevenueModel,
                )
              }
            >
              {AGENT_OPPORTUNITY_REVENUE_MODELS.map((m) => (
                <option key={m} value={m}>
                  {revenueModelLabelFor(m)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Risk Level</span>
            <select
              className={inputClass}
              value={draft.riskLevel}
              onChange={(e) =>
                update("riskLevel", e.target.value as AgentOpportunityRiskLevel)
              }
            >
              {AGENT_OPPORTUNITY_RISK_LEVELS.map((r) => (
                <option key={r} value={r}>
                  {riskLabelFor(r)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {/* Section: Scoring Inputs */}
      <section className="flex flex-col gap-3">
        <h3 className={sectionTitleClass}>Scoring Inputs</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Revenue Potential (USD)</span>
            <input
              type="number"
              min={0}
              step="1"
              inputMode="decimal"
              className={inputClass}
              value={draft.revenueUSD}
              onChange={(e) => update("revenueUSD", e.target.value)}
              placeholder="e.g. 500000"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Validation Cost (USD)</span>
            <input
              type="number"
              min={0}
              step="1"
              inputMode="decimal"
              className={inputClass}
              value={draft.validationCostUSD}
              onChange={(e) => update("validationCostUSD", e.target.value)}
              placeholder="e.g. 1000"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Speed to First Dollar (days)</span>
            <input
              type="number"
              min={0}
              step="1"
              inputMode="numeric"
              className={inputClass}
              value={draft.speedDays}
              onChange={(e) => update("speedDays", e.target.value)}
              placeholder="e.g. 30"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Automation Score (0–100)</span>
            <input
              type="number"
              min={0}
              max={100}
              step="1"
              inputMode="numeric"
              className={inputClass}
              value={draft.automationScore}
              onChange={(e) => update("automationScore", e.target.value)}
              placeholder="e.g. 70"
            />
          </label>
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className={labelClass}>Confidence Score (0–100)</span>
            <input
              type="number"
              min={0}
              max={100}
              step="1"
              inputMode="numeric"
              className={inputClass}
              value={draft.confidenceScore}
              onChange={(e) => update("confidenceScore", e.target.value)}
              placeholder="e.g. 60"
            />
          </label>
        </div>
      </section>

      {/* Section: Context */}
      <section className="flex flex-col gap-3">
        <h3 className={sectionTitleClass}>Context</h3>
        <div className="grid gap-3">
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Rationale</span>
            <textarea
              className={`${inputClass} min-h-16 resize-y`}
              value={draft.rationale}
              onChange={(e) => update("rationale", e.target.value)}
              placeholder="Why is this worth pursuing?"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Evidence</span>
            <textarea
              className={`${inputClass} min-h-20 resize-y`}
              value={draft.evidenceText}
              onChange={(e) => update("evidenceText", e.target.value)}
              placeholder="One piece of evidence per line"
            />
          </label>
        </div>
      </section>

      {/* Score display */}
      {currentScore !== null && (
        <div className="flex flex-col gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <BarChart2 className="h-4 w-4 text-neutral-400" aria-hidden="true" />
              <span className="text-sm font-bold text-white">
                Overall score: {currentScore.overallScore}/100
              </span>
            </div>
            <RecommendationBadge recommendation={currentScore.recommendation} />
          </div>

          {/* Sub-scores */}
          <div className="flex flex-wrap gap-3 text-xs text-neutral-400">
            <span>
              Revenue:{" "}
              <span className="font-semibold text-neutral-200">
                {currentScore.revenuePotentialScore}
              </span>
            </span>
            <span>
              Speed:{" "}
              <span className="font-semibold text-neutral-200">
                {currentScore.speedScore}
              </span>
            </span>
            <span>
              Cost:{" "}
              <span className="font-semibold text-neutral-200">
                {currentScore.costScore}
              </span>
            </span>
            <span>
              Automation:{" "}
              <span className="font-semibold text-neutral-200">
                {currentScore.automationScore}
              </span>
            </span>
            <span>
              Confidence:{" "}
              <span className="font-semibold text-neutral-200">
                {currentScore.confidenceScore}
              </span>
            </span>
          </div>

          {/* Validation errors */}
          {validationErrors.length > 0 && (
            <div className="flex flex-col gap-1 rounded-xl border border-red-500/20 bg-red-500/5 p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-red-400">
                <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                Validation issues ({validationErrors.length})
              </div>
              <ul className="mt-1 flex flex-col gap-0.5">
                {validationErrors.map((err, i) => (
                  <li key={i} className="text-[11px] text-red-300">
                    {err}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {validationErrors.length === 0 && (
            <div className="flex items-center gap-1.5 text-xs text-green-400">
              <CheckCircle className="h-3.5 w-3.5" aria-hidden="true" />
              Brief passes all validation checks
            </div>
          )}
        </div>
      )}

      {/* Action row */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-800/60 pt-4">
        <p className="text-[11px] leading-5 text-neutral-600">
          This form creates a local draft only. Nothing is saved, sent, or executed.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleClear}
            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-neutral-700 px-3 text-sm font-semibold text-neutral-200 transition hover:border-neutral-500 hover:bg-neutral-900"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Clear
          </button>
          <button
            type="button"
            onClick={handleAnalyse}
            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-amber-400"
          >
            <Zap className="h-4 w-4" aria-hidden="true" />
            Analyse Opportunity
          </button>
        </div>
      </div>
    </div>
  );
}
