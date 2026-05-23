import { AlertTriangle, Trophy } from "lucide-react";
import type { AgentScore } from "../types";

const cad = new Intl.NumberFormat("fr-CA", {
  currency: "CAD",
  style: "currency",
  maximumFractionDigits: 2,
});

function fromCents(cents: number) {
  return cad.format(cents / 100);
}

function scoreClass(score: number) {
  if (score >= 85) return "text-emerald-300";
  if (score >= 70) return "text-amber-300";
  return "text-neutral-400";
}

export function AgentLeaderboard({ scores }: { scores: AgentScore[] }) {
  const ranked = [...scores].sort((a, b) => b.score - a.score);

  return (
    <section className="rounded-3xl border border-neutral-800 bg-neutral-950/70 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-400">Agent Leaderboard</p>
          <h2 className="mt-2 text-xl font-semibold text-white">Performance des agents Hermes</h2>
          <p className="mt-1 text-xs text-neutral-500">
            Score = impact revenu + outputs acceptés + vitesse + qualité + efficience coût − incidents − rework.
          </p>
        </div>
        <Trophy className="h-6 w-6 text-amber-400" />
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-neutral-500">
              <th className="pb-2 pr-3 font-medium">#</th>
              <th className="pb-2 pr-3 font-medium">Agent</th>
              <th className="pb-2 pr-3 text-right font-medium">Score</th>
              <th className="pb-2 pr-3 text-right font-medium">Outputs</th>
              <th className="pb-2 pr-3 font-medium">Revenu influencé</th>
              <th className="pb-2 pr-3 text-right font-medium">Coût</th>
              <th className="pb-2 text-right font-medium">Risque</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((agent, index) => (
              <tr key={agent.agentId} className="border-t border-neutral-800/80">
                <td className="py-3 pr-3 text-neutral-500">{index + 1}</td>
                <td className="py-3 pr-3">
                  <p className="font-medium text-white">{agent.agentName}</p>
                  <p className="mt-0.5 max-w-xs text-[11px] leading-4 text-neutral-500">{agent.notes}</p>
                </td>
                <td className={`py-3 pr-3 text-right text-base font-bold tabular-nums ${scoreClass(agent.score)}`}>
                  {agent.score}
                </td>
                <td className="py-3 pr-3 text-right tabular-nums text-neutral-300">{agent.outputsAccepted}</td>
                <td className="py-3 pr-3 text-neutral-400">{agent.revenueLabel}</td>
                <td className="py-3 pr-3 text-right tabular-nums text-neutral-400">
                  {fromCents(agent.estimatedCostCents)}
                </td>
                <td className="py-3 text-right">
                  {agent.riskIncidents > 0 ? (
                    <span className="inline-flex items-center gap-1 text-amber-400">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {agent.riskIncidents}
                    </span>
                  ) : (
                    <span className="text-neutral-600">0</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11px] text-neutral-600">
        Un agent peut scorer haut sans cash direct s&apos;il protège la holding (ex. Hermes Auditor).
      </p>
    </section>
  );
}
