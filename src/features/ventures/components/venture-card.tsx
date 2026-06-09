import {
  CalendarRange,
  CircleDollarSign,
  Compass,
  Gauge,
  ShieldCheck,
  Target,
  Users,
} from "lucide-react";
import { isActiveVentureStatus, isTerminalVentureStatus } from "../lifecycle";
import type {
  VentureCard as VentureCardType,
  VentureLifecycleStatus,
  VentureScore,
} from "../types";

type StatusVisual = {
  label: string;
  badge: string;
  dot: string;
};

const STATUS_VISUALS: Record<VentureLifecycleStatus, StatusVisual> = {
  discovered: {
    label: "Découverte",
    badge: "border-neutral-700 bg-neutral-900 text-neutral-300",
    dot: "bg-neutral-500",
  },
  candidate: {
    label: "Candidat",
    badge: "border-neutral-700 bg-neutral-900 text-neutral-300",
    dot: "bg-neutral-400",
  },
  scored: {
    label: "Scoré",
    badge: "border-sky-500/20 bg-sky-500/10 text-sky-300",
    dot: "bg-sky-400",
  },
  shortlisted: {
    label: "Shortlisté",
    badge: "border-amber-500/20 bg-amber-500/10 text-amber-300",
    dot: "bg-amber-400",
  },
  approved_for_validation: {
    label: "Validation approuvée",
    badge: "border-violet-500/20 bg-violet-500/10 text-violet-300",
    dot: "bg-violet-400",
  },
  validating: {
    label: "En validation",
    badge: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
    dot: "bg-emerald-400",
  },
  operating: {
    label: "En opération",
    badge: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
    dot: "bg-emerald-400",
  },
  autonomous: {
    label: "Autonome",
    badge: "border-teal-500/20 bg-teal-500/10 text-teal-300",
    dot: "bg-teal-400",
  },
  scaling: {
    label: "Scaling",
    badge: "border-cyan-500/20 bg-cyan-500/10 text-cyan-300",
    dot: "bg-cyan-400",
  },
  paused: {
    label: "En pause",
    badge: "border-amber-500/20 bg-amber-500/10 text-amber-300",
    dot: "bg-amber-400",
  },
  killed: {
    label: "Tuée",
    badge: "border-red-500/20 bg-red-500/10 text-red-300",
    dot: "bg-red-400",
  },
  archived: {
    label: "Archivée",
    badge: "border-neutral-700 bg-neutral-900 text-neutral-500",
    dot: "bg-neutral-600",
  },
};

const RECOMMENDATION_LABELS: Record<VentureScore["recommendation"], string> = {
  go: "Go",
  test_small: "Tester petit",
  hold: "Hold",
  kill: "Kill",
};

const RECOMMENDATION_STYLES: Record<VentureScore["recommendation"], string> = {
  go: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
  test_small: "border-amber-500/20 bg-amber-500/10 text-amber-300",
  hold: "border-neutral-700 bg-neutral-900 text-neutral-400",
  kill: "border-red-500/20 bg-red-500/10 text-red-300",
};

