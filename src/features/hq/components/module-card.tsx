import type { HqModule } from "../types";

const statusLabels: Record<HqModule["status"], string> = {
  ready: "Prêt",
  foundation: "Fondation",
  planned: "Planifié",
};

const statusClasses: Record<HqModule["status"], string> = {
  ready: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  foundation: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  planned: "border-neutral-700 bg-neutral-900 text-neutral-400",
};

export function ModuleCard({ module }: { module: HqModule }) {
  return (
    <article className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-white">{module.title}</h3>
          <p className="mt-1 text-sm leading-6 text-neutral-400">{module.subtitle}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] ${statusClasses[module.status]}`}>
          {statusLabels[module.status]}
        </span>
      </div>
      <div className="mt-4 h-2 rounded-full bg-neutral-900">
        <div
          className="h-full rounded-full bg-amber-500"
          style={{ width: `${Math.max(10, module.autonomyLevel * 20)}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-neutral-500">Autonomie cible niveau {module.autonomyLevel}/5</p>
    </article>
  );
}
