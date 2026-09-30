import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';import {createJiti} from 'jiti';
const jiti=createJiti(import.meta.url,{alias:{'@':path.join(process.cwd(),'src')}});
const {requestLaunch}=await jiti.import('./openhands-launch.ts');
const context={workspaceId:'w',missionId:'11111111-1111-4111-8111-111111111111'};
const binding={...context,reservationId:'22222222-2222-4222-8222-222222222222',payloadHash:'a'.repeat(64),launchHash:'b'.repeat(64),commitSha:'c'.repeat(40),
 config:{imageDigest:'sha256:'+'d'.repeat(64),executorVersion:'1.50.0',runnerId:'runner',permissionPolicy:'deny',maxCostCents:100,maxTokens:1000,maxIterations:2,timeoutSeconds:30,hardTokenLimitEnforced:false}};
const claim={...context,launchId:'33333333-3333-4333-8333-333333333333',state:'claimed',reservationId:binding.reservationId,payloadHash:binding.payloadHash,launchHash:binding.launchHash,commitSha:binding.commitSha,imageDigest:binding.config.imageDigest,runnerId:binding.config.runnerId};
const respond=(data,status=200)=>async()=>Response.json(data,{status});
test('preview binds mission/workspace and rejects invalid or oversized configuration',async()=>{
 assert.equal((await requestLaunch(context,undefined,respond({status:'prepared',binding,externalEffectAllowed:false}))).kind,'prepared');
 for(const data of [{...binding,workspaceId:'foreign'},{...binding,config:{...binding.config,permissionPolicy:'allow'}},{...binding,extra:'x'}]){
  assert.equal((await requestLaunch(context,undefined,respond({status:'prepared',binding:data,externalEffectAllowed:false}))).kind,'blocked');
 }
 assert.equal((await requestLaunch(context,undefined,respond({extra:'x'.repeat(17000)}))).kind,'blocked');
});
test('confirmation sends only identity/hash and validates returned exact claim',async()=>{
 let sent;const result=await requestLaunch(context,binding,async(_url,options)=>{sent=JSON.parse(options.body);return Response.json({status:'claimed',claim,externalEffectAllowed:false});});
 assert.deepEqual(sent,{action:'confirm_launch',missionId:context.missionId,confirm:true,expectedLaunchHash:binding.launchHash});assert.equal(result.kind,'claimed');
 for(const field of ['workspaceId','missionId','reservationId','payloadHash','launchHash','commitSha','imageDigest','runnerId','state']){
  assert.equal((await requestLaunch(context,binding,respond({status:'claimed',claim:{...claim,[field]:'foreign'},externalEffectAllowed:false}))).kind,'uncertain');
 }
});
test('lost or malformed response is uncertain and never triggers a retry',async()=>{
 let calls=0;assert.equal((await requestLaunch(context,binding,async()=>{calls++;throw Error('lost');})).kind,'uncertain');assert.equal(calls,1);
 assert.equal((await requestLaunch(context,binding,respond({status:'claimed',claim,externalEffectAllowed:true}))).kind,'uncertain');
 assert.equal((await requestLaunch(context,binding,respond({status:'claimed',claim,externalEffectAllowed:false},500))).kind,'uncertain');
});
