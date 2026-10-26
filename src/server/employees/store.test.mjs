import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createJiti } from 'jiti';
// REAL adapter, synthetic transport only: no credential, session or PostgreSQL.
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'oria-employees-adapter-'));
fs.writeFileSync(path.join(dir,'client.ts'),'export const createOptionalSupabaseAdminClient = () => globalThis.__employeeAdapterTestDb;');
const jiti=createJiti(import.meta.url,{alias:{'@':path.resolve('src'),'@/server/supabase/admin':path.join(dir,'client.ts'),'server-only':path.resolve('src/scripts/smoke/server-only-stub.mjs')}});
const {createEmployeeStore}=await jiti.import('./store.ts');
const scope={ownerId:'owner-a',workspaceId:'workspace-a',ventureId:'venture-a'};
const key='11111111-1111-4111-8111-111111111111';
const fields={displayName:'Bob',specialty:'Recherche',instructions:'Analyser',assignmentRole:'Analyste',assignmentContext:'Business A'};
const id='emp_10000000-0000-4000-8000-000000000001';
const row={id,owner_id:scope.ownerId,workspace_id:scope.workspaceId,venture_id:scope.ventureId,display_name:fields.displayName,specialty:fields.specialty,instructions:fields.instructions,assignment_role:fields.assignmentRole,assignment_context:fields.assignmentContext,state:'draft',revision:1};
function fake(responses){const calls=[];return {calls,from(table){const chain={};calls.push(['from',table]);for(const method of ['select','eq','update','insert','single','maybeSingle','order'])chain[method]=(...args)=>{calls.push([method,...args]);return chain;};chain.then=(yes,no)=>{const next=responses.shift();return Promise.resolve(typeof next==='function'?next(calls):next??{data:null,error:null}).then(yes,no);};return chain;}}}
function set(responses){const db=fake(responses);globalThis.__employeeAdapterTestDb=db;return db;}
function scoped(calls){for(const [key,value] of [['owner_id',scope.ownerId],['workspace_id',scope.workspaceId],['venture_id',scope.ventureId]])assert.ok(calls.some(c=>c[0]==='eq'&&c[1]===key&&c[2]===value));}
test('no configured store means unavailable, never memory fallback',()=>{globalThis.__employeeAdapterTestDb=null;assert.equal(createEmployeeStore(),null);});
test('read filters owner workspace and actual business; cross-scope response rejected',async()=>{
 const db=set([{data:[row],error:null}]);const records=await createEmployeeStore().list(scope);assert.equal(records[0].id,id);scoped(db.calls);
 for(const patch of [{owner_id:'other'},{workspace_id:'other'},{venture_id:'other'},{id:'joris'},{revision:0},{state:'active'}]){set([{data:[{...row,...patch}],error:null}]);await assert.rejects(createEmployeeStore().list(scope));}
 set([{data:null,error:{message:'database detail secret'}}]);await assert.rejects(createEmployeeStore().list(scope),{message:'Employee directory persistence unavailable.'});
});
test('single insert includes profile plus assignment and generated namespace ID',async()=>{
 const db=set([calls=>({data:calls.find(c=>c[0]==='insert')[1],error:null})]);const saved=await createEmployeeStore().create(scope,fields,key);assert.match(saved.id,/^emp_[0-9a-f-]{36}$/);assert.notEqual(saved.id,id);assert.equal(saved.state,'draft');assert.equal(saved.revision,1);
 assert.equal(db.calls.filter(c=>c[0]==='insert').length,1);assert.deepEqual(db.calls.filter(c=>c[0]==='from'),[['from','employee_profiles']]);const inserted=db.calls.find(c=>c[0]==='insert')[1];assert.equal(inserted.venture_id,scope.ventureId);assert.equal(inserted.owner_id,scope.ownerId);assert.equal(inserted.workspace_id,scope.workspaceId);
});
test('failed insert not acknowledged or retried; malformed return not success',async()=>{
 for(const response of [{data:null,error:{message:'failed constraint'}},{data:row,error:null}]){const db=set([response]);await assert.rejects(createEmployeeStore().create(scope,fields,key));assert.equal(db.calls.filter(c=>c[0]==='insert').length,1);assert.equal(db.calls.filter(c=>c[0]==='from').length,1);}
});
test('edit writes only presentation fields and revision, all scope and CAS guards used',async()=>{
 const db=set([{data:{...row,display_name:'Alice',revision:2},error:null}]);const result=await createEmployeeStore().change(scope,{operation:'edit',id,revision:1,...fields,displayName:'Alice'});assert.equal(result.id,id);assert.equal(result.revision,2);scoped(db.calls);
 for(const pair of [['id',id],['revision',1],['state','draft']])assert.ok(db.calls.some(c=>c[0]==='eq'&&c[1]===pair[0]&&c[2]===pair[1]));
 assert.deepEqual(Object.keys(db.calls.find(c=>c[0]==='update')[1]).sort(),['assignment_context','assignment_role','display_name','instructions','revision','specialty']);
});
test('stale revision or foreign employee returns conflict without existence disclosure',async()=>{set([{data:null,error:null}]);assert.equal(await createEmployeeStore().change(scope,{operation:'archive',id,revision:1}),null);});
test('archive preserves row and identity, only state+revision updated',async()=>{
 const db=set([{data:{...row,state:'archived',revision:2},error:null}]);const result=await createEmployeeStore().change(scope,{operation:'archive',id,revision:1});assert.equal(result.id,id);assert.equal(result.state,'archived');assert.deepEqual(db.calls.find(c=>c[0]==='update'),['update',{state:'archived',revision:2}]);scoped(db.calls);assert.ok(!db.calls.some(c=>c[0]==='delete'));
});
test('adapter rejects altered acknowledgement and database errors',async()=>{
 for(const response of [{data:{...row,revision:2,venture_id:'b'},error:null},{data:{...row,revision:2,state:'draft'},error:null},{data:null,error:{message:'private'}}]){set([response]);await assert.rejects(createEmployeeStore().change(scope,{operation:'archive',id,revision:1}));}
});
test('bounds and controls enforced; multiline instructions supported',async()=>{
 for(const patch of [{displayName:''},{displayName:' Bob '},{displayName:'x'.repeat(81)},{specialty:'x\n'},{instructions:'bad\u0001'}]){const db=set([]);await assert.rejects(createEmployeeStore().create(scope,{...fields,...patch},key));assert.equal(db.calls.length,0);}
 set([calls=>({data:calls.find(c=>c[0]==='insert')[1],error:null})]);assert.equal((await createEmployeeStore().create(scope,{...fields,instructions:'Line 1\nLine 2\tX'},key)).instructions,'Line 1\nLine 2\tX');
});
test('numbered SQL statically preserves isolation and atomic single-row schema (not DB proof)',()=>{
 const sql=fs.readFileSync('db/migrations/0035_employee_profiles.sql','utf8');assert.match(sql,/NOT APPLIED/);assert.match(sql,/foreign key \(venture_id, workspace_id\) references public\.ventures\(id, workspace_id\)/);assert.match(sql,/enable row level security/);assert.match(sql,/to anon, authenticated using \(false\) with check \(false\)/);assert.match(sql,/revoke all on public\.employee_profiles from public, anon, authenticated, service_role/);assert.match(sql,/OLD\.state <> 'draft'/);assert.match(sql,/NEW\.revision <> OLD\.revision \+ 1/);assert.match(sql,/must be archived/);assert.doesNotMatch(sql,/on delete cascade/i);assert.doesNotMatch(sql,/language plpgsql security definer/i);assert.equal((sql.match(/create table /g)||[]).length,1);
 assert.ok(fs.readdirSync('db/migrations/drafts').every(n=>!n.includes('employee_profiles')));
});

