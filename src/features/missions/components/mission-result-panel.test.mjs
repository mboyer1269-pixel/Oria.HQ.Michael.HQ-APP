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
