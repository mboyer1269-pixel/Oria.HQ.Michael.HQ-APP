import test from 'node:test';
import assert from 'node:assert/strict';
import {createJiti} from 'jiti';
const jiti=createJiti(import.meta.url);
const {sealLedgerEntry}=await jiti.import('./hash-chain-sealer.ts');
const {toLedgerChainEntry,restorePersistedLedgerTimestamp}=await jiti.import('./hash-chain-ledger-fields.ts');
const {verifyChain}=await jiti.import('./hash-chain-verifier.ts');
const fields={id:'entry-1',workspace_id:'test-workspace',user_id:'owner',agent_id:null,skill_id:null,mission_id:null,action_type:'test',event_type:'decision',summary:'Fixture',autonomy_level:0,requires_confirmation:true,payload:{},metadata:{},created_at:'2026-10-06T01:40:02.123Z'};

test('a sealed timestamp survives PostgreSQL UTC offset and padded precision without resealing',()=>{
 const sealed=sealLedgerEntry(fields,{prevHash:null,hmacKey:'synthetic-test-key'});
 for(const timestamp of ['2026-10-06T01:40:02.123+00:00','2026-10-06T01:40:02.123000+00:00','2026-10-05T21:40:02.123-04:00']){
  const decoded=toLedgerChainEntry({...sealed,created_at:timestamp});
  assert.equal(decoded.entry_hash,sealed.entry_hash);
  assert.equal(decoded.created_at,fields.created_at);
  assert.equal(verifyChain([decoded]).ok,true);
 }
});

test('changed milliseconds and nonzero microseconds remain detectable',()=>{
 const sealed=sealLedgerEntry(fields,{prevHash:null,hmacKey:'synthetic-test-key'});
 for(const timestamp of ['2026-10-06T01:40:02.124+00:00','2026-10-06T01:40:02.123001+00:00']){
  assert.equal(verifyChain([toLedgerChainEntry({...sealed,created_at:timestamp})]).ok,false);
 }
 assert.equal(restorePersistedLedgerTimestamp('2026-10-06T01:40:02.123001+00:00'),'2026-10-06T01:40:02.123001+00:00');
});

test('whole and short fractional seconds restore milliseconds; unknown text remains untouched',()=>{
 assert.equal(restorePersistedLedgerTimestamp('2026-10-06T01:40:02+00:00'),'2026-10-06T01:40:02.000Z');
 assert.equal(restorePersistedLedgerTimestamp('2026-10-06T01:40:02.12+00:00'),'2026-10-06T01:40:02.120Z');
 for(const value of ['invalid','2026-10-06','2026-10-06T01:40:02.123'])assert.equal(restorePersistedLedgerTimestamp(value),value);
});

test('timestamp restoration preserves HMAC verification and still rejects a wrong key or altered content',()=>{
 const sealed=sealLedgerEntry(fields,{prevHash:null,hmacKey:'synthetic-test-key'});
 const restored=toLedgerChainEntry({...sealed,created_at:'2026-10-06T01:40:02.123000+00:00'});
 assert.equal(restored.hmac,sealed.hmac);
 assert.deepEqual(verifyChain([restored],{hmacKey:'synthetic-test-key'}),{ok:true,count:1});
 assert.equal(verifyChain([restored],{hmacKey:'wrong-synthetic-key'}).reason,'hmac mismatch');
 assert.equal(verifyChain([{...restored,summary:'Changed content'}],{hmacKey:'synthetic-test-key'}).reason,'entry_hash mismatch (tampered content or prev_hash)');
});
