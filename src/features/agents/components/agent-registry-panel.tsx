import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  Clock,
  Cpu,
  Eye,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";
import type { AgentApprovalMode, AgentStatus, AgentVenture, HermesAgent } from "@/features/hq/types";
import { hermesAgents } from "@/features/hq/seed";
import { needsHumanGate, summarizeFleet } from "@/features/agents/fleet";

const cad = new Intl.NumberFormat("fr-CA", {
  currency: "CAD",
  style: "currency",
  maximumFractionDigits: 0,
});

const statusConfig: Record<AgentStatus, { label: string; cardClass: string; badgeClass: string; dot: string }> = {
  active: {
    label: "Actif",
    cardClass: "border-neutral-700 bg-neutral-900/70",
    badgeClass: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    dot: "bg-emerald-400",
  },
  idle: {
    label: "En veille",
    cardClass: "border-neutral-800 bg-neutral-950/40",
    badgeClass: "border-neutral-600/40 bg-neutral-800/50 text-neutral-400",
    dot: "bg-neutral-500",
  },
  needs_review: {
    label: "À réviser",
    cardClass: "border-amber-500/20 bg-amber-500/5",
    badgeClass: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    dot: "bg-amber-400",
  },
  planned: {
    label: "Planifié",
    cardClass: "border-dashed border-neutral-800 bg-neutral-950/30",
    badgeClass: "border-neutral-700 bg-neutral-900/50 text-neutral-500",
    dot: "bg-neutral-600",
  },
};

const approvalConfig: Record<AgentApprovalMode, { label: string; icon: React.ElementType; className: string }> = {
  manual: {
    label: "Manuel",
    icon: ShieldCheck,
    className: "text-amber-300",
  },
  supervised: {
    label: "Supervisé",
    icon: Eye,
    className: "text-blue-300",
  },
  autonomous: {
    label: "Autonome",
    icon: Activity,
    className: "text-emerald-300",
  },
};

const ventureLabel: Record<AgentVenture, string> = {
  hq: "HQ",
  suivia: "Suivia",
  mcl: "MCL",
  personal: "Personnel",
  global: "Global",
};

const ventureClass: Record<AgentVenture, string> = {
  hq: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  suivia: "border-blue-500/30 bg-blue-500/10 text-blue-300",
  mcl: "border-orange-500/30 bg-orange-500/10 text-orange-300",
  personal: "border-purple-500/30 bg-purple-500/10 text-purple-300",
  global: "border-neutral-600/40 bg-neutral-800/50 text-neutral-400",
};

