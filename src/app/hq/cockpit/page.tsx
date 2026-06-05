import { getDefaultWorkspace } from "@/core/workspaces/registry";
import { CockpitShell } from "@/features/cockpit/components/cockpit-shell";
import { FounderZeroStateCockpit } from "@/features/cockpit/components/founder-zero-state";
import {
  getEventPersistenceMode,
  listIdeaCapturedEvents,
} from "@/features/cockpit/events/event-client";
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
  const storageMode = getEventPersistenceMode();
  let loadError = false;
  let ideas: IdeaProjection[] = [];

  try {
    const ideaEvents = await listIdeaCapturedEvents({
      workspaceId,
      userId: access.user.id,
      limit: 50,
    });
    ideas = projectIdeas(ideaEvents);
  } catch {
    loadError = true;
  }

  return (
    <CockpitShell active="cockpit" crumb="Cockpit">
      <FounderZeroStateCockpit ideas={ideas} loadError={loadError} storageMode={storageMode} />
    </CockpitShell>
  );
}
