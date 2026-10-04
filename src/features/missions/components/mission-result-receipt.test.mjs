import assert from "node:assert/strict";
import test from "node:test";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {createJiti} from "jiti";
const jiti=createJiti(import.meta.url,{jsx:{runtime:"automatic"},fsCache:false});
const {missionReportedOutput}=await jiti.import("../mission-dossier.ts");
const {MissionResultPanel}=await jiti.import("./mission-result-panel.tsx");
const missionId="77777777-7777-4777-8777-777777777777";
const launchId="55555555-5555-4555-8555-555555555555";
function fixture(){
 const identity={missionId,launchId,workspaceId:"w",commitSha:"a".repeat(40),payloadHash:"b".repeat(64)};
 const report={...identity,contractVersion:1,independentValidationPassed:false,validation:"not_performed",
   availability:"outcome_present",executionState:"agent_returned",sdkExecutionStatus:"finished",
   summary:{status:"present",path:"report.txt",text:"<script>not executable</script>",sha256:"c".repeat(64),source:"selected_checkout_file"},
   files:[{path:"report.txt",status:"added",diff:"+<iframe src='https://example.com'></iframe>",sha256:"c".repeat(64)}],
   diffScope:"selected_file_contents_only"};
 return {id:missionId,workspaceId:"w",input:{_openhandsLaunch:{...identity,state:"execution_finished",
   process:{containerStopped:true,exitCode:0,deadlineExceeded:false}}},result:{_openhandsResult:{version:1,
   receivedAt:"2026-10-03T12:00:00Z",contentHash:"d".repeat(64),report}}};
}
test("persisted bound selected files open as escaped differences, never a validated executable preview",()=>{
 const output=missionReportedOutput(fixture());assert.ok(output.receipt);assert.equal(output.independentlyValidated,false);
 const html=renderToStaticMarkup(createElement(MissionResultPanel,{output,source:"supabase"}));
 assert.match(html,/Retour d’OpenHands/);assert.match(html,/report.txt/);assert.match(html,/Télécharger cette différence/);
 assert.match(html,/Ouvrir le résultat dans Atelier/);assert.match(html,/\/hq\/atelier\?mission=77777777-7777-4777-8777-777777777777/);
 assert.match(html,/&lt;script&gt;/);assert.match(html,/&lt;iframe/);assert.doesNotMatch(html,/<script|<iframe|href="https:/);
 assert.match(html,/Fichiers sélectionnés uniquement/);assert.match(html,/Atelier ouvre le même reçu persistant/);
});
test("receipt from different mission, workspace, launch, revision or payload cannot appear",()=>{
 for(const [key,value] of [["missionId","88888888-8888-4888-8888-888888888888"],["workspaceId","other"],
   ["launchId","99999999-9999-4999-8999-999999999999"],["commitSha","f".repeat(40)],["payloadHash","f".repeat(64)]]){
  const m=fixture();m.result._openhandsResult.report[key]=value;assert.equal(missionReportedOutput(m).receipt,null,key);
 }
});
test("malformed receipt or unfinished process cannot expose selected files",()=>{
 const mutations=[m=>{m.input._openhandsLaunch.state="running";},m=>{m.input._openhandsLaunch.process.containerStopped=false;},
   m=>{m.result._openhandsResult.report.independentValidationPassed=true;},
   m=>{m.result._openhandsResult.report.files[0].path="../escape.txt";},
   m=>{m.result._openhandsResult.version=2;}];
 for(const mutate of mutations){const m=fixture();mutate(m);assert.equal(missionReportedOutput(m).receipt,null);}
});
test("receiving a file report preserves the mission's existing summary",()=>{
 const m=fixture();m.result.summary="Existing reviewed summary";const output=missionReportedOutput(m);
 assert.equal(output.text,m.result.summary);assert.equal(output.receipt.report.summary.text,"<script>not executable</script>");
});
test("subscription refusal is displayed as a connection diagnostic without a fabricated artifact",()=>{
 const m=fixture();Object.assign(m.result._openhandsResult.report,{executionState:"connection_required",authentication:"local_subscription_not_confirmed",sdkExecutionStatus:null,summary:{status:"missing",text:null},files:[]});
 const output=missionReportedOutput(m);assert.ok(output.receipt);
 const html=renderToStaticMarkup(createElement(MissionResultPanel,{output,source:"supabase"}));
 assert.match(html,/Connexion à l’abonnement requise/);assert.doesNotMatch(html,/Télécharger cette différence|Ouvrir le rapport du fichier|L’agent a rendu la main/);
});
