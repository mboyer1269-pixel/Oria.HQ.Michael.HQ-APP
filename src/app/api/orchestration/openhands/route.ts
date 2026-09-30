import { getCurrentAuthUser, isOwnerUser } from "@/server/auth/owner";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { createOpenHandsConfirmationService } from "@/server/missions/openhands-confirmation";
import { createOpenHandsHandler } from "./handler";
import { createConfiguredOpenHandsLaunch } from "@/server/missions/openhands-configured-launch";
import { attachConfiguredOpenHandsMemory, listOpenHandsMemoryProjects } from "@/server/missions/openhands-project-registry";
export const dynamic = "force-dynamic";
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
  launch: createConfiguredOpenHandsLaunch(),
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
