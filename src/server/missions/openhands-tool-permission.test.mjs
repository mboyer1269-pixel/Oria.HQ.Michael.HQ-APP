import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createJiti} from 'jiti';
const jiti=createJiti(import.meta.url,{alias:{'server-only':path.join(process.cwd(),'src/scripts/smoke/server-only-stub.mjs')}});
const {bindToolPermission,matchToolDecision}=await jiti.import('./openhands-tool-permission.ts');
const now=Date.parse('2026-09-30T12:00:01Z');
const request={version:1,workspaceId:'w',missionId:'11111111-1111-4111-8111-111111111111',launchId:'22222222-2222-4222-8222-222222222222',runnerId:'runner',containerId:'a'.repeat(64),sessionId:'session',toolCallId:'call',inputJson:'{"command":"npm test"}',options:[{optionId:'allow',kind:'allow_once'}],requestedAt:'2026-09-30T12:00:00Z',expiresAt:'2026-09-30T12:00:30Z'};
const decision={version:1,decisionId:'33333333-3333-4333-8333-333333333333',requestHash:bindToolPermission(request,now).requestHash,actorId:'owner',optionId:'allow',decidedAt:'2026-09-30T12:00:01Z'};
test('exact decision matches only its request and actor',()=>{
 assert.ok(matchToolDecision(request,decision,'owner',now));
 for(const patch of [{workspaceId:'foreign'},{sessionId:'other'},{containerId:'b'.repeat(64)},{inputJson:'{"command":"npm publish"}'},{toolCallId:'later'}])assert.equal(matchToolDecision({...request,...patch},decision,'owner',now),null);
 assert.equal(matchToolDecision(request,decision,'foreign',now),null);
});
test('expired, persistent, duplicate, empty and oversized requests fail closed',()=>{
 for(const patch of [{expiresAt:'2026-09-30T12:00:01Z'},{expiresAt:'2026-09-30T12:03:01Z'},{options:[{optionId:'allow',kind:'allow_always'}]},{options:[...request.options,...request.options]},{inputJson:'{}'},{inputJson:'{"x":"'+'x'.repeat(17000)+'"}'},{inputJson:'{"x":1e400}'}])assert.equal(bindToolPermission({...request,...patch},now),null);
});
test('unknown option and future decision cannot match',()=>{
 assert.equal(matchToolDecision(request,{...decision,optionId:'other'},'owner',now),null);
 assert.equal(matchToolDecision(request,{...decision,decidedAt:'2026-09-30T12:00:02Z'},'owner',now),null);
});
