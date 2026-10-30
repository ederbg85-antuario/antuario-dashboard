create table public.account_attention_reports (
 id uuid primary key default gen_random_uuid(),
 organization_id bigint not null references public.organizations(id),
 project_id uuid not null references public.projects(id),
 member_id uuid not null references public.team_members(id),
 author_id uuid not null default auth.uid() references auth.users(id),
 cut_date date not null, cut_hour integer not null check(cut_hour in(10,15,19)),
 period_from timestamptz not null, period_to timestamptz not null check(period_to>=period_from),
 coverage text not null check(length(btrim(coverage)) between 1 and 3000),
 reviewed_count integer not null check(reviewed_count between 0 and 100000),
 attention_state text not null check(attention_state in('pending','stable','needs_review','blocked')),
 public_summary text not null check(length(btrim(public_summary)) between 1 and 5000),
 evidence text not null check(length(btrim(evidence)) between 1 and 10000),
 next_actions text not null check(length(btrim(next_actions)) between 1 and 5000),
 created_at timestamptz not null default now(),
 unique(organization_id,project_id,member_id,cut_date,cut_hour)
);
alter table public.account_attention_reports enable row level security;
grant select,insert on public.account_attention_reports to authenticated;
revoke all on public.account_attention_reports from anon;
create policy attention_reports_read on public.account_attention_reports for select to authenticated
 using(private.can_project(organization_id,project_id));
create policy attention_reports_insert on public.account_attention_reports for insert to authenticated
 with check(author_id=(select auth.uid()) and private.is_agent_self(organization_id,member_id) and private.can_project(organization_id,project_id,true));
create or replace function private.validate_attention_report() returns trigger language plpgsql security definer set search_path='' as $$
declare project public.projects; seat public.team_members; begin
 select * into project from public.projects where id=new.project_id;
 select * into seat from public.team_members where id=new.member_id;
 if project.organization_id is distinct from new.organization_id or seat.organization_id is distinct from new.organization_id
  or seat.user_id is distinct from new.author_id or seat.status<>'active'
  or not('production'=any(seat.write_areas))
  or (cardinality(seat.client_ids)>0 and not coalesce(project.client_id=any(seat.client_ids),false))
 then raise exception 'Attention report scope mismatch'; end if;
 if new.period_to>now() or ((new.cut_date::text||' '||new.cut_hour::text||':00')::timestamp at time zone 'Europe/Paris')>now()
 then raise exception 'No future audit reports'; end if;
 return new;
end $$;
revoke all on function private.validate_attention_report() from public,anon,authenticated;
create trigger attention_report_scope before insert on public.account_attention_reports for each row execute function private.validate_attention_report();
create trigger operational_audit after insert on public.account_attention_reports for each row execute function public.operations_record_change();
create index attention_report_project_cut on public.account_attention_reports(organization_id,project_id,cut_date desc,cut_hour desc);
