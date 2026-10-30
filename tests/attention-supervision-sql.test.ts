import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
test('attention reports enforce authorship, tenant scope, append-only history and real cut times',async()=>{
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create schema auth;create schema private;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create table public.organizations(id bigint primary key);create table public.projects(id uuid primary key,organization_id bigint,client_id uuid);create table public.team_members(id uuid primary key,organization_id bigint,user_id uuid,status text,areas text[],write_areas text[],access text,client_ids uuid[]);create table public.memberships(organization_id bigint,user_id uuid,status text,role text);create function public.operations_record_change() returns trigger language plpgsql as $$begin return new;end$$;grant usage on schema public,auth,private to authenticated;`);
const dir='supabase/migrations/';
for(const [file,functions] of [['20261011213659_agent_accountability_and_strategy.sql',['can_area','is_agent_self']],['20261011204318_internal_operational_workspace.sql',['can_project']]]){
 const sql=fs.readFileSync(dir+file,'utf8');
 for(const name of functions){const regex=new RegExp('create or replace function private\\.'+name+'\\([\\s\\S]*?\\$\\$;','i');const match=sql.match(regex);assert.ok(match,`Missing ${name} definition`);await db.exec(match[0]);}
}
const ids={user:'00000000-0000-4000-8000-000000000001',other:'00000000-0000-4000-8000-000000000002',member:'00000000-0000-4000-8000-000000000003',project:'00000000-0000-4000-8000-000000000004',otherProject:'00000000-0000-4000-8000-000000000005',client:'00000000-0000-4000-8000-000000000006',otherClient:'00000000-0000-4000-8000-000000000007'};
await db.exec(`insert into auth.users values('${ids.user}'),('${ids.other}');insert into public.organizations values(1),(2);insert into public.projects values('${ids.project}',1,'${ids.client}'),('${ids.otherProject}',1,'${ids.otherClient}');insert into public.memberships values(1,'${ids.user}','active','viewer');insert into public.team_members values('${ids.member}',1,'${ids.user}','active',array['production'],array['production'],'operator',array['${ids.client}']::uuid[]);`);
await db.exec(fs.readFileSync(dir+'20261012213236_account_attention_supervision.sql','utf8'));
await db.exec(fs.readFileSync(dir+'20261012214600_attention_report_grants.sql','utf8'));
await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${ids.user}',false);`);
const make=(overrides:Record<string,string|number>={})=>{const r={project:ids.project,author:ids.user,date:'2026-01-01',hour:10,from:'2026-01-01T07:00:00Z',to:'2026-01-01T08:00:00Z',...overrides};return `insert into public.account_attention_reports(organization_id,project_id,member_id,author_id,cut_date,cut_hour,period_from,period_to,coverage,reviewed_count,attention_state,public_summary,evidence,next_actions)values(1,'${r.project}','${ids.member}','${r.author}','${r.date}',${r.hour},'${r.from}','${r.to}','Isolated fixture',1,'needs_review','Fixture','Original evidence','Await approval');`};
await db.exec(make());
const rejectedCases:Record<string,string|number>[]=[{},{project:ids.otherProject},{author:ids.other},{hour:11},{date:'9999-01-01'},{hour:15,to:'9999-01-01T00:00:00Z'}];
for(const r of rejectedCases)await assert.rejects(()=>db.exec(make(r)));
await assert.rejects(()=>db.exec(`update public.account_attention_reports set evidence='overwrite';`));
await assert.rejects(()=>db.exec(`delete from public.account_attention_reports;`));
await assert.rejects(()=>db.exec(`truncate public.account_attention_reports;`));
assert.equal((await db.query<{n:number}>('select count(*)::int n from public.account_attention_reports')).rows[0]?.n,1);
await db.exec('reset role;update public.team_members set status=\'paused\';set role authenticated;');
assert.equal((await db.query<{n:number}>('select count(*)::int n from public.account_attention_reports')).rows[0]?.n,0);
await assert.rejects(()=>db.exec(make({hour:15})));
await db.close();
});
