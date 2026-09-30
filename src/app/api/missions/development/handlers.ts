import { z } from "zod";
import { developmentInputSchema, type DevelopmentInput, type DevelopmentReceipt } from "@/server/missions/development-mission";
export function createDevelopmentHandlers(deps:{authenticate:()=>Promise<{actorId:string}|Response>;context:()=>{workspaceId:string;modeId:string};publicOrigin:()=>string|undefined;create:(input:DevelopmentInput,context:{workspaceId:string;modeId:string;actorId:string})=>Promise<DevelopmentReceipt>;lookup:(requestId:string,workspaceId:string)=>Promise<DevelopmentReceipt>}){
 const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
 return {
  async POST(request:Request){
   const actor=await deps.authenticate();if(actor instanceof Response)return actor;
   try{const configured=deps.publicOrigin();const origin=configured??new URL(request.url).origin;const url=new URL(origin);if(url.origin!==origin||!["http:","https:"].includes(url.protocol)||url.username||url.password||request.headers.get("origin")!==origin||new URL(request.url).search)return json({status:"request_denied"},403);}catch{return json({status:"request_denied"},403);}
   if(!request.body||!request.headers.get("content-type")?.startsWith("application/json"))return json({status:"invalid_request"},400);
   const reader=request.body.getReader();let timer:ReturnType<typeof setTimeout>|undefined;let body:unknown;
   try{body=await Promise.race([(async()=>{const chunks:Uint8Array[]=[];let bytes=0;while(true){const item=await reader.read();if(item.done)break;bytes+=item.value.length;if(bytes>40000)throw Error();chunks.push(item.value);}return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks)));})(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error()),5000);})]);}catch{return json({status:"invalid_request"},400);}finally{clearTimeout(timer);void reader.cancel().catch(()=>{});}
   const parsed=developmentInputSchema.safeParse(body);if(!parsed.success)return json({status:"invalid_request"},400);
   try{return json(await deps.create(parsed.data,{...deps.context(),actorId:actor.actorId}));}catch{return json({status:"outcome_unknown"},503);}
  },
  async GET(request:Request){const actor=await deps.authenticate();if(actor instanceof Response)return actor;const params=new URL(request.url).searchParams;const id=params.get("requestId");if(!z.string().uuid().safeParse(id).success||params.getAll("requestId").length!==1||[...params.keys()].some(key=>key!=="requestId"))return json({status:"invalid_request"},400);
   try{return json(await deps.lookup(id!,deps.context().workspaceId));}catch{return json({status:"unavailable"},503);}
  }
 };
}
