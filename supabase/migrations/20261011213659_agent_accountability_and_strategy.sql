alter table public.team_members add column write_areas text[] not null default '{}', add column reports_to_member_id uuid references public.team_members(id), add column kpis jsonb not null default '[]';
update public.team_members set write_areas=case when access='operator' then areas else '{}'::text[] end;
alter table public.team_members drop constraint team_areas_valid;
alter table public.team_members add constraint team_areas_valid check(cardinality(areas)>0 and areas <@ array['production','marketing','sales','finance','accounting','people']::text[]), add constraint team_write_valid check(write_areas <@ areas), add constraint team_manager_valid check(reports_to_member_id is distinct from id);
create or replace function private.can_area(org bigint, area text, client uuid default null, writing boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.memberships m where m.organization_id=org and m.user_id=(select auth.uid()) and m.status='active' and (m.role='owner' or (area not in ('finance','accounting','people') and not exists(select 1 from public.team_members s where s.organization_id=org and s.user_id=m.user_id) and (not writing or m.role in ('admin','editor'))) or exists(select 1 from public.team_members s where s.organization_id=org and s.user_id=m.user_id and s.status='active' and area=any(s.areas) and (not writing or (s.access='operator' and area=any(s.write_areas))) and (cardinality(s.client_ids)=0 or client=any(s.client_ids)))));
$$;
create or replace function private.is_agent_self(org bigint, member uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.team_members s join public.memberships m on m.organization_id=s.organization_id and m.user_id=s.user_id and m.status='active' where s.organization_id=org and s.id=member and s.status='active' and s.user_id=(select auth.uid())); $$;
create or replace function private.is_agent_manager(org bigint, member uuid) returns boolean language sql stable security definer set search_path='' as $$ select public.get_user_role(org)='owner' or exists(select 1 from public.team_members s join public.team_members boss on boss.id=s.reports_to_member_id and boss.organization_id=org where s.id=member and s.organization_id=org and boss.user_id=(select auth.uid()) and boss.status='active' and private.can_area(org,'people',null,true)); $$;
revoke all on function private.is_agent_self(bigint,uuid),private.is_agent_manager(bigint,uuid) from public;
grant execute on function private.is_agent_self(bigint,uuid),private.is_agent_manager(bigint,uuid) to authenticated;
create table public.agent_reports (
 id uuid primary key default gen_random_uuid(), organization_id bigint not null references public.organizations(id), member_id uuid not null references public.team_members(id), report_date date not null,
 completed text not null check(length(completed) between 1 and 5000), blockers text not null default '' check(length(blockers)<=5000), next_actions text not null check(length(next_actions) between 1 and 5000), evidence text not null check(length(evidence) between 1 and 3000), author_id uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(), unique(organization_id,member_id,report_date)
);
create table public.agent_reviews (
 id uuid primary key default gen_random_uuid(), organization_id bigint not null references public.organizations(id), report_id uuid not null references public.agent_reports(id), member_id uuid not null references public.team_members(id), verdict text not null check(verdict in ('accepted','changes_requested')), notes text not null check(length(notes) between 1 and 3000), reviewer_id uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(), unique(report_id)
);
create table public.strategy_plans (
 id uuid primary key default gen_random_uuid(), organization_id bigint not null references public.organizations(id), title text not null, metric_key text not null check(metric_key in ('seo_clicks','seo_ctr','ga_sessions','ga_key_events','content_published')), target numeric not null check(target>0), period_from date not null, period_to date not null check(period_to>=period_from), hypothesis text not null, actions text not null, decision text not null, owner_member_id uuid references public.team_members(id), status text not null default 'proposed' check(status in ('proposed','active','paused','completed')), updated_at timestamptz not null default now()
);
create index agent_reports_org_member_idx on public.agent_reports(organization_id,member_id,report_date);
create index agent_reviews_org_idx on public.agent_reviews(organization_id,member_id);
create index strategy_org_idx on public.strategy_plans(organization_id);
alter table public.agent_reports enable row level security;
alter table public.agent_reviews enable row level security;
alter table public.strategy_plans enable row level security;
create policy reports_read on public.agent_reports for select to authenticated using(private.is_agent_self(organization_id,member_id) or private.is_agent_manager(organization_id,member_id));
create policy reports_insert on public.agent_reports for insert to authenticated with check(author_id=auth.uid() and (private.is_agent_self(organization_id,member_id) or public.get_user_role(organization_id)='owner'));
create policy reviews_read on public.agent_reviews for select to authenticated using(private.is_agent_self(organization_id,member_id) or private.is_agent_manager(organization_id,member_id));
create policy reviews_insert on public.agent_reviews for insert to authenticated with check(reviewer_id=auth.uid() and not private.is_agent_self(organization_id,member_id) and private.is_agent_manager(organization_id,member_id));
create policy strategy_read on public.strategy_plans for select to authenticated using(private.can_area(organization_id,'marketing'));
create policy strategy_insert on public.strategy_plans for insert to authenticated with check(private.can_area(organization_id,'marketing',null,true));
create policy strategy_update on public.strategy_plans for update to authenticated using(private.can_area(organization_id,'marketing',null,true)) with check(private.can_area(organization_id,'marketing',null,true));
grant select,insert on public.agent_reports,public.agent_reviews to authenticated;
grant select,insert,update on public.strategy_plans to authenticated;
revoke all on public.agent_reports,public.agent_reviews,public.strategy_plans from anon;
create or replace function private.validate_accountability() returns trigger language plpgsql security definer set search_path='' as $$
declare org bigint; begin
 if tg_table_name='agent_reviews' then select organization_id into org from public.agent_reports where id=new.report_id and member_id=new.member_id;
 elsif tg_table_name='strategy_plans' then if new.owner_member_id is null then return new; end if; select organization_id into org from public.team_members where id=new.owner_member_id and 'marketing'=any(areas);
 else select organization_id into org from public.team_members where id=new.member_id; end if;
 if org is distinct from new.organization_id then raise exception 'Accountability scope mismatch'; end if;
 if tg_table_name='strategy_plans' then new.updated_at=now(); end if;
 return new;
