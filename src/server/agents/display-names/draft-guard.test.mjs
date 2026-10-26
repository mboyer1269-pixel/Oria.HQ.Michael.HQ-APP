import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { createJiti } from 'jiti';
const jiti=createJiti(import.meta.url,{alias:{'@':path.resolve('src')}});
const {agentRegistry}=await jiti.import('@/features/agents/seed.ts');
const {isAgentDisplayNameStorageEnabled}=await jiti.import('./flag.ts');
const draft=fs.readFileSync('db/migrations/0036_agent_display_names.sql','utf8');
test('not-live flag is closed and the table is defined by exactly one numbered migration',()=>{
 assert.equal(isAgentDisplayNameStorageEnabled(),false);
 const defs=fs.readdirSync('db/migrations').filter(f=>f.endsWith('.sql')&&/create table(?: if not exists)? public\.agent_display_names/i.test(fs.readFileSync('db/migrations/'+f,'utf8')));
 assert.deepEqual(defs,['0036_agent_display_names.sql']);
 assert.equal(fs.readdirSync('db/migrations/drafts').some(f=>f.startsWith('agent_display_names')),false);
});
test('migration constrains name, known IDs, scope, RLS and immutable-key grants',()=>{
 assert.match(draft,/primary key \(user_id, workspace_id, agent_id\)/i);
 assert.match(draft,/enable row level security/i);assert.equal((draft.match(/create policy /g)||[]).length,4);
 assert.match(draft,/workspace_id text not null references public\.workspaces\(id\)/);
 const member=/\(select auth.uid\(\)\) = user_id and exists \(select 1 from public\.workspace_members m where m\.workspace_id = agent_display_names\.workspace_id and m\.user_id = \(select auth.uid\(\)\)\)/g;
 assert.equal((draft.match(member)||[]).length,5,'membership in every USING and WITH CHECK');
 assert.match(draft,/check \(public\.oria_display_text_ok\(display_name, 80\)\)/);
 assert.match(draft,/revoke all .* from public, anon, authenticated/);
 assert.match(draft,/revoke all on public.agent_display_names from public, anon, authenticated, service_role/);
 assert.match(draft,/grant update \(display_name\)/);assert.doesNotMatch(draft,/grant update on|security definer|grant[^;]*to service_role/i);
 // P3: the CHECK list must stay identical to the canonical seed registry.
 const ids=[...draft.match(/agent_id in \(([^)]+)\)/)[1].matchAll(/'([^']+)'/g)].map(m=>m[1]);assert.deepEqual(ids.sort(),agentRegistry.map(a=>a.id).sort());
});
test('revert matches object and verify remains read-only',()=>{
 assert.match(fs.readFileSync('db/migrations/0036_agent_display_names_revert.sql','utf8'),/drop table if exists public.agent_display_names/);
 const sql=fs.readFileSync('db/migrations/0036_agent_display_names_verify.sql','utf8').replace(/--[^\n]*/g,'');assert.doesNotMatch(sql,/\b(insert|update|delete|create|alter|drop|grant|revoke)\b/i);
});
