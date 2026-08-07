import { getDefaultWorkspace } from "@/core/workspaces/registry";
import { CockpitShell } from "@/features/cockpit/components/cockpit-shell";
import { ControlChain } from "@/features/cockpit/components/control-chain";
import { FounderZeroStateCockpit } from "@/features/cockpit/components/founder-zero-state";
import { getCockpitLayout } from "@/features/cockpit/actions/cockpit-layout";
import {
  getEventPersistenceMode,
  listDailyDirectionEvents,
  listIdeaCapturedEvents,
} from "@/features/cockpit/events/event-client";
import {
  projectTodayDailyDirection,
  type DailyDirectionProjection,
} from "@/features/cockpit/events/daily-direction-projection";
import { projectIdeas, type IdeaProjection } from "@/features/cockpit/events/idea-projection";
import { OwnerAccessDenied } from "@/features/hq/components/owner-access-denied";
import { requireOwnerAccess } from "@/server/auth/owner";

export const dynamic = "force-dynamic";

export default async function CockpitPage() {
  const access = await requireOwnerAccess("/hq/cockpit");

  if (access.status === "forbidden") {
    return <OwnerAccessDenied email={access.user.email} />;
  }

  const workspaceId = getDefaultWorkspace({ ownerUserId: access.user.id }).id;
  const userId = access.user.id;
  const todayIso = new Date().toISOString().slice(0, 10);
  const storageMode = getEventPersistenceMode();

  const initialOrder = await getCockpitLayout();

  let loadError = false;
  let ideas: IdeaProjection[] = [];
  let todayDirection: DailyDirectionProjection | null = null;

  try {
    const [ideaEvents, directionEvents] = await Promise.all([
      listIdeaCapturedEvents({ workspaceId, userId, limit: 50 }),
      listDailyDirectionEvents({ workspaceId, userId, dateIso: todayIso, limit: 3 }),
    ]);

    ideas = projectIdeas(ideaEvents);
    todayDirection = projectTodayDailyDirection(directionEvents, todayIso);
  } catch {
    loadError = true;
  }

  return (
    <CockpitShell active="cockpit" crumb="Cockpit">
      {/* The governance spine, above everything else: the cockpit states what
          it will and will not do before it shows what it has done. */}
      <div className="mb-4">
        <ControlChain />
      </div>
      <FounderZeroStateCockpit
        ideas={ideas}
        loadError={loadError}
        storageMode={storageMode}
        todayDirection={todayDirection}
        todayIso={todayIso}
        initialOrder={initialOrder}
      />
    </CockpitShell>
  );
}
