import { MissionApprovalControls } from "./mission-approval-controls";
import type { Mission } from "@/core/types";
import { getAgentDisplayName } from "@/features/agents/naming";
import { evaluateMissionApproval } from "@/server/missions";

const riskColors: Record<Mission["riskLevel"], string> = {
  low: "text-emerald-300 border-emerald-500/20 bg-emerald-500/10",
  medium: "text-amber-300 border-amber-500/20 bg-amber-500/10",
  high: "text-red-300 border-red-500/20 bg-red-500/10",
};

const riskLabels: Record<Mission["riskLevel"], string> = {
  low: "Risque faible",
  medium: "Risque moyen",
  high: "Risque élevé",
};

function ApprovalCard({ mission }: { mission: Mission }) {
  const agentLabel = getAgentDisplayName(mission.assignedAgentId);
  const evaluation = evaluateMissionApproval(mission);
  const reasonText =
    evaluation.reasonLabels.length > 0
      ? evaluation.reasonLabels.join(", ")
      : "politique workspace";

  return (
    <article className="rounded-2xl border border-orange-500/15 bg-neutral-900/60 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-semibold text-white">{mission.title}</h3>
          <p className="mt-1 text-sm leading-6 text-neutral-400">{mission.objective}</p>
        </div>
        <span className={`shrink-0 rounded-md border px-2 py-1 text-[11px] font-medium ${riskColors[mission.riskLevel]}`}>
          {riskLabels[mission.riskLevel]}
        </span>
      </div>

      <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
        <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-3">
          <dt className="text-neutral-500">Agent assigné</dt>
          <dd className="mt-1 font-medium text-neutral-200">{agentLabel}</dd>
        </div>
        <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-3">
          <dt className="text-neutral-500">Niveau d&apos;autonomie</dt>
          <dd className="mt-1 font-medium text-neutral-200">{mission.autonomyLevel} / 5</dd>
        </div>
        <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-3 sm:col-span-2">
          <dt className="text-neutral-500">Sortie attendue</dt>
          <dd className="mt-1 text-neutral-300">{mission.expectedOutput}</dd>
        </div>
        <div className="rounded-lg border border-orange-500/15 bg-orange-500/5 p-3 sm:col-span-2">
          <dt className="text-orange-400">Raison d&apos;approbation requise</dt>
          <dd className="mt-1 capitalize text-orange-200/80">{reasonText}</dd>
        </div>
      </dl>

      <MissionApprovalControls missionId={mission.id} />
    </article>
  );
}

interface MissionApprovalPanelProps {
  missions: Mission[];
}

/**
 * Displays missions requiring human review.
 * Approval evaluation delegated to evaluateMissionApproval() — no inline logic.
 * Owner controls prepare an exact review before recording a decision. No model call.
 */
export function MissionApprovalPanel({ missions }: MissionApprovalPanelProps) {
  const gated = missions.filter((m) => evaluateMissionApproval(m).required);

  if (gated.length === 0) return null;

  return (
    <section className="rounded-3xl border border-orange-500/20 bg-neutral-950/70 p-5">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-400">
            Approbation des missions
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">
            {gated.length} mission{gated.length > 1 ? "s" : ""} de cette page {gated.length > 1 ? "nécessitent" : "nécessite"} une revue
          </h2>
          <p className="mt-1 text-sm text-neutral-400">
            Examinez le dossier, le compte et les limites avant de décider. Le lancement reste distinct.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-neutral-700 px-3 py-1 text-[11px] font-medium text-neutral-500">
          Décision du propriétaire
        </span>
      </div>

      <div className="flex flex-col gap-4">
        {gated.map((mission) => (
          <ApprovalCard key={mission.id} mission={mission} />
        ))}
      </div>

    </section>
  );
}
