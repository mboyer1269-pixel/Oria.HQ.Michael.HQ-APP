import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {localConfig,allowedRequest,requireCommittedPatchAck,assertLostAckObservation} from './prove-cockpit-layout-real-db.mjs';
const pg='postgres://postgres@127.0.0.1:5432/oria_test_cockpit_layout',rest='http://127.0.0.1:3000';
test('proof requires exact named loopback DB and REST, no production override',()=>{
 assert.deepEqual(localConfig(pg,rest),{pg,rest});for(const v of [undefined,pg+'?host=external',pg.replace('127.0.0.1','example.invalid'),pg.replace('oria_test_cockpit_layout','postgres'),pg.replace('postgres@','postgres:secret@')])assert.throws(()=>localConfig(v,rest));for(const v of [undefined,'https://example.invalid',rest+'/rest/v1',rest.replace('127.0.0.1','localhost')])assert.throws(()=>localConfig(pg,v));
});
test('network allowlist is limited to bounded cockpit fixture requests',()=>{
 const url=rest+'/cockpit_layout?select=user_id,widget_order,updated_at&user_id=eq.cockpit-proof-owner';assert.equal(allowedRequest(url),true);for(const v of [url.replace(rest,'https://example.invalid'),url.replace('cockpit_layout','missions'),url+'&other=1',url.replace('cockpit-proof-owner','actual-owner'),url+'#fragment'])assert.equal(allowedRequest(v),false);
 assert.equal(allowedRequest(url,{method:'DELETE'}),false);assert.equal(allowedRequest(url,{method:'PATCH'}),false);
});
test('runner import has no DB side effect; workflow stays ephemeral, secretless and read-only',()=>{
 const source=fs.readFileSync(new URL('./prove-cockpit-layout-real-db.mjs',import.meta.url),'utf8');assert.match(source,/if\(entry&&process.argv\[2\]==='--run'\)/);assert.match(source,/OBSERVED_COCKPIT_UPDATE_WAITERS=2/);assert.match(source,/set request\.jwt\.claim\.sub=\$\{quote\(readOwner\)\}/);assert.match(source,/set request\.jwt\.claim\.sub=\$\{quote\(insertOwner\)\}/);
 const wf=fs.readFileSync(new URL('../.github/workflows/cockpit-layout-proof.yml',import.meta.url),'utf8');assert.match(wf,/contents: read/);assert.match(wf,/persist-credentials: false/);assert.match(wf,/postgres:16\.4-alpine/);assert.match(wf,/postgrest\/postgrest:v12\.2\.0/);assert.doesNotMatch(wf,/pull_request_target|secrets\.|sysctl|deploy|SUPABASE_SERVICE_ROLE/);
});

test('lost ACK proof rejects HTTP failure, unchanged version and false-positive recovered order',async()=>{
 const baseline={status:'loaded',order:['a','b'],revision:'2026-01-01T00:00:00.000Z'},request={widget_order:['b','a'],updated_at:'2026-01-01T00:00:00.001Z'};
 await assert.rejects(()=>requireCommittedPatchAck(new Response('{}',{status:500}),request,'owner',baseline),/successful mutation/);
 await assert.rejects(()=>requireCommittedPatchAck(new Response(JSON.stringify([{user_id:'owner',widget_order:request.widget_order,updated_at:baseline.revision}])),request,'owner',baseline));
 const ack=await requireCommittedPatchAck(new Response(JSON.stringify([{user_id:'owner',widget_order:request.widget_order,updated_at:request.updated_at}])),request,'owner',baseline);
 const good={result:{status:'unconfirmed'},baseline,target:request.widget_order,ack,recovered:{status:'loaded',order:request.widget_order,revision:request.updated_at},mutations:1};assert.doesNotThrow(()=>assertLostAckObservation(good));
 assert.throws(()=>assertLostAckObservation({...good,ack:null}),/missing validated commit ACK/);
 assert.throws(()=>assertLostAckObservation({...good,recovered:{...good.recovered,revision:baseline.revision}}));
 assert.throws(()=>assertLostAckObservation({...good,baseline:{...baseline,order:request.widget_order}}));
});
