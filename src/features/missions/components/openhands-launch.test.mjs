import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createJiti} from 'jiti';
const jiti=createJiti(import.meta.url,{jsx:{runtime:'automatic'},fsCache:false,alias:{'@':path.join(process.cwd(),'src')}});
const {OpenHandsLaunch,OpenHandsLaunchConfiguration,canConfirmOpenHandsLaunch}=await jiti.import('./openhands-launch.tsx');
const {requestLaunch}=await jiti.import('../openhands-launch.ts');
const context={workspaceId:'w',missionId:'11111111-1111-4111-8111-111111111111'};
const base={...context,reservationId:'22222222-2222-4222-8222-222222222222',payloadHash:'a'.repeat(64),launchHash:'b'.repeat(64),commitSha:'c'.repeat(40),
  config:{imageDigest:'sha256:'+'d'.repeat(64),executorVersion:'1.50.0',runnerId:'runner',permissionPolicy:'deny',maxCostCents:100,maxTokens:1000,maxIterations:2,timeoutSeconds:30,hardTokenLimitEnforced:false,foundationModelId:'default'}};
const profiled=provider=>({...base,config:{...base.config,providerProfile:{id:`${provider}-subscription-v1`,policySha256:'e'.repeat(64),provider,
  authentication:'subscription',network:'restricted-proxy',accountConnectors:'disabled'}}});
const state=binding=>({binding,checked:true,busy:false,attempted:false,existing:false});
const render=props=>renderToStaticMarkup(createElement(OpenHandsLaunchConfiguration,{...props,onChecked(){},onConfirm(){}}));
const confirmButton=html=>html.match(/<button\b[^>]*>Confirmer la tentative<\/button>/)?.[0];

test('profiled Claude and Codex configurations allow explicit confirmation and label the actual provider',async()=>{
  for(const provider of ['claude','codex']){
    const preview=await requestLaunch(context,undefined,async()=>Response.json({status:'prepared',binding:profiled(provider),externalEffectAllowed:false}));
    assert.equal(preview.kind,'prepared');const ready=state(preview.binding);
    assert.equal(canConfirmOpenHandsLaunch(ready),true);
    const html=render(ready);assert.match(html,new RegExp(`${provider==='claude'?'Claude':'Codex'} par abonnement`));
    assert.match(html,/vérifiées par le serveur à la confirmation/);
    assert.match(html,/Modèle ACP demandé/);assert.match(html,/default/);
    assert.doesNotMatch(confirmButton(html),/ disabled=""/);
    assert.doesNotMatch(html,/profil n’est pas encore exécutable/);
    let sent;const claim={...context,launchId:'33333333-3333-4333-8333-333333333333',state:'claimed',reservationId:base.reservationId,
      payloadHash:base.payloadHash,launchHash:base.launchHash,commitSha:base.commitSha,imageDigest:base.config.imageDigest,runnerId:base.config.runnerId};
    const result=await requestLaunch(context,preview.binding,async(_url,options)=>{
      sent=JSON.parse(options.body);return Response.json({status:'claimed',claim,externalEffectAllowed:false});
    });
    assert.equal(result.kind,'claimed');
    assert.deepEqual(sent,{action:'confirm_launch',missionId:context.missionId,confirm:true,expectedLaunchHash:base.launchHash});
  }
});

test('explicit consent, in-flight lock, prior attempt and existing claim remain blocking',()=>{
  for(const binding of [base,profiled('claude'),profiled('codex')]){
    const ready=state(binding);
    for(const change of [{checked:false},{busy:true},{attempted:true},{existing:true}]){
      assert.equal(canConfirmOpenHandsLaunch({...ready,...change}),false);
      assert.match(confirmButton(render({...ready,...change})),/ disabled=""/);
    }
    assert.equal(canConfirmOpenHandsLaunch({...ready,binding:null}),false);
  }
});

test('disconnected, revoked and refused server responses never become a claimed launch or automatic retry',async()=>{
  for(const status of ['account_identity_unverifiable','model_emission_blocked','approval_changed_before_commit',
    'account_identity_changed_before_commit','authorization_denied','disabled']){
    let calls=0;const result=await requestLaunch(context,profiled('claude'),async()=>{
      calls++;return Response.json({status,externalEffectAllowed:false},{status:status==='model_emission_blocked'?403:409});
    });
    assert.equal(calls,1);assert.equal(result.kind,'uncertain');assert.match(result.message,/ne renvoyez pas la demande/);
    assert.equal(canConfirmOpenHandsLaunch({...state(profiled('claude')),attempted:true}),false);
  }
});

test('screen describes queued intent without asserting the host service is active or the agent started',()=>{
  const html=renderToStaticMarkup(createElement(OpenHandsLaunch,{mission:{id:context.missionId,workspaceId:context.workspaceId,input:{}},onRefresh(){}}));
  assert.match(html,/Si le serveur l’accepte/);assert.match(html,/en attente de prise en charge/);
  assert.match(html,/Seul le suivi serveur peut confirmer son démarrage/);
  assert.doesNotMatch(html,/n’est pas encore raccordé|service actif|agent démarré/);
});
