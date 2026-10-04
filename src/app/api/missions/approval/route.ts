import { getCurrentAuthUser, isOwnerUser } from "@/server/auth/owner";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { createMissionApprovalService } from "@/server/missions/mission-approval-service";
import { createMissionApprovalHandler } from "./handler";

export const dynamic = "force-dynamic";
export const POST = createMissionApprovalHandler({
  authenticate: async () => {
    const user = await getCurrentAuthUser();
    if (!user) return Response.json({ status: "unauthenticated" }, { status: 401 });
    if (!isOwnerUser(user)) return Response.json({ status: "forbidden" }, { status: 403 });
    return { actorId: user.id };
  },
  workspaceId: () => getActiveWorkspaceContext().workspace.id,
  publicOrigin: () => process.env.ORIA_HQ_PUBLIC_ORIGIN,
  service: createMissionApprovalService(),
});