end $$;
revoke all on function private.validate_accountability() from public;
do $$ declare t text; begin foreach t in array array['agent_reports','agent_reviews','strategy_plans'] loop
 execute format('create trigger accountability_scope before insert or update on public.%I for each row execute function private.validate_accountability()',t);
 execute format('create trigger operational_audit after insert or update on public.%I for each row execute function public.operations_record_change()',t);
end loop; end $$;
create policy accountability_audit on public.operations_audit for select to authenticated using((entity in ('agent_reports','agent_reviews') and (private.is_agent_self(organization_id,coalesce(after_data->>'member_id',before_data->>'member_id')::uuid) or private.is_agent_manager(organization_id,coalesce(after_data->>'member_id',before_data->>'member_id')::uuid))) or (entity='strategy_plans' and private.can_area(organization_id,'marketing')));
-- Restrict deletion through legacy broad policies: operational actors archive instead.
create policy team_sales_no_delete on public.proposals as restrictive for delete to authenticated using(public.get_user_role(organization_id)='owner');
create policy team_project_no_delete on public.projects as restrictive for delete to authenticated using(public.get_user_role(organization_id)='owner');
create policy team_task_no_delete on public.tasks as restrictive for delete to authenticated using(public.get_user_role(organization_id)='owner');
create or replace function private.validate_reporting_line() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if new.reports_to_member_id is not null and (not exists(select 1 from public.team_members where id=new.reports_to_member_id and organization_id=new.organization_id) or exists(with recursive chain as(select id,reports_to_member_id from public.team_members where id=new.reports_to_member_id union select s.id,s.reports_to_member_id from public.team_members s join chain c on s.id=c.reports_to_member_id) select 1 from chain where id=new.id)) then raise exception 'Invalid reporting line'; end if; return new; end $$;
revoke all on function private.validate_reporting_line() from public;
create trigger team_reporting_line before insert or update on public.team_members for each row execute function private.validate_reporting_line();
