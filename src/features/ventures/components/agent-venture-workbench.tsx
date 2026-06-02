"use client";

// src/features/ventures/components/agent-venture-workbench.tsx
//
// Read-only display component for agent venture workbench items.
// No server actions, no fetch, no Supabase, no onClick handlers
// that mutate state (only local accordion open/close).
// Disabled affordances for future features are non-functional.

import { useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  Clock,
  FileText,
  Gauge,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Target,
  Users,
  Zap,
} from "lucide-react";
import type { AgentVentureWorkbenchItem } from "../agent-venture-workbench-data";

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatCents(cents: number): string {
  const dollars = Math.round(cents / 100);
  return `$${dollars.toLocaleString("en-US")}`;
}

// ---------------------------------------------------------------------------
// Badge / chip helpers
// ---------------------------------------------------------------------------

const RISK_BADGE: Record<string, string> = {
  low: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
  medium: "border-amber-500/20 bg-amber-500/10 text-amber-300",
  high: "border-orange-500/20 bg-orange-500/10 text-orange-300",
  critical: "border-red-500/20 bg-red-500/10 text-red-300",
};

const STAGE_BADGE: Record<string, string> = {
  discovery: "border-sky-500/20 bg-sky-500/10 text-sky-300",
  validation: "border-violet-500/20 bg-violet-500/10 text-violet-300",
  build: "border-amber-500/20 bg-amber-500/10 text-amber-300",
  launch: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
  growth: "border-teal-500/20 bg-teal-500/10 text-teal-300",
  optimization: "border-cyan-500/20 bg-cyan-500/10 text-cyan-300",
};

const STATUS_BADGE: Record<string, string> = {
  draft: "border-neutral-700 bg-neutral-900 text-neutral-400",
  pending_ceo_review: "border-amber-500/20 bg-amber-500/10 text-amber-300",
  approved_for_planning: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
  active: "border-sky-500/20 bg-sky-500/10 text-sky-300",
  paused: "border-amber-500/20 bg-amber-500/10 text-amber-300",
  completed: "border-teal-500/20 bg-teal-500/10 text-teal-300",
  abandoned: "border-neutral-700 bg-neutral-900 text-neutral-500",
};

const WORK_ITEM_STATUS_BADGE: Record<string, string> = {
  not_started: "border-neutral-700 bg-neutral-900 text-neutral-400",
  in_progress: "border-sky-500/20 bg-sky-500/10 text-sky-300",
  blocked: "border-red-500/20 bg-red-500/10 text-red-300",
  completed: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
  skipped: "border-neutral-700 bg-neutral-900 text-neutral-500",
};

const WORK_ITEM_TYPE_BADGE: Record<string, string> = {
  research: "border-sky-500/20 bg-sky-500/10 text-sky-300",
  validation: "border-violet-500/20 bg-violet-500/10 text-violet-300",
  build: "border-amber-500/20 bg-amber-500/10 text-amber-300",
  outreach: "border-teal-500/20 bg-teal-500/10 text-teal-300",
  analysis: "border-cyan-500/20 bg-cyan-500/10 text-cyan-300",
  synthesis: "border-indigo-500/20 bg-indigo-500/10 text-indigo-300",
  decision_point: "border-orange-500/20 bg-orange-500/10 text-orange-300",
  review: "border-neutral-700 bg-neutral-900 text-neutral-300",
  launch: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
  optimization: "border-purple-500/20 bg-purple-500/10 text-purple-300",
};

const DECISION_LABEL: Record<string, string> = {
  save_as_candidate: "Save as Candidate",
  needs_more_research: "Needs More Research",
  reject_opportunity: "Reject",
  prepare_validation_plan: "Prepare Validation Plan",
  request_ceo_review: "Request CEO Review",
};

const DECISION_BADGE: Record<string, string> = {
  save_as_candidate: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
  needs_more_research: "border-amber-500/20 bg-amber-500/10 text-amber-300",
  reject_opportunity: "border-red-500/20 bg-red-500/10 text-red-300",
  prepare_validation_plan: "border-violet-500/20 bg-violet-500/10 text-violet-300",
  request_ceo_review: "border-sky-500/20 bg-sky-500/10 text-sky-300",
};

// ---------------------------------------------------------------------------
// Section wrapper
// ---------------------------------------------------------------------------

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="text-neutral-500">{icon}</span>
        <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
          {title}
        </h3>
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Field row helper
// ---------------------------------------------------------------------------

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
        {label}
      </span>
      <span className="text-sm leading-6 text-neutral-300">{children}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline badge helper
// ---------------------------------------------------------------------------

