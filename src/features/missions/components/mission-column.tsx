import type { Mission } from "@/core/types";
import { MissionCard } from "./mission-card";

const columnAccents: Record<Mission["status"], string> = {
  draft: "text-neutral-400 border-neutral-700",
  queued: "text-sky-300 border-sky-500/30",
  running: "text-amber-300 border-amber-500/30",
  needs_approval: "text-orange-300 border-orange-500/30",
  completed: "text-emerald-300 border-emerald-500/30",
  failed: "text-red-300 border-red-500/30",
  cancelled: "text-neutral-500 border-neutral-700",
};

const columnDots: Record<Mission["status"], string> = {
  draft: "bg-neutral-500",
  queued: "bg-sky-400",
  running: "bg-amber-400",
  needs_approval: "bg-orange-400",
  completed: "bg-emerald-400",
  failed: "bg-red-400",
  cancelled: "bg-neutral-600",
};

interface MissionColumnProps {
  status: Mission["status"];
  label: string;
  missions: Mission[];
}

export function MissionColumn({ status, label, missions }: MissionColumnProps) {
  const accentClass = columnAccents[status];
  const dotClass = columnDots[status];

  return (
    <div className="flex min-w-[240px] flex-col gap-3 sm:min-w-[260px]">
      <header className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${accentClass} bg-neutral-950/60`}>
        <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} />
        <span className="text-xs font-semibold uppercase tracking-[0.18em]">{label}</span>
        <span className="ml-auto rounded-full bg-neutral-800 px-2 py-0.5 text-[10px] tabular-nums text-neutral-400">
          {missions.length}
        </span>
      </header>

      {missions.length === 0 ? (
        <div className="flex h-20 items-center justify-center rounded-2xl border border-dashed border-neutral-800 text-xs text-neutral-700">
          Aucune mission
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {missions.map((mission) => (
            <MissionCard key={mission.id} mission={mission} />
          ))}
        </div>
      )}
    </div>
  );
}
