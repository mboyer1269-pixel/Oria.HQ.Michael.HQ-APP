import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { createJiti } from 'jiti';
const jiti=createJiti(import.meta.url,{alias:{'@':path.resolve('src')}});
const {agentRegistry}=await jiti.import('@/features/agents/seed.ts');
const {isAgentDisplayNameStorageEnabled}=await jiti.import('./flag.ts');
const draft=fs.readFileSync('db/migrations/drafts/agent_display_names.sql','utf8');
test('not-live flag is closed and DDL remains draft-only',()=>{
 assert.equal(isAgentDisplayNameStorageEnabled(),false);
 for(const file of fs.readdirSync('db/migrations'))if(file.endsWith('.sql'))assert.doesNotMatch(fs.readFileSync('db/migrations/'+file,'utf8'),/create table(?: if not exists)? public\.agent_display_names/i);
});
test('draft constrains name, known IDs, scope, RLS and immutable-key grants',()=>{
 assert.match(draft,/primary key \(user_id, workspace_id, agent_id\)/i);
 assert.match(draft,/enable row level security/i);assert.equal((draft.match(/create policy /g)||[]).length,4);
 assert.match(draft,/for update to authenticated\s+using \(\(select auth.uid\(\)\) = user_id\) with check \(\(select auth.uid\(\)\) = user_id\)/);
 assert.match(draft,/revoke all .* from public, anon, authenticated/);
 assert.match(draft,/revoke all on public.agent_display_names from public, anon, authenticated, service_role/);
 assert.match(draft,/grant update \(display_name\)/);assert.doesNotMatch(draft,/grant update on|security definer|grant[^;]*to service_role/i);
 assert.match(draft,/char_length\(display_name\) between 1 and 80/);
 const ids=[...draft.match(/agent_id in \(([^)]+)\)/)[1].matchAll(/'([^']+)'/g)].map(m=>m[1]);assert.deepEqual(ids.sort(),agentRegistry.map(a=>a.id).sort());
});
test('revert matches object and verify remains read-only',()=>{
 assert.match(fs.readFileSync('db/migrations/drafts/agent_display_names_revert.sql','utf8'),/drop table if exists public.agent_display_names/);
 const sql=fs.readFileSync('db/migrations/drafts/agent_display_names_verify.sql','utf8').replace(/--[^\n]*/g,'');assert.doesNotMatch(sql,/\b(insert|update|delete|create|alter|drop|grant|revoke)\b/i);
});