function Chip({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${className}`}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Accordion work item card
// ---------------------------------------------------------------------------

function WorkItemCard({ item }: { item: AgentVentureWorkbenchItem["workstream"]["workItems"][0] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Chip className={WORK_ITEM_TYPE_BADGE[item.type] ?? "border-neutral-700 bg-neutral-900 text-neutral-400"}>
              {item.type.replace(/_/g, " ")}
            </Chip>
            <Chip className={WORK_ITEM_STATUS_BADGE[item.status] ?? "border-neutral-700 bg-neutral-900 text-neutral-400"}>
              {item.status.replace(/_/g, " ")}
            </Chip>
            {item.requiresHumanApproval && (
              <Chip className="border-amber-500/20 bg-amber-500/10 text-amber-300">
                <ShieldAlert className="h-3 w-3" aria-hidden="true" />
                Requires human approval
              </Chip>
            )}
          </div>
          <span className="text-sm font-medium leading-5 text-white">{item.title}</span>
        </div>
        <span className="mt-1 shrink-0 text-neutral-500">
          {open ? (
            <ChevronUp className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          )}
        </span>
      </button>

      {open && (
        <div className="border-t border-neutral-800 px-4 pb-4 pt-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Description">{item.description}</Field>
            <Field label="Expected output">{item.expectedOutput}</Field>
            <Field label="Success criteria">{item.successCriteria}</Field>
            <Field label="Effort">
              {item.estimatedEffortHours}h estimated
            </Field>
            {item.agentId && (
              <Field label="Agent">{item.agentId}</Field>
            )}
          </div>
          <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/8 px-3 py-2 text-xs text-red-300">
            <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            No execution authorized — this item is prepared for CEO review only.
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AgentVentureWorkbench({ items }: { items: AgentVentureWorkbenchItem[] }) {
  if (items.length === 0) {
    return (
      <div className="flex min-h-32 items-center justify-center rounded-2xl border border-dashed border-neutral-800 bg-neutral-950/40 px-6 py-10 text-center">
        <p className="text-sm text-neutral-500">No workbench items to display.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {/* ------------------------------------------------------------------ */}
      {/* A. SAFETY BANNER                                                     */}
      {/* ------------------------------------------------------------------ */}
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/8 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" aria-hidden="true" />
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold leading-6 text-amber-200">
              This workbench prepares venture work. It does not save candidates, approve work,
              execute agents, spend money, send messages, publish, or write to external systems.
            </p>
            <p className="text-xs leading-5 text-amber-300/80">
              Agent workstreams prepare work for CEO review. Runtime execution remains blocked until
              future approval, ledger, and bounded execution controls exist.
            </p>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Per-item panels                                                      */}
      {/* ------------------------------------------------------------------ */}
      {items.map((item) => (
        <div key={item.id} className="flex flex-col gap-4">
          {/* ---------------------------------------------------------------- */}
          {/* B. OPPORTUNITY SECTION                                            */}
          {/* ---------------------------------------------------------------- */}
          <Section title="Opportunity Brief" icon={<FileText className="h-4 w-4" />}>
            <div className="flex flex-col gap-4">
              {/* Title + source badge */}
              <div className="flex flex-wrap items-start gap-3">
                <h4 className="text-xl font-semibold leading-snug text-white">{item.brief.title}</h4>
                <Chip className="border-sky-500/20 bg-sky-500/10 text-sky-300">
                  {item.brief.source.replace(/_/g, " ")}
                </Chip>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex items-start gap-2">
                  <Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-500" aria-hidden="true" />
                  <Field label="Target customer">{item.brief.targetCustomer}</Field>
                </div>
                <div className="flex items-start gap-2">
                  <Target className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-500" aria-hidden="true" />
                  <Field label="Problem">
                    <span className="italic text-neutral-400">{item.brief.problem}</span>
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="Proposed offer">{item.brief.proposedOffer}</Field>
                </div>
                <Field label="Revenue model">{item.brief.revenueModel.replace(/_/g, " ")}</Field>
                <div className="flex items-start gap-2">
                  <CircleDollarSign className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-500" aria-hidden="true" />
                  <Field label="Estimated revenue">
                    {formatCents(item.brief.estimatedRevenuePotentialCents)}/yr potential
                  </Field>
                </div>
                <Field label="Validation cost">
                  {formatCents(item.brief.estimatedValidationCostCents)} to validate
                </Field>
                <div className="flex items-start gap-2">
                  <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-500" aria-hidden="true" />
                  <Field label="Speed to first dollar">
                    {item.brief.speedToFirstDollarDays} days to first dollar
                  </Field>
                </div>
                <div className="flex items-start gap-2">
                  <Gauge className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-500" aria-hidden="true" />
                  <Field label="Confidence">{item.brief.confidenceScore}% confidence</Field>
                </div>

                {/* Risk level */}
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                    Risk level
                  </span>
                  <Chip className={RISK_BADGE[item.brief.risk.riskLevel] ?? "border-neutral-700 bg-neutral-900 text-neutral-400"}>
                    {item.brief.risk.riskLevel}
                  </Chip>
                </div>

                {/* Recommended decision */}
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                    Recommended decision
                  </span>
                  <Chip className={DECISION_BADGE[item.brief.recommendedDecision] ?? "border-neutral-700 bg-neutral-900 text-neutral-400"}>
                    {DECISION_LABEL[item.brief.recommendedDecision] ?? item.brief.recommendedDecision}
                  </Chip>
                </div>
              </div>

              {/* Evidence */}
              {item.brief.evidence.length > 0 && (
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                    Evidence
                  </span>
                  {item.brief.evidence.length <= 3 ? (
                    <ul className="mt-1 space-y-1">
                      {item.brief.evidence.map((e, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-neutral-300">
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden="true" />
                          {e}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-sm text-neutral-400">
                      {item.brief.evidence.length} evidence items on file.
                    </p>
                  )}
                </div>
              )}

              {/* Next action */}
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                  Next action
                </span>
                <p className="mt-1 text-sm font-medium text-white">{item.brief.nextAction.actionLabel}</p>
                <p className="mt-1 text-xs leading-5 text-neutral-400">{item.brief.nextAction.rationale}</p>
              </div>

              {/* Brief score */}
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 px-4 py-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                  Brief score
                </span>
                <div className="mt-2 flex flex-wrap gap-4 text-xs text-neutral-400">
                  <span className="flex items-center gap-1.5">
                    <Gauge className="h-3.5 w-3.5 text-neutral-500" aria-hidden="true" />
                    <span className="font-semibold uppercase tracking-[0.12em] text-neutral-500">Overall</span>
                    <span className="tabular-nums text-white">{item.briefScore.overallScore}/100</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <CircleDollarSign className="h-3.5 w-3.5 text-neutral-500" aria-hidden="true" />
                    <span className="font-semibold uppercase tracking-[0.12em] text-neutral-500">Revenue</span>
                    <span className="tabular-nums text-white">{item.briefScore.revenuePotentialScore}/100</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5 text-neutral-500" aria-hidden="true" />
                    <span className="font-semibold uppercase tracking-[0.12em] text-neutral-500">Speed</span>
                    <span className="tabular-nums text-white">{item.briefScore.speedScore}/100</span>
                  </span>
                  <Chip className={DECISION_BADGE[item.briefScore.recommendation] ?? "border-neutral-700 bg-neutral-900 text-neutral-400"}>
                    {DECISION_LABEL[item.briefScore.recommendation] ?? item.briefScore.recommendation}
                  </Chip>
                </div>
              </div>
            </div>
          </Section>

          {/* ---------------------------------------------------------------- */}
          {/* C. WORKSTREAM SECTION                                             */}
          {/* ---------------------------------------------------------------- */}
          <Section title="Venture Workstream" icon={<BarChart3 className="h-4 w-4" />}>
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <Chip className={STAGE_BADGE[item.workstream.stage] ?? "border-neutral-700 bg-neutral-900 text-neutral-400"}>
                  Stage: {item.workstream.stage}
                </Chip>
                <Chip className={STATUS_BADGE[item.workstream.status] ?? "border-neutral-700 bg-neutral-900 text-neutral-400"}>
                  {item.workstream.status.replace(/_/g, " ")}
                </Chip>
              </div>

              <Field label="Next recommended action">{item.workstream.nextRecommendedAction}</Field>

              {/* Readiness score */}
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-xs text-neutral-400">
                    <Gauge className="h-3.5 w-3.5 text-neutral-500" aria-hidden="true" />
                    <span className="font-semibold uppercase tracking-[0.12em] text-neutral-500">
                      Readiness
                    </span>
                    <span className="tabular-nums text-lg font-bold text-white">
                      {item.workstreamReadiness.overallReadinessScore}
                      <span className="text-xs font-normal text-neutral-500">/100</span>
                    </span>
                  </span>
                  {item.workstreamReadiness.isReadyForCEOReview ? (
                    <Chip className="border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
                      <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                      Ready for CEO review
                    </Chip>
                  ) : (
                    <Chip className="border-amber-500/20 bg-amber-500/10 text-amber-300">
                      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                      Not yet ready for CEO review
                    </Chip>
                  )}
                </div>
                {/* Progress bar */}
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
                  <div
                    className="h-full rounded-full bg-amber-500"
                    style={{ width: `${item.workstreamReadiness.overallReadinessScore}%` }}
                    aria-label={`${item.workstreamReadiness.overallReadinessScore}% readiness`}
                  />
                </div>
              </div>

              {/* Blockers */}
              {item.workstreamReadiness.blockers.length > 0 && (
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                    Blockers
                  </span>
                  <ul className="mt-1 space-y-1">
                    {item.workstreamReadiness.blockers.map((b, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-red-300">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" aria-hidden="true" />
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Section>

          {/* ---------------------------------------------------------------- */}
          {/* D. WORK ITEMS SECTION                                             */}
          {/* ---------------------------------------------------------------- */}
          {item.workstream.workItems.length > 0 && (
            <Section title="Agent Work Items" icon={<Target className="h-4 w-4" />}>
              <div className="flex flex-col gap-3">
                {item.workstream.workItems.map((wi) => (
                  <WorkItemCard key={wi.itemId} item={wi} />
                ))}
              </div>
            </Section>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* E. KPIs SECTION                                                   */}
          {/* ---------------------------------------------------------------- */}
          {item.workstream.kpis.length > 0 && (
            <Section title="KPIs" icon={<BarChart3 className="h-4 w-4" />}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {item.workstream.kpis.map((kpi) => (
                  <div
                    key={kpi.kpiId}
                    className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className={`text-sm leading-5 ${kpi.isCritical ? "font-bold text-white" : "font-medium text-neutral-200"}`}
                      >
                        {kpi.label}
                      </span>
                      {kpi.isCritical && (
                        <Chip className="border-amber-500/20 bg-amber-500/10 text-amber-300">
                          Critical
                        </Chip>
                      )}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-neutral-400">{kpi.description}</p>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-neutral-400">
                      <span>
                        <span className="text-neutral-500">Target: </span>
                        <span className="tabular-nums text-white">{kpi.targetValue} {kpi.unit}</span>
                      </span>
                      {kpi.currentValue !== null && (
                        <span>
                          <span className="text-neutral-500">Current: </span>
                          <span className="tabular-nums text-white">{kpi.currentValue} {kpi.unit}</span>
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* F. APPROVAL GATES SECTION                                         */}
          {/* ---------------------------------------------------------------- */}
          {item.workstream.approvalGates.length > 0 && (
            <Section title="Approval Gates" icon={<ShieldCheck className="h-4 w-4" />}>
              <div className="flex flex-col gap-3">
                {item.workstream.approvalGates.map((gate) => (
                  <div
                    key={gate.gateId}
                    className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4"
                  >
                    <div className="flex flex-wrap items-start gap-2">
                      <span className="text-sm font-semibold text-white">{gate.label}</span>
                      <Chip className={STAGE_BADGE[gate.stage] ?? "border-neutral-700 bg-neutral-900 text-neutral-400"}>
                        {gate.stage}
                      </Chip>
                      <Chip className="border-amber-500/20 bg-amber-500/10 text-amber-300">
                        <ShieldAlert className="h-3 w-3" aria-hidden="true" />
                        Human review required
                      </Chip>
                      <Chip className="border-violet-500/20 bg-violet-500/10 text-violet-300">
                        <BadgeCheck className="h-3 w-3" aria-hidden="true" />
                        Ledger entry required
                      </Chip>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-neutral-400">{gate.description}</p>
                    <p className="mt-1 text-xs text-neutral-500">
                      <span className="font-semibold text-neutral-400">Required before: </span>
                      {gate.requiredBefore}
                    </p>
                    {gate.approvalCriteria.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {gate.approvalCriteria.map((criterion, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-neutral-300">
                            <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" aria-hidden="true" />
                            {criterion}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* G. FUTURE ACTIONS SECTION (DISABLED ONLY)                         */}
          {/* ---------------------------------------------------------------- */}
          <Section title="Future Actions" icon={<Lock className="h-4 w-4" />}>
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm font-medium text-neutral-500 opacity-50"
                >
                  <Lock className="h-4 w-4" aria-hidden="true" />
                  Save as Candidate
                  <span className="text-[11px] text-neutral-600">(Future feature)</span>
                </button>
                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm font-medium text-neutral-500 opacity-50"
                >
                  <Lock className="h-4 w-4" aria-hidden="true" />
                  Submit for CEO Review
                  <span className="text-[11px] text-neutral-600">(Future feature)</span>
                </button>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/8 px-3 py-2 text-xs text-red-400">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Execute Workstream — not available. Runtime blocked.
              </div>
            </div>
          </Section>
        </div>
      ))}
    </div>
  );
}
