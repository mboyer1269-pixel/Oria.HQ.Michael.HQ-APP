import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';import {createJiti} from 'jiti';
const jiti=createJiti(import.meta.url,{alias:{'@':path.join(process.cwd(),'src'),'server-only':path.join(process.cwd(),'src/scripts/smoke/server-only-stub.mjs')}});
const {parseOpenHandsProjectRegistry}=await jiti.import('./openhands-project-registry.ts');
const entry={workspaceId:'w',projectId:'p',label:'Project',namespace:'org:project-p',centerEntityId:'anchor',endpoint:'https://memex.example/mcp',readHandleFile:path.resolve('synthetic-handle')};
test('registry accepts explicit unique project configuration without credentials',()=>{
 assert.deepEqual(parseOpenHandsProjectRegistry(undefined),[]);assert.deepEqual(parseOpenHandsProjectRegistry(JSON.stringify([entry])),[entry]);
});
test('registry rejects duplicate identities, shared namespaces and unsafe destinations',()=>{
 for(const entries of [[entry,entry],[entry,{...entry,workspaceId:'foreign',projectId:'other'}],
   [{...entry,namespace:'org:workspace:w'}],[{...entry,readHandleFile:'relative'}],[{...entry,readHandle:'secret'}],
   [{...entry,endpoint:'http://internal/mcp'}],[{...entry,endpoint:'https://user:pass@memex.example/mcp'}],[{...entry,endpoint:'https://memex.example/mcp?token=x'}]]) {
  assert.throws(()=>parseOpenHandsProjectRegistry(JSON.stringify(entries)));
 }
 assert.throws(()=>parseOpenHandsProjectRegistry('x'.repeat(32769)));
});
