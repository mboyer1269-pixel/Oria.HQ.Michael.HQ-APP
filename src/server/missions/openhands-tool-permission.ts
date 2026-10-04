import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";

const id=z.string().min(1).max(160);
const hash=z.string().regex(/^[a-f0-9]{64}$/);
export const toolRequestSchema=z.object({
  version:z.literal(1),workspaceId:id,missionId:z.uuid(),launchId:z.uuid(),
  runnerId:id,containerId:hash,sessionId:id,toolCallId:id,
  inputJson:z.string().min(2).max(16384),
  options:z.array(z.object({optionId:id,kind:z.enum(['allow_once','reject_once'])}).strict()).min(1).max(8),
  requestedAt:z.iso.datetime({offset:true}),expiresAt:z.iso.datetime({offset:true}),
}).strict();
export type ToolPermissionRequest=z.infer<typeof toolRequestSchema>;
export const toolDecisionSchema=z.object({version:z.literal(1),decisionId:z.uuid(),
  requestHash:hash,actorId:id,optionId:id,decidedAt:z.iso.datetime({offset:true})}).strict();

/** Pure validation only: no persistence, approval, consumption or tool execution.
 * Exact input JSON bytes are bound; alternate serialization needs fresh review.
 * Caller must reject sensitive input before any durable storage/UI transmission.
 */
export function bindToolPermission(raw:unknown,now:number) {
  try {
    const request=toolRequestSchema.parse(raw);
    const start=Date.parse(request.requestedAt),end=Date.parse(request.expiresAt);
    if(!Number.isFinite(now)||start>now||end<=now||end<=start||end-start>180000)return null;
    if(Buffer.byteLength(request.inputJson,'utf8')>16384)return null;
    const input=z.record(z.string(),z.json()).parse(JSON.parse(request.inputJson));
    if(Object.keys(input).length===0)return null;
    if(new Set(request.options.map(x=>x.optionId)).size!==request.options.length)return null;
    const requestHash=createHash('sha256').update(JSON.stringify(request)).digest('hex');
    return {request,requestHash};
  } catch {return null;}
}

/** Identity check is necessary but not sufficient: the store must establish
 * the actor's authority and atomically consume the immutable decision once. */
export function matchToolDecision(rawRequest:unknown,rawDecision:unknown,actorId:string,now:number) {
  const binding=bindToolPermission(rawRequest,now);
  const decision=toolDecisionSchema.safeParse(rawDecision);
  if(!binding||!decision.success)return null;
  const d=decision.data;
  if(d.actorId!==actorId||d.requestHash!==binding.requestHash||Date.parse(d.decidedAt)>now
    ||Date.parse(d.decidedAt)<Date.parse(binding.request.requestedAt))return null;
  const option=binding.request.options.find(x=>x.optionId===d.optionId);
  return option?{...binding,decision:d,option}:null;
}
