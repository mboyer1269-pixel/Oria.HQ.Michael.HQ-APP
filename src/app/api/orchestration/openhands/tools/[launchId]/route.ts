import {getCurrentAuthUser,isOwnerUser} from "@/server/auth/owner";
import {getActiveWorkspaceContext} from "@/core/workspace-context";
import {createOpenHandsToolInbox} from "@/server/missions/openhands-tool-inbox";
import {z} from "zod";

export const dynamic='force-dynamic';
export const runtime='nodejs';
type Context={params:Promise<{launchId:string}>};
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
async function owner(){
  const user=await getCurrentAuthUser();
  if(!user)return json({status:'unauthenticated'},401);
  if(!isOwnerUser(user))return json({status:'forbidden'},403);
  if(process.env.ORIA_ENABLE_OPENHANDS_TOOL_REVIEW!=='1')return json({status:'disabled'},503);
  return {actorId:user.id,workspaceId:getActiveWorkspaceContext().workspace.id};
}
export async function GET(request:Request,context:Context){
  const auth=await owner();if(auth instanceof Response)return auth;
  const launch=z.uuid().safeParse((await context.params).launchId);
  if(!launch.success||new URL(request.url).search)return json({status:'invalid_request'},400);
  try{return json(await createOpenHandsToolInbox(launch.data).list(auth));}
  catch{return json({status:'unavailable'},503);}
}
export async function POST(request:Request,context:Context){
  const auth=await owner();if(auth instanceof Response)return auth;
  const launch=z.uuid().safeParse((await context.params).launchId);
  if(!launch.success||new URL(request.url).search)return json({status:'invalid_request'},400);
  try{
    const configured=process.env.ORIA_HQ_PUBLIC_ORIGIN??new URL(request.url).origin;
    const origin=new URL(configured);
    if(origin.origin!==configured||!['http:','https:'].includes(origin.protocol)||request.headers.get('origin')!==configured)
      return json({status:'request_denied'},403);
  }catch{return json({status:'request_denied'},403);}
  if(!request.body||!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return json({status:'invalid_request'},400);
  const reader=request.body.getReader();let timer:ReturnType<typeof setTimeout>|undefined;let selection:unknown;
  try{
    selection=await Promise.race([(async()=>{
      const chunks:Uint8Array[]=[];let bytes=0;
      for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>2048)throw Error();chunks.push(part.value);}
      return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
    })(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error()),5000);})]);
  }catch{return json({status:'invalid_request'},400);}
  finally{clearTimeout(timer);void reader.cancel().catch(()=>{});}
  try{
    const result=await createOpenHandsToolInbox(launch.data).decide(auth,selection);
    return json(result,result.status==='recorded'?200:result.status==='unavailable'?503:409);
  }catch{return json({status:'unavailable'},503);}
}
