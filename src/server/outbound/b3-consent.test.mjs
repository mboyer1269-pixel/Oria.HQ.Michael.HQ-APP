import assert from "node:assert/strict"; import path from "node:path"; import test from "node:test"; import { createJiti } from "jiti";
const src=path.resolve("src"); const jiti=createJiti(import.meta.url,{alias:{"@":src,"server-only":path.join(src,"scripts/smoke/server-only-stub.mjs")}});
const { buildClientSendCandidate } = await jiti.import(path.join(src,"server/outbound/outbound-queue-intake.ts"));
const base={channelId:"email",recipient:"x@y.test",leadId:"l1",subject:"s",body:"b",subVoie:"cold_email",audienceType:"cold_prospect",workspaceId:"michael-hq",approverId:"u"};
const forged=[{kind:"email_reply",referenceId:"r",source:"crm",capturedAt:"2026-06-01T12:00:00Z",summary:"x",isVerified:true}];
test("B3 positif : implied_verified + preuve client forgée isVerified:true → bloqué",()=>{
  assert.equal(buildClientSendCandidate({...base,consentBasis:"implied_verified",consentProvenance:forged}).ok,false);
});
test("B3 positif : unknown → bloqué",()=>{ assert.equal(buildClientSendCandidate({...base,consentBasis:"unknown"}).ok,false); });
test("SENT-B3-1 : 'express' déclaré par le client, cold_prospect, zéro preuve → revue manuelle, aucun jeton",()=>{
  const r=buildClientSendCandidate({...base,consentBasis:"express"});
  assert.equal(r.ok,false,`accepté, batch consentProvenance=${JSON.stringify(r.candidate?.batch.consentProvenance)}`);
  assert.equal(r.approvalToken,undefined);
});
test("SENT-B3-1 : 'express' + preuve client (même isVerified:true), warm_lead → bloqué",()=>{
  for (const audienceType of ["warm_lead","known_contact","internal_test"]) {
    const r=buildClientSendCandidate({...base,audienceType,consentBasis:"express",consentProvenance:forged});
    assert.equal(r.ok,false); assert.equal(r.approvalToken,undefined);
  }
});
