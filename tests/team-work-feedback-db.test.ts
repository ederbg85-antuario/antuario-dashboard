import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {PGlite} from '@electric-sql/pglite'

test('thread feedback is participant-scoped, immutable, versioned, audited and never self-approved',async()=>{
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
  await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261020225102_team_work_feedback.sql',import.meta.url),'utf8'))
  await db.exec('insert into organizations values(1),(2);')
  for(const [name,user] of Object.entries(ids)){
   const org=name==='outsider'?2:1,area=name==='alonso'?'finance':name==='woss'?'people':'production'
   await db.exec(`insert into auth.users values('${user}');insert into memberships values(${org},'${user}','active','${name==='owner'?'owner':'viewer'}');insert into team_members values('${seat(user)}',${org},'${user}','active',array['${area}'],array['${area}'],'operator','{}');`)
  }
  const login=async(user:string)=>{await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${user}',false);`)}
  await login(ids.woss)
  await db.exec(`insert into team_work_items(organization_id,sender_member_id,recipient_member_id,area,title,body,source_key) values(1,'${seat(ids.woss)}','${seat(ids.alonso)}','finance','Registrar gasto','Conciliar comprobante','expense:1');`)
  const work=async()=> (await db.query<{id:string;updated_at:Date;submission_version:number;status:string;updated_by:string}>('select id,updated_at,submission_version,status,updated_by from team_work_items order by created_at limit 1')).rows[0]
  const initial=await work()
  let eventCounter=0
  const event=(user:string,kind='comment',timestamp:string|null=null,org=1,workId=initial.id,author=seat(user))=>`insert into team_work_events(organization_id,work_id,author_member_id,author_id,kind,body,source_key,work_updated_at) values(${org},'${workId}','${author}','${user}','${kind}','Resultado verificable','event:${++eventCounter}',${timestamp?`'${timestamp}'`:'null'});`
  await assert.rejects(db.exec(event(ids.woss,'accepted',initial.updated_at.toISOString())),/Review requires submitted evidence/)
  await login(ids.alonso)
  await db.exec(event(ids.alonso))
  assert.equal((await work()).submission_version,0)
  assert.ok((await work()).updated_at>=initial.updated_at)
  await assert.rejects(db.exec(event(ids.woss)),/Event author must be the active authenticated member/)
  await assert.rejects(db.exec(event(ids.alonso,'accepted',(await work()).updated_at.toISOString())),/Only coordination reviews another member/)
  await assert.rejects(db.exec(event(ids.alonso,'comment',null,2)),/Event author must be the active authenticated member/)
  await db.exec(`update team_work_items set status='done',evidence='finance_entries/verified',submission_version=900;`)
  const submitted=await work()
  assert.equal(submitted.submission_version,1)
  await login(ids.woss)
  await assert.rejects(db.exec(event(ids.woss,'accepted',initial.updated_at.toISOString())),/Submission changed/)
  await db.exec(event(ids.woss,'accepted',submitted.updated_at.toISOString()))
  assert.equal((await work()).submission_version,1)
  assert.equal((await db.query<{actor_id:string}>(`select actor_id from operations_audit where entity='team_work_events' order by id desc limit 1`)).rows[0].actor_id,ids.woss)
  await assert.rejects(db.exec(event(ids.woss,'accepted',(await work()).updated_at.toISOString())),/duplicate key/)
  await db.exec(event(ids.woss))
  assert.equal((await work()).submission_version,1)
  await assert.rejects(db.exec(`update team_work_events set body='Rewrite review';`),/permission denied/)
  await assert.rejects(db.exec(`delete from team_work_events;`),/permission denied/)
  await login(ids.alonso)
  await db.exec(`update team_work_items set evidence='finance_entries/revised';`)
  assert.equal((await work()).submission_version,2)
  await login(ids.woss)
  await db.exec(event(ids.woss,'changes_requested',(await work()).updated_at.toISOString()))
  assert.equal((await work()).status,'pending')
  assert.equal((await work()).submission_version,3)
  assert.equal((await work()).updated_by,ids.woss)
  await login(ids.alonso)
  await db.exec(event(ids.alonso))
  assert.equal((await work()).submission_version,3)
  await db.exec(`update team_work_items set status='done',evidence='finance_entries/final';`)
  assert.equal((await work()).submission_version,4)
  await login(ids.owner)
  await db.exec(`insert into team_work_items(organization_id,sender_member_id,recipient_member_id,area,title,body,source_key) values(1,'${seat(ids.owner)}','${seat(ids.owner)}','production','Self task','Task','self:1');update team_work_items set status='done',evidence='proof' where source_key='self:1';`)
  const own=(await db.query<{id:string;updated_at:Date}>(`select id,updated_at from team_work_items where source_key='self:1'`)).rows[0]
  await assert.rejects(db.exec(event(ids.owner,'accepted',own.updated_at.toISOString(),1,own.id)),/Only coordination reviews another member/)
  await login(ids.memo)
  assert.equal((await db.query<{n:number}>('select count(*)::int n from team_work_events')).rows[0].n,0)
  await assert.rejects(db.exec(event(ids.memo)),/Work unavailable in this scope/)
  await login(ids.outsider)
  assert.equal((await db.query<{n:number}>('select count(*)::int n from team_work_events')).rows[0].n,0)
  await db.exec(`reset role;update team_members set status='paused' where id='${seat(ids.alonso)}';`)
  await login(ids.alonso)
  assert.equal((await db.query<{n:number}>('select count(*)::int n from team_work_events')).rows[0].n,0)
 }finally{await db.close()}
})
