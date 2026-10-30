import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";
const jiti=createJiti(import.meta.url,{jsx:{runtime:"automatic"},fsCache:false});
const {MissionResultPanel}=await jiti.import("./mission-result-panel.tsx");
const {missionReportedOutput}=await jiti.import("../mission-dossier.ts");
const render=(result,source="supabase")=>renderToStaticMarkup(createElement(MissionResultPanel,{source,output:missionReportedOutput({id:"mission-test",input:{},result})}));
test("stored report opens through native details and offers plain text export without rendering active content",()=>{
 const html=render({summary:'<script>alert(1)</script><iframe src="https://example.com"></iframe>\nhttps://example.com'});
 assert.match(html,/<details/);assert.match(html,/Ouvrir le compte rendu rapporté/);assert.match(html,/Télécharger ce compte rendu/);
 assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script|<iframe|href="https:/);
 assert.match(html,/Validation indépendante non reliée/);
});
test("empty result offers neither fabricated preview nor download",()=>{
 const html=render(undefined);assert.match(html,/Aucun compte rendu enregistré/);assert.doesNotMatch(html,/<details|<button/);
});
test("local example results retain source disclaimer",()=>{
 assert.match(render({summary:"Example"},"local"),/Source locale : exemple ou donnée temporaire/);
});

const renderReceipt=(modelExecution,executionState="agent_returned")=>renderToStaticMarkup(createElement(MissionResultPanel,{source:"supabase",output:{missionId:"mission-test",state:"missing",text:null,receipt:{receivedAt:"2026-10-03T00:00:00Z",report:{executionState,modelExecution,summary:{status:"missing",text:null},files:[]}}}}));
test("missing model telemetry stays unknown and selection failure is not an authentication failure",()=>{
 const html=renderReceipt(undefined,"model_selection_required");
 assert.match(html,/modèle demandé n’a pas été confirmé/);assert.doesNotMatch(html,/Connexion à l’abonnement requise/);
 assert.match(html,/Demandé : inconnu/);assert.match(html,/fournisseur : inconnus/);
 assert.match(html,/entrée : inconnue ; sortie : inconnue/);
});
test("requested, confirmed and observed models remain distinct and zero usage is preserved",()=>{
 const html=renderReceipt({requestedModelId:"requested-model",acpConfirmedModelId:"requested-model",observedModelIds:["provider-revision"],mainLoopUsage:{inputTokens:0,outputTokens:12},modelUsage:[{modelId:"provider-revision",inputTokens:3,outputTokens:14}]});
 assert.match(html,/Demandé : requested-model/);assert.match(html,/fournisseur : provider-revision/);
 assert.match(html,/entrée : 0 ; sortie : 12/);assert.match(html,/entrée : 3 ; sortie : 14/);
 assert.match(html,/ne sont pas additionnées/);assert.match(html,/Quota d’abonnement restant inconnu/);
 assert.match(html,/Ouvrir le résultat dans Atelier/);assert.match(html,/\/hq\/atelier\?mission=mission-test/);
});

test("owner-spec historical evidence opens escaped SPEC text and export without granting execution",async()=>{
 const {fixture,result,jiti:serverJiti}=await import('../../../server/missions/test-fixtures/atelier-owner-spec.mjs');
 const {readOwnerSpecEvidence}=await serverJiti.import('../atelier-owner-spec-read.ts');
 const f=await fixture(),r=result(f,'# SPEC\n<script>not executable</script>');
 f.mission.input._atelierOwnerSpecV2={review:f.review,admission:f.receipt,result:r};f.mission.result={atelierOwnerSpecV2:r};
 const html=renderToStaticMarkup(createElement(MissionResultPanel,{source:'supabase',output:missionReportedOutput(f.mission,readOwnerSpecEvidence(f.mission,f.context))}));
 assert.match(html,/Spécification Atelier enregistrée/);assert.match(html,/&lt;script&gt;not executable/);assert.match(html,/Télécharger SPEC.md/);
 assert.match(html,/aucune autorisation actuelle/);assert.doesNotMatch(html,/<script|Lancer|Approuver/);
 for(const state of ['unverified','reserved','awaiting_result']) {
  const view={state,runId:f.receipt.runId,executionAvailable:false,independentlyValidated:false};
  const h=renderToStaticMarkup(createElement(MissionResultPanel,{source:'supabase',output:missionReportedOutput(f.mission,view)}));
  assert.doesNotMatch(h,/Télécharger SPEC|<script|Enregistrer l’autorisation/);
 }
});

test('SPEC export uses exactly the validated UTF-8 bytes, no fetch or execution',async()=>{
 const {fixture,result,jiti:serverJiti}=await import('../../../server/missions/test-fixtures/atelier-owner-spec.mjs');
 const {readOwnerSpecEvidence}=await serverJiti.import('../atelier-owner-spec-read.ts');
 const f=await fixture(),r=result(f,'# SPEC\nÉpreuve 😀 安全 <script>texte</script>\n');
 f.mission.input._atelierOwnerSpecV2={review:f.review,admission:f.receipt,result:r};f.mission.result={atelierOwnerSpecV2:r};
 const element=MissionResultPanel({source:'supabase',output:missionReportedOutput(f.mission,readOwnerSpecEvidence(f.mission,f.context))});
 const buttons=[];function visit(n){if(!n||typeof n!=='object')return;if(Array.isArray(n)){n.forEach(visit);return;}if(n.type==='button')buttons.push(n);visit(n.props?.children);}visit(element);
 const button=buttons.find(n=>n.props.children==='Télécharger SPEC.md');assert.ok(button);
 const originalDocument=Object.getOwnPropertyDescriptor(globalThis,'document'),create=URL.createObjectURL,revoke=URL.revokeObjectURL,fetch=globalThis.fetch;
 const events=[];let blob;
 const a={href:'',download:'',click(){events.push(['click',this.href,this.download]);},remove(){events.push(['remove']);}};
 try {
  globalThis.fetch=()=>{throw Error('no network during export');};
  URL.createObjectURL=value=>{blob=value;return 'blob:spec-fixture';};URL.revokeObjectURL=url=>events.push(['revoke',url]);
  Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement(tag){assert.equal(tag,'a');return a;},body:{appendChild(node){assert.equal(node,a);events.push(['append']);}}}});
  button.props.onClick();assert.equal(await blob.text(),r.evidence.specText);assert.equal(blob.size,r.evidence.bytes);
  assert.equal(blob.type,'text/plain;charset=utf-8');
  assert.deepEqual(events,[['append'],['click','blob:spec-fixture','SPEC.md'],['remove'],['revoke','blob:spec-fixture']]);
 }finally{URL.createObjectURL=create;URL.revokeObjectURL=revoke;globalThis.fetch=fetch;if(originalDocument)Object.defineProperty(globalThis,'document',originalDocument);else delete globalThis.document;}
});
