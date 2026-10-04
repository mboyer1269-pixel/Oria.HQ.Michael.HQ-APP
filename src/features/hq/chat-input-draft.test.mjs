import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
const jiti=createJiti(import.meta.url);
const {CHAT_INPUT_TTL_MS,chatInputDraftKey,readChatInputDraft,saveChatInputDraft,clearSentChatInputDraft}=await jiti.import("./chat-input-draft.ts");
const now=1700000000000;
const first={id:"6f1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d",text:"Saisie privée à reprendre"};
const next={id:"7a2c3d4e-5f60-4b7c-9d8e-1f2a3b4c5d6e",text:"Nouvelle saisie pendant la réponse"};
function tab(){const entries=new Map();return {entries,getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,value),removeItem:key=>entries.delete(key)};}
test("unsent input survives repeated page remounts and reads do not consume it",()=>{
 const storage=tab();assert.equal(saveChatInputDraft(storage,"a",first,now),true);
 for(let i=1;i<=3;i++)assert.deepEqual(readChatInputDraft(storage,"a",now+i),{status:"ready",draft:first});
 assert.deepEqual(Object.keys(JSON.parse(storage.getItem(chatInputDraftKey("a")))).sort(),["expiresAt","id","text","version","workspaceId"]);
});
test("only explicit success cleanup clears the corresponding input",()=>{
 const storage=tab();saveChatInputDraft(storage,"a",first,now);
 // While pending or failed, no success cleanup occurs and remount restores input.
 assert.equal(readChatInputDraft(storage,"a",now+1).draft.text,first.text);
 assert.equal(clearSentChatInputDraft(storage,"a",first.id,now+2),true);
 assert.deepEqual(readChatInputDraft(storage,"a",now+3),{status:"absent"});
});
test("a late successful response never removes a newer edit, even if text is identical",()=>{
 for(const text of [next.text,first.text]){
  const storage=tab();saveChatInputDraft(storage,"a",first,now);
  saveChatInputDraft(storage,"a",{...next,text},now+1);
  assert.equal(clearSentChatInputDraft(storage,"a",first.id,now+2),true);
  assert.deepEqual(readChatInputDraft(storage,"a",now+3),{status:"ready",draft:{...next,text}});
 }
});
test("workspace switch never restores or clears another project's input",()=>{
 const storage=tab();saveChatInputDraft(storage,"a",first,now);
 assert.deepEqual(readChatInputDraft(storage,"b",now),{status:"absent"});
 clearSentChatInputDraft(storage,"b",first.id,now);
 assert.equal(readChatInputDraft(storage,"a",now).status,"ready");
});
test("unavailable storage and failed removal are reported without a fake cleared state",()=>{
 const storage={getItem(){throw Error("blocked");},setItem(){throw Error("blocked");},removeItem(){throw Error("blocked");}};
 assert.deepEqual(readChatInputDraft(storage,"a",now),{status:"unavailable"});
 assert.equal(saveChatInputDraft(storage,"a",first,now),false);
 assert.equal(clearSentChatInputDraft(storage,"a",first.id,now),false);
 const working=tab();saveChatInputDraft(working,"a",first,now);working.removeItem=()=>{throw Error("blocked");};
 assert.equal(clearSentChatInputDraft(working,"a",first.id,now),false);
 assert.equal(readChatInputDraft(working,"a",now).status,"ready");
});
test("bounded schema expires after 24 hours and rejects foreign or corrupted records",()=>{
 const storage=tab();assert.equal(saveChatInputDraft(storage,"a",{...first,text:"x".repeat(4001)},now),false);
 saveChatInputDraft(storage,"a",first,now);
 assert.deepEqual(readChatInputDraft(storage,"a",now+CHAT_INPUT_TTL_MS),{status:"invalid"});
 for(const value of ["{","null","[]",JSON.stringify({version:2,workspaceId:"a",...first,expiresAt:now+100}),JSON.stringify({version:1,workspaceId:"b",...first,expiresAt:now+100}),JSON.stringify({version:1,workspaceId:"a",...first,expiresAt:now+100,token:"extra-field"})]){
  storage.setItem(chatInputDraftKey("a"),value);assert.equal(readChatInputDraft(storage,"a",now).status,"invalid");
 }
});
test("user-cleared input and whitespace are preserved exactly without autosend",()=>{
 const storage=tab();for(const text of ["","  Nouvelle demande\n "]){saveChatInputDraft(storage,"a",{...first,text},now);assert.equal(readChatInputDraft(storage,"a",now).draft.text,text);}
});
