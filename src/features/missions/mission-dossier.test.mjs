import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const { missionDossierSummary, missionReportedOutput } = await createJiti(import.meta.url).import("./mission-dossier.ts");
const mission = { status: "completed", result: { summary: "Tests annoncés réussis" } };

test("reported completion stays a declaration requiring verification", () => {
  const result = missionDossierSummary(mission);
  assert.equal(result.status, "Terminée déclarée");
  assert.equal(result.reportedResult, "Tests annoncés réussis");
  assert.match(result.nextStep, /Vérifier/);
});
test("an unknown budget is never shown as zero, but explicit zero is retained", () => {
  for (const value of [undefined, null, NaN, Infinity, -1, "100"]) {
    assert.equal(missionDossierSummary({ ...mission, costBudgetCents: value }).budget, "Non défini");
  }
  assert.equal(missionDossierSummary({ ...mission, costBudgetCents: 0 }).budget, "0.00 $");
});
test("malformed or empty summaries do not fabricate a result", () => {
  for (const value of [undefined, {}, 0, "", "  "]) {
    assert.equal(missionDossierSummary({ ...mission, result: { summary: value } }).reportedResult, null);
  }
});

test("owners use canonical names while missing and unknown agents stay understandable", () => {
  assert.equal(missionDossierSummary({ ...mission, assignedAgentId: "agent_hermes" }).owner, "Relay");
  assert.equal(missionDossierSummary({ ...mission, assignedAgentId: "joris" }).owner, "Joris");
  assert.equal(missionDossierSummary({ ...mission, assignedAgentId: "agent_opaque_123" }).owner, "Agent à identifier");
  assert.equal(missionDossierSummary({ ...mission, assignedAgentId: "" }).owner, "Non attribué");
});

test("result viewer is empty without a persisted report, even for completed missions", () => {
  for (const result of [undefined, {}, { summary: " " }, { summary: 5 }, { url: "https://example.com", diff: "invented reference" }]) {
    const output=missionReportedOutput({id:"m",workspaceId:"w",status:"completed",input:{},result});
    assert.equal(output.state,"empty");assert.equal(output.text,null);assert.equal(output.independentlyValidated,false);
  }
});
test("reported text is projected verbatim and remains unvalidated; oversized reports are explicitly truncated", () => {
  const text="<script>alert(1)</script>\nhttps://example.com/unapproved";
  const output=missionReportedOutput({...mission,id:"m",workspaceId:"w",input:{},result:{summary:text,validated:true}});
  assert.equal(output.state,"reported");assert.equal(output.text,text);
  assert.equal(output.sourceField,"mission.result.summary");assert.equal(output.independentlyValidated,false);
  const huge=missionReportedOutput({...mission,result:{summary:"x".repeat(100001)}});
  assert.equal(huge.text.length,100000);assert.equal(huge.truncated,true);
});
test("an OpenHands exit-zero receipt is shown only for the same mission/workspace and never fabricates a deliverable", () => {
  const launch={missionId:"m",workspaceId:"w",state:"execution_finished",process:{exitCode:0,containerStopped:true,deadlineExceeded:false}};
  const make=(claim)=>missionReportedOutput({id:"m",workspaceId:"w",input:{_openhandsLaunch:claim}});
  const output=make(launch);assert.equal(output.state,"empty");assert.equal(output.independentlyValidated,false);
  assert.deepEqual(output.process,{exitCode:0,deadlineExceeded:false});
  for(const patch of [{missionId:"other"},{workspaceId:"other"},{state:"running"},{process:{exitCode:0,containerStopped:false,deadlineExceeded:false}},{process:{exitCode:"0",containerStopped:true,deadlineExceeded:false}}])assert.equal(make({...launch,...patch}).process,null);
});
