import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {createJiti} from "jiti";
const jiti=createJiti(import.meta.url,{jsx:true,alias:{"@":path.join(process.cwd(),"src")}});
const {parsePendingReview}=await jiti.import("./memex-review-panel.tsx");
const pending={proposalId:"p1",expectedPayloadHash:"a".repeat(64),hashVersion:1,decisionId:"12345678-1234-4234-8234-123456789abc",decision:"approve"};
test("restored pending decision is exact and excludes injected identity/content",()=>{
 assert.deepEqual(parsePendingReview(JSON.stringify(pending)),pending);
 for(const raw of ["{",JSON.stringify({...pending,reviewerId:"forged"}),JSON.stringify({...pending,decisionId:`prefix${pending.decisionId}`}),JSON.stringify({...pending,proposalId:"x".repeat(161)}),JSON.stringify({...pending,decision:"publish"})])assert.throws(()=>parsePendingReview(raw),/storage/);
});
