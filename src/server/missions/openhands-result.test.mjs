import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createJiti} from 'jiti';
const jiti=createJiti(import.meta.url,{alias:{'@':path.join(process.cwd(),'src'),'server-only':path.join(process.cwd(),'src/scripts/smoke/server-only-stub.mjs')}});
const {createOpenHandsLifecycleService}=await jiti.import('./openhands-lifecycle.ts');
const {createOpenHandsLaunchStore}=await jiti.import('./openhands-launch-store.ts');
const {launchBinding}=await jiti.import('./openhands-launch.ts');
const {buildOpenHandsSubmission}=await jiti.import('./openhands-submission.ts');
const {createDevelopmentService}=await jiti.import('./development-mission.ts');
const {mapMissionRow}=await jiti.import('./mission-row.ts');
const {openHandsResultSchema}=await jiti.import('../../core/openhands-result-contract.ts');
const now=Date.parse('2026-10-03T12:00:00Z');
const launchId='55555555-5555-4555-8555-555555555555';
const containerId='d'.repeat(64);
const context={workspaceId:'w',actorId:'owner',runnerId:'runner'};
const config={imageDigest:'sha256:'+'a'.repeat(64),executorVersion:'1.50.0',runnerId:'runner',permissionPolicy:'deny',maxCostCents:100,maxTokens:1000,maxIterations:2,timeoutSeconds:30,hardTokenLimitEnforced:false};
const hash=value=>createHash('sha256').update(value).digest('hex');

async function fixture(commit='a'.repeat(40),foundationModelId) {
  const effectiveConfig={...config,...(foundationModelId?{foundationModelId}:{})};
  let mission;
  await createDevelopmentService({enabled:()=>true,store:()=>({save:async m=>(mission=m),load:async()=>mission})}).create(
    {requestId:'714ac9b7-6bce-4eb4-b3bd-08d3df8ad46e',title:'Synthetic',objective:'Verify result collection',scope:'One file',acceptanceCriteria:'Review evidence'},
    {workspaceId:'w',modeId:'hq',actorId:'owner'});
  mission.updatedAt='2026-10-03T11:00:00Z';
  const prepared=buildOpenHandsSubmission(mission,'w',{missionId:mission.id,expectedUpdatedAt:mission.updatedAt,commitSha:commit,
    executorVersion:'1.50.0',...(foundationModelId?{foundationModelId}:{}),budget:{maxCostCents:100,maxTokens:1000,maxIterations:2,timeoutSeconds:30}});
  assert.equal(prepared.status,'prepared');
  const dossier=prepared.dossier;
  const reservationId='22222222-2222-4222-8222-222222222222';
  mission.input._openhandsReservation={version:1,reservationId,state:'audit_recorded',workspaceId:'w',missionId:mission.id,
    missionVersion:mission.updatedAt,idempotencyKey:dossier.idempotencyKey,payloadHash:dossier.payloadHash,
    authorizationId:'33333333-3333-4333-8333-333333333333',actorId:'owner',reservedAt:'2026-10-03T11:59:00Z',authorizationExpiresAt:'2026-10-03T12:09:00Z',auditId:'audit'};
  const binding=launchBinding(mission,'owner',effectiveConfig,dossier);
  assert.ok(binding);
  mission.input._openhandsLaunch={version:1,launchId,authorizationId:'44444444-4444-4444-8444-444444444444',workspaceId:'w',
    missionId:mission.id,reservationId,payloadHash:dossier.payloadHash,launchHash:binding.launchHash,actorId:'owner',runnerId:'runner',
    imageDigest:config.imageDigest,commitSha:commit,containerName:'hq-openhands-'+launchId,state:'execution_finished',containerId,
    process:{exitCode:0,containerStopped:true,deadlineExceeded:false},claimedAt:'2026-10-03T11:59:00Z',authorizationExpiresAt:'2026-10-03T12:09:00Z'};
  let row={id:mission.id,workspace_id:mission.workspaceId,mode_id:mission.modeId,title:mission.title,objective:mission.objective,
    assigned_agent_id:mission.assignedAgentId,autonomy_level:mission.autonomyLevel,status:mission.status,risk_level:mission.riskLevel,
    input:structuredClone(mission.input),expected_output:mission.expectedOutput,requires_approval:mission.requiresApproval,
    cost_budget_cents:mission.costBudgetCents??null,result:null,created_at:mission.createdAt,updated_at:mission.updatedAt,completed_at:null};
  let writes=0,forceConflict=false;
  const client={from:table=>{
    assert.equal(table,'missions');
    let patch;const filters=[];
    const q={select:()=>q,update:value=>(patch=value,q),eq:(key,value)=>(filters.push([key,value]),q),
      is:(key,value)=>(filters.push([key,value]),q),maybeSingle:async()=>{
        const matches=filters.every(([key,value])=>typeof row[key]==='object'&&row[key]!==null
          ? JSON.stringify(row[key])===value : row[key]===value);
        if(!matches || (patch&&forceConflict))return {data:null,error:null};
        if(patch){row={...row,...structuredClone(patch)};writes++;}
        return {data:structuredClone(row),error:null};
      }};return q;
  }};
  const store=createOpenHandsLaunchStore(client);
  store.readSubmission=async()=>structuredClone(dossier);
  store.readAuthority=async()=>{throw Error('Result ingestion must not renew execution authority');};
  const service=createOpenHandsLifecycleService({store:()=>store,now:()=>now});
  const step=(transition,ctx=context,cfg=effectiveConfig)=>service(ctx,{missionId:mission.id,launchId,config:cfg,transition});
  const summary='Observed result\n<script>plain text only</script>';
  const report={contractVersion:1,launchId,workspaceId:'w',missionId:mission.id,commitSha:commit,payloadHash:dossier.payloadHash,
    independentValidationPassed:false,validation:'not_performed',availability:'outcome_present',executionState:'agent_returned',sdkExecutionStatus:'finished',
    summary:{status:'present',path:'report.txt',text:summary,sha256:hash(summary),source:'selected_checkout_file'},
    files:[{path:'report.txt',status:'modified',diff:'--- a/report.txt\n+++ b/report.txt\n@@ -1 +1 @@\n-before\n+after\n',sha256:hash(summary)}],
    diffScope:'selected_file_contents_only'};
  return {report,dossier,step,store,row:()=>row,writes:()=>writes,conflict:()=>{forceConflict=true;},
    receive:(result=report)=>step({next:'result_received',expected:'execution_finished',containerId,result})};
}

