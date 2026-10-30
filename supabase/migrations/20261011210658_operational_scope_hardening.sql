create or replace function private.validate_operational_record() returns trigger language plpgsql security definer set search_path='' as $$
declare ref_org bigint; ref_task uuid; ref_client uuid; seat public.team_members; begin
 if tg_table_name='tasks' then
 select organization_id,client_id into ref_org,ref_client from public.projects where id=new.project_id;
 if ref_org is distinct from new.organization_id then raise exception 'Project scope mismatch'; end if;
 if new.status='done' and (nullif(btrim(new.blocked_reason),'') is not null or exists(select 1 from public.task_checklist where task_id=new.id and not done)) then raise exception 'Task blocked or checklist unfinished'; end if;
 if new.assignee_member_id is not null then select * into seat from public.team_members where id=new.assignee_member_id; if seat.organization_id is distinct from new.organization_id or not ('production'=any(seat.areas)) or seat.status='paused' or (cardinality(seat.client_ids)>0 and not coalesce(ref_client=any(seat.client_ids),false)) then raise exception 'Assignee scope mismatch'; end if; end if;
 elsif tg_table_name='projects' then
 if new.client_id is not null then select organization_id into ref_org from public.clients where id=new.client_id; if ref_org is distinct from new.organization_id then raise exception 'Client scope mismatch'; end if; end if;
 if new.director_member_id is not null then select * into seat from public.team_members where id=new.director_member_id; if seat.organization_id is distinct from new.organization_id or not ('production'=any(seat.areas)) or seat.status='paused' or (cardinality(seat.client_ids)>0 and not coalesce(new.client_id=any(seat.client_ids),false)) then raise exception 'Director scope mismatch'; end if; end if;
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

alter table public.team_members add constraint team_areas_valid check (cardinality(areas)>0 and areas <@ array['production','marketing','sales','finance','accounting']::text[]);
create or replace function private.validate_team_scope() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from unnest(new.client_ids) c(id) where not exists(select 1 from public.clients where id=c.id and organization_id=new.organization_id)) then raise exception 'Team client scope mismatch'; end if;
 if new.user_id is not null and not exists(select 1 from public.organization_members where organization_id=new.organization_id and user_id=new.user_id and is_active) then raise exception 'Team identity must be an active organization member'; end if;
 return new;
end $$;
revoke all on function private.validate_team_scope() from public,anon,authenticated;
create trigger team_scope_validation before insert or update on public.team_members for each row execute function private.validate_team_scope();
