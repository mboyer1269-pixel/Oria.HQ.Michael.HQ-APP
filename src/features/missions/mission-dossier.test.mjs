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

test("every existing approval reason links to the exact mission review, never a different page", () => {
  for (const reason of [{status:"needs_approval"},{requiresApproval:true},{riskLevel:"high"},{autonomyLevel:4}]) {
    const dossier=missionDossierSummary({...mission,id:"requested-42",riskLevel:"low",autonomyLevel:0,requiresApproval:false,...reason});
    assert.equal(dossier.approvalHref,"/hq/missions?mission=requested-42#mission-approval");
    assert.match(dossier.nextStep,/décision de cette mission/);
    assert.doesNotMatch(dossier.nextStep,/ci-dessous/);
  }
  assert.equal(missionDossierSummary({...mission,id:"normal"}).approvalHref,null);
  assert.equal(missionDossierSummary({...mission,id:"../other",status:"needs_approval"}).approvalHref,null);
});

test("a draft points to reviewing its objective before preparation, not to a nonexistent result", () => {
  const draft=missionDossierSummary({ ...mission, id:"draft-1", status:"draft", result:undefined, input:{} });
  assert.match(draft.nextStep,/Relire l’objectif et le résultat attendu/);
  assert.match(draft.nextStep,/préparer une réservation/);
  assert.doesNotMatch(draft.nextStep,/Suivre le résultat/);
  assert.equal(draft.approvalHref,null);
});
test("any existing reservation reference keeps a draft on receipt verification without declaring it valid", () => {
  for (const key of ["_atelierRun","_openhandsReservation"]) for (const value of [null,{}, {state:"reserved"}]) {
    const draft=missionDossierSummary({ ...mission, id:"draft-1", status:"draft", result:undefined, input:{[key]:value} });
    assert.match(draft.nextStep,/Vérifier si un reçu confirme la réservation/);
    assert.match(draft.nextStep,/sans renvoyer de confirmation/);
    assert.doesNotMatch(draft.nextStep,/réservation confirmée|autorisation accordée/);
  }
  const review=missionDossierSummary({ ...mission, id:"draft-1", status:"draft", requiresApproval:true, input:{_atelierRun:{}} });
  assert.match(review.nextStep,/décision de cette mission/);
  assert.equal(review.approvalHref,"/hq/missions?mission=draft-1#mission-approval");
});
