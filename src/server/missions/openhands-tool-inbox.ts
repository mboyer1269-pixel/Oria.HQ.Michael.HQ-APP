import "server-only";
import {z} from "zod";
import {createOpenHandsControlClient} from "./openhands-control-client";
import {createOpenHandsToolReview} from "./openhands-tool-review";
import {createOpenHandsToolService} from "./openhands-tool-service";
import {createOpenHandsLaunchStore} from "./openhands-launch-store";
import {createOpenHandsToolDecisionStore} from "./openhands-tool-decision-store";
import {admitOpenHandsToolRequest} from "./openhands-tool-admission";
import {bindToolPermission} from "./openhands-tool-permission";

type Owner={actorId:string;workspaceId:string};
/** Fixed private mount. Browser supplies a UUID, never a filesystem path. */
export function createOpenHandsToolInbox(launchId:string){
  const launch=z.uuid().parse(launchId);
  const client=createOpenHandsControlClient(`/run/oria-hq-control/${launch}/review.sock`);
  const load=async(owner:Owner,requestId:string)=>{
    const pending=await client.load(owner,requestId);
    return pending?.request.launchId===launch?pending:null;
  };
  const tools=createOpenHandsToolService({launches:()=>createOpenHandsLaunchStore(),decisions:()=>createOpenHandsToolDecisionStore()});
  const review=createOpenHandsToolReview({loadPending:load,approve:tools.approve});
  return {
    async list(owner:Owner){
      const ids=await client.list(owner);const items=[];
      for(const requestId of ids){
        const pending=await load(owner,requestId);if(!pending)continue;
        const store=createOpenHandsLaunchStore();if(!store)throw Error('unavailable');
        const context={...owner,runnerId:pending.runnerId};
        if(!await admitOpenHandsToolRequest(store,context,pending.request,pending.config,Date.now()))continue;
        const bound=bindToolPermission(pending.request,Date.now());if(!bound)continue;
        items.push({requestId,requestHash:bound.requestHash,missionId:bound.request.missionId,
          toolCallId:bound.request.toolCallId,inputJson:bound.request.inputJson,
          options:bound.request.options,expiresAt:bound.request.expiresAt});
      }
      return {status:'ready',items};
    },
    async decide(owner:Owner,selection:unknown){
      const result=await review(owner,selection);
      if(result.status!=='recorded')return result;
      // A notification failure cannot undo or duplicate the durable decision.
      let notified=false;
      try{notified=await client.notify(owner,z.object({requestId:z.uuid()}).parse(selection).requestId);}catch{}
      return {...result,notified};
    },
  };
}
