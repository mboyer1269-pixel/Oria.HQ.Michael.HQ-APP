import type { Route } from "next";
import Link from "next/link";
import type { Mission } from "@/core/types";
import { isConfirmedCalendarDraftMission } from "@/features/missions/mission-display";

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

function AutonomyBar({ level }: { level: Mission["autonomyLevel"] }) {
  return (
    <div className="flex items-center gap-1.5" title={`Autonomie ${level}/5`} aria-label={`Niveau d'autonomie ${level} sur 5`}>
      {([1, 2, 3, 4, 5] as const).map((n) => (
        <span
          key={n}
          className={`h-1.5 w-4 rounded-full ${
            n <= level
              ? level >= 4
                ? "bg-red-400"
                : level >= 3
                  ? "bg-amber-400"
                  : "bg-emerald-400"
              : "bg-neutral-700"
          }`}
        />
      ))}
      <span className="ml-1 text-[10px] tabular-nums text-neutral-500">{level}/5</span>
    </div>
  );
}

export function MissionCard({ mission }: { mission: Mission }) {
  const agentLabel = mission.assignedAgentId === "joris" ? "Joris" : mission.assignedAgentId;
  const calendarDraft = isConfirmedCalendarDraftMission(mission);

  return (
    <article className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4 transition hover:border-neutral-700 hover:bg-neutral-900/80">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold leading-5 text-white">{mission.title}</h3>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {calendarDraft ? (
            <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
              Calendrier confirmé
            </span>
          ) : null}
          {mission.requiresApproval && !calendarDraft ? (
            <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">
              Mock exécuteur
            </span>
          ) : null}
        </div>
      </div>

      <p className="mt-2 line-clamp-2 text-xs leading-5 text-neutral-400">{mission.objective}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className={`rounded-md border px-2 py-0.5 text-[10px] font-medium ${riskColors[mission.riskLevel]}`}>
          {riskLabels[mission.riskLevel]}
        </span>
        <span className="rounded-md border border-neutral-700 bg-neutral-800/60 px-2 py-0.5 text-[10px] text-neutral-400">
          {agentLabel}
        </span>
        {mission.costBudgetCents !== undefined && (
          <span className="rounded-md border border-neutral-700 px-2 py-0.5 text-[10px] text-neutral-500">
            {(mission.costBudgetCents / 100).toFixed(2)} $
          </span>
        )}
      </div>

      <div className="mt-3">
        <AutonomyBar level={mission.autonomyLevel} />
      </div>

      <p className="mt-3 text-[10px] leading-4 text-neutral-600">
        <span className="font-medium text-neutral-500">Sortie attendue: </span>
        {mission.expectedOutput.length > 80
          ? mission.expectedOutput.slice(0, 80) + "…"
          : mission.expectedOutput}
      </p>

      {calendarDraft ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px]">
          <span className="font-mono text-neutral-500">{mission.id}</span>
          <Link
            href={"/hq#ledger-activity" as Route}
            className="font-semibold text-emerald-400/90 underline-offset-2 hover:underline"
          >
            Trace ledger (Liée)
          </Link>
        </div>
      ) : null}

      {mission.status === "completed" && mission.result && (
        <div className="mt-3 rounded-lg border border-emerald-500/15 bg-emerald-500/5 p-2">
          <p className="text-[10px] leading-4 text-emerald-300">
            {typeof mission.result["summary"] === "string"
              ? mission.result["summary"]
              : "Mission complétée."}
          </p>
        </div>
      )}
    </article>
  );
}
