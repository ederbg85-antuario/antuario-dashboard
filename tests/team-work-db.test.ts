import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {PGlite} from '@electric-sql/pglite'

test('team inbox enforces recipient scope, immutable authorship, evidence, idempotency and audited actor',async()=>{
 const db=new PGlite()
 const ids={woss:'00000000-0000-4000-8000-000000000001',alonso:'00000000-0000-4000-8000-000000000002',memo:'00000000-0000-4000-8000-000000000003',outsider:'00000000-0000-4000-8000-000000000004',owner:'00000000-0000-4000-8000-000000000005'}
 const seat=(v:string)=>v.replace('00000000-0000','10000000-0000')
 try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema private;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table auth.users(id uuid primary key);create table public.organizations(id bigint primary key);
 create table public.memberships(organization_id bigint,user_id uuid,status text,role text);
 create table public.team_members(id uuid primary key,organization_id bigint,user_id uuid,status text,areas text[],write_areas text[],access text,client_ids uuid[]);
 create table public.operations_audit(id bigint generated always as identity primary key,organization_id bigint,actor_id uuid,entity text,record_id uuid,operation text,before_data jsonb,after_data jsonb,created_at timestamptz default now());
 alter table public.operations_audit enable row level security;grant select on public.operations_audit to authenticated;
 grant usage on schema auth,private,public to authenticated;`)
 const legacy=fs.readFileSync(new URL('../supabase/migrations/20261011213659_agent_accountability_and_strategy.sql',import.meta.url),'utf8')
 for(const name of ['can_area','is_agent_self']){const match=legacy.match(new RegExp('create or replace function private\\.'+name+'\\([\\s\\S]*?\\$\\$;','i'));assert.ok(match);await db.exec(match[0])}
 const audit=fs.readFileSync(new URL('../supabase/migrations/20261010163347_operations_finance_security.sql',import.meta.url),'utf8').match(/create function public.operations_record_change\([\s\S]*?\$\$;/)
 assert.ok(audit);await db.exec(audit[0])
 await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261020221638_team_work_inbox.sql',import.meta.url),'utf8'))
 await db.exec(`insert into organizations values(1),(2);`)
 for(const [name,user]of Object.entries(ids)){
  const org=name==='outsider'?2:1,area=name==='alonso'?'finance':name==='woss'?'people':'production'
  await db.exec(`insert into auth.users values('${user}');insert into memberships values(${org},'${user}','active','${name==='owner'?'owner':'viewer'}');insert into team_members values('${seat(user)}',${org},'${user}','active',array['${area}'],array['${area}'],'operator','{}');`)
 }
 await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${ids.woss}',false);`)
 const insert=(key:string,recipient=seat(ids.alonso),sender=seat(ids.woss),area='finance')=>`insert into team_work_items(organization_id,sender_member_id,recipient_member_id,area,title,body,source_key) values(1,'${sender}','${recipient}','${area}','Registrar gasto','Corte informado; no transferencia','${key}')`
 await db.exec(insert('receipt-1'))
 await assert.rejects(db.exec(insert('receipt-1')),/duplicate key/)
 await assert.rejects(db.exec(insert('spoof',seat(ids.alonso),seat(ids.memo))),/Only coordination assigns work as itself/)
 await assert.rejects(db.exec(insert('cross-org',seat(ids.outsider))),/Invalid active team scope/)
 await assert.rejects(db.exec(insert('wrong-area',seat(ids.memo))),/Invalid active team scope/)
 await db.exec(`select set_config('request.jwt.claim.sub','${ids.alonso}',false);`)
 assert.equal((await db.query<{n:number}>('select count(*)::int n from team_work_items')).rows[0].n,1)
 await assert.rejects(db.exec(insert('illegal-assignment',seat(ids.alonso),seat(ids.alonso))),/Only coordination assigns work as itself/)
 await assert.rejects(db.exec(`update team_work_items set title='Rewrite assignment';`),/Recipient cannot alter the assignment/)
 await assert.rejects(db.exec(`update team_work_items set sender_member_id='${seat(ids.owner)}';`),/Work authorship is immutable/)
 await assert.rejects(db.exec(`update team_work_items set status='done';`),/check/)
 await assert.rejects(db.exec(`update team_work_items set status='blocked';`),/check/)
 await db.exec(`update team_work_items set status='in_progress',updated_by='${ids.woss}';`)
 assert.equal((await db.query<{updated_by:string}>('select updated_by from team_work_items')).rows[0].updated_by,ids.alonso)
 await db.exec(`update team_work_items set status='done',evidence='finance_entries/test-id';`)
 assert.equal((await db.query<{actor_id:string}>('select actor_id from operations_audit order by id desc limit 1')).rows[0].actor_id,ids.alonso)
 await assert.rejects(db.exec('delete from team_work_items;'),/permission denied/)
 await db.exec(`select set_config('request.jwt.claim.sub','${ids.memo}',false);`)
 assert.equal((await db.query<{n:number}>('select count(*)::int n from team_work_items')).rows[0].n,0)
 await db.exec(`select set_config('request.jwt.claim.sub','${ids.outsider}',false);`)
 assert.equal((await db.query<{n:number}>('select count(*)::int n from team_work_items')).rows[0].n,0)
 await db.exec(`reset role;update team_members set status='paused' where id='${seat(ids.alonso)}';set role authenticated;select set_config('request.jwt.claim.sub','${ids.alonso}',false);`)
 assert.equal((await db.query<{n:number}>('select count(*)::int n from team_work_items')).rows[0].n,0)
 }finally{await db.close()}
})
