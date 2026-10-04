import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { createJiti } from 'jiti';

test('signed Memex HTTP capture survives attachment, memory changes and exact dossier confirmation',
  { skip: !process.env.MEMEX_CORE_TEST_ROOT }, async () => {
  const memexRoot=process.env.MEMEX_CORE_TEST_ROOT;
  const load=relative=>import(pathToFileURL(path.join(memexRoot,relative)).href);
  const graph=await load('src/graph.ts');
  const {createHttpApp}=await load('src/mcp/unified-server.ts');
  const {mintHandle}=await load('src/mcp/handles.ts');
  const jiti=createJiti(import.meta.url,{alias:{'@':path.join(process.cwd(),'src'),
    'server-only':path.join(process.cwd(),'src/scripts/smoke/server-only-stub.mjs')}});
  const hq=relative=>jiti.import(path.join(process.cwd(),'src',relative));
  const {createProjectHttpMemexTransport}=await hq('server/mcp/memex-http-transport.ts');
  const {createDevelopmentService}=await hq('server/missions/development-mission.ts');
  const {createOpenHandsMemoryAttachmentService}=await hq('server/missions/openhands-memory-attachment.ts');
  const {createOpenHandsConfirmationService}=await hq('server/missions/openhands-confirmation.ts');
  const {createOpenHandsHandler}=await hq('app/api/orchestration/openhands/handler.ts');
  const {OPENHANDS_RESERVATION_KEY}=await hq('server/missions/openhands-reservation.ts');
  const savedEnv={AGENTMEMORY_HANDLE_SECRET:process.env.AGENTMEMORY_HANDLE_SECRET,
    GATEWAY_TOKEN:process.env.GATEWAY_TOKEN,GATEWAY_DEFAULT_ACCESS:process.env.GATEWAY_DEFAULT_ACCESS};
  // Ephemeral test credential, never printed, written to disk, or used by a real service.
  const secret=randomBytes(32).toString('hex');
  process.env.AGENTMEMORY_HANDLE_SECRET=secret;
  delete process.env.GATEWAY_TOKEN;
  process.env.GATEWAY_DEFAULT_ACCESS='read_only';
  graph.initGraph(':memory:');
  let server;
  const transports=[];
  try {
    const namespace='org:synthetic-project-a',workspaceId='synthetic-workspace',projectId='project-a';
    graph.addEntity({id:'anchor-a',type:'Project',namespace,name:'Original decision 🧪',source:'reviewed:test',properties:{status:'verified'}});
    graph.addEntity({id:'foreign-b',type:'Project',namespace:'org:synthetic-project-b',name:'FOREIGN_CONTENT_MUST_NOT_APPEAR',source:'reviewed:test',properties:{status:'verified'}});
    server=await new Promise((resolve,reject)=>{const s=createHttpApp().listen(0,'127.0.0.1',()=>resolve(s));s.once('error',reject);});
    const endpoint=`http://127.0.0.1:${server.address().port}/mcp`;
    const handle=mintHandle('hq-lifecycle-test','read_only',secret,60,new Date(),[namespace]);
    let reads=0,closes=0;
    const transportFactory=async()=>{
      const transport=createProjectHttpMemexTransport({workspaceId,namespace,endpoint,readHandle:handle},async(...args)=>{reads++;return fetch(...args);});
      transports.push(transport);
      return {...transport,close:async()=>{closes++;await transport.close();}};
    };
    let mission;
    await createDevelopmentService({enabled:()=>true,store:()=>({save:async m=>(mission=m),load:async()=>mission})}).create({
      requestId:'714ac9b7-6bce-4eb4-b3bd-08d3df8ad46e',title:'Synthetic live capture',objective:'Check end-to-end memory',scope:'One test',acceptanceCriteria:'Original snapshot remains approved'},
      {workspaceId,modeId:'hq',actorId:'synthetic-owner'});
    const context={workspaceId,actorId:'synthetic-owner'};
    const request={missionId:mission.id,expectedUpdatedAt:mission.updatedAt,commitSha:'a'.repeat(40),executorVersion:'1.50.0',budget:{maxCostCents:100,maxTokens:10000,maxIterations:2,timeoutSeconds:60}};
    let snapshot;let attachmentWrites=0;let authorization;let reservationWrites=0;
    // Mission/ledger stores are in-memory test doubles. Memex HTTP/auth/graph are real.
    const attach=createOpenHandsMemoryAttachmentService({
      store:{load:async()=>structuredClone(mission),attach:async(prior,memory)=>{
        assert.equal(prior.updatedAt,mission.updatedAt);attachmentWrites++;
        mission={...mission,input:{...mission.input,_openhandsMemory:memory},updatedAt:new Date(Date.parse(mission.updatedAt)+1).toISOString()};
        return structuredClone(mission);
      }},
      snapshots:{load:async()=>snapshot??null,persist:async(_scope,value)=>(snapshot??=value)},
      resolveProjectBinding:async(w,p)=>w===workspaceId&&p===projectId?{workspaceId,projectId,namespace,namespaceScope:'project',centerEntityId:'anchor-a'}:null,
      createTransport:transportFactory,
    });
    const confirmation=createOpenHandsConfirmationService({
      store:()=>({load:async()=>structuredClone(mission),compareAndSwap:async(prior,receipt)=>{
        if(prior.updatedAt!==mission.updatedAt||JSON.stringify(prior.input)!==JSON.stringify(mission.input))return null;
        reservationWrites++;mission={...mission,input:{...mission.input,[OPENHANDS_RESERVATION_KEY]:receipt},updatedAt:new Date(Date.parse(mission.updatedAt)+1).toISOString()};return structuredClone(mission);
      },audit:async()=> 'synthetic-audit'}),
      authority:()=>({persist:async(dossier,actorId,now)=>{
        authorization={dossier,record:{version:1,id:'bcdc08c6-7ee9-4a92-8ab6-e8b8eae7d94e',scope:'openhands.submission',workspaceId,missionId:dossier.mission.id,
          missionVersion:dossier.mission.version,idempotencyKey:dossier.idempotencyKey,payloadHash:dossier.payloadHash,actorId,
          approvedAt:new Date(now).toISOString(),expiresAt:new Date(now+600000).toISOString()}};
        return authorization.record;
      }}),
    });
    const handler=createOpenHandsHandler({authenticate:async()=>({actorId:context.actorId}),enabled:()=>true,workspaceId:()=>workspaceId,
      publicOrigin:()=> 'https://hq.synthetic.invalid',attachMemory:attach,service:confirmation});
    const call=async body=>{
      const response=await handler(new Request('https://hq.synthetic.invalid/api/orchestration/openhands',{method:'POST',headers:{origin:'https://hq.synthetic.invalid','content-type':'application/json'},body:JSON.stringify(body)}));
      return {status:response.status,body:await response.json()};
    };
    const attached=await call({action:'attach_memory',...request,projectId});
    assert.equal(attached.status,200);assert.equal(attached.body.status,'attached');
    assert.equal(reads,2);assert.equal(closes,1);assert.equal(attachmentWrites,1);
    assert.ok(snapshot.content.includes('Original decision'));assert.ok(!snapshot.content.includes('FOREIGN_CONTENT'));
    graph.addEntity({id:'later-decision',type:'Decision',namespace,name:'New decision after capture',source:'reviewed:test',properties:{status:'verified'}});
    graph.addRelation({id:'later-link',type:'RELATED_TO',sourceId:'anchor-a',targetId:'later-decision',namespace,source:'reviewed:test'});
    const fresh=await fetch(endpoint,{method:'POST',headers:{authorization:`Bearer ${handle}`,'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:49,method:'tools/call',params:{name:'agentmemory_context_pack',arguments:{namespace,centerEntityId:'anchor-a',format:'json'}}})});
    assert.ok(JSON.stringify(await fresh.json()).includes('New decision after capture'),'the live graph really changed');
    const current={...request,expectedUpdatedAt:attached.body.updatedAt};
    const preview=await call({action:'prepare',...current});
    assert.equal(preview.status,200);assert.equal(preview.body.dossier.contractVersion,2);
    assert.equal(preview.body.dossier.memory.snapshotHash,snapshot.snapshotHash);
    assert.ok(!preview.body.dossier.memory.content.includes('New decision'));
    const confirm={action:'confirm',...current,expectedPayloadHash:preview.body.dossier.payloadHash,confirm:true};
    assert.equal((await call(confirm)).body.status,'reserved');
    assert.equal((await call(confirm)).body.status,'already_reserved');
    assert.deepEqual(authorization.dossier.memory,preview.body.dossier.memory);assert.equal(reservationWrites,2);assert.equal(reads,2);
    // Bypass the HQ client to verify Memex itself, not only its client-side guard.
    const foreign=await fetch(endpoint,{method:'POST',headers:{authorization:`Bearer ${handle}`,'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:50,method:'tools/call',params:{name:'agentmemory_context_pack',arguments:{namespace:'org:synthetic-project-b',centerEntityId:'foreign-b',format:'json'}}})});
    const denied=await foreign.json();assert.ok(denied.error);assert.ok(!JSON.stringify(denied).includes('FOREIGN_CONTENT'));
    const invalidHandle=handle.slice(0,-1)+(handle.endsWith('A')?'B':'A');
    const invalid=await fetch(endpoint,{method:'POST',headers:{authorization:`Bearer ${invalidHandle}`,'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:51,method:'tools/list'})});
    assert.equal(invalid.status,401);
  } finally {
    await Promise.allSettled(transports.map(t=>t.close()));
    if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    graph.closeGraph();
    for(const [key,value]of Object.entries(savedEnv)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
  }
});
