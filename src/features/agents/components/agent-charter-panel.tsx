import { AlertTriangle, Ban, CheckCircle2, Eye, Zap } from "lucide-react";
import type { AgentActionRisk, AgentOperatingCharter, CharterRule, CharterRuleMode } from "@/features/hq/types";
import { agentCharters } from "@/features/agents/charters";

const modeConfig: Record<
  CharterRuleMode,
  { label: string; icon: React.ElementType; rowClass: string; badgeClass: string }
> = {
  auto: {
    label: "Auto",
    icon: Zap,
    rowClass: "border-emerald-500/10 bg-emerald-500/5",
    badgeClass: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  },
  supervised: {
    label: "Supervisé",
    icon: Eye,
    rowClass: "border-blue-500/10 bg-blue-500/5",
    badgeClass: "border-blue-500/30 bg-blue-500/10 text-blue-300",
  },
  approval_required: {
    label: "Approbation",
    icon: AlertTriangle,
    rowClass: "border-amber-500/10 bg-amber-500/5",
    badgeClass: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  },
  forbidden: {
    label: "Interdit",
    icon: Ban,
    rowClass: "border-red-500/10 bg-red-500/5",
    badgeClass: "border-red-500/30 bg-red-500/10 text-red-400",
  },
};

const riskOrder: AgentActionRisk[] = ["read", "draft", "check", "write", "publish"];

const riskLabel: Record<AgentActionRisk, string> = {
  read: "Lecture",
  draft: "Brouillon",
  check: "Vérif.",
  write: "Écriture",
  publish: "Publication",
};

const riskClass: Record<AgentActionRisk, string> = {
  read: "text-neutral-500",
  draft: "text-blue-400",
  check: "text-sky-400",
  write: "text-amber-400",
  publish: "text-red-400",
};

function RuleRow({ rule }: { rule: CharterRule }) {
  const mode = modeConfig[rule.mode];
  const Icon = mode.icon;

  return (
    <div className={`flex items-start gap-3 rounded-lg border p-3 ${mode.rowClass}`}>
      <div className="mt-0.5 shrink-0">
        <Icon className={`h-3.5 w-3.5 ${mode.badgeClass.split(" ").find((c) => c.startsWith("text-")) ?? "text-neutral-400"}`} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-white">{rule.action}</span>
          <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${mode.badgeClass}`}>
            {mode.label}
          </span>
          <span className={`text-[10px] font-medium uppercase tracking-wide ${riskClass[rule.risk]}`}>
            {riskLabel[rule.risk]}
          </span>
        </div>
        <p className="mt-1 text-[11px] leading-5 text-neutral-500">{rule.reason}</p>
        {rule.evidenceRequired && rule.evidenceRequired.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {rule.evidenceRequired.map((ev) => (
              <span
                key={ev}
                className="rounded border border-neutral-800 bg-neutral-900/60 px-1.5 py-0.5 font-mono text-[10px] text-neutral-500"
              >
                {ev}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CharterCard({ charter }: { charter: AgentOperatingCharter }) {
  const sorted = [...charter.rules].sort(
    (a, b) => riskOrder.indexOf(a.risk) - riskOrder.indexOf(b.risk)
  );

  const counts = {
    auto: sorted.filter((r) => r.mode === "auto").length,
    supervised: sorted.filter((r) => r.mode === "supervised").length,
    approval_required: sorted.filter((r) => r.mode === "approval_required").length,
    forbidden: sorted.filter((r) => r.mode === "forbidden").length,
  };

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold capitalize text-white">{charter.agentId}</h3>
          <p className="mt-0.5 text-[10px] text-neutral-600">
            Charte v{charter.version} · {charter.effectiveDate}
          </p>
        </div>
        <div className="flex gap-1.5">
          {counts.auto > 0 && (
            <span className="flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
              <Zap className="h-2.5 w-2.5" />
              {counts.auto}
            </span>
          )}
          {counts.forbidden > 0 && (
            <span className="flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-400">
              <Ban className="h-2.5 w-2.5" />
              {counts.forbidden}
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {sorted.map((rule) => (
          <RuleRow key={rule.action} rule={rule} />
        ))}
      </div>
    </div>
  );
}

export function AgentCharterPanel() {
  const autoCount = agentCharters.reduce(
    (n, c) => n + c.rules.filter((r) => r.mode === "auto").length,
    0
  );
  const forbiddenCount = agentCharters.reduce(
    (n, c) => n + c.rules.filter((r) => r.mode === "forbidden").length,
    0
  );
  const approvalCount = agentCharters.reduce(
    (n, c) => n + c.rules.filter((r) => r.mode === "approval_required").length,
    0
  );

  return (
    <section id="agent-charters" className="scroll-mt-6 space-y-5">
      <div className="rounded-3xl border border-neutral-800 bg-neutral-950/70 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-400">
          Chartes d&apos;opération
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-white">Règles par agent</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-neutral-400">
          Chaque agent opère dans un périmètre défini — auto, supervisé, approbation requise ou
          interdit. Aucune action hors charte.
        </p>

        <dl className="mt-5 grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <dt className="flex items-center gap-2 text-xs uppercase tracking-wide text-emerald-500">
              <Zap className="h-3.5 w-3.5" />
              Auto-run
            </dt>
            <dd className="mt-2 text-2xl font-bold text-emerald-300">{autoCount}</dd>
          </div>
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
            <dt className="flex items-center gap-2 text-xs uppercase tracking-wide text-amber-500">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Approbation
            </dt>
            <dd className="mt-2 text-2xl font-bold text-amber-300">{approvalCount}</dd>
          </div>
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
            <dt className="flex items-center gap-2 text-xs uppercase tracking-wide text-red-500">
              <Ban className="h-3.5 w-3.5" />
              Interdits
            </dt>
            <dd className="mt-2 text-2xl font-bold text-red-400">{forbiddenCount}</dd>
          </div>
        </dl>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {agentCharters.map((charter) => (
          <CharterCard key={charter.agentId} charter={charter} />
        ))}
      </div>
    </section>
  );
}
