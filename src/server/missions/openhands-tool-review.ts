import "server-only";
import {z} from "zod";
import {bindToolPermission} from "./openhands-tool-permission";

const selectionSchema=z.object({requestId:z.uuid(),expectedRequestHash:z.string().regex(/^[a-f0-9]{64}$/),
  optionId:z.string().min(1).max(160)}).strict();
type Owner={actorId:string;workspaceId:string};
type Pending={request:unknown;config:unknown;actorId:string;runnerId:string};

/** The pending source is host-owned and scoped to the authenticated owner.
 * Raw arguments/config/runner identity never come from the browser selection.
 * Missing/expired transient requests fail closed, including after restart.
 */
export function createOpenHandsToolReview(deps:{
  loadPending:(owner:Owner,requestId:string)=>Promise<Pending|null>;
  approve:(context:Owner & {runnerId:string},request:unknown,config:unknown,optionId:string)=>Promise<{status:string;decisionId?:string}>;
  now?:()=>number;
}) {
  return async(owner:Owner,rawSelection:unknown)=>{
    const selected=selectionSchema.safeParse(rawSelection);
    if(!selected.success)return {status:'invalid_selection'};
    try{
      const pending=await deps.loadPending(owner,selected.data.requestId);
      if(!pending||pending.actorId!==owner.actorId)return {status:'not_found'};
      const bound=bindToolPermission(pending.request,(deps.now??Date.now)());
      if(!bound||bound.request.workspaceId!==owner.workspaceId||bound.request.runnerId!==pending.runnerId)
        return {status:'inactive'};
      if(bound.requestHash!==selected.data.expectedRequestHash)return {status:'changed_request'};
      if(!bound.request.options.some(x=>x.optionId===selected.data.optionId))return {status:'invalid_option'};
      return await deps.approve({...owner,runnerId:pending.runnerId},bound.request,pending.config,selected.data.optionId);
    }catch{return {status:'unavailable'};}
  };
}
