create schema if not exists private;
grant usage on schema private to authenticated;
create table public.team_members (
 id uuid primary key default gen_random_uuid(), organization_id bigint not null references public.organizations(id),
 name text not null check(length(name) between 1 and 100), position text not null, kind text not null default 'agent' check(kind in ('agent','human')),
 status text not null default 'proposed' check(status in ('proposed','active','paused')), email text,
 user_id uuid references auth.users(id), areas text[] not null default '{}', client_ids uuid[] not null default '{}',
 access text not null default 'operator' check(access in ('read','operator')), responsibilities text,
 created_at timestamptz not null default now(), unique(organization_id,user_id)
);
create index team_members_org_idx on public.team_members(organization_id);
alter table public.team_members enable row level security;
create policy team_read on public.team_members for select to authenticated using (organization_id in (select public.get_user_org_ids()));
create policy team_owner_insert on public.team_members for insert to authenticated with check(public.get_user_role(organization_id)='owner');
create policy team_owner_update on public.team_members for update to authenticated using(public.get_user_role(organization_id)='owner') with check(public.get_user_role(organization_id)='owner');
grant select,insert,update on public.team_members to authenticated;
revoke all on public.team_members from anon;
create or replace function private.can_area(org bigint, area text, client uuid default null, writing boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.memberships m where m.organization_id=org and m.user_id=(select auth.uid()) and m.status='active' and (
 m.role='owner' or (area not in ('finance','accounting') and not exists(select 1 from public.team_members s where s.organization_id=org and s.user_id=m.user_id) and (not writing or m.role in ('admin','editor'))) or
 exists(select 1 from public.team_members s where s.organization_id=org and s.user_id=m.user_id and s.status='active' and area=any(s.areas) and (not writing or s.access='operator') and (cardinality(s.client_ids)=0 or client=any(s.client_ids))) ));
