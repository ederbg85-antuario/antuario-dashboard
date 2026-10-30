-- Presence is a self-reported authenticated poll, not a synthetic online status.
create table public.team_worker_presence (
 organization_id bigint not null references public.organizations(id),
 member_id uuid not null references public.team_members(id),
 state text not null check(state in ('idle','working','blocked')),
 current_work_id uuid references public.team_work_items(id),
 note text not null default '' check(length(note)<=500),
 last_checked_at timestamptz not null default now(),
 reported_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 primary key(organization_id,member_id),
 check(state<>'blocked' or length(btrim(note))>0),
 check(state<>'idle' or current_work_id is null)
);
alter table public.team_worker_presence enable row level security;
revoke all on public.team_worker_presence from anon,authenticated;
grant select,insert,update on public.team_worker_presence to authenticated;

create function private.validate_team_worker_presence() returns trigger language plpgsql security definer set search_path='' as $$
declare current_uid uuid; work public.team_work_items;
begin
 current_uid=auth.uid();
 if current_uid is null or not private.is_agent_self(new.organization_id,new.member_id) then
  raise exception 'Only the active member records its own check';
 end if;
 if tg_op='UPDATE' and (new.organization_id is distinct from old.organization_id or new.member_id is distinct from old.member_id or new.created_at is distinct from old.created_at) then
  raise exception 'Presence identity is immutable';
 end if;
 if new.current_work_id is not null then
  select * into work from public.team_work_items where id=new.current_work_id;
  if work.id is null or work.organization_id is distinct from new.organization_id or
   (work.recipient_member_id<>new.member_id and not private.can_area(new.organization_id,'people',null,true)) then
   raise exception 'Work is outside the member scope';
  end if;
 end if;
 if tg_op='INSERT' then new.created_at=now(); end if;
 new.note=btrim(new.note);new.last_checked_at=now();new.reported_by=current_uid;
 return new;
end $$;
revoke all on function private.validate_team_worker_presence() from public,anon,authenticated;
create trigger team_worker_presence_validation before insert or update on public.team_worker_presence for each row execute function private.validate_team_worker_presence();
create policy team_worker_presence_read on public.team_worker_presence for select to authenticated using (
 private.is_agent_self(organization_id,member_id) or private.can_area(organization_id,'people')
);
create policy team_worker_presence_insert on public.team_worker_presence for insert to authenticated with check (
 private.is_agent_self(organization_id,member_id) and reported_by=auth.uid()
);
create policy team_worker_presence_update on public.team_worker_presence for update to authenticated using (
 private.is_agent_self(organization_id,member_id)
) with check(private.is_agent_self(organization_id,member_id) and reported_by=auth.uid());
comment on table public.team_worker_presence is 'Latest authenticated self-reported poll; GET does not write presence. Never seed as proof of agent activation.';