test('receipt persists through existing mission CAS and row projection without replacing existing result',async()=>{
  const f=await fixture();f.row().result={summary:'Existing result',other:{keep:true}};
  const before=structuredClone(f.row().input);
  const received=await f.receive();assert.equal(received.status,'recorded');assert.equal(f.writes(),1);
  const reread=await f.store.load('w',f.report.missionId);
  assert.deepEqual(reread.input,before);assert.equal(reread.result.summary,'Existing result');assert.deepEqual(reread.result.other,{keep:true});
  assert.deepEqual(reread.result._openhandsResult.report,f.report);
  assert.equal(reread.status,'draft');assert.equal(reread.completedAt,undefined);
  assert.equal((await f.step({next:'read'})).result.contentHash,received.result.contentHash);
  assert.equal(received.independentValidationPassed,false);
});

test('foundation-bound result requires requested and confirmed model, preserving unknown usage',async()=>{
 const f=await fixture('a'.repeat(40),'claude-fixture-1');
 assert.equal((await f.receive()).status,'binding_mismatch');assert.equal(f.writes(),0);
 const modelExecution={requestedModelId:'claude-fixture-1',acpConfirmedModelId:'claude-fixture-1',observedModelIds:null,mainLoopUsage:null,modelUsage:null};
 assert.equal((await f.receive({...f.report,modelExecution:{...modelExecution,requestedModelId:'claude-fixture-2',acpConfirmedModelId:'claude-fixture-2'}})).status,'binding_mismatch');
 assert.equal((await f.receive({...f.report,modelExecution:{...modelExecution,acpConfirmedModelId:null}})).status,'binding_mismatch');
 assert.equal((await f.receive({...f.report,modelExecution})).status,'recorded');
 assert.deepEqual(f.row().result._openhandsResult.report.modelExecution,modelExecution);
});
test('ACP default can be the approved and confirmed identity but never provider usage identity',async()=>{
 const f=await fixture('a'.repeat(40),'default');
 const modelExecution={requestedModelId:'default',acpConfirmedModelId:'default',observedModelIds:null,mainLoopUsage:null,modelUsage:null};
 assert.equal((await f.receive({...f.report,modelExecution})).status,'recorded');
 assert.deepEqual(f.row().result._openhandsResult.report.modelExecution,modelExecution);
 const observed={...modelExecution,observedModelIds:['default']};
 assert.equal(openHandsResultSchema.safeParse({...f.report,modelExecution:observed}).success,false);
 const usage={...modelExecution,observedModelIds:['default'],modelUsage:[{modelId:'default',inputTokens:null,outputTokens:null,
  cachedReadTokens:null,cachedWriteTokens:null,totalTokens:null,reasoningOutputTokens:null}]};
 assert.equal(openHandsResultSchema.safeParse({...f.report,modelExecution:usage}).success,false);
});
test('model refusal is a diagnostic, not successful execution or invented zero consumption',async()=>{
 const f=await fixture('a'.repeat(40),'claude-fixture-1');
 const modelExecution={requestedModelId:'claude-fixture-1',acpConfirmedModelId:null,observedModelIds:null,mainLoopUsage:null,modelUsage:null};
 const report={...f.report,executionState:'model_selection_required',modelSelection:'not_confirmed',modelExecution,sdkExecutionStatus:null};
 assert.equal((await f.receive(report)).status,'recorded');
 assert.equal(openHandsResultSchema.safeParse({...report,modelExecution:{...modelExecution,acpConfirmedModelId:'claude-fixture-1'}}).success,false);
 assert.equal(openHandsResultSchema.safeParse({...report,modelExecution:{...modelExecution,mainLoopUsage:{inputTokens:-1,outputTokens:null,cachedReadTokens:null,cachedWriteTokens:null,thoughtTokens:null}}}).success,false);
 assert.equal(openHandsResultSchema.safeParse({...report,sdkExecutionStatus:'finished'}).success,false);
});