function formatBudgetCents(cents: number): string {
  if (cents <= 0) {
    return "0 $ — aucune dépense pré-autorisée";
  }
  return (cents / 100).toLocaleString("fr-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  });
}

function summarizeAutonomy(card: VentureCardType): {
  safeCount: number;
  approvalCount: number;
  forbiddenCount: number;
} {
  let safeCount = 0;
  let approvalCount = 0;
  let forbiddenCount = 0;

  for (const rule of card.autonomyProfile.rules) {
    if (rule.riskTier === "forbidden") {
      forbiddenCount += 1;
      continue;
    }
    if (rule.requiresApproval) {
      approvalCount += 1;
      continue;
    }
    if (rule.riskTier === "safe") {
      safeCount += 1;
    }
  }

  return { safeCount, approvalCount, forbiddenCount };
}

export function VentureCard({ card }: { card: VentureCardType }) {
  const statusVisual = STATUS_VISUALS[card.status];
  const isActive = isActiveVentureStatus(card.status);
  const isTerminal = isTerminalVentureStatus(card.status);
  const autonomySummary = summarizeAutonomy(card);
  const firstSuccessMetric = card.validationPlan?.successMetrics[0];
  const firstKillCriterion = card.validationPlan?.killCriteria[0];

  return (
    <article className="flex h-full flex-col gap-4 rounded-2xl border border-neutral-800 bg-neutral-950/70 p-5">
      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold leading-snug text-white">
              {card.name}
            </h3>
            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-neutral-500">
              {card.source === "agent_suggested"
                ? "Suggestion agent — candidat"
                : card.source === "human_created"
                  ? "Créée par CEO"
                  : card.source === "market_scan"
                    ? "Scan marché"
                    : card.source === "imported"
                      ? "Importée"
                      : "Reprise d'une ancienne idée"}
            </p>
          </div>
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusVisual.badge}`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${statusVisual.dot}`}
              aria-hidden="true"
            />
            {statusVisual.label}
          </span>
        </div>

        <p className="text-sm leading-6 text-neutral-400">{card.description}</p>
      </header>

      <div className="grid grid-cols-1 gap-3 text-xs text-neutral-400 sm:grid-cols-2">
        <div className="flex items-start gap-2">
          <Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-500" aria-hidden="true" />
          <div>
            <p className="font-semibold uppercase tracking-[0.14em] text-neutral-500">
              Client cible
            </p>
            <p className="mt-1 text-sm leading-5 text-neutral-300">
              {card.targetCustomer}
            </p>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Target className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-500" aria-hidden="true" />
          <div>
            <p className="font-semibold uppercase tracking-[0.14em] text-neutral-500">
              Problème
            </p>
            <p className="mt-1 text-sm leading-5 text-neutral-300">{card.problem}</p>
          </div>
        </div>
        <div className="flex items-start gap-2 sm:col-span-2">
          <Compass className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-500" aria-hidden="true" />
          <div>
            <p className="font-semibold uppercase tracking-[0.14em] text-neutral-500">
              Offre
            </p>
            <p className="mt-1 text-sm leading-5 text-neutral-300">{card.offer}</p>
          </div>
        </div>
      </div>

      {card.score && (
        <section className="flex flex-wrap items-center gap-3 rounded-xl border border-neutral-800/80 bg-neutral-900/40 px-3 py-2 text-xs">
          <span className="inline-flex items-center gap-1.5 text-neutral-400">
            <Gauge className="h-3.5 w-3.5 text-neutral-500" aria-hidden="true" />
            <span className="font-semibold uppercase tracking-[0.14em] text-neutral-500">
              Score
            </span>
            <span className="tabular-nums text-white">{card.score.overallScore}/100</span>
          </span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
              RECOMMENDATION_STYLES[card.score.recommendation]
            }`}
          >
            {RECOMMENDATION_LABELS[card.score.recommendation]}
          </span>
        </section>
      )}

      {card.validationPlan && (
        <section className="space-y-2 rounded-xl border border-neutral-800/80 bg-neutral-900/40 px-3 py-3 text-xs">
          <div className="flex flex-wrap items-center gap-3 text-neutral-400">
            <span className="inline-flex items-center gap-1.5">
              <CalendarRange className="h-3.5 w-3.5 text-neutral-500" aria-hidden="true" />
              <span className="font-semibold uppercase tracking-[0.14em] text-neutral-500">
                Fenêtre
              </span>
              <span className="tabular-nums text-white">
                {card.validationPlan.windowDays} jours
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CircleDollarSign className="h-3.5 w-3.5 text-neutral-500" aria-hidden="true" />
              <span className="font-semibold uppercase tracking-[0.14em] text-neutral-500">
                Budget cap
              </span>
              <span className="tabular-nums text-white">
                {formatBudgetCents(card.validationPlan.budgetCapCents)}
              </span>
            </span>
          </div>
          {firstSuccessMetric && (
            <p className="text-sm leading-5 text-neutral-300">
              <span className="font-semibold text-neutral-400">Prochain repère :</span>{" "}
              {firstSuccessMetric}
            </p>
          )}
          {firstKillCriterion && (
            <p className="text-xs leading-5 text-neutral-500">
              <span className="font-semibold text-neutral-400">Kill criterion :</span>{" "}
              {firstKillCriterion.metric} {firstKillCriterion.threshold} —{" "}
              {firstKillCriterion.consequence === "kill"
                ? "kill auto"
                : firstKillCriterion.consequence === "pause"
                  ? "mise en pause"
                  : firstKillCriterion.consequence === "rework"
                    ? "rework"
                    : "revue manuelle"}
            </p>
          )}
        </section>
      )}

      <section className="rounded-xl border border-neutral-800/80 bg-neutral-900/40 px-3 py-3 text-xs">
        <div className="flex items-center gap-2 text-neutral-400">
          <ShieldCheck className="h-3.5 w-3.5 text-neutral-500" aria-hidden="true" />
          <span className="font-semibold uppercase tracking-[0.14em] text-neutral-500">
            Autonomie sécuritaire
          </span>
        </div>
        <p className="mt-2 text-sm leading-5 text-neutral-300">
          <span className="tabular-nums text-emerald-300">{autonomySummary.safeCount}</span>{" "}
          domaine{autonomySummary.safeCount !== 1 ? "s" : ""} sûr·s ·{" "}
          <span className="tabular-nums text-amber-300">{autonomySummary.approvalCount}</span>{" "}
          sous approbation ·{" "}
          <span className="tabular-nums text-red-300">{autonomySummary.forbiddenCount}</span>{" "}
          bloqué·s
        </p>
        <p className="mt-2 text-[11px] leading-5 text-neutral-500">
          Aucune action risquée sans approbation CEO explicite.
        </p>
      </section>

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-neutral-800/60 pt-3 text-[11px] text-neutral-500">
        <span>
          {card.assignedAgents.length === 0
            ? "Aucun agent assigné"
            : `${card.assignedAgents.length} agent${card.assignedAgents.length > 1 ? "s" : ""} assigné${card.assignedAgents.length > 1 ? "s" : ""}`}
        </span>
        <span>
          {isTerminal
            ? "Statut terminal"
            : isActive
              ? "Slot de validation actif"
              : "En préparation"}
        </span>
      </footer>
    </article>
  );
}
