import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {PGlite} from '@electric-sql/pglite'

test('real presence SQL enforces self identity, active membership, scoped work and server timestamps',async()=>{
 const db=new PGlite()
 const ids={woss:'00000000-0000-4000-8000-000000000001',alonso:'00000000-0000-4000-8000-000000000002',memo:'00000000-0000-4000-8000-000000000003',outsider:'00000000-0000-4000-8000-000000000004'}
 const seat=(id:string)=>id.replace('00000000-0000','10000000-0000')
 const workA='20000000-0000-4000-8000-000000000001',workM='20000000-0000-4000-8000-000000000002',workOther='20000000-0000-4000-8000-000000000003'
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create schema private;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create table auth.users(id uuid primary key);create table public.organizations(id bigint primary key);
   create table public.memberships(organization_id bigint,user_id uuid,status text,role text);
   create table public.team_members(id uuid primary key,organization_id bigint,user_id uuid,status text,areas text[],write_areas text[],access text,client_ids uuid[]);
   create table public.team_work_items(id uuid primary key,organization_id bigint,recipient_member_id uuid,sender_member_id uuid);
   grant usage on schema auth,private,public to authenticated;`)
  const legacy=fs.readFileSync(new URL('../supabase/migrations/20261011213659_agent_accountability_and_strategy.sql',import.meta.url),'utf8')
  for(const name of ['can_area','is_agent_self']){const match=legacy.match(new RegExp('create or replace function private\\.'+name+'\\([\\s\\S]*?\\$\\$;','i'));assert.ok(match);await db.exec(match[0])}
  await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261020225126_team_worker_presence.sql',import.meta.url),'utf8'))
  await db.exec('insert into organizations values(1),(2);')
  for(const [name,user]of Object.entries(ids)){
   const org=name==='outsider'?2:1,area=name==='woss'?'people':name==='alonso'?'finance':'production'
   await db.exec(`insert into auth.users values('${user}');insert into memberships values(${org},'${user}','active','viewer');insert into team_members values('${seat(user)}',${org},'${user}','active',array['${area}'],array['${area}'],'operator','{}');`)
  }
  await db.exec(`insert into team_work_items values('${workA}',1,'${seat(ids.alonso)}','${seat(ids.woss)}'),('${workM}',1,'${seat(ids.memo)}','${seat(ids.woss)}'),('${workOther}',2,'${seat(ids.outsider)}','${seat(ids.outsider)}');`)
  const check=(user:string,state='idle',work:string|null=null,org=1)=>`insert into team_worker_presence(organization_id,member_id,state,current_work_id,note,last_checked_at,reported_by,created_at) values(${org},'${seat(user)}','${state}',${work?`'${work}'`:'null'},'Comprobación propia','2099-01-01','${ids.woss}','2099-01-01') on conflict(organization_id,member_id) do update set state=excluded.state,current_work_id=excluded.current_work_id,note=excluded.note,last_checked_at=excluded.last_checked_at,reported_by=excluded.reported_by`
  await assert.rejects(db.exec(check(ids.woss)),/Only the active member/)
  await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${ids.alonso}',false);`)
  await db.exec(check(ids.alonso,'working',workA))
  const own=(await db.query<{reported_by:string;last_checked_at:Date;created_at:Date}>('select reported_by,last_checked_at,created_at from team_worker_presence')).rows[0]
  assert.equal(own.reported_by,ids.alonso)
  assert.ok(new Date(own.last_checked_at).getUTCFullYear()<2099)
  assert.ok(new Date(own.created_at).getUTCFullYear()<2099)
  await assert.rejects(db.exec(check(ids.woss)),/Only the active member/)
  await assert.rejects(db.exec(check(ids.alonso,'working',workM)),/Work is outside/)
  await assert.rejects(db.exec(check(ids.alonso,'working',workOther)),/Work is outside/)
  await assert.rejects(db.exec(`update team_worker_presence set created_at='2000-01-01';`),/Presence identity is immutable/)
  await assert.rejects(db.exec(`update team_worker_presence set state='blocked',note=' ';`),/check/)
  await assert.rejects(db.exec(`delete from team_worker_presence;`),/permission denied/)
  await db.exec(`select set_config('request.jwt.claim.sub','${ids.woss}',false);`)
  assert.equal((await db.query<{n:number}>('select count(*)::int n from team_worker_presence')).rows[0].n,1)
  await assert.rejects(db.exec(check(ids.alonso)),/Only the active member/)
  await db.exec(check(ids.woss,'working',workA))
  assert.equal((await db.query<{n:number}>('select count(*)::int n from team_worker_presence')).rows[0].n,2)
  await db.exec(`select set_config('request.jwt.claim.sub','${ids.memo}',false);`)
  assert.equal((await db.query<{n:number}>('select count(*)::int n from team_worker_presence')).rows[0].n,0)
  await db.exec(check(ids.memo))
  await db.exec(`select set_config('request.jwt.claim.sub','${ids.outsider}',false);`)
  assert.equal((await db.query<{n:number}>('select count(*)::int n from team_worker_presence')).rows[0].n,0)
  await db.exec(check(ids.outsider,'idle',null,2))
  await db.exec(`reset role;update team_members set status='paused' where id='${seat(ids.memo)}';set role authenticated;select set_config('request.jwt.claim.sub','${ids.memo}',false);`)
  assert.equal((await db.query<{n:number}>('select count(*)::int n from team_worker_presence')).rows[0].n,0)
  await assert.rejects(db.exec(check(ids.memo)),/Only the active member/)
  await db.exec(`reset role;update memberships set status='inactive' where user_id='${ids.alonso}';set role authenticated;select set_config('request.jwt.claim.sub','${ids.alonso}',false);`)
  assert.equal((await db.query<{n:number}>('select count(*)::int n from team_worker_presence')).rows[0].n,0)
  await assert.rejects(db.exec(check(ids.alonso,'working',workA)),/Only the active member/)
 }finally{await db.close()}
})