test('identical replay is stable and divergent replay cannot replace result',async()=>{
  const f=await fixture();const first=await f.receive();const replay=await f.receive();
  assert.equal(replay.status,'recorded');assert.deepEqual(replay.result,first.result);assert.equal(f.writes(),1);
  const changed=structuredClone(f.report);changed.files[0].diff+='different\n';
  assert.equal((await f.receive(changed)).status,'conflict');assert.equal(f.writes(),1);
});

test('CAS conflict does not return or persist a receipt',async()=>{
  const f=await fixture();f.conflict();assert.deepEqual(await f.receive(),{status:'conflict'});assert.equal(f.writes(),0);
});

test('concurrent receipts have one CAS winner and persisted identity/hash are rechecked on read',async()=>{
  const f=await fixture();const outcomes=await Promise.all([f.receive(),f.receive()]);
  assert.equal(outcomes.filter(result=>result.status==='recorded').length,1);assert.equal(f.writes(),1);
  assert.equal(outcomes.filter(result=>result.status==='conflict').length,1);
  f.row().result._openhandsResult.report.workspaceId='foreign';
  assert.deepEqual(await f.step({next:'read'}),{status:'binding_mismatch'});
  f.row().result._openhandsResult.report.workspaceId='w';
  f.row().result._openhandsResult.contentHash='f'.repeat(64);
  assert.deepEqual(await f.step({next:'read'}),{status:'binding_mismatch'});
});

test('canonical launch, workspace, mission, payload and commit identity are all required',async()=>{
  for(const [key,value] of [['launchId','66666666-6666-4666-8666-666666666666'],['workspaceId','other'],
    ['missionId','77777777-7777-4777-8777-777777777777'],['payloadHash','f'.repeat(64)],['commitSha','e'.repeat(40)]]){
    const f=await fixture();assert.equal((await f.receive({...f.report,[key]:value})).status,'binding_mismatch');assert.equal(f.writes(),0);
  }
  const f=await fixture();assert.equal((await f.step({next:'result_received',expected:'execution_finished',containerId:'e'.repeat(64),result:f.report})).status,'binding_mismatch');
  assert.equal((await f.step({next:'result_received',expected:'execution_finished',containerId,result:f.report},{...context,actorId:'other'})).status,'ineligible_mission');
  assert.equal(f.writes(),0);
});

