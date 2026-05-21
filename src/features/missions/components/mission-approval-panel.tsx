import type { Mission } from "@/core/types";

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

function approvalReason(mission: Mission): string {
  const reasons: string[] = [];
  if (mission.requiresApproval) reasons.push("approbation explicitement requise");
  if (mission.riskLevel === "high") reasons.push("niveau de risque élevé");
  if (mission.autonomyLevel >= 4)
    reasons.push(`autonomie ${mission.autonomyLevel}/5 — action externe ou irréversible potentielle`);
  return reasons.length > 0 ? reasons.join(", ") : "politique workspace";
}

function ApprovalCard({ mission }: { mission: Mission }) {
  const agentLabel = mission.assignedAgentId === "joris" ? "Joris" : mission.assignedAgentId;

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
          <dd className="mt-1 capitalize text-orange-200/80">{approvalReason(mission)}</dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="inline-flex min-h-9 cursor-not-allowed items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 text-sm font-semibold text-emerald-600 opacity-50"
        >
          Approve
        </button>
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="inline-flex min-h-9 cursor-not-allowed items-center justify-center rounded-lg border border-red-500/20 bg-red-500/10 px-4 text-sm font-semibold text-red-600 opacity-50"
        >
          Reject
        </button>
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="inline-flex min-h-9 cursor-not-allowed items-center justify-center rounded-lg border border-neutral-700 px-4 text-sm font-semibold text-neutral-600 opacity-50"
        >
          Request changes
        </button>
        <span className="ml-auto rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 text-[10px] font-medium text-neutral-500">
          Mock only — no action is executed
        </span>
      </div>
    </article>
  );
}

interface MissionApprovalPanelProps {
  missions: Mission[];
}

/**
 * Displays missions requiring human review.
 * All action buttons are disabled — this is a read-only visualization of the
 * future approval gate. No writes, no AI calls, no state mutations.
 */
export function MissionApprovalPanel({ missions }: MissionApprovalPanelProps) {
  const gated = missions.filter(
    (m) => m.requiresApproval || m.riskLevel === "high" || m.autonomyLevel >= 4,
  );

  if (gated.length === 0) return null;

  return (
    <section className="rounded-3xl border border-orange-500/20 bg-neutral-950/70 p-5">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-400">
            Approbation requise
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">
            {gated.length} mission{gated.length > 1 ? "s" : ""} en attente de validation humaine
          </h2>
          <p className="mt-1 text-sm text-neutral-400">
            Ces missions nécessitent une approbation explicite avant toute exécution.
            Les actions ci-dessous sont désactivées dans cette version mock.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-neutral-700 px-3 py-1 text-[11px] font-medium text-neutral-500">
          Mock only
        </span>
      </div>

      <div className="flex flex-col gap-4">
        {gated.map((mission) => (
          <ApprovalCard key={mission.id} mission={mission} />
        ))}
      </div>

      <div className="mt-5 rounded-xl border border-neutral-800 bg-neutral-900/40 px-4 py-3">
        <p className="text-xs leading-5 text-neutral-600">
          <span className="font-medium text-neutral-500">Phase 2 — </span>
          Ces boutons deviendront actifs après l&apos;implémentation du Mission Executor et du service
          d&apos;approbation. Aucun appel AI, aucun write, aucune action externe ne s&apos;exécute dans cette PR.
        </p>
      </div>
    </section>
  );
}
