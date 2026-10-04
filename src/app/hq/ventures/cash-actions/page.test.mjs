import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const code = ts.transpileModule(fs.readFileSync(new URL('./page.tsx',import.meta.url),'utf8'), {
  compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}
}).outputText;
for (const unavailable of [false,true]) test(`page read does not call a model when queue ${unavailable?'fails':'is empty'}`,async()=>{
  let modelCalls=0;
  const exports={};
  const modules={
    'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},
    '@/core/workspaces/registry':{getDefaultWorkspace:()=>({id:'synthetic'})},
    '@/server/auth/owner':{requireOwnerAccess:async()=>({allowed:true,user:{id:'synthetic'}})},
    '@/server/ventures/prepared-action-repository':{listPreparedActionsForWorkspace:async()=>{if(unavailable)throw Error('queue unavailable');return[];}},
    '@/features/ventures/cash-action-review-projection':{selectReviewablePreparedActions:x=>x},
    '@/server/ventures/cash-signal-intake-repository':{listCashSignalIntakesForWorkspace:async()=>[],getCashSignalIntakePersistenceMode:()=> 'local'},
  };
  const require=name=>{
    if(/llm|active-venture-context/.test(name))return new Proxy({}, {get:()=>()=>{modelCalls++;throw Error('No model allowed during page read');}});
    return modules[name]||new Proxy({}, {get:(_,key)=>String(key)});
  };
  vm.runInNewContext(code,{exports,require});
  const rendered=await exports.default();
  assert.equal(modelCalls,0);
  assert.ok(JSON.stringify(rendered).includes('"packets":[]'));
  assert.ok(JSON.stringify(rendered).includes(`"preparedQueueUnavailable":${unavailable}`));
});
