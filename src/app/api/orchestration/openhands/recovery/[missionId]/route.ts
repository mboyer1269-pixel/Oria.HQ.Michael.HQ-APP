import {getCurrentAuthUser,isOwnerUser} from "@/server/auth/owner";
import {getActiveWorkspaceContext} from "@/core/workspace-context";
import {createOpenHandsRecoveryReader} from "@/server/missions/openhands-recovery";
import {z} from "zod";
export const dynamic='force-dynamic';
export const runtime='nodejs';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(request:Request,context:{params:Promise<{missionId:string}>}){
  const user=await getCurrentAuthUser();if(!user)return json({status:'unauthenticated'},401);
  if(!isOwnerUser(user))return json({status:'forbidden'},403);
  const id=z.uuid().safeParse((await context.params).missionId);
  if(!id.success||new URL(request.url).search)return json({status:'invalid_request'},400);
  try{
    const result=await createOpenHandsRecoveryReader()({actorId:user.id,workspaceId:getActiveWorkspaceContext().workspace.id},id.data);
    return json(result,result.status==='ready'?200:result.status==='not_found'?404:503);
  }catch{return json({status:'unavailable'},503);}
}
