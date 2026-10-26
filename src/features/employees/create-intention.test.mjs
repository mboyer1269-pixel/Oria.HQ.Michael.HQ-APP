import test from 'node:test';
import assert from 'node:assert/strict';
import {createJiti} from 'jiti';
const {intentionStorageKey,readIntention,retainIntention,clearIntention,isIntentionStale}=await createJiti(import.meta.url).import('./create-intention.ts');
const scope={ownerId:'owner',workspaceId:'workspace',ventureId:'business'};
const pending=()=>({version:1,createdAt:Date.now(),creationKey:'10000000-0000-4000-8000-000000000001',fields:{displayName:'Bob',specialty:'Research',instructions:'Analyze',assignmentRole:'Analyst',assignmentContext:'A'}});
function memory(){const rows=new Map();return {rows,getItem:k=>rows.get(k)??null,setItem:(k,v)=>rows.set(k,v),removeItem:k=>rows.delete(k)}}
test('same intention preserved across storage reread; every scope axis isolated',()=>{const s=memory(),p=pending();retainIntention(s,scope,p);assert.deepEqual(readIntention(s,scope),p);retainIntention(s,scope,p);for(const k of ['ownerId','workspaceId','ventureId'])assert.equal(readIntention(s,{...scope,[k]:'other'}),null);assert.equal(s.rows.size,1);});
test('unresolved intention cannot be overwritten by new key or changed payload',()=>{const s=memory(),p=pending();retainIntention(s,scope,p);for(const next of [{...p,creationKey:'20000000-0000-4000-8000-000000000002'},{...p,fields:{...p.fields,displayName:'Changed'}}])assert.throws(()=>retainIntention(s,scope,next));assert.deepEqual(readIntention(s,scope),p);clearIntention(s,scope);retainIntention(s,scope,{...p,creationKey:'20000000-0000-4000-8000-000000000002'});assert.equal(s.rows.size,1);});
test('malformed oversized forged or future recovery fails closed without deletion',()=>{for(const transform of [p=>({...p,creationKey:'joris'}),p=>({...p,ownerId:'other'}),p=>({...p,fields:{...p.fields,displayName:'x'.repeat(81)}}),p=>({...p,fields:{...p.fields,tools:['exec']}}),p=>({...p,createdAt:-1}),p=>({...p,createdAt:'yesterday'}),p=>({...p,createdAt:Date.now()+60000})]){const s=memory();s.setItem(intentionStorageKey(scope),JSON.stringify(transform(pending())));assert.throws(()=>readIntention(s,scope));assert.equal(s.rows.size,1);}});
test('storage denial or unacknowledged write/remove cannot masquerade as recoverable intent',()=>{const p=pending();assert.throws(()=>retainIntention({getItem:()=>null,setItem:()=>{throw Error('denied')},removeItem(){}},scope,p));assert.throws(()=>retainIntention({getItem:()=>null,setItem(){},removeItem(){}},scope,p));const s=memory();retainIntention(s,scope,p);assert.throws(()=>clearIntention({...s,removeItem(){}},scope));assert.deepEqual(readIntention(s,scope),p);});

test('valid intention older than 25 hours restores unchanged without storage writes',()=>{
  const s=memory(),p={...pending(),createdAt:Date.now()-26*60*60*1000};
  const key=intentionStorageKey(scope),raw=JSON.stringify(p);
  s.setItem(key,raw);
  const readOnly={getItem:s.getItem,setItem(){assert.fail('read wrote storage')},removeItem(){assert.fail('read deleted storage')}};
  assert.deepEqual(readIntention(readOnly,scope),p);
  for(const axis of ['ownerId','workspaceId','ventureId'])assert.equal(readIntention(readOnly,{...scope,[axis]:'other'}),null);
  assert.equal(s.getItem(key),raw);
  retainIntention(s,scope,p);
  assert.equal(s.getItem(key),raw);
});
test('intention age is a pure advisory with a strict 24 hour boundary',()=>{
  const p=Object.freeze({...pending(),createdAt:1000});
  assert.equal(isIntentionStale(p,1000),false);
  assert.equal(isIntentionStale(p,1000+24*60*60*1000),false);
  assert.equal(isIntentionStale(p,1001+24*60*60*1000),true);
  assert.equal(isIntentionStale(p,1000+26*60*60*1000),true);
  assert.equal(p.createdAt,1000);
});
test('malformed JSON and future records fail closed without any writes',()=>{
  for(const raw of ['{','null','[]',JSON.stringify({...pending(),createdAt:Date.now()+60000})]){
    const s=memory(),key=intentionStorageKey(scope);s.setItem(key,raw);
    assert.throws(()=>readIntention({getItem:s.getItem,setItem(){assert.fail('invalid read wrote storage')},removeItem(){assert.fail('invalid read deleted storage')}},scope));
    assert.equal(s.getItem(key),raw);
  }
});
test('explicit cleanup can retry after storage recovers and only clears its scope',()=>{
  const s=memory(),p={...pending(),createdAt:Date.now()-26*60*60*1000},other={...scope,ventureId:'other'};
  retainIntention(s,scope,p);retainIntention(s,other,p);
  assert.throws(()=>clearIntention({...s,removeItem(){throw Error('denied')}},scope));
  assert.deepEqual(readIntention(s,scope),p);
  clearIntention(s,scope);
  assert.equal(readIntention(s,scope),null);
  assert.deepEqual(readIntention(s,other),p);
  const next={...pending(),creationKey:'20000000-0000-4000-8000-000000000002'};
  retainIntention(s,scope,next);
  assert.deepEqual(readIntention(s,scope),next);
});
