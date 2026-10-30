-- Internal assignments bridge WOSS with each area without granting financial writes.
create table public.team_work_items (
 id uuid primary key default gen_random_uuid(),
 organization_id bigint not null references public.organizations(id),
 sender_member_id uuid not null references public.team_members(id),
 recipient_member_id uuid not null references public.team_members(id),
 area text not null check(area in ('production','marketing','sales','finance','accounting','people')),
 title text not null check(length(btrim(title)) between 1 and 240),
 body text not null check(length(btrim(body)) between 1 and 6000),
 status text not null default 'pending' check(status in ('pending','in_progress','blocked','done')),
 priority integer not null default 2 check(priority between 1 and 4),
 due_date date,
 evidence text not null default '' check(length(evidence)<=3000),
 blocked_reason text not null default '' check(length(blocked_reason)<=2000),
 source_key text not null check(length(source_key) between 1 and 160),
 created_by uuid references auth.users(id),updated_by uuid references auth.users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,source_key),
 check(status<>'done' or length(btrim(evidence))>0),
 check((status='blocked' and length(btrim(blocked_reason))>0) or (status<>'blocked' and length(btrim(blocked_reason))=0))
);
create index team_work_recipient_idx on public.team_work_items(organization_id,recipient_member_id,status,created_at desc);
create index team_work_sender_idx on public.team_work_items(organization_id,sender_member_id,created_at desc);
alter table public.team_work_items enable row level security;
revoke all on public.team_work_items from anon,authenticated;
grant select,insert,update on public.team_work_items to authenticated;

create function private.validate_team_work() returns trigger language plpgsql security definer set search_path='' as $$
declare sender public.team_members; recipient public.team_members; current_uid uuid; coordinating boolean;
begin
 current_uid=auth.uid();
 select * into sender from public.team_members where id=new.sender_member_id;
 select * into recipient from public.team_members where id=new.recipient_member_id;
 if sender.organization_id is distinct from new.organization_id or recipient.organization_id is distinct from new.organization_id
 or sender.status<>'active' or recipient.status<>'active' or recipient.user_id is null or not (new.area=any(recipient.areas))
 or not exists(select 1 from public.memberships m where m.organization_id=new.organization_id and m.user_id=sender.user_id and m.status='active')
 or not exists(select 1 from public.memberships m where m.organization_id=new.organization_id and m.user_id=recipient.user_id and m.status='active')
 then raise exception 'Invalid active team scope'; end if;
 if tg_op='UPDATE' and (new.id is distinct from old.id or new.organization_id is distinct from old.organization_id or new.sender_member_id is distinct from old.sender_member_id or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at or new.source_key is distinct from old.source_key)
 then raise exception 'Work authorship is immutable'; end if;
 if current_uid is not null then
  if not exists(select 1 from public.memberships m where m.organization_id=new.organization_id and m.user_id=current_uid and m.status='active') then raise exception 'Inactive membership'; end if;
  coordinating=private.can_area(new.organization_id,'people',null,true);
  if tg_op='INSERT' then
   if sender.user_id is distinct from current_uid or not coordinating then raise exception 'Only coordination assigns work as itself'; end if;
   if new.status<>'pending' or btrim(new.evidence)<>'' or btrim(new.blocked_reason)<>'' then raise exception 'New work must be pending'; end if;
   new.created_by=current_uid;
  elsif not coordinating then
   if recipient.user_id is distinct from current_uid then raise exception 'Only recipient updates own work'; end if;
   if new.recipient_member_id is distinct from old.recipient_member_id or new.area is distinct from old.area or new.title is distinct from old.title or new.body is distinct from old.body or new.priority is distinct from old.priority or new.due_date is distinct from old.due_date
   then raise exception 'Recipient cannot alter the assignment'; end if;
  end if;
 end if;
 if tg_op='INSERT' then new.created_at=now(); end if;
 new.updated_by=current_uid;new.updated_at=now();
 return new;
end $$;
revoke all on function private.validate_team_work() from public,anon,authenticated;
create trigger team_work_validation before insert or update on public.team_work_items for each row execute function private.validate_team_work();
create trigger team_work_audit after insert or update on public.team_work_items for each row execute function public.operations_record_change();

create policy team_work_read on public.team_work_items for select to authenticated using (
 private.is_agent_self(organization_id,sender_member_id) or private.is_agent_self(organization_id,recipient_member_id) or private.can_area(organization_id,'people')
);
create policy team_work_insert on public.team_work_items for insert to authenticated with check (
 created_by=auth.uid() and private.is_agent_self(organization_id,sender_member_id) and private.can_area(organization_id,'people',null,true)
);
create policy team_work_update on public.team_work_items for update to authenticated using (
 private.is_agent_self(organization_id,recipient_member_id) or private.can_area(organization_id,'people',null,true)
) with check(private.is_agent_self(organization_id,recipient_member_id) or private.can_area(organization_id,'people',null,true));
create policy team_work_audit_read on public.operations_audit for select to authenticated using (
 entity='team_work_items' and (
 private.is_agent_self(organization_id,coalesce(after_data->>'sender_member_id',before_data->>'sender_member_id')::uuid)
 or private.is_agent_self(organization_id,coalesce(after_data->>'recipient_member_id',before_data->>'recipient_member_id')::uuid)
 or private.can_area(organization_id,'people'))
);
