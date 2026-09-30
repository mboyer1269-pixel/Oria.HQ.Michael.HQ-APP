/** Local privileged host bridge; never expose directly to agent containers.
 * Server selects immutable job config; stdin carries transitions or consumption.
 * No operation here creates a tool approval.
 * Existing Supabase environment is inherited by this process, never serialized.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createJiti} from 'jiti';
import {z} from 'zod';

try {
  if(process.argv.length!==3)throw Error('configuration_required');
  const filename=path.resolve(process.argv[2]);
  const stat=await fs.lstat(filename);
  if(!stat.isFile() || stat.isSymbolicLink() || stat.size>16384)throw Error('invalid_configuration');
  const contextSchema=z.object({workspaceId:z.string().min(1).max(160),actorId:z.string().min(1).max(160),runnerId:z.string().min(1).max(160)}).strict();
  const configuration=z.object({context:contextSchema,missionId:z.uuid(),launchId:z.uuid(),config:z.unknown()}).strict()
    .parse(JSON.parse(await fs.readFile(filename,'utf8')));
  const chunks=[];let bytes=0;
  for await (const chunk of process.stdin) {bytes+=chunk.length;if(bytes>65536)throw Error('oversized_request');chunks.push(chunk);}
  const transition=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const root=path.resolve(import.meta.dirname,'../..');
  const jiti=createJiti(import.meta.url,{alias:{'@':path.join(root,'src'),'server-only':path.join(root,'src/scripts/smoke/server-only-stub.mjs')}});
  const {createOpenHandsLifecycleService}=await jiti.import('../server/missions/openhands-lifecycle.ts');
  const {createOpenHandsLaunchStore}=await jiti.import('../server/missions/openhands-launch-store.ts');
  let result;
  if(transition?.operation==='consume_tool'){
    const {toolRequestSchema}=await jiti.import('../server/missions/openhands-tool-permission.ts');
    const request=z.object({operation:z.literal('consume_tool'),request:toolRequestSchema}).strict().parse(transition).request;
    if(request.missionId!==configuration.missionId||request.launchId!==configuration.launchId)throw Error('job_mismatch');
    const {createOpenHandsToolService}=await jiti.import('../server/missions/openhands-tool-service.ts');
    const {createOpenHandsToolDecisionStore}=await jiti.import('../server/missions/openhands-tool-decision-store.ts');
    const tools=createOpenHandsToolService({launches:()=>createOpenHandsLaunchStore(),decisions:()=>createOpenHandsToolDecisionStore()});
    result={status:'permission_response',...await tools.consume(configuration.context,request,configuration.config)};
  }else{
    const service=createOpenHandsLifecycleService({store:()=>createOpenHandsLaunchStore()});
    result=await service(configuration.context,{missionId:configuration.missionId,launchId:configuration.launchId,config:configuration.config,transition});
  }
  process.stdout.write(JSON.stringify(result)+'\n');
  if(!['recorded','observed','permission_response'].includes(result.status))process.exitCode=3;
} catch {
  process.stdout.write(JSON.stringify({status:'reconciliation_required'})+'\n');
  process.exitCode=2;
}
