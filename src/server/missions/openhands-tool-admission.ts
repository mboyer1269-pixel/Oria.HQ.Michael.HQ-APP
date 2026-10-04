import "server-only";
import { bindToolPermission } from "./openhands-tool-permission";
import { launchBinding, launchClaimSchema, OPENHANDS_LAUNCH_KEY, type LaunchStore } from "./openhands-launch";

/** Read-only prerequisite. Does not approve or consume a decision. The trusted
 * caller authenticates context and obtains the request from its bound ACP peer.
 * Host process cancellation remains required to stop already-admitted work.
 */
export async function admitOpenHandsToolRequest(store:LaunchStore,context:{workspaceId:string;actorId:string;runnerId:string},raw:unknown,config:unknown,now:number) {
  const tool=bindToolPermission(raw,now);if(!tool)return null;
  const r=tool.request;
  if(r.workspaceId!==context.workspaceId||r.runnerId!==context.runnerId)return null;
  const mission=await store.load(context.workspaceId,r.missionId);
  if(!mission||mission.workspaceId!==context.workspaceId||mission.id!==r.missionId)return null;
  const binding=launchBinding(mission,context.actorId,config,await store.readSubmission(mission,context.actorId));
  const parsed=launchClaimSchema.safeParse(mission.input[OPENHANDS_LAUNCH_KEY]);
  if(!binding||!parsed.success)return null;
  const claim=parsed.data;
  if(claim.state!=='running'||claim.launchId!==r.launchId||claim.containerId!==r.containerId||claim.sessionId!==r.sessionId
    ||claim.actorId!==context.actorId||claim.runnerId!==context.runnerId||binding.config.runnerId!==context.runnerId||claim.workspaceId!==context.workspaceId
    ||claim.containerName!==`hq-openhands-${claim.launchId}`
    ||claim.missionId!==r.missionId||claim.launchHash!==binding.launchHash||claim.payloadHash!==binding.payloadHash
    ||claim.reservationId!==binding.reservationId||claim.imageDigest!==binding.config.imageDigest||claim.commitSha!==binding.commitSha
    ||!claim.startRequestedAt)return null;
  const start=Date.parse(claim.startRequestedAt);
  if(start>now||now>=start+binding.config.timeoutSeconds*1000)return null;
  return tool;
}