function AgentCard({ agent }: { agent: HermesAgent }) {
  const status = statusConfig[agent.status];
  const approval = approvalConfig[agent.approvalMode];
  const ApprovalIcon = approval.icon;
  const isOperational = agent.status === "active" || agent.status === "needs_review";
  const gate = needsHumanGate(agent);

  return (
    <article className={`rounded-2xl border p-5 transition ${status.cardClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${
            isOperational ? "border-neutral-700 bg-neutral-950" : "border-neutral-800 bg-neutral-950/60"
          }`}
        >
          {isOperational ? (
            <BrainCircuit className={`h-5 w-5 ${agent.status === "needs_review" ? "text-amber-300" : "text-amber-300"}`} />
          ) : (
            <Cpu className="h-5 w-5 text-neutral-600" />
          )}
        </div>
        <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${status.badgeClass}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
          {status.label}
        </div>
      </div>

      <h3 className={`mt-4 text-base font-semibold ${isOperational ? "text-white" : "text-neutral-500"}`}>
        {agent.name}
      </h3>
      <p className={`mt-1 text-xs font-medium uppercase tracking-wide ${isOperational ? "text-amber-400/80" : "text-neutral-600"}`}>
        {agent.niche}
      </p>
      <p className={`mt-2 text-sm leading-6 ${isOperational ? "text-neutral-400" : "text-neutral-600"}`}>
        {agent.objective}
      </p>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {agent.ventures.map((v) => (
          <span key={v} className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${ventureClass[v]}`}>
            {ventureLabel[v]}
          </span>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-2.5">
          <p className="text-[10px] uppercase tracking-wide text-neutral-600">Heures/sem.</p>
          <p className={`mt-0.5 text-sm font-semibold ${isOperational ? "text-white" : "text-neutral-600"}`}>
            {agent.weeklyHoursSaved}h
          </p>
        </div>
        <div className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-2.5">
          <p className="text-[10px] uppercase tracking-wide text-neutral-600">Potentiel/mois</p>
          <p className={`mt-0.5 text-sm font-semibold ${isOperational && agent.monthlyRevenuePotential > 0 ? "text-emerald-300" : "text-neutral-600"}`}>
            {agent.monthlyRevenuePotential > 0 ? cad.format(agent.monthlyRevenuePotential) : "—"}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-950/50 px-3 py-2">
        <div className={`flex items-center gap-1.5 text-xs ${approval.className}`}>
          <ApprovalIcon className="h-3.5 w-3.5" />
          {approval.label}
        </div>
        <div className={`flex items-center gap-1.5 text-[11px] ${gate ? "text-amber-400" : "text-neutral-500"}`}>
          {gate ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
          {gate ? "Gate humaine" : "Auto-run"}
        </div>
      </div>

      {agent.evidenceRequired.length > 0 && isOperational && (
        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-wide text-neutral-600">Preuves requises</p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {agent.evidenceRequired.map((ev) => (
              <span key={ev} className="rounded border border-neutral-800 bg-neutral-900/60 px-1.5 py-0.5 font-mono text-[10px] text-neutral-500">
                {ev}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 flex items-center gap-1.5 text-[11px] text-neutral-600">
        <Clock className="h-3 w-3" />
        {agent.reviewCadence}
      </div>
    </article>
  );
}

export function AgentRegistryPanel() {
  const summary = summarizeFleet(hermesAgents);

  return (
    <section id="agent-registry" className="scroll-mt-6 space-y-5">
      <div className="rounded-3xl border border-neutral-800 bg-neutral-950/70 p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-400">Registre Hermès</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Flotte d&apos;agents</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-neutral-400">
              Chaque agent a un rôle niche, un mode d&apos;approbation et des preuves requises avant d&apos;agir.
              Tu orientes la flotte — les agents exécutent dans leur périmètre.
            </p>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
            <dt className="flex items-center gap-2 text-xs uppercase tracking-wide text-neutral-500">
              <Users className="h-3.5 w-3.5" />
              Agents total
            </dt>
            <dd className="mt-2 text-2xl font-bold text-white">{summary.totalAgents}</dd>
          </div>
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <dt className="flex items-center gap-2 text-xs uppercase tracking-wide text-emerald-500">
              <Activity className="h-3.5 w-3.5" />
              Actifs
            </dt>
            <dd className="mt-2 text-2xl font-bold text-emerald-300">{summary.activeAgents}</dd>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
            <dt className="flex items-center gap-2 text-xs uppercase tracking-wide text-neutral-500">
              <Clock className="h-3.5 w-3.5" />
              Heures / sem.
            </dt>
            <dd className="mt-2 text-2xl font-bold text-white">{summary.weeklyHoursSaved}h</dd>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
            <dt className="flex items-center gap-2 text-xs uppercase tracking-wide text-neutral-500">
              <TrendingUp className="h-3.5 w-3.5" />
              Potentiel / mois
            </dt>
            <dd className="mt-2 text-2xl font-bold text-emerald-300">
              {cad.format(summary.monthlyRevenuePotential)}
            </dd>
          </div>
        </dl>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {hermesAgents.map((agent) => (
          <AgentCard key={agent.id} agent={agent} />
        ))}
      </div>
    </section>
  );
}
