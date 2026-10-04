import { getCurrentAuthUser, isOwnerUser } from "@/server/auth/owner";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { createOpenHandsConfirmationService } from "@/server/missions/openhands-confirmation";
import { createOpenHandsHandler } from "./handler";
import { createConfiguredOpenHandsLaunch } from "@/server/missions/openhands-configured-launch";
import { createOpenHandsLaunchStore } from "@/server/missions/openhands-launch-store";
import { getMissionApprovalRecord } from "@/server/missions/approval-record-repository";
import { createGatedOpenHandsLaunch } from "@/server/missions/model-emission-launch-gate";
import { attachConfiguredOpenHandsMemory, listOpenHandsMemoryProjects } from "@/server/missions/openhands-project-registry";
export const dynamic = "force-dynamic";

/**
 * Account/capability gate in front of the real launch commit. Reuses the
 * same createOpenHandsLaunchStore() Supabase-backed store openhands-launch
 * itself needs for a load — if Supabase is not configured, this read is
 * null and the gate passes through to the real launch call, which then
 * fails "unavailable" exactly as it always has (no behavior change on an
 * absent store).
 *
 * No `connectionProbe` override is passed here. The gate reads a strict,
 * workspace-bound operator configuration naming the approved runner host and
 * qualified Docker container, then probes that executor's own CLI status.
 * No laptop or unrelated Hermes account substitutes for this evidence. Missing
 * or revoked configuration stays closed; this route never supplies approval.
 */
const gatedOpenHandsLaunch = createGatedOpenHandsLaunch({
  launch: createConfiguredOpenHandsLaunch(),
  loadMission: async (workspaceId, missionId) => {
    const store = createOpenHandsLaunchStore();
    return store ? store.load(workspaceId, missionId) : null;
  },
  loadApprovalRecord: getMissionApprovalRecord,
});

export const POST = createOpenHandsHandler({
  authenticate: async () => {
    const user = await getCurrentAuthUser();
    if (!user) return Response.json({ status: "unauthenticated" }, { status: 401 });
    if (!isOwnerUser(user)) return Response.json({ status: "forbidden" }, { status: 403 });
    return { actorId: user.id };
  },
  enabled: () => process.env.ORIA_ENABLE_OPENHANDS_CONFIRMATION === "1",
  workspaceId: () => getActiveWorkspaceContext().workspace.id,
  publicOrigin: () => process.env.ORIA_HQ_PUBLIC_ORIGIN,
  service: createOpenHandsConfirmationService(),
  launch: gatedOpenHandsLaunch,
  attachMemory: attachConfiguredOpenHandsMemory,
});

export async function GET() {
  const headers = {"Cache-Control":"private, no-store"};
  const user = await getCurrentAuthUser();
  if (!user) return Response.json({status:"unauthenticated"},{status:401,headers});
  if (!isOwnerUser(user)) return Response.json({status:"forbidden"},{status:403,headers});
  if (process.env.ORIA_ENABLE_OPENHANDS_CONFIRMATION !== "1") return Response.json({status:"disabled"},{status:503,headers});
  try {
    const projects = listOpenHandsMemoryProjects(getActiveWorkspaceContext().workspace.id);
    return Response.json({status:"ready",projects},{headers});
  } catch { return Response.json({status:"unavailable"},{status:503,headers}); }
}