// Combined proof: REAL service -> REAL store -> stateful synthetic PostgREST
// transport. This is not PostgreSQL, an auth session, RLS or MVCC qualification.
const {readEmployees,saveEmployee}=await jiti.import('./service.ts');
function statefulTransport(){
 const rows=new Map(), calls=[];
 const transport={rows,calls,failNextInsert:false,from(table){
  assert.equal(table,'employee_profiles','no provider, dispatcher or other table access');
  const query={kind:'select',filters:[],payload:null,single:false};
  const chain={
   select(){return chain},order(){return chain},single(){query.single=true;return chain},maybeSingle(){query.single=true;return chain},
   eq(key,value){query.filters.push([key,value]);return chain},
   insert(payload){query.kind='insert';query.payload=structuredClone(payload);return chain},
   update(payload){query.kind='update';query.payload=structuredClone(payload);return chain},
   then(resolve,reject){return Promise.resolve().then(()=>{
    calls.push(structuredClone(query));
    if(query.kind==='insert'){
     if(transport.failNextInsert){transport.failNextInsert=false;return {data:null,error:{message:'synthetic failed FK'}}}
     if(rows.has(query.payload.id)||[...rows.values()].some(r=>r.creation_key===query.payload.creation_key))return {data:null,error:{code:'23505',message:'synthetic duplicate'}};
     // One synthetic statement stores profile AND assignment together.
     rows.set(query.payload.id,structuredClone(query.payload));
     return {data:structuredClone(query.payload),error:null};
    }
    const matches=[...rows.values()].filter(row=>query.filters.every(([key,value])=>row[key]===value));
    if(query.kind==='select')return {data:structuredClone(query.single?(matches[0]??null):matches),error:null};
    assert.ok(matches.length<=1,'CAS targets at most one employee');
    if(!matches.length)return {data:null,error:null};
    const updated={...matches[0],...query.payload};rows.set(updated.id,structuredClone(updated));
    return {data:structuredClone(updated),error:null};
   }).then(resolve,reject)}
  };
  return chain;
 }};
 return transport;
}
test('combined real service + real store: three concurrent additions, reload and business isolation',async()=>{
 const db=statefulTransport();globalThis.__employeeAdapterTestDb=db;
 const writes=await Promise.all([1,2,3].map(n=>saveEmployee(scope,{operation:'create',creationKey:randomUUID(),...fields,displayName:`Employé ${n}`},createEmployeeStore())));
 assert.ok(writes.every(r=>r.status==='saved'));
 const ids=writes.map(r=>r.employee.id);assert.equal(new Set(ids).size,3);assert.equal(db.rows.size,3);
 // New adapter instance simulates a subsequent request, not process/DB persistence.
 const reloaded=await readEmployees(scope,createEmployeeStore());assert.equal(reloaded.status,'ready');assert.deepEqual(reloaded.employees.map(r=>r.id).sort(),ids.sort());
 assert.deepEqual((await readEmployees({...scope,ventureId:'venture-b'},createEmployeeStore())).employees,[]);
 const target=writes[0].employee;
 const renamed=await saveEmployee(scope,{operation:'edit',...fields,displayName:'Alice',id:target.id,revision:1},createEmployeeStore());
 assert.equal(renamed.status,'saved');assert.equal(renamed.employee.id,target.id);assert.equal(renamed.employee.ventureId,scope.ventureId);assert.equal(renamed.employee.ownerId,scope.ownerId);assert.equal(renamed.employee.workspaceId,scope.workspaceId);assert.equal(renamed.employee.revision,2);
 for(const other of [{...scope,ventureId:'venture-b'},{...scope,ownerId:'owner-b'},{...scope,workspaceId:'workspace-b'}]){
  const denied=await saveEmployee(other,{operation:'archive',id:target.id,revision:2},createEmployeeStore());assert.equal(denied.status,'conflict');
 }
 assert.equal(db.rows.get(target.id).display_name,'Alice');assert.equal(db.rows.get(target.id).state,'draft');
 assert.equal(db.calls.filter(c=>c.kind==='insert').length,3,'no duplicate/replayed creates');
});
test('combined real chain: insert failure atomic, stale CAS conflicts, archive preserves history',async()=>{
 const db=statefulTransport();globalThis.__employeeAdapterTestDb=db;db.failNextInsert=true;
 const failure=await saveEmployee(scope,{operation:'create',creationKey:randomUUID(),...fields},createEmployeeStore());assert.equal(failure.status,'unavailable');assert.equal(db.rows.size,0,'failed single statement leaves neither profile nor assignment');
 assert.equal(db.calls.length,1,'failure is not retried');
 const created=await saveEmployee(scope,{operation:'create',creationKey:randomUUID(),...fields},createEmployeeStore());assert.equal(created.status,'saved');const id=created.employee.id;
 const concurrent=await Promise.all(['First','Second'].map(displayName=>saveEmployee(scope,{operation:'edit',...fields,displayName,id,revision:1},createEmployeeStore())));
 assert.deepEqual(concurrent.map(r=>r.status).sort(),['conflict','saved']);assert.equal(db.rows.get(id).revision,2);
 assert.equal((await saveEmployee(scope,{operation:'archive',id,revision:1},createEmployeeStore())).status,'conflict');
 assert.equal((await saveEmployee(scope,{operation:'archive',id,revision:2},createEmployeeStore())).status,'saved');
 const reloaded=await readEmployees(scope,createEmployeeStore());assert.equal(reloaded.employees.length,1);assert.equal(reloaded.employees[0].id,id);assert.equal(reloaded.employees[0].state,'archived');assert.equal(reloaded.employees[0].revision,3);
 assert.equal((await saveEmployee(scope,{operation:'edit',...fields,id,revision:3},createEmployeeStore())).status,'conflict');assert.equal(db.rows.size,1);
});

