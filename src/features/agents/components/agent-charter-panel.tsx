import { Crosshair, GitBranch, Target } from "lucide-react";
import type {
  AgentCharter,
  CharterHealthReport,
  CharterHealthRow,
  RoiLever,
} from "../agent-charter";

const ROI_LABEL: Record<RoiLever, string> = {
  revenue: "Revenu",
  cost_saving: "Coûts",
  time_saving: "Temps",
  risk_reduction: "Risque",
  decision_quality: "Décision",
};

const VERDICT_LABEL: Record<CharterHealthRow["verdict"], string> = {
  operational: "opérationnel",
  thin: "à renforcer",
  decorative: "décoratif",
};

const VERDICT_STYLE: Record<CharterHealthRow["verdict"], string> = {
  operational: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
  thin: "border-amber-500/20 bg-amber-500/10 text-amber-300",
  decorative: "border-red-500/20 bg-red-500/10 text-red-300",
};

function CharterCard({ charter, row }: { charter: AgentCharter; row: CharterHealthRow }) {
  return (
    <article className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-white">{row.agentName}</h3>
            {charter.roiLevers.map((lever) => (
              <span
                key={lever}
                className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[11px] text-neutral-400"
              >
                {ROI_LABEL[lever]}
              </span>
            ))}
          </div>
          <p className="mt-1 text-xs italic text-neutral-500">{charter.dna.identity}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="tabular-nums text-sm font-semibold text-white">{row.score}</span>
          <span
            className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${VERDICT_STYLE[row.verdict]}`}
          >
            {VERDICT_LABEL[row.verdict]}
          </span>
        </div>
      </div>

      <p className="mt-3 text-sm text-neutral-300">
        <Target className="mr-1 inline h-3.5 w-3.5 text-violet-400" aria-hidden />
        {charter.mission}
      </p>

      <div className="mt-3 space-y-1.5">
        {charter.workflows.map((wf) => (
          <div
            key={wf.id}
            className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-2.5 text-xs"
          >
            <p className="font-medium text-neutral-200">
              <GitBranch className="mr-1 inline h-3 w-3 text-neutral-500" aria-hidden />
              {wf.title}
            </p>
            <p className="mt-1 text-neutral-500">
              <span className="text-neutral-400">Déclencheur :</span> {wf.trigger}
              {" · "}
              <span className="text-neutral-400">Sortie :</span> {wf.outputs[0]}
              {" · "}
              <span className="text-neutral-400">Ensuite :</span> {wf.nextAction}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {charter.kpis.map((kpi) => (
          <span
            key={kpi.id}
            className="rounded-lg border border-neutral-800 bg-neutral-900/50 px-2 py-1 text-[11px] text-neutral-400"
          >
            {kpi.label} <span className="font-semibold text-neutral-200">{kpi.target}</span>
          </span>
        ))}
      </div>
    </article>
  );
}

export function AgentCharterPanel({
  charters,
  health,
}: {
  charters: AgentCharter[];
  health: CharterHealthReport;
}) {
  const charterByAgent = new Map(charters.map((c) => [c.agentId, c]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-950/60 p-3 text-xs text-neutral-400">
        <Crosshair className="h-4 w-4 text-violet-400" aria-hidden />
        <span>
          Santé moyenne des chartes :{" "}
          <span className="tabular-nums font-semibold text-white">{health.averageScore}/100</span>
        </span>
        <span className="text-emerald-300">{health.operationalCount} opérationnels</span>
        <span className="text-amber-300">{health.thinCount} à renforcer</span>
        <span className="text-red-300">{health.decorativeCount} décoratifs</span>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {health.rows.map((row) => {
          const charter = charterByAgent.get(row.agentId);
          if (!charter) {
            return (
              <article
                key={row.agentId}
                className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300"
              >
                {row.agentName} — aucune charte. {row.topGap}.
              </article>
            );
          }
          return <CharterCard key={row.agentId} charter={charter} row={row} />;
        })}
      </div>
    </div>
  );
}
