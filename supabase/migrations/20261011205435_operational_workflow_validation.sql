create table public.content_jobs (
 id uuid primary key default gen_random_uuid(), organization_id bigint not null references public.organizations(id), content_id uuid not null references public.content_items(id),
 action text not null check(action in ('generate','publish')),status text not null default 'queued' check(status in ('queued','running','completed','failed','cancelled')),
 requested_by uuid not null default auth.uid() references auth.users(id), requested_at timestamptz not null default now(), error text, result_url text
);
create index content_jobs_org_idx on public.content_jobs(organization_id);
create unique index content_jobs_once_idx on public.content_jobs(content_id,action) where status in ('queued','running');
alter table public.content_jobs enable row level security;
create policy content_jobs_read on public.content_jobs for select to authenticated using(private.can_area(organization_id,'marketing'));
create policy content_jobs_insert on public.content_jobs for insert to authenticated with check(private.can_area(organization_id,'marketing',null,true) and requested_by=auth.uid() and status='queued');
grant select,insert on public.content_jobs to authenticated;
revoke all on public.content_jobs from anon;
create trigger operational_audit after insert or update on public.content_jobs for each row execute function public.operations_record_change();
create or replace function private.validate_operational_record() returns trigger language plpgsql security definer set search_path='' as $$
declare ref_org bigint; ref_task uuid; ref_client uuid; seat public.team_members; begin
 if tg_table_name='tasks' then
 select organization_id,client_id into ref_org,ref_client from public.projects where id=new.project_id;
 if ref_org is distinct from new.organization_id then raise exception 'Project scope mismatch'; end if;
 if new.status='done' and (nullif(btrim(new.blocked_reason),'') is not null or exists(select 1 from public.task_checklist where task_id=new.id and not done)) then raise exception 'Task blocked or checklist unfinished'; end if;
 if new.assignee_member_id is not null then select * into seat from public.team_members where id=new.assignee_member_id; if seat.organization_id is distinct from new.organization_id or not ('production'=any(seat.areas)) or seat.status='paused' or (cardinality(seat.client_ids)>0 and not (ref_client=any(seat.client_ids))) then raise exception 'Assignee scope mismatch'; end if; end if;
 elsif tg_table_name='projects' then
 if new.client_id is not null then select organization_id into ref_org from public.clients where id=new.client_id; if ref_org is distinct from new.organization_id then raise exception 'Client scope mismatch'; end if; end if;
 if new.director_member_id is not null then select * into seat from public.team_members where id=new.director_member_id; if seat.organization_id is distinct from new.organization_id or not ('production'=any(seat.areas)) or seat.status='paused' or (cardinality(seat.client_ids)>0 and not(new.client_id=any(seat.client_ids))) then raise exception 'Director scope mismatch'; end if; end if;
 elsif tg_table_name in ('task_checklist','task_comments') then
 select organization_id into ref_org from public.tasks where id=new.task_id; if ref_org is distinct from new.organization_id then raise exception 'Task scope mismatch'; end if;
 if tg_table_name='task_checklist' and not new.done and exists(select 1 from public.tasks where id=new.task_id and status='done') then raise exception 'Reopen task before adding unfinished steps'; end if;
 elsif tg_table_name='content_jobs' then
 select organization_id into ref_org from public.content_items where id=new.content_id; if ref_org is distinct from new.organization_id then raise exception 'Content scope mismatch'; end if;
 if new.action='publish' and not exists(select 1 from public.content_items where id=new.content_id and status='approved' and asset_url is not null) then raise exception 'Content must be approved with material before queueing publication'; end if;
 end if;
 return new;
end $$;
revoke all on function private.validate_operational_record() from public,anon,authenticated;
do $$ declare t text; begin foreach t in array array['tasks','projects','task_checklist','task_comments','content_jobs'] loop execute format('create trigger operational_validation before insert or update on public.%I for each row execute function private.validate_operational_record()',t); end loop; end $$;
