import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';import {createJiti} from 'jiti';
globalThis.fetch=()=>{throw Error('unexpected network');};
const j=createJiti(import.meta.url,{alias:{'@':path.resolve('src'),'server-only':path.resolve('src/scripts/smoke/server-only-stub.mjs')}});
const {createAtomicApproveHandler}=await j.import('./execution-intent-approve-handler.ts');
const {approveAndDispatchExecutionIntent}=await j.import('./execution-intent-approval-service.ts');
const {precheckGovernedTool}=await j.import('../runtime/governed-tool-dispatch.ts');
const {hashExecutionIntentPayload}=await j.import('./execution-intent-payload-hash.ts');
const actor='11111111-1111-4111-8111-111111111111',decision='22222222-2222-4222-8222-222222222222',attempt='33333333-3333-4333-8333-333333333333';
const intent={workspaceId:'ws',intentId:'intent',agentId:'hermes',skillId:'content.generate',toolName:'n8n_webhook_trigger',autonomyLevel:3,status:'pending',requiresCeoApproval:true,payload:{agentId:'hermes',skillId:'content.generate',client:'Synthetic',email:'fake@example.test',actionType:'draft',missionId:'test',data:{}},createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z'};
function fixture(options={}){const calls=[];const admission={admit:async(input)=>{calls.push(['admit',input]);return options.admission??{status:'admitted',receipt:{version:1,workspaceId:'ws',actorId:actor,intentId:'intent',decisionId:decision,attemptId:attempt,payloadHash:input.payloadHash,sourceHash:input.sourceHash,ledgerId:attempt,ledgerHash:'a'.repeat(64),admittedAt:'2026-01-01T00:00:00Z'}};},takeCurrent:async()=>{calls.push(['current']);return options.current!==false;}};
 const deps={requireOwnerApiSession:async()=>{if(options.gateError)throw Error('session I/O');return options.denied?new Response('denied',{status:403}):null;},getAuthenticatedActorId:async()=>{calls.push(['actor']);if(options.authError)throw Error('session');return options.actor===undefined?actor:options.actor;},getActiveWorkspaceContext:()=>({workspace:{id:'ws'},userId:'CONFIGURED_NOT_SESSION'}),getAgentExecutionIntent:async()=>{calls.push(['load']);return intent;},toolRegistry:{get:()=>({handler:async(payload,ctx)=>{calls.push(['execute',payload,ctx]);return options.toolResult??{ok:true};}})},evaluateLiveExecution:()=>({outcome:options.block?'BLOCK':'REQUIRE_APPROVAL',reason:'policy'}),precheckGovernedTool,randomUUID:()=>attempt,webhookEnv:Object.freeze({N8N_WEBHOOK_URL:'http://synthetic.invalid'}),approveAndDispatchExecutionIntent,admission,
 transitionAgentExecutionIntent:async(ws,id,p)=>{calls.push(['transition',p]);},recordLedgerEvent:async(ctx,e)=>{calls.push(['ledger',e]);},billApprovedIntentUsage:async()=>{calls.push(['billing']);return null;},dispatchGovernedTool:()=>{throw Error('legacy dispatch forbidden');}};
 const POST=createAtomicApproveHandler(deps);
 return{calls,async run(){const response=await POST(new Request('http://localhost/approve',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({decisionId:decision,expectedPayloadHash:hashExecutionIntentPayload(intent.payload),actorId:'forged',workspaceId:'foreign'})}),{params:Promise.resolve({intentId:'intent'})});return{status:response.status,body:await response.json().catch(()=>null)};}};
}
test('atomic handler refuses owner/session failure before reads; never uses configured identity',async()=>{for(const options of [{denied:true},{actor:null},{authError:true},{gateError:true}]){const f=fixture(options);assert.ok([401,403,503].includes((await f.run()).status));assert.equal(f.calls.filter(c=>c[0]!=='actor').length,0);}});
test('expired/invalid admission leaves intent and all legacy writes untouched; missing RPC closes503',async()=>{for(const status of ['approval_required','conflict','unavailable','unconfirmed']){const f=fixture({admission:{status}});const r=await f.run();assert.equal(r.status,status==='approval_required'?403:status==='conflict'?409:503);assert.deepEqual(f.calls.map(c=>c[0]),status==='unconfirmed'?['actor','load','admit']:['actor','load','admit','load']);if(status==='unconfirmed')assert.equal(r.body.status,'unknown');}});
test('fresh admitted path uses current read, same guard and tool, no legacy claim/attempt/consume',async()=>{const f=fixture();assert.equal((await f.run()).status,200);assert.deepEqual(f.calls.map(c=>c[0]),['actor','load','admit','current','execute','ledger','transition','billing']);const admitted=f.calls.find(c=>c[0]==='admit')[1];assert.equal(admitted.source.actorId,actor);assert.equal(admitted.source.workspaceId,'ws');assert.equal(f.calls.find(c=>c[0]==='execute')[2].idempotencyKey,`oria1:ws:intent:${admitted.payloadHash}`);assert.equal(f.calls.find(c=>c[0]==='transition')[1].toStatus,'executed');});
test('after admission, failed current read, timeout and rate limit cannot rearm pending or consume again',async()=>{for(const options of [{current:false},{toolResult:{ok:false,outcomeUncertain:true}},{toolResult:{ok:false,rateLimited:true}}]){const f=fixture(options);const r=await f.run();assert.equal(r.status,502);assert.equal(r.body.status,'executing');assert.equal(f.calls.filter(c=>c[0]==='transition').length,0);assert.equal(f.calls.filter(c=>c[0]==='admit').length,1);}});
test('policy hard BLOCK refuses before admission and does not damage pending state',async()=>{const f=fixture({block:true});assert.equal((await f.run()).status,403);assert.deepEqual(f.calls.map(c=>c[0]),['actor','load']);});

