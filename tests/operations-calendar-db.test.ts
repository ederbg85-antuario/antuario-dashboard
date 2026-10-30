import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {PGlite} from '@electric-sql/pglite'

test('operating migration preserves history and RLS; dates, reviewers, dependencies and checklist visibility persist',async()=>{
 const db=new PGlite(),reviewer='10000000-0000-4000-8000-000000000001',outsider='10000000-0000-4000-8000-000000000002',project='20000000-0000-4000-8000-000000000001'
 try{
  await db.exec(`create role authenticated;create schema private;
  create table team_members(id uuid primary key,organization_id bigint,status text,areas text[],client_ids uuid[]);
  create table projects(id uuid primary key,organization_id bigint,client_id uuid);
  create table tasks(id int primary key,organization_id bigint,project_id uuid,due_date date,title text);
  create table task_checklist(id int primary key,task_id int,title text,done boolean);
  insert into team_members values('${reviewer}',1,'active',array['production'],'{}'),('${outsider}',2,'active',array['production'],'{}');
  insert into projects values('${project}',1,'30000000-0000-4000-8000-000000000001');
  alter table tasks enable row level security;grant select,update on tasks to authenticated;
  grant select on team_members,projects,task_checklist to authenticated;grant update on task_checklist to authenticated;grant usage on schema private to authenticated;
  create policy account_scope on tasks to authenticated using(organization_id=1) with check(organization_id=1);
  insert into tasks values(1,1,'${project}','2026-10-28','Original'),(2,2,null,'2026-10-29','Other org'),(3,1,'${project}',null,'Sin fecha');
  insert into task_checklist values(1,1,'Original interno',false);`)
  await db.exec(readFileSync(new URL('../supabase/migrations/20261028201618_operational_calendar_date_kind.sql',import.meta.url),'utf8'))
  await db.exec('set role authenticated')
  assert.deepEqual((await db.query<{task_areas:string[];task_tags:string[]}>('select task_areas,task_tags from tasks where id=1')).rows[0],{task_areas:[],task_tags:[]})
  await db.exec("update tasks set task_areas=array['production','marketing'],task_tags=array['seo','diseño'] where id=1")
  assert.deepEqual((await db.query<{task_areas:string[]}>('select task_areas from tasks where id=1')).rows[0].task_areas,['production','marketing'])
  await assert.rejects(db.exec("update tasks set task_tags=array['SEO'] where id=1"),/Invalid task classification/)
  await assert.rejects(db.exec("update tasks set task_tags=array['seo','seo'] where id=1"),/Invalid task classification/)
  await assert.rejects(db.exec("update tasks set task_areas=array['production','production'] where id=1"),/Invalid task classification/)
  await assert.rejects(db.exec("update tasks set task_areas=array['invented'] where id=1"),/tasks_classification_check/)
  assert.equal((await db.query('select * from tasks')).rows.length,2)
  assert.equal((await db.query<{due_date_kind:string|null}>('select due_date_kind from tasks where id=1')).rows[0].due_date_kind,null)
  await db.exec("update tasks set due_date_kind='proposed' where id=1")
  assert.equal((await db.query<{due_date_kind:string}>('select due_date_kind from tasks where id=1')).rows[0].due_date_kind,'proposed')
  await assert.rejects(db.exec("update tasks set due_date_kind='confirmed' where id=3"),/tasks_due_date_kind_check/)
  await assert.rejects(db.exec("update tasks set due_date_kind='invented' where id=1"),/tasks_due_date_kind_check/)
  await db.exec("update tasks set due_date='2026-10-30',due_date_kind='follow_up' where id=3")
  await db.exec('update tasks set due_date=null,due_date_kind=null where id=3')
  assert.equal((await db.query('select * from tasks where id=2')).rows.length,0)
  await assert.rejects(db.exec('update tasks set organization_id=2 where id=1'),/row-level security/)
  await assert.rejects(db.exec(`update tasks set validator_member_id='${outsider}' where id=1`),/Reviewer outside task scope/)
  await db.exec(`update tasks set validator_member_id='${reviewer}',client_dependency='Fotografías',client_dependency_owner='Responsable del portafolio',client_dependency_impact='Impide migración; sin plazo inventado' where id=1`)
  const row=(await db.query<{validator_member_id:string;client_dependency_owner:string}>('select validator_member_id,client_dependency_owner from tasks where id=1')).rows[0]
  assert.equal(row.validator_member_id,reviewer);assert.equal(row.client_dependency_owner,'Responsable del portafolio')
  assert.equal((await db.query<{client_visible:boolean}>('select client_visible from task_checklist where id=1')).rows[0].client_visible,false)
  await db.exec('update task_checklist set client_visible=true where id=1')
  assert.equal((await db.query<{client_visible:boolean}>('select client_visible from task_checklist where id=1')).rows[0].client_visible,true)
 }finally{await db.close()}
})
