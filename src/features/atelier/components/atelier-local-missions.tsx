import { listMissions, missionView } from "@/server/atelier/atelier-mission";
import { AtelierMissionList } from "./atelier-mission-list";

/** Read-only panel: local subscription-CLI atelier missions (contract atelier-mission/v1). */
export function AtelierLocalMissions({ workspaceId }: { workspaceId: string }) {
  let missions: ReturnType<typeof missionView>[] = [];
  let unavailable = false;
  try {
    missions = listMissions(undefined, workspaceId).map(missionView);
  } catch {
    unavailable = true;
  }
  return <AtelierMissionList missions={missions} unavailable={unavailable} />;
}
