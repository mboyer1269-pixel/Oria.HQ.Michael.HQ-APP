import type { MemorySubject, MemorySubjectStatus } from "../types";

const statusLabel: Record<MemorySubjectStatus, string> = {
  active: "Actif",
  building: "En construction",
  planned: "Planifié",
  paused: "En pause",
};

const statusClass: Record<MemorySubjectStatus, string> = {
  active: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  building: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  planned: "border-neutral-700 bg-neutral-900 text-neutral-400",
  paused: "border-red-500/30 bg-red-500/10 text-red-300",
};

export function MemorySubjectCard({ subject }: { subject: MemorySubject }) {
  return (
    <article className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold text-white">{subject.title}</h3>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] ${statusClass[subject.status]}`}
        >
          {statusLabel[subject.status]}
        </span>
      </div>

      <p className="mt-2 text-sm leading-6 text-neutral-400">{subject.summary}</p>

      {subject.decisions.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-600">Décisions</p>
          <ul className="mt-1 space-y-1 text-xs leading-5 text-neutral-400">
            {subject.decisions.map((decision) => (
              <li key={decision}>• {decision}</li>
            ))}
          </ul>
        </div>
      )}

      {subject.nextActions.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-400/80">Prochaines actions</p>
          <ul className="mt-1 space-y-1 text-xs leading-5 text-neutral-400">
            {subject.nextActions.map((action) => (
              <li key={action}>→ {action}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between text-[11px] text-neutral-600">
        <span>{subject.risks.length > 0 ? `${subject.risks.length} risque(s)` : "Aucun risque noté"}</span>
        <span>MàJ {subject.lastUpdated}</span>
      </div>
    </article>
  );
}