test('real route default wiring: auth denial has zero I/O; missing SQL RPC closes503 without legacy effects',async()=>{
 const {mkdtempSync,writeFileSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');
 const dir=mkdtempSync(path.join(tmpdir(),'oria-atomic-route-')),calls=[];
 const {listExecutionCorridors}=await j.import('../runtime/execution-corridors.ts');
 const corridor=listExecutionCorridors({N8N_WEBHOOK_URL:'http://127.0.0.1:5678/webhook/test',N8N_SECRET:'fixture',AGENT_WEBHOOK_SIGNING_SECRET:'fixture'}).find(c=>c.guard.outcome!=='BLOCK');assert.ok(corridor);
 const current={...intent,agentId:corridor.agentId,skillId:corridor.skillId,autonomyLevel:corridor.evaluatedAtAutonomyLevel,payload:{...intent.payload,agentId:corridor.agentId,skillId:corridor.skillId}};
 globalThis.__atomicRouteFixture={denied:true,actor,intent:current,calls};
 try {
  const stub=path.join(dir,'ports.mjs');writeFileSync(stub,`const f=globalThis.__atomicRouteFixture;
   export const requireOwnerApiSession=async()=>f.denied?new Response('{}',{status:403}):null;
   export const getAuthenticatedActorId=async()=>f.actor;
   export const getActiveWorkspaceContext=()=>({workspace:{id:'ws'},userId:'configured-not-authority'});
   export class AgentExecutionIntentConcurrencyError extends Error{}
   export const getAgentExecutionIntent=async()=>{f.calls.push('read');return f.intent;};
   export const transitionAgentExecutionIntent=async()=>{f.calls.push('legacy-transition');throw Error('forbidden');};
   export const recordLedgerEvent=async()=>{f.calls.push('legacy-ledger');throw Error('forbidden');};
   export const billApprovedIntentUsage=async()=>{f.calls.push('billing');throw Error('forbidden');};
   export const mcpToolRegistry={get:()=>({handler:async()=>{f.calls.push('external');throw Error('forbidden');}})};
   export const resolveLedgerHmacKey=()=> 'synthetic-test-key';export const isHashChainWriteEnabled=()=>true;
   export const createOptionalSupabaseAdminClient=()=>{f.calls.push('client');return{rpc:async(name)=>{f.calls.push(name);return name==='read_atelier_ledger_tail'?{data:{status:'ready',tail:null},error:null}:{data:null,error:{code:'PGRST202',message:'function missing'}};}};};`);
  const alias={'@':path.resolve('src'),'server-only':path.resolve('src/scripts/smoke/server-only-stub.mjs')};
  for(const key of ['server/auth/owner','core/workspace-context','server/agents/execution-intent-repository','server/actions/ledger-events','server/michael-hq/billing-on-approve','server/agents/tools','server/supabase/admin','server/ledger/hash-chain-hmac-key','server/ledger/hash-chain-write-flag'])alias['@/'+key]=stub;
  const isolated=createJiti(path.join(dir,'entry.mjs'),{moduleCache:false,alias});
  const {POST}=await isolated.import(path.resolve('src/app/api/agents/execution-intents/[intentId]/approve/route.ts'));
  assert.deepEqual(calls,[],'no privileged client at route import');
  const run=()=>POST(new Request('http://localhost/approve',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({decisionId:decision,expectedPayloadHash:hashExecutionIntentPayload(current.payload)})}),{params:Promise.resolve({intentId:'intent'})});
  assert.equal((await run()).status,403);assert.deepEqual(calls,[]);
  globalThis.__atomicRouteFixture.denied=false;globalThis.__atomicRouteFixture.actor=null;
  assert.equal((await run()).status,401);assert.deepEqual(calls,[]);
  globalThis.__atomicRouteFixture.actor=actor;const out=await run();assert.equal(out.status,503,await out.text());
  assert.deepEqual(calls,['read','client','read_atelier_ledger_tail','admit_execution_intent_v1']);
 } finally {delete globalThis.__atomicRouteFixture;rmSync(dir,{recursive:true,force:true});}
});
