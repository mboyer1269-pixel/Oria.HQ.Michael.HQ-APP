// Explicit opt-in, read-only qualification. Load existing configuration in the
// invoking process (e.g. node --env-file=.env.local ...). Never prints row data.
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {randomUUID} from 'node:crypto';
import {createJiti} from 'jiti';
if(process.env.HQ_MISSION_READONLY_LIVE !== '1'){
 console.log(JSON.stringify({status:'skipped',reason:'Explicit HQ_MISSION_READONLY_LIVE=1 required'}));
}else if(!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY){
 console.log(JSON.stringify({status:'unconfigured',urlPresent:!!process.env.NEXT_PUBLIC_SUPABASE_URL,serviceRolePresent:!!process.env.SUPABASE_SERVICE_ROLE_KEY}));
 process.exitCode=2;
}else{
 const originalFetch=globalThis.fetch;
 let calls=0;
 const origin=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin;
 globalThis.fetch=async(input,init)=>{
  const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
  const method=(init?.method??(input instanceof Request?input.method:'GET')).toUpperCase();
  if(!['GET','HEAD'].includes(method)||url.origin!==origin||url.pathname!=='/rest/v1/missions'||++calls>32)throw Error('Read-only guard rejected request');
  return originalFetch(input,{...init,redirect:'error',signal:AbortSignal.any([...(init?.signal?[init.signal]:[]),AbortSignal.timeout(10000)])});
 };
 const jiti=createJiti(import.meta.url,{alias:{'@':path.join(process.cwd(),'src'),'server-only':path.join(process.cwd(),'src/scripts/smoke/server-only-stub.mjs')}});
 try{
  const {getActiveWorkspaceContext}=await jiti.import('../../core/workspace-context.ts');
  const {listMissionsForWorkspace}=await jiti.import('../../server/missions/mission-repository.ts');
  const {listMissionPage}=await jiti.import('../../server/missions/mission-page.ts');
  const {activeWorkspace,activeMode}=getActiveWorkspaceContext();
  const scope={workspaceId:activeWorkspace.id,modeId:activeMode.id};
  let start=performance.now();const old=await listMissionsForWorkspace(scope);const beforeMs=Math.round(performance.now()-start);
  start=performance.now();const page=await listMissionPage(scope,{page:1,q:'',status:'all'});const afterMs=Math.round(performance.now()-start);
  if(old.source!=='supabase'||page.source!=='supabase')throw Error('Live source unavailable');
  const sentinel=`hq-readonly-absent-${randomUUID()}`;
  const absent=await listMissionPage(scope,{page:1,q:sentinel,status:'all'});
  const punctuation=await listMissionPage(scope,{page:1,q:`${sentinel}.*%_,"(x)\\`,status:'review'});
  if(absent.filteredTotal!==0||punctuation.filteredTotal!==0||absent.missions.length||punctuation.missions.length)throw Error('Sentinel unexpectedly matched');
  console.log(JSON.stringify({status:'passed',scope:'configured default workspace and mode',httpCalls:calls,before:{rows:old.missions.length,elapsedMs:beforeMs},after:{rows:page.missions.length,globalTotal:page.summary.total,filteredTotal:page.filteredTotal,elapsedMs:afterMs},sentinelEmpty:true,punctuationAndReviewEmpty:true,limits:'One sequential baseline sample per path, then two sentinel page queries. Read-only; no large-volume or latency improvement claim. Counts are not transactionally consistent.'}));
 }catch{
  console.log(JSON.stringify({status:'failed',httpCalls:calls,reason:'Read-only database qualification failed; no rows or upstream error details emitted'}));process.exitCode=1;
 }finally{globalThis.fetch=originalFetch;}
}