test('receiving output never permits an altered objective, scope, input, budget, revision or executor configuration',async()=>{
  const mutations=[row=>{row.objective='changed';},row=>{row.input.development.scope='changed';},row=>{row.input.other='changed';},
    row=>{row.cost_budget_cents=1;},row=>{row.input._openhandsReservation.missionVersion='2026-10-02T11:00:00Z';}];
  for(const mutate of mutations){
    const f=await fixture();assert.equal((await f.receive()).status,'recorded');mutate(f.row());
    assert.equal((await f.receive()).status,'ineligible_mission');assert.equal(f.writes(),1);
  }
  for(const nextConfig of [{...config,maxTokens:2000},{...config,imageDigest:'sha256:'+'e'.repeat(64)},
    {...config,runnerId:'another-runner'},{...config,providerProfile:{id:'claude-subscription-v1',policySha256:'e'.repeat(64),provider:'claude',authentication:'subscription',network:'restricted-proxy',accountConnectors:'disabled'}}]){
    const f=await fixture();assert.equal((await f.receive()).status,'recorded');
    const result=await f.step({next:'result_received',expected:'execution_finished',containerId,result:f.report},context,nextConfig);
    assert.ok(['ineligible_mission','binding_mismatch'].includes(result.status));assert.equal(f.writes(),1);
  }
});

test('nonterminal process, absent outcomes, unvalidated claims, invalid paths and size are refused',async()=>{
  const f=await fixture();f.row().input._openhandsLaunch.state='running';assert.equal((await f.receive()).status,'conflict');
  f.row().input._openhandsLaunch.state='execution_finished';delete f.row().input._openhandsLaunch.process;
  assert.equal((await f.receive()).status,'binding_mismatch');
  for(const mutate of [r=>{r.availability='outcome_missing';},r=>{r.independentValidationPassed=true;},r=>{r.files[0].path='/etc/file';},
    r=>{r.files[0].path='../file';},r=>{r.files[0].path='.env';},r=>{r.files[0].diff='a'.repeat(1024*1024);},
    r=>{r.summary.text='a'.repeat(128*1024+1);},r=>{r.summary.text='-----BEGIN '+'PRIVATE KEY-----';},r=>{r.extra='rejected';}]){
    const current=await fixture();const bad=structuredClone(current.report);mutate(bad);
    assert.equal((await current.receive(bad)).status,'invalid_transition');assert.equal(current.writes(),0);
  }
});

test('summary digest must represent exact returned text; failure outcome stays neutral',async()=>{
  const f=await fixture();const changed=structuredClone(f.report);changed.summary.text+='changed';
  assert.equal((await f.receive(changed)).status,'invalid_transition');
  const failed={...f.report,executionState:'execution_error',summary:{status:'missing',text:null}};
  const result=await f.receive(failed);assert.equal(result.status,'recorded');assert.equal(result.claim.state,'execution_finished');
  assert.equal(result.result.report.executionState,'execution_error');assert.equal(result.independentValidationPassed,false);
});

test('connection diagnostic rejects missing authentication, SDK completion and authentication on ordinary results',async()=>{
  for(const change of [{executionState:'connection_required',sdkExecutionStatus:null},
    {executionState:'connection_required',authentication:'confirmed',sdkExecutionStatus:null},
    {executionState:'connection_required',authentication:'local_subscription_not_confirmed',sdkExecutionStatus:'finished'},
    {authentication:'local_subscription_not_confirmed'}]){
    const f=await fixture();assert.equal((await f.receive({...f.report,...change})).status,'invalid_transition');assert.equal(f.writes(),0);
  }
});

