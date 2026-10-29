// Synthetic source/identity/evidence for DI and isolated disposable DB proofs only.
import path from 'node:path';
import { createJiti } from 'jiti';
import { fixture as base } from './atelier-execution.mjs';
export const jiti = createJiti(import.meta.url, { alias: { '@': path.join(process.cwd(),'src'), 'server-only': path.join(process.cwd(),'src/scripts/smoke/server-only-stub.mjs') } });
export const C = await jiti.import('../atelier-owner-spec-contract.ts');
export async function fixture() {
 const f=await base();
 const payload=C.buildOwnerSpecPayload(f.mission,f.context,{runId:f.request.runId,installationId:f.request.installationId,
  reviewId:'77777777-7777-4777-8777-777777777777',reviewExpiresAt:new Date(Date.now()+240000).toISOString()});
 const payloadJson=JSON.stringify(payload),payloadHash=C.sha256(payloadJson);
 const receipt={version:2,state:'admitted',workspaceId:payload.workspaceId,actorId:payload.actorId,missionId:payload.missionId,
  runId:payload.runId,installationId:payload.installationId,attemptId:f.request.attemptId,decisionId:f.request.decisionId,
  payloadHash,bindingHash:payload.binding.bindingHash,ledgerId:f.request.attemptId,admittedAt:new Date().toISOString()};
 return {...f,payload,payloadHash,review:{payloadJson,payloadHash},receipt};
}
export function result(e,text='# Specification\nBound fake-provider result\n') {
 const p=e.payload,r=e.receipt,hash=C.sha256(text),bytes=Buffer.byteLength(text),sessionId='synthetic-session';
 return {status:'succeeded',sessionId,evidence:{specText:text,sha256:hash,bytes,manifest:{version:2,
 workspaceId:p.workspaceId,actorId:p.actorId,missionId:p.missionId,runId:p.runId,installationId:p.installationId,
 attemptId:r.attemptId,decisionId:r.decisionId,stepId:r.attemptId,instructionHash:p.instructions.sha256,sessionId,
 payloadHash:e.payloadHash,bindingHash:p.binding.bindingHash,baseSha:p.binding.repository.baseSha,headSha:p.binding.repository.baseSha,
 artifact:{kind:'spec',path:'SPEC.md',sha256:hash,bytes}}}};
}
