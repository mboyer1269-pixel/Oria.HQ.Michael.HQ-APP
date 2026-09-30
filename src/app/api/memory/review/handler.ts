import { z } from "zod";
import type { ReviewDecision, ReviewResult } from "@/server/memory/memex-review-service";
const schema=z.discriminatedUnion("action",[
 z.object({action:z.literal("snapshot"),proposalId:z.string().min(1).max(160)}).strict(),
 z.object({action:z.literal("decision"),proposalId:z.string().min(1).max(160),expectedPayloadHash:z.string().regex(/^[a-f0-9]{64}$/),hashVersion:z.literal(1),decisionId:z.string().uuid(),decision:z.enum(["approve","reject"])}).strict(),
]);
export function createReviewHandler(deps:{authenticate:()=>Promise<{reviewerId:string}|Response>;workspaceId:()=>string;publicOrigin:()=>string|undefined;review:(workspaceId:string,proposalId:string,decision?:ReviewDecision&{reviewerId:string})=>Promise<ReviewResult>}) {
 return async(request:Request)=>{
  const auth=await deps.authenticate();if(auth instanceof Response)return auth;
  const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{"Cache-Control":"no-store"}});
  let origin=new URL(request.url).origin;
  try{const configured=deps.publicOrigin();if(configured!==undefined){const parsed=new URL(configured);if(parsed.origin!==configured||!["http:","https:"].includes(parsed.protocol)||parsed.username||parsed.password)throw Error();origin=parsed.origin;}}catch{return json({status:"request_denied"},403);}
  if(request.headers.get("origin")!==origin||new URL(request.url).search)return json({status:"request_denied"},403);
  if(!request.body||!request.headers.get("content-type")?.startsWith("application/json"))return json({status:"invalid_request"},400);
  const reader=request.body.getReader();let timer:ReturnType<typeof setTimeout>|undefined;let raw:unknown;
  try{raw=await Promise.race([(async()=>{const chunks:Uint8Array[]=[];let size=0;while(true){const p=await reader.read();if(p.done)break;size+=p.value.length;if(size>16384)throw Error();chunks.push(p.value);}return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks)));})(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error()),5000);})]);}catch{return json({status:"invalid_request"},400);}finally{clearTimeout(timer);void reader.cancel().catch(()=>{});}
  const parsed=schema.safeParse(raw);if(!parsed.success)return json({status:"invalid_request"},400);
  const {action,...data}=parsed.data;
  try{return json(await deps.review(deps.workspaceId(),data.proposalId,action==="decision"?{...data,reviewerId:auth.reviewerId} as ReviewDecision&{reviewerId:string}:undefined));}
  catch{return json({status:action==="decision"?"outcome_unknown":"unavailable"},503);}
 };
}
