import {
  Bot,
  CalendarRange,
  CircleDollarSign,
  Compass,
  Eye,
  FileText,
  Gauge,
  Megaphone,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import { LOCAL_DRAFT_VENTURE_LABEL } from "../draft";
import { VentureAssetPanel } from "./venture-asset-panel";
import type {
  VentureCard,
  VentureLifecycleStatus,
  VentureScore,
  VentureSource,
} from "../types";

const STATUS_LABELS: Record<VentureLifecycleStatus, string> = {
  discovered: "Découverte",
  candidate: "Candidat",
  scored: "Scoré",
  shortlisted: "Shortlisté",
  approved_for_validation: "Validation approuvée",
  validating: "En validation",
  operating: "En opération",
  autonomous: "Autonome",
  scaling: "Scaling",
  paused: "En pause",
  killed: "Tuée",
  archived: "Archivée",
};

const SOURCE_LABELS: Record<VentureSource, string> = {
  human_created: "Créée par CEO",
  agent_suggested: "Suggérée par un agent",
  market_scan: "Scan marché",
  imported: "Importée",
  reworked_from_old_idea: "Reprise d'une ancienne idée",
};

const RECOMMENDATION_LABELS: Record<VentureScore["recommendation"], string> = {
  go: "Go",
  test_small: "Tester petit",
  hold: "Hold",
  kill: "Kill",
};

const AGENT_STATUS_LABELS: Record<VentureCard["assignedAgents"][number]["status"], string> = {
  proposed: "Proposé",
  active: "Actif",
  paused: "En pause",
  removed: "Retiré",
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

function Field({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Target;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-500" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
          {label}
        </p>
        <div className="mt-1 text-sm leading-6 text-neutral-300">{children}</div>
      </div>
    </div>
  );
}

type DetailStatusTone = "saved" | "local" | "demo" | "error";

const STATUS_BADGE_CLASS: Record<DetailStatusTone, string> = {
  saved: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  local: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  demo: "border-neutral-700 bg-neutral-900 text-neutral-400",
  error: "border-red-500/30 bg-red-500/10 text-red-300",
};

export function VentureDetailPanel({
  card,
  isLocalDraft = false,
  statusBadge,
  actions,
}: {
  card: VentureCard;
  isLocalDraft?: boolean;
  statusBadge?: { label: string; tone: DetailStatusTone };
  actions?: React.ReactNode;
}) {
  const plan = card.validationPlan;

  return (
    <div className="flex h-full flex-col gap-5 rounded-3xl border border-neutral-800 bg-neutral-950/70 p-5">
      <header className="flex flex-col gap-3 border-b border-neutral-800/60 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          {!actions && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-[11px] font-medium text-neutral-300">
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              Lecture seule
            </span>
          )}
          {statusBadge && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${STATUS_BADGE_CLASS[statusBadge.tone]}`}
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              {statusBadge.label}
            </span>
          )}
          {isLocalDraft && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-300">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              {LOCAL_DRAFT_VENTURE_LABEL}
            </span>
          )}
        </div>
        <h3 className="text-lg font-semibold leading-snug text-white">{card.name}</h3>
        <div className="flex flex-wrap gap-2 text-[11px] text-neutral-400">
          <span className="rounded-full border border-neutral-800 bg-neutral-900/70 px-2 py-0.5">
            Statut : <span className="text-neutral-200">{STATUS_LABELS[card.status]}</span>
          </span>
          <span className="rounded-full border border-neutral-800 bg-neutral-900/70 px-2 py-0.5">
            Source : <span className="text-neutral-200">{SOURCE_LABELS[card.source]}</span>
          </span>
        </div>
        {card.description && (
          <p className="text-sm leading-6 text-neutral-400">{card.description}</p>
        )}
      </header>

      <section className="grid gap-3 sm:grid-cols-2">
        <Field icon={Users} label="Client cible">
          {card.targetCustomer || "—"}
        </Field>
        <Field icon={Target} label="Problème">
          {card.problem || "—"}
        </Field>
        <Field icon={Compass} label="Offre">
          {card.offer || "—"}
        </Field>
        <Field icon={Megaphone} label="Canal principal">
          {card.primaryChannel || "—"}
        </Field>
      </section>

      <section className="rounded-2xl border border-neutral-800/80 bg-neutral-900/40 p-4">
        <div className="flex items-center gap-2 text-neutral-400">
          <Gauge className="h-3.5 w-3.5 text-neutral-500" aria-hidden="true" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
            Score
          </span>
        </div>
        {card.score ? (
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
            <span className="tabular-nums text-white">{card.score.overallScore}/100</span>
            <span className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[11px] text-neutral-300">
              Recommandation : {RECOMMENDATION_LABELS[card.score.recommendation]}
            </span>
          </div>
        ) : (
          <p className="mt-2 text-sm text-neutral-500">Pas encore scoré.</p>
        )}
      </section>

      <section className="rounded-2xl border border-neutral-800/80 bg-neutral-900/40 p-4">
        <div className="flex items-center gap-2 text-neutral-400">
          <FileText className="h-3.5 w-3.5 text-neutral-500" aria-hidden="true" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
            Plan de validation
          </span>
        </div>
        {plan ? (
          <div className="mt-3 space-y-3 text-sm leading-6 text-neutral-300">
            <div className="flex flex-wrap gap-3 text-xs text-neutral-400">
              <span className="inline-flex items-center gap-1.5">
                <CalendarRange className="h-3.5 w-3.5 text-neutral-500" aria-hidden="true" />
                Fenêtre <span className="tabular-nums text-white">{plan.windowDays} jours</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CircleDollarSign className="h-3.5 w-3.5 text-neutral-500" aria-hidden="true" />
                Budget cap{" "}
                <span className="tabular-nums text-white">
                  {formatBudgetCents(plan.budgetCapCents)}
                </span>
              </span>
            </div>
            {plan.hypothesis && (
              <p>
                <span className="font-semibold text-neutral-400">Hypothèse :</span>{" "}
                {plan.hypothesis}
              </p>
            )}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                Métriques de succès
              </p>
              {plan.successMetrics.length > 0 ? (
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {plan.successMetrics.map((metric, index) => (
                    <li key={index}>{metric}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-neutral-500">—</p>
              )}
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-neutral-500">Aucun plan de validation défini.</p>
        )}
      </section>

      <section className="rounded-2xl border border-neutral-800/80 bg-neutral-900/40 p-4">
        <div className="flex items-center gap-2 text-neutral-400">
          <ShieldCheck className="h-3.5 w-3.5 text-neutral-500" aria-hidden="true" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
            Critères de kill
          </span>
        </div>
        {plan && plan.killCriteria.length > 0 ? (
          <ul className="mt-2 space-y-2 text-sm leading-6 text-neutral-300">
            {plan.killCriteria.map((criterion) => (
              <li key={criterion.id}>
                <span className="font-semibold text-neutral-400">{criterion.metric}</span>{" "}
                {criterion.threshold}{" "}
                <span className="text-neutral-500">
                  ({criterion.evaluationWindowDays} jours · {criterion.consequence})
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-neutral-500">Aucun critère de kill défini.</p>
        )}
      </section>

      <section className="rounded-2xl border border-neutral-800/80 bg-neutral-900/40 p-4">
        <div className="flex items-center gap-2 text-neutral-400">
          <ShieldCheck className="h-3.5 w-3.5 text-neutral-500" aria-hidden="true" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
            Profil d&apos;autonomie
          </span>
        </div>
        <ul className="mt-2 space-y-1.5 text-xs leading-5">
          {card.autonomyProfile.rules.map((rule) => (
            <li key={rule.domain} className="flex items-center justify-between gap-3">
              <span className="text-neutral-300">{rule.domain}</span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                  rule.riskTier === "forbidden"
                    ? "border-red-500/20 bg-red-500/10 text-red-300"
                    : rule.requiresApproval
                      ? "border-amber-500/20 bg-amber-500/10 text-amber-300"
                      : "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                }`}
              >
                {rule.riskTier === "forbidden"
                  ? "bloqué"
                  : rule.requiresApproval
                    ? "approbation"
                    : "autonome"}
              </span>
            </li>
          ))}
        </ul>
        {card.autonomyProfile.notes && (
          <p className="mt-2 text-[11px] leading-5 text-neutral-500">
            {card.autonomyProfile.notes}
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-neutral-800/80 bg-neutral-900/40 p-4">
        <div className="flex items-center gap-2 text-neutral-400">
          <Bot className="h-3.5 w-3.5 text-neutral-500" aria-hidden="true" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
            Agents assignés
          </span>
        </div>
        {card.assignedAgents.length > 0 ? (
          <ul className="mt-2 space-y-2 text-sm leading-6 text-neutral-300">
            {card.assignedAgents.map((agent) => (
              <li key={agent.agentId}>
                <span className="font-semibold text-neutral-200">{agent.role}</span>{" "}
                <span className="text-neutral-500">
                  ({agent.agentId} · {AGENT_STATUS_LABELS[agent.status]})
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-neutral-500">Aucun agent assigné.</p>
        )}
      </section>

      <section className="rounded-2xl border border-neutral-800/80 bg-neutral-900/40 p-4">
        <div className="flex items-center gap-2 text-neutral-400">
          <ScrollText className="h-3.5 w-3.5 text-neutral-500" aria-hidden="true" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
            Décisions
          </span>
        </div>
        {card.decisions.length > 0 ? (
          <ul className="mt-2 space-y-2 text-sm leading-6 text-neutral-300">
            {card.decisions.map((decision) => (
              <li key={decision.id}>
                <span className="font-semibold text-neutral-200">{decision.type}</span> —{" "}
                {decision.summary}{" "}
                <span className="text-neutral-500">({decision.decidedBy})</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-neutral-500">Aucune décision enregistrée.</p>
        )}
      </section>

      {!isLocalDraft ? (
        <VentureAssetPanel ventureId={card.id} ventureStatus={card.status} />
      ) : null}

      {actions}

      <footer className="mt-auto border-t border-neutral-800/60 pt-3 text-[11px] leading-5 text-neutral-500">
        {actions
          ? "Édition, archivage et kill passent par le repository. Aucune suppression définitive, aucune dépense, aucun envoi externe."
          : "Vue en lecture seule — aucune action (éditer, supprimer, activer, dépenser) n'est déclenchée depuis ce panneau."}
      </footer>
    </div>
  );
}
