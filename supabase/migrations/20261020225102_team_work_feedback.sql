-- Append-only conversation and review evidence. Apply before publishing the UI.
alter table public.team_work_items add column submission_version bigint not null default 0;
create function private.version_team_work_submission() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='INSERT' then new.submission_version=0;
 elsif new.status is distinct from old.status or new.evidence is distinct from old.evidence or new.blocked_reason is distinct from old.blocked_reason
 or new.title is distinct from old.title or new.body is distinct from old.body or new.recipient_member_id is distinct from old.recipient_member_id
 or new.area is distinct from old.area or new.due_date is distinct from old.due_date or new.priority is distinct from old.priority then
  new.submission_version=old.submission_version+1;
 else new.submission_version=old.submission_version;
 end if;
 return new;
end $$;
revoke all on function private.version_team_work_submission() from public,anon,authenticated;
create trigger team_work_submission_version before insert or update on public.team_work_items for each row execute function private.version_team_work_submission();

create table public.team_work_events (
 id uuid primary key default gen_random_uuid(),organization_id bigint not null references public.organizations(id),
 work_id uuid not null references public.team_work_items(id),author_member_id uuid not null references public.team_members(id),
 author_id uuid not null references auth.users(id),kind text not null check(kind in ('comment','accepted','changes_requested')),
 body text not null check(length(btrim(body)) between 1 and 3000),work_version bigint not null default 0,
 work_updated_at timestamptz,source_key text not null check(length(source_key) between 1 and 160),
 created_at timestamptz not null default now(),unique(organization_id,source_key)
);
create index team_work_events_work_idx on public.team_work_events(organization_id,work_id,created_at);
create unique index team_work_one_review_per_submission on public.team_work_events(work_id,work_version) where kind<>'comment';
alter table public.team_work_events enable row level security;
revoke all on public.team_work_events from anon,authenticated;
grant select,insert on public.team_work_events to authenticated;

create function private.validate_team_work_event() returns trigger language plpgsql set search_path='' as $$
declare work public.team_work_items;coordinating boolean;
begin
 if auth.uid() is null or new.author_id is distinct from auth.uid() or not private.is_agent_self(new.organization_id,new.author_member_id) then
  raise exception 'Event author must be the active authenticated member';
 end if;
 select * into work from public.team_work_items where id=new.work_id and organization_id=new.organization_id for update;
 if work.id is null then raise exception 'Work unavailable in this scope';end if;
 coordinating=private.can_area(new.organization_id,'people',null,true);
 if not coordinating and not private.is_agent_self(new.organization_id,work.recipient_member_id) and not private.is_agent_self(new.organization_id,work.sender_member_id) then
  raise exception 'Not a participant in this assignment';
 end if;
 if new.kind<>'comment' then
  if not coordinating or private.is_agent_self(new.organization_id,work.recipient_member_id) then raise exception 'Only coordination reviews another member';end if;
  if new.work_updated_at is distinct from work.updated_at then raise exception 'Submission changed' using errcode='40001';end if;
  if work.status<>'done' or length(btrim(work.evidence))=0 then raise exception 'Review requires submitted evidence';end if;
 end if;
 new.work_version=work.submission_version;new.work_updated_at=work.updated_at;new.created_at=now();
 if new.kind='changes_requested' then
  update public.team_work_items set status='pending',blocked_reason='',updated_at=now() where id=work.id and organization_id=new.organization_id;
 else
  update public.team_work_items set updated_at=now() where id=work.id and organization_id=new.organization_id;
 end if;
 return new;
end $$;
revoke all on function private.validate_team_work_event() from public,anon,authenticated;
create trigger team_work_event_validation before insert on public.team_work_events for each row execute function private.validate_team_work_event();
create trigger team_work_event_audit after insert on public.team_work_events for each row execute function public.operations_record_change();
create policy team_work_events_read on public.team_work_events for select to authenticated using (
 exists(select 1 from public.team_work_items w where w.id=team_work_events.work_id and w.organization_id=team_work_events.organization_id)
);
create policy team_work_events_insert on public.team_work_events for insert to authenticated with check (
 author_id=auth.uid() and private.is_agent_self(organization_id,author_member_id)
 and exists(select 1 from public.team_work_items w where w.id=team_work_events.work_id and w.organization_id=team_work_events.organization_id and
 (private.is_agent_self(w.organization_id,w.recipient_member_id) or private.is_agent_self(w.organization_id,w.sender_member_id) or private.can_area(w.organization_id,'people',null,true)))
);
create policy team_work_events_audit_read on public.operations_audit for select to authenticated using (
 entity='team_work_events' and exists(select 1 from public.team_work_events e where e.id=operations_audit.record_id and e.organization_id=operations_audit.organization_id)
);
