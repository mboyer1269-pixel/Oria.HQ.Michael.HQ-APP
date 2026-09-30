import "server-only";
import { createOpenHandsLaunchService, launchConfigSchema, type LaunchStore } from "./openhands-launch";
import { createOpenHandsLaunchStore } from "./openhands-launch-store";

/** Browser inputs never select an executor configuration. Re-read on confirmation
 * so a changed server configuration invalidates the previously shown hash. */
export function createConfiguredOpenHandsLaunch(deps: {
  enabled?: () => boolean; configuration?: () => string | undefined; store?: () => LaunchStore | null;
} = {}) {
  const service = createOpenHandsLaunchService({store:deps.store ?? createOpenHandsLaunchStore});
  return async (context: {workspaceId:string;actorId:string}, missionId:string,
    confirmation?: {expectedLaunchHash:string;confirm:true}) => {
    if (!(deps.enabled ?? (() => process.env.ORIA_ENABLE_OPENHANDS_LAUNCH === "1"))())
      return {status:"disabled",externalEffectAllowed:false};
    try {
      const raw = (deps.configuration ?? (() => process.env.ORIA_OPENHANDS_LAUNCH_CONFIG))();
      if (!raw || Buffer.byteLength(raw,"utf8") > 4096) return {status:"unavailable",externalEffectAllowed:false};
      const config = launchConfigSchema.safeParse(JSON.parse(raw));
      if (!config.success) return {status:"unavailable",externalEffectAllowed:false};
      return await service(context,{missionId,config:config.data},confirmation);
    } catch { return {status:confirmation ? "reconciliation_required" : "unavailable",externalEffectAllowed:false}; }
  };
}
