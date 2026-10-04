import { getCurrentAuthUser,isOwnerUser } from "@/server/auth/owner";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { createDevelopmentService } from "@/server/missions/development-mission";
import { createDevelopmentHandlers } from "./handlers";
export const dynamic="force-dynamic";
const service=createDevelopmentService();
export const {POST,GET}=createDevelopmentHandlers({authenticate:async()=>{const user=await getCurrentAuthUser();if(!user)return Response.json({status:"unauthenticated"},{status:401});if(!isOwnerUser(user))return Response.json({status:"forbidden"},{status:403});return {actorId:user.id};},context:()=>{const ctx=getActiveWorkspaceContext();return {workspaceId:ctx.workspace.id,modeId:ctx.activeMode.id};},publicOrigin:()=>process.env.ORIA_HQ_PUBLIC_ORIGIN,create:service.create,lookup:service.lookup});
