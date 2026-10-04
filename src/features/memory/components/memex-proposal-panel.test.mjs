import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createJiti } from "jiti";
const jiti=createJiti(import.meta.url,{jsx:true,alias:{"@":path.join(process.cwd(),"src")}});
const {parseReceiptHistory,appendReceipt}=await jiti.import("./memex-proposal-panel.tsx");
const receipt=n=>({status:"received",requestId:`12345678-1234-4234-8234-${String(n).padStart(12,"0")}`,proposalId:`p${n}`,proposalStatus:"proposed",publicationStatus:"unknown"});
test("history keeps20 deduplicated receipts, preserves previous cycle without content",()=>{
 let history=[];for(let i=0;i<25;i++)history=appendReceipt(history,receipt(i));assert.equal(history.length,20);assert.equal(history[0].requestId,receipt(24).requestId);
 history=appendReceipt(history,{...receipt(24),proposalStatus:"approved"});assert.equal(history.length,20);assert.equal(history[0].proposalStatus,"approved");
 const parsed=parseReceiptHistory(JSON.stringify([{...receipt(1),content:"must not persist"}]));assert.equal("content" in parsed[0],false);
});
test("corrupt history fails closed instead of silently discarding receipt",()=>{
 for(const value of ['{','{}','[{"status":"received"}]',JSON.stringify([ {...receipt(1),requestId:"bad"} ]),JSON.stringify(Array.from({length:21},(_,i)=>receipt(i)))])assert.throws(()=>parseReceiptHistory(value));
 assert.deepEqual(parseReceiptHistory(null),[]);
});