test('real chain lost acknowledgement then same intention returns one stored identity',async()=>{
 const db=statefulTransport();globalThis.__employeeAdapterTestDb=db;
 const command={operation:'create',creationKey:randomUUID(),...fields};
 const original=createEmployeeStore();
 const lost={...original,async create(...args){await original.create(...args);throw Error('synthetic response lost after commit')}};
 assert.equal((await saveEmployee(scope,command,lost)).status,'unavailable');assert.equal(db.rows.size,1);
 const id=[...db.rows.keys()][0];
 const retry=await saveEmployee(scope,command,createEmployeeStore());
 assert.equal(retry.status,'saved');assert.equal(retry.employee.id,id);assert.equal(db.rows.size,1);
 assert.equal((await readEmployees(scope,createEmployeeStore())).employees[0].id,id);
});
test('identical concurrent intentions serialize through synthetic unique constraint, no overwrite',async()=>{
 const db=statefulTransport();globalThis.__employeeAdapterTestDb=db;
 const command={operation:'create',creationKey:randomUUID(),...fields};
 const result=await Promise.all([1,2].map(()=>saveEmployee(scope,command,createEmployeeStore())));
 assert.ok(result.every(r=>r.status==='saved'));assert.equal(result[0].employee.id,result[1].employee.id);assert.equal(db.rows.size,1);
 assert.equal(db.calls.filter(c=>c.kind==='update').length,0);
});
test('same key different initial content or scope conflicts without information disclosure',async()=>{
 const db=statefulTransport();globalThis.__employeeAdapterTestDb=db;
 const command={operation:'create',creationKey:randomUUID(),...fields};
 const first=await saveEmployee(scope,command,createEmployeeStore());assert.equal(first.status,'saved');
 for(const changed of ['displayName','specialty','instructions','assignmentRole','assignmentContext']) {
  const result=await saveEmployee(scope,{...command,[changed]:'Different'},createEmployeeStore());
  assert.equal(result.status,'conflict');assert.equal(result.employee,undefined);
 }
 for(const other of [{...scope,ownerId:'other'},{...scope,workspaceId:'other'},{...scope,ventureId:'other'}]) {
  const result=await saveEmployee(other,command,createEmployeeStore());assert.equal(result.status,'conflict');assert.equal(result.employee,undefined);
 }
 assert.equal(db.rows.size,1);assert.equal(db.rows.get(first.employee.id).display_name,'Bob');
});
test('replay compares immutable original payload, returning current edited or archived profile',async()=>{
 const db=statefulTransport();globalThis.__employeeAdapterTestDb=db;
 const command={operation:'create',creationKey:randomUUID(),...fields};
 const first=await saveEmployee(scope,command,createEmployeeStore());const id=first.employee.id;
 await saveEmployee(scope,{operation:'edit',id,revision:1,...fields,displayName:'Renamed'},createEmployeeStore());
 const replay=await saveEmployee(scope,command,createEmployeeStore());
 assert.equal(replay.status,'saved');assert.equal(replay.employee.displayName,'Renamed');assert.equal(replay.employee.revision,2);
 assert.equal((await saveEmployee(scope,{...command,displayName:'Renamed'},createEmployeeStore())).status,'conflict');
 await saveEmployee(scope,{operation:'archive',id,revision:2},createEmployeeStore());
 const archived=await saveEmployee(scope,command,createEmployeeStore());assert.equal(archived.status,'saved');assert.equal(archived.employee.state,'archived');assert.equal(archived.employee.id,id);assert.equal(db.rows.size,1);
});
test('new intention permits same-name second employee; normalized equivalent payload replays',async()=>{
 const db=statefulTransport();globalThis.__employeeAdapterTestDb=db;
 const command={operation:'create',creationKey:randomUUID(),...fields};
 const first=await saveEmployee(scope,command,createEmployeeStore());
 const normalized=await saveEmployee(scope,{...command,displayName:' Bob '},createEmployeeStore());assert.equal(normalized.employee.id,first.employee.id);
 const second=await saveEmployee(scope,{...command,creationKey:randomUUID()},createEmployeeStore());assert.equal(second.status,'saved');assert.notEqual(second.employee.id,first.employee.id);assert.equal(db.rows.size,2);
});
test('unknown DB outcome is not retried; malformed keys rejected before adapter write',async()=>{
 for(const creationKey of [undefined,null,'','joris','FFFFFFFF-FFFF-4FFF-8FFF-FFFFFFFFFFFF','11111111-1111-1111-8111-111111111111']){
  const db=statefulTransport();globalThis.__employeeAdapterTestDb=db;assert.equal((await saveEmployee(scope,{operation:'create',creationKey,...fields},createEmployeeStore())).status,'invalid');assert.equal(db.calls.length,0);
 }
 const db=set([{data:null,error:{code:'57014',message:'timeout'}}]);
 assert.equal((await saveEmployee(scope,{operation:'create',creationKey:key,...fields},createEmployeeStore())).status,'unavailable');assert.equal(db.calls.filter(c=>c[0]==='insert').length,1);assert.equal(db.calls.filter(c=>c[0]==='from').length,1);
});
test('legacy upgrade draft is superseded: the numbered create already carries the idempotency pair',()=>{
 assert.equal(fs.existsSync('db/migrations/drafts/employee_profiles_idempotency_upgrade.sql'),false);
 const sql=fs.readFileSync('db/migrations/0035_employee_profiles.sql','utf8');
 assert.match(sql,/create unique index if not exists employee_profiles_creation_key_unique on public\.employee_profiles\(creation_key\) where creation_key is not null/);
 assert.match(sql,/creation_key is null and creation_payload_hash is null/);
 assert.match(sql,/NEW.creation_key is null or NEW.creation_payload_hash is null/);
 assert.match(sql,/NEW.creation_key is distinct from OLD.creation_key/);assert.match(sql,/NEW.creation_payload_hash is distinct from OLD.creation_payload_hash/);
 assert.match(sql,/security invoker/);assert.doesNotMatch(sql,/^update /mi);
});
