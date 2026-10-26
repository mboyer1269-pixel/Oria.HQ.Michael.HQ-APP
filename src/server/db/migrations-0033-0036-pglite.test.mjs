// In-process PGlite proof for migrations 0033–0036. Never connects to any remote DB.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {createJiti} from 'jiti';
const jiti=createJiti(import.meta.url,{alias:{'@':path.resolve('src')}});
const rule=await jiti.import('@/core/text/display-text-rule.ts');
const M='db/migrations/';
const read=f=>fs.readFileSync(M+f,'utf8');
const NEW=['0033_workspaces.sql','0034_display_text_rule.sql','0035_employee_profiles.sql','0036_agent_display_names.sql'];
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const db=new PGlite();

async function as(role,uid,fn){
 await db.exec(`select set_config('t.uid','${uid??''}',false)`);
 if(role)await db.exec(`set role ${role}`);
 try{return await fn();}finally{await db.exec('reset role');}
}
const fails=async(p,re)=>{await assert.rejects(p,re);await db.exec('rollback').catch(()=>{});};

test.before(async()=>{
 await db.exec(`create schema if not exists auth; create table auth.users(id uuid primary key, email text);
 create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('t.uid', true),'')::uuid $$;
 create role anon; create role authenticated; create role service_role bypassrls;
 grant usage on schema auth, public to anon, authenticated, service_role;
 grant execute on all functions in schema auth to anon, authenticated, service_role;
 create table public.contact_leads(id uuid primary key, created_at timestamptz default now());`);
 await db.exec(read('0009_ventures.sql'));
 await db.exec(read('0032_workspace_members.sql'));
 await db.exec(`insert into auth.users values ('${A}','a@x'),('${B}','b@x');`);
});

test('0033–0036 apply cleanly and re-apply idempotently (twice)',async()=>{
 for(const f of NEW)await db.exec(read(f));
 for(const f of NEW)await db.exec(read(f));
 await db.exec(`insert into public.workspaces(id) values ('wsA'),('wsB') on conflict do nothing;
  insert into public.workspace_members values ('wsA','${A}','owner',now()),('wsB','${B}','owner',now());`);
 const {rows}=await db.query(`select to_regclass('public.agent_display_names') t, to_regclass('public.employee_profiles') e`);
 assert.ok(rows[0].t&&rows[0].e);
});

test('agent_display_names RLS: owner AND workspace member in USING and WITH CHECK',async()=>{
 await as('authenticated',A,()=>db.exec(`insert into public.agent_display_names values ('${A}','wsA','joris','Jo')`));
 await fails(as('authenticated',A,()=>db.exec(`insert into public.agent_display_names values ('${A}','wsB','joris','Jo')`)),/row-level security/);
 await fails(as('authenticated',A,()=>db.exec(`insert into public.agent_display_names values ('${B}','wsA','joris','Jo')`)),/row-level security/);
 await fails(as('authenticated',A,()=>db.exec(`insert into public.agent_display_names values ('${A}','nope','joris','Jo')`)),/row-level security|foreign key/);
 await db.exec(`insert into public.agent_display_names values ('${B}','wsB','joris','Bj')`);
 const seen=await as('authenticated',A,()=>db.query('select workspace_id from public.agent_display_names'));
 assert.deepEqual(seen.rows,[{workspace_id:'wsA'}]);
 const upd=await as('authenticated',A,()=>db.query(`update public.agent_display_names set display_name='pwn' where user_id='${B}'`));
 assert.equal(upd.affectedRows??0,0);
 await fails(as('authenticated',A,()=>db.exec(`update public.agent_display_names set workspace_id='wsB'`)),/permission denied/);
 // Membership revoked => row becomes invisible and immutable for A.
 await db.exec(`delete from public.workspace_members where workspace_id='wsA' and user_id='${A}'`);
 assert.equal((await as('authenticated',A,()=>db.query('select 1 from public.agent_display_names'))).rows.length,0);
 assert.equal((await as('authenticated',A,()=>db.query(`update public.agent_display_names set display_name='x'`))).affectedRows??0,0);
 await db.exec(`insert into public.workspace_members values ('wsA','${A}','owner',now())`);
 await fails(as('anon',null,()=>db.query('select * from public.agent_display_names')),/permission denied/);
 await fails(as('authenticated',A,()=>db.exec(`insert into public.agent_display_names values ('${A}','wsA','nouvel_agent','N')`)),/agent_id_known/);
});

test('SQL oria_display_text_ok agrees with the shared JS rule',async()=>{
 const samples=['Joris','Café','Cafe\u0301','😀'.repeat(80),'😀'.repeat(81),'',' Jo','Jo ','\u00A0Jo','Jo\u3000','Ali\u202Ece','Ali\u2066ce','Ali\u200Bce','Ali\u200Dce','Ali\u2028ce','Ali\u2029ce','Ali\u0085ce','Ali\u0001ce','Ali\tce','Ali\nce','Ali\u00ADce','Ali\uFEFFce','x\u{E0041}','x\u{1D173}','x\u{13430}','<script>','x\'; drop table x;--'];
 for(const multiline of [false,true])for(const s of samples){
  const {rows}=await db.query('select public.oria_display_text_ok($1, 80, $2) ok',[s,multiline]);
  assert.equal(rows[0].ok,rule.isValidDisplayText(s,{maxLength:80,multiline}),`${JSON.stringify(s)} multiline=${multiline}`);
 }
 await fails(as('authenticated',A,()=>db.exec(`insert into public.agent_display_names values ('${A}','wsA','hermes',E'Her\\u202Emes')`)),/display_name_rule/);
});

test('revert files drop the objects and re-apply succeeds',async()=>{
 for(const f of ['0036_agent_display_names_revert.sql','0035_employee_profiles_revert.sql','0034_display_text_rule_revert.sql','0033_workspaces_revert.sql'])await db.exec(read(f));
 const {rows}=await db.query(`select to_regclass('public.agent_display_names') t, to_regclass('public.workspaces') w`);
 assert.equal(rows[0].t,null);assert.equal(rows[0].w,null);
 for(const f of NEW)await db.exec(read(f));
});

test('no migration in 0033–0036 targets a named remote/staging project',()=>{
 for(const f of fs.readdirSync(M).filter(f=>/^003[3-6]_.*\.sql$/.test(f))){
  const s=read(f);assert.doesNotMatch(s,/staging|supabase\.co|teatqbtzgzcygpefnfbh/i,f);
 }
 assert.equal(fs.existsSync(M+'drafts/names_employees_staging_delta.sql'),false);
});