for(const scenario of ['legacy','connection','native','model_refusal']) {
 const diagnostic=['connection','model_refusal'].includes(scenario);
 const native=['native','model_refusal'].includes(scenario);
 test(`real synthetic filesystem ${scenario} crosses Python transition, mission persistence, and row projection`,
  {skip:!process.env.OPENHANDS_RUNNER_TEST_ROOT},async()=>{
    const runner=path.resolve(process.env.OPENHANDS_RUNNER_TEST_ROOT);
    const temp=await fs.mkdtemp(path.join(os.tmpdir(),'hq-result-integration-'));
    try{
      const root=path.join(temp,launchId),checkout=path.join(root,'checkout'),results=path.join(root,'results');
      await fs.mkdir(checkout,{recursive:true});await fs.mkdir(results);
      const run=(command,args,options={})=>{const result=spawnSync(command,args,{encoding:'utf8',timeout:30000,...options});assert.equal(result.status,0,result.stderr);return result.stdout.trim();};
      const git=(...args)=>run('git',['-C',checkout,...args]);
      git('init');await fs.writeFile(path.join(checkout,'report.txt'),'before\n');git('add','report.txt');
      git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','fixture');
      const commit=git('rev-parse','HEAD');git('checkout','--detach',commit);
      const f=await fixture(commit,native?'claude-fixture-1':undefined);
      const modelExecution=native?{requestedModelId:'claude-fixture-1',acpConfirmedModelId:diagnostic?null:'claude-fixture-1',observedModelIds:null,mainLoopUsage:null,modelUsage:null}:undefined;
      await fs.writeFile(path.join(root,'dossier.json'),JSON.stringify(f.dossier));
      await fs.writeFile(path.join(results,'started.json'),JSON.stringify({payloadHash:f.dossier.payloadHash,commitSha:commit,idempotencyKey:f.dossier.idempotencyKey}));
      await fs.writeFile(path.join(results,'outcome.json'),JSON.stringify({payloadHash:f.dossier.payloadHash,
        ...(scenario==='connection'?{state:'connection_required',authentication:'local_subscription_not_confirmed'}:scenario==='model_refusal'?{state:'model_selection_required',modelSelection:'not_confirmed'}:{state:'agent_returned',sdkExecutionStatus:'finished'}),
        ...(modelExecution?{modelExecution}:{}),
        independentValidationPassed:false,hardTokenLimitEnforced:false,permissions:'default_deny',externalDeadlineRequired:true}));
      const exact=diagnostic?null:'Compte rendu exact\r\n<script>du texte</script>\n';
      if(!diagnostic)await fs.writeFile(path.join(checkout,'report.txt'),exact);
      else f.row().input._openhandsLaunch.process.exitCode=3;
      const args={job_root:root,expected_launch_id:launchId,expected_workspace_id:'w',expected_mission_id:f.report.missionId,
        expected_commit:commit,expected_payload_hash:f.dossier.payloadHash,expected_idempotency_key:f.dossier.idempotencyKey,
        selected_paths:diagnostic?[]:['report.txt'],summary_path:diagnostic?null:'report.txt',quiescent:true};
      // Exercise the actual Python serializer, with a local capture command in
      // place of the privileged service. It records stdin then intentionally
      // returns an unconfirmed response: the bridge must refuse to claim success.
      const captured=path.join(temp,'transition.json');
      const code="import json,sys; from result_export import export_result; from hq_transition import lifecycle_transition; report=export_result(**json.loads(sys.stdin.read())); command=[sys.executable,'-c','import pathlib,sys; pathlib.Path(sys.argv[1]).write_text(sys.stdin.read(),encoding=\"utf-8\"); print(\"{}\")',sys.argv[1]]\ntry: lifecycle_transition(command)('execution_finished','result_received',{'containerId':'d'*64,'result':report})\nexcept RuntimeError: pass\n";
      run(process.env.PYTHON??'python',['-c',code,captured],{cwd:runner,input:JSON.stringify(args)});
      const transition=JSON.parse(await fs.readFile(captured,'utf8'));
      assert.equal(transition.result.summary.text,exact);
      if(scenario==='connection'){
        assert.equal(transition.result.executionState,'connection_required');
        assert.equal(transition.result.authentication,'local_subscription_not_confirmed');
        assert.equal(transition.result.sdkExecutionStatus,null);assert.deepEqual(transition.result.files,[]);
      }else if(!diagnostic)assert.match(transition.result.files[0].diff,/-before/);
      if(native)assert.deepEqual(transition.result.modelExecution,modelExecution);
      if(scenario==='model_refusal')assert.equal(transition.result.executionState,'model_selection_required');
      assert.equal(openHandsResultSchema.safeParse(transition.result).success,true);
      assert.equal((await f.step(transition)).status,'recorded');
      const projected=mapMissionRow(structuredClone(f.row()));
      assert.equal(projected.result._openhandsResult.report.summary.text,exact);
      assert.equal(projected.result._openhandsResult.report.independentValidationPassed,false);
      assert.equal(projected.status,'draft');assert.equal(projected.completedAt,undefined);
      if(scenario==='connection'){
        assert.equal(projected.result._openhandsResult.report.executionState,'connection_required');
        assert.equal(projected.result._openhandsResult.report.authentication,'local_subscription_not_confirmed');
        assert.equal(projected.result._openhandsResult.report.summary.status,'missing');
        assert.deepEqual(projected.result._openhandsResult.report.files,[]);
      }
      assert.equal((await f.step({next:'read'})).result.report.summary.text,exact);
    }finally{await fs.rm(temp,{recursive:true,force:true});}
  });

}
