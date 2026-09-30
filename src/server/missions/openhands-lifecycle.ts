import "server-only";
import { z } from "zod";
import { launchBinding, launchClaimSchema, OPENHANDS_LAUNCH_KEY, validateLaunchAuthority, type LaunchStore } from "./openhands-launch";

const transitionSchema=z.discriminatedUnion("next",[
  z.object({next:z.literal("read")}).strict(),
  z.object({next:z.literal("prepare")}).strict(),
  z.object({next:z.literal("creation_requested"),expected:z.literal("claimed")}).strict(),
  z.object({next:z.literal("container_created"),expected:z.literal("creation_requested"),containerId:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),
  z.object({next:z.literal("start_requested"),expected:z.literal("container_created"),containerId:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),
  z.object({next:z.literal("running"),expected:z.literal("start_requested"),containerId:z.string().regex(/^[a-f0-9]{64}$/),sessionId:z.string().min(1).max(160)}).strict(),
  z.object({next:z.literal("execution_finished"),expected:z.enum(["start_requested","running"]),containerId:z.string().regex(/^[a-f0-9]{64}$/),
    process:z.object({exitCode:z.number().int(),containerStopped:z.literal(true),deadlineExceeded:z.boolean()}).strict()}).strict(),
  // Explicit closure of an interrupted launch, bound to an observed container that
  // cannot act any more. A container that is running, paused, restarting, removing
  // or of unknown identity is not expressible here, so it can never be closed away.
  z.object({next:z.literal("cancelled"),expected:z.enum(["creation_requested","container_created","start_requested","running"]),
    containerId:z.string().regex(/^[a-f0-9]{64}$/).optional(),
    observed:z.object({containerState:z.enum(["absent","created","dead"]),observedAt:z.iso.datetime({offset:true}),
      reason:z.enum(["interrupted_before_start","result_unrecoverable"])}).strict()}).strict(),
]);

/** A closure reason must match the canonical stage it claims to close. */
const CLOSURE:Record<string,readonly string[]>={interrupted_before_start:["creation_requested","container_created"],
  result_unrecoverable:["start_requested","running"]};

/** Trusted host boundary only. No route or browser-supplied runner identity.
 * Uses the same mission CAS as claiming; no parallel execution database. */
export function createOpenHandsLifecycleService(deps:{store:()=>LaunchStore|null;now?:()=>number}) {
  return async (context:{workspaceId:string;actorId:string;runnerId:string},
    request:{missionId:string;launchId:string;config:unknown;transition:unknown}) => {
    try {
      const t=transitionSchema.safeParse(request.transition);
      if(!t.success) return {status:"invalid_transition"};
      const store=deps.store();if(!store)return {status:"unavailable"};
      const mission=await store.load(context.workspaceId,request.missionId);
      if(!mission || mission.workspaceId!==context.workspaceId || mission.id!==request.missionId)return {status:"not_found"};
      const dossier=await store.readSubmission(mission,context.actorId);
      const binding=launchBinding(mission,context.actorId,request.config,dossier);
      const parsed=launchClaimSchema.safeParse(mission.input[OPENHANDS_LAUNCH_KEY]);
      if(!binding || !parsed.success)return {status:"ineligible_mission"};
      const claim=parsed.data;
      if(claim.launchId!==request.launchId || claim.runnerId!==context.runnerId || binding.config.runnerId!==context.runnerId
        || claim.actorId!==context.actorId || claim.workspaceId!==context.workspaceId || claim.missionId!==mission.id
        || claim.launchHash!==binding.launchHash || claim.payloadHash!==binding.payloadHash || claim.reservationId!==binding.reservationId
        || claim.commitSha!==binding.commitSha || claim.imageDigest!==binding.config.imageDigest
        || claim.containerName!==`hq-openhands-${claim.launchId}`)return {status:"binding_mismatch"};
      if(t.data.next==="read")return {status:"observed",claim,config:binding.config};
      if(t.data.next==="prepare"){
        if(claim.state!=="claimed")return {status:"conflict"};
        const authority=validateLaunchAuthority(await store.readAuthority(binding,context.actorId),binding,context.actorId,(deps.now??Date.now)());
        if(!authority||authority.id!==claim.authorizationId)return {status:"authorization_denied"};
        return {status:"observed",claim,config:binding.config,dossier};
      }
      if(claim.state!==t.data.expected)return {status:"conflict"};
      if("containerId" in t.data && t.data.next!=="container_created" && claim.containerId!==t.data.containerId)return {status:"binding_mismatch"};
      if(t.data.next==="cancelled"){
        // The closure must name exactly the container identity the claim holds.
        if((claim.containerId??null)!==(t.data.containerId??null))return {status:"binding_mismatch"};
        if(!CLOSURE[t.data.observed.reason].includes(t.data.expected))return {status:"invalid_transition"};
        // A container still in `created` was never started, so only the
        // before-start reason can explain it. Nothing recoverable is discarded.
        if(t.data.observed.containerState==="created" && t.data.observed.reason!=="interrupted_before_start")return {status:"invalid_transition"};
      }
      // Recording observed effects remains possible after expiry. Creating new
      // effects requires current authority, canonically reread every time.
      if(t.data.next==="creation_requested" || t.data.next==="start_requested") {
        const authority=validateLaunchAuthority(await store.readAuthority(binding,context.actorId),binding,context.actorId,(deps.now??Date.now)());
        if(!authority || authority.id!==claim.authorizationId)return {status:"authorization_denied"};
      }
      const next=launchClaimSchema.parse({...claim,state:t.data.next,
        ...(t.data.next==="start_requested"?{startRequestedAt:new Date((deps.now??Date.now)()).toISOString()}:{}),
        ...("sessionId" in t.data?{sessionId:t.data.sessionId}:{}),
        ...("containerId" in t.data?{containerId:t.data.containerId}:{}),
        ...("process" in t.data?{process:t.data.process}:{}),
        ...(t.data.next==="cancelled"?{reconciliation:{reason:t.data.observed.reason,
          containerState:t.data.observed.containerState,observedAt:t.data.observed.observedAt}}:{})});
      const saved=await store.compareAndSwap(mission,next);
      return saved?{status:"recorded",claim:next,independentValidationPassed:false}:{status:"conflict"};
    } catch {return {status:"reconciliation_required"};}
  };
}
