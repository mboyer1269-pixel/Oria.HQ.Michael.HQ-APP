import "server-only";
import { admitOpenHandsToolRequest } from "./openhands-tool-admission";
import { createOpenHandsToolDecisionStore } from "./openhands-tool-decision-store";
import type { LaunchStore } from "./openhands-launch";

type Context={workspaceId:string;actorId:string;runnerId:string};
type Decisions=NonNullable<ReturnType<typeof createOpenHandsToolDecisionStore>>;

/** Authenticated owner calls approve; bound host worker calls consume. Neither
 * context nor raw request may be taken directly from an untrusted browser body:
 * the boundary must reload the exact request presented by the bound ACP peer.
 * This service does not grant authority to its caller or expose a route.
 */
export function createOpenHandsToolService(deps:{launches:()=>LaunchStore|null;decisions:()=>Decisions|null;now?:()=>number}) {
  const clock=deps.now??Date.now;
  async function admitted(context:Context,request:unknown,config:unknown) {
    const store=deps.launches();
    return store?admitOpenHandsToolRequest(store,context,request,config,clock()):null;
  }
  return {
    async approve(context:Context,request:unknown,config:unknown,optionId:string) {
      try {
        if(!await admitted(context,request,config))return {status:'denied'};
        const decisions=deps.decisions();if(!decisions)return {status:'unavailable'};
        const canonical=await decisions.persist(request,context.actorId,optionId,clock());
        // A decision persisted during cancellation is retained for audit, but
        // never described as available for an inactive session.
        if(!await admitted(context,request,config))return {status:'inactive'};
        return {status:'recorded',decisionId:canonical.decision.decisionId};
      }catch{return {status:'reconciliation_required'};}
    },
    async consume(context:Context,request:unknown,config:unknown) {
      const denied={outcome:{outcome:'cancelled' as const}};
      try {
        if(!await admitted(context,request,config))return denied;
        const decisions=deps.decisions();if(!decisions)return denied;
        const canonical=await decisions.consume(request,context.actorId,clock());
        if(!canonical||!await admitted(context,request,config))return denied;
        return {outcome:{outcome:'selected' as const,optionId:canonical.option.optionId}};
      }catch{return denied;}
    },
  };
}