$$;
revoke all on function private.can_area(bigint,text,uuid,boolean) from public;
grant execute on function private.can_area(bigint,text,uuid,boolean) to authenticated;
create or replace function private.can_project(org bigint, project uuid, writing boolean default false) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.projects p where p.id=project and p.organization_id=org and private.can_area(org,'production',p.client_id,writing)); $$;
revoke all on function private.can_project(bigint,uuid,boolean) from public;
grant execute on function private.can_project(bigint,uuid,boolean) to authenticated;
alter table public.tasks add column description text, add column acceptance text, add column next_action text, add column blocked_reason text, add column deliverable_url text, add column assignee_member_id uuid references public.team_members(id);
alter table public.projects add column director_member_id uuid references public.team_members(id), add column next_action text;
create table public.task_checklist (
 id uuid primary key default gen_random_uuid(), organization_id bigint not null references public.organizations(id), task_id uuid not null references public.tasks(id),
 title text not null check(length(title) between 1 and 500), done boolean not null default false, created_at timestamptz not null default now()
);
create index task_checklist_task_idx on public.task_checklist(task_id);
alter table public.task_checklist enable row level security;
create or replace function private.can_task(org bigint, task uuid, writing boolean default false) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.tasks t where t.id=task and t.organization_id=org and private.can_project(org,t.project_id,writing)); $$;
revoke all on function private.can_task(bigint,uuid,boolean) from public;
grant execute on function private.can_task(bigint,uuid,boolean) to authenticated;
create policy checklist_read on public.task_checklist for select to authenticated using(private.can_task(organization_id,task_id));
create policy checklist_insert on public.task_checklist for insert to authenticated with check(private.can_task(organization_id,task_id,true));
create policy checklist_update on public.task_checklist for update to authenticated using(private.can_task(organization_id,task_id,true)) with check(private.can_task(organization_id,task_id,true));
grant select,insert,update on public.task_checklist to authenticated;
revoke all on public.task_checklist from anon;
create table public.task_comments (
 id uuid primary key default gen_random_uuid(), organization_id bigint not null references public.organizations(id), task_id uuid not null references public.tasks(id),
 author_id uuid not null default auth.uid() references auth.users(id), body text not null check(length(body) between 1 and 5000),created_at timestamptz not null default now()
);
create index task_comments_task_idx on public.task_comments(task_id);
alter table public.task_comments enable row level security;
create policy comments_read on public.task_comments for select to authenticated using(private.can_task(organization_id,task_id));
create policy comments_insert on public.task_comments for insert to authenticated with check(author_id=auth.uid() and private.can_task(organization_id,task_id,true));
grant select,insert on public.task_comments to authenticated;
revoke all on public.task_comments from anon;
create table public.ads_campaign_reports (
 id uuid primary key default gen_random_uuid(), organization_id bigint not null references public.organizations(id), account_id text not null,
 campaign text not null, period_from date not null, period_to date not null check(period_to>=period_from), currency text not null check(currency in ('MXN','USD')),
 impressions bigint not null check(impressions>=0), clicks bigint not null check(clicks>=0), cost numeric not null check(cost>=0), conversions numeric not null check(conversions>=0),
 source text not null, imported_by uuid default auth.uid(),created_at timestamptz not null default now(), unique(organization_id,account_id,campaign,period_from,period_to)
);
create index ads_campaign_reports_org_idx on public.ads_campaign_reports(organization_id);
alter table public.ads_campaign_reports enable row level security;
create policy ads_read on public.ads_campaign_reports for select to authenticated using(private.can_area(organization_id,'marketing'));
create policy ads_insert on public.ads_campaign_reports for insert to authenticated with check(private.can_area(organization_id,'marketing',null,true));
create policy ads_update on public.ads_campaign_reports for update to authenticated using(private.can_area(organization_id,'marketing',null,true)) with check(private.can_area(organization_id,'marketing',null,true));
grant select,insert,update on public.ads_campaign_reports to authenticated;
revoke all on public.ads_campaign_reports from anon;
-- Restrictive policies compose with the existing authorization; linked seats never widen legacy access.
create policy production_scope on public.projects as restrictive for all to authenticated using(private.can_area(organization_id,'production',client_id)) with check(private.can_area(organization_id,'production',client_id,true));
create policy task_scope on public.tasks as restrictive for all to authenticated using(private.can_project(organization_id,project_id)) with check(private.can_project(organization_id,project_id,true));
create policy content_scope on public.content_items as restrictive for all to authenticated using(private.can_area(organization_id,'marketing')) with check(private.can_area(organization_id,'marketing',null,true));
-- Explicit operational grants allow a linked viewer membership to write only its authorized area.
create policy project_operator_insert on public.projects for insert to authenticated with check(private.can_area(organization_id,'production',client_id,true));
create policy project_operator_update on public.projects for update to authenticated using(private.can_area(organization_id,'production',client_id,true)) with check(private.can_area(organization_id,'production',client_id,true));
create policy task_operator_insert on public.tasks for insert to authenticated with check(private.can_project(organization_id,project_id,true));
create policy task_operator_update on public.tasks for update to authenticated using(private.can_project(organization_id,project_id,true)) with check(private.can_project(organization_id,project_id,true));
create policy content_operator_insert on public.content_items for insert to authenticated with check(private.can_area(organization_id,'marketing',null,true));
create policy content_operator_update on public.content_items for update to authenticated using(private.can_area(organization_id,'marketing',null,true)) with check(private.can_area(organization_id,'marketing',null,true));
do $$ declare t text; begin
 foreach t in array array['finance_accounts','finance_entries','finance_documents','finance_subscriptions','finance_closings','accounting_items'] loop
 execute format('create policy area_reader on public.%I for select to authenticated using(private.can_area(organization_id,%L))',t,case when t='accounting_items' then 'accounting' else 'finance' end);
 execute format('create policy area_insert on public.%I for insert to authenticated with check(private.can_area(organization_id,%L,null,true))',t,case when t='accounting_items' then 'accounting' else 'finance' end);
 execute format('create policy area_update on public.%I for update to authenticated using(private.can_area(organization_id,%L,null,true)) with check(private.can_area(organization_id,%L,null,true))',t,case when t='accounting_items' then 'accounting' else 'finance' end,case when t='accounting_items' then 'accounting' else 'finance' end);
 end loop;
 foreach t in array array['projects','tasks','task_checklist','task_comments','content_items','team_members','ads_campaign_reports'] loop
 execute format('create trigger operational_audit after insert or update on public.%I for each row execute function public.operations_record_change()',t);
 end loop;
end $$;
create policy production_audit on public.operations_audit for select to authenticated using (
 (entity='projects' and private.can_project(organization_id,record_id)) or
 (entity='tasks' and private.can_task(organization_id,record_id)) or
 (entity in ('task_checklist','task_comments') and private.can_task(organization_id,coalesce(after_data->>'task_id',before_data->>'task_id')::uuid)) or
 (entity in ('content_items','ads_campaign_reports') and private.can_area(organization_id,'marketing'))
);

-- Protect legacy sales and marketing tables even if an old permissive policy remains.
do $$ declare t text; begin
 foreach t in array array['contacts','proposals','deals','companies','meetings'] loop
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=t and c.relrowsecurity) and exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='organization_id') then
 execute format('create policy internal_sales_scope on public.%I as restrictive for all to authenticated using(private.can_area(organization_id,%L)) with check(private.can_area(organization_id,%L,null,true))',t,'sales','sales');
 end if;
 end loop;
 foreach t in array array['marketing_connections','marketing_metrics_values','marketing_sync_jobs'] loop
 execute format('create policy internal_marketing_scope on public.%I as restrictive for all to authenticated using(private.can_area(organization_id,%L)) with check(private.can_area(organization_id,%L,null,true))',t,'marketing','marketing');
 end loop;
end $$;
create policy client_scope on public.clients as restrictive for select to authenticated using(private.can_area(organization_id,'sales') or private.can_area(organization_id,'production',id));
