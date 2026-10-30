create table public.client_communications (
 id uuid primary key default gen_random_uuid(), organization_id bigint not null references public.organizations(id), client_id uuid not null references public.clients(id), author_id uuid not null default auth.uid() references auth.users(id), subject text not null check(length(subject) between 1 and 500), draft text not null check(length(draft) between 1 and 5000), status text not null default 'pending' check(status in ('pending','approved','sent','cancelled')), approved_by uuid references auth.users(id), approved_at timestamptz, delivery_evidence text, created_at timestamptz not null default now()
);
create index client_communications_org_idx on public.client_communications(organization_id,client_id);
alter table public.client_communications enable row level security;
create policy communication_read on public.client_communications for select to authenticated using(private.can_area(organization_id,'production',client_id));
create policy communication_insert on public.client_communications for insert to authenticated with check(author_id=auth.uid() and status='pending' and approved_by is null and approved_at is null and private.can_area(organization_id,'production',client_id));
create policy communication_update on public.client_communications for update to authenticated using(private.can_area(organization_id,'production',client_id)) with check(private.can_area(organization_id,'production',client_id));
grant select,insert,update on public.client_communications to authenticated;
revoke all on public.client_communications from anon;
create or replace function private.validate_client_communication() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.clients where id=new.client_id and organization_id=new.organization_id) then raise exception 'Client scope mismatch'; end if;
 if tg_op='INSERT' then if new.status<>'pending' or new.approved_by is not null or new.approved_at is not null then raise exception 'New communications start pending'; end if;
 else
 if new.author_id is distinct from old.author_id or new.client_id is distinct from old.client_id or new.organization_id is distinct from old.organization_id or new.created_at is distinct from old.created_at then raise exception 'Immutable communication attribution'; end if;
 if old.status in ('sent','cancelled') then raise exception 'Closed communication is immutable'; end if;
 if new.status='approved' and old.status<>'approved' then
 if public.get_user_role(new.organization_id)<>'owner' then raise exception 'Owner approval required'; end if; new.approved_by=auth.uid();new.approved_at=now();
 elsif new.approved_by is distinct from old.approved_by or new.approved_at is distinct from old.approved_at then raise exception 'Immutable approval'; end if;
 if old.status='approved' and (new.draft is distinct from old.draft or new.subject is distinct from old.subject) then raise exception 'Approved text cannot change'; end if;
 if new.status='sent' then
 if old.status<>'approved' or nullif(btrim(new.delivery_evidence),'') is null then raise exception 'Approval and delivery evidence required'; end if;
 if public.get_user_role(new.organization_id)<>'owner' and not exists(select 1 from public.team_members where organization_id=new.organization_id and user_id=auth.uid() and email='henry@antuario.mx' and status='active') then raise exception 'Only Henry records delivery'; end if;
 elsif new.delivery_evidence is distinct from old.delivery_evidence then raise exception 'Evidence only when recording delivery'; end if;
 if new.status='cancelled' and public.get_user_role(new.organization_id)<>'owner' and new.author_id<>auth.uid() then raise exception 'Author or owner cancellation required'; end if;
 if (new.draft is distinct from old.draft or new.subject is distinct from old.subject) and public.get_user_role(new.organization_id)<>'owner' and new.author_id<>auth.uid() and not private.can_area(new.organization_id,'people',null,true) then raise exception 'Author or supervisor edits draft'; end if;
 end if;
 return new;
end $$;
revoke all on function private.validate_client_communication() from public;
create trigger communication_validation before insert or update on public.client_communications for each row execute function private.validate_client_communication();
create trigger operational_audit after insert or update on public.client_communications for each row execute function public.operations_record_change();
create policy communication_audit on public.operations_audit for select to authenticated using(entity='client_communications' and private.can_area(organization_id,'production',coalesce(after_data->>'client_id',before_data->>'client_id')::uuid));
alter table public.content_items add column published_at timestamptz;
create or replace function private.content_publication_date() returns trigger language plpgsql set search_path='' as $$ begin
 if new.status='published' and (tg_op='INSERT' or old.status is distinct from 'published') then new.published_at=now(); elsif tg_op='UPDATE' then new.published_at=old.published_at; end if;
 return new; end $$;
revoke all on function private.content_publication_date() from public;
create trigger content_publication_date before insert or update on public.content_items for each row execute function private.content_publication_date();
