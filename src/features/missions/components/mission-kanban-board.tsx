import type { Mission } from "@/core/types";
import { KANBAN_COLUMNS } from "@/features/missions/seed";
import { MissionColumn } from "./mission-column";

interface MissionKanbanBoardProps {
  missions: Mission[];
}

export function MissionKanbanBoard({ missions }: MissionKanbanBoardProps) {
  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-4" style={{ minWidth: "max-content" }}>
        {KANBAN_COLUMNS.map(({ status, label }) => (
          <MissionColumn
            key={status}
            status={status}
            label={label}
            missions={missions.filter((m) => m.status === status)}
          />
        ))}
      </div>
    </div>
  );
}
