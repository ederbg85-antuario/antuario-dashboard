-- Preserve invoices, orders, contacts, projects and tasks when a relationship ends.
alter table public.clients
 add column status text not null default 'active' check(status in ('active','archived')),
 add column archived_at timestamptz,
 add column archive_reason text check(archive_reason is null or length(archive_reason)<=2000),
 add constraint clients_lifecycle_consistent check(
  (status='active' and archived_at is null) or
  (status='archived' and archived_at is not null)
 );
create index clients_org_lifecycle on public.clients(organization_id,status);

-- Existing sales permissions must not grant authority to end or reactivate accounts.
create function private.validate_client_lifecycle() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if ((tg_op='INSERT' and new.status<>'active') or
     (tg_op='UPDATE' and (new.status is distinct from old.status or new.archived_at is distinct from old.archived_at or new.archive_reason is distinct from old.archive_reason)))
    and auth.uid() is not null and public.get_user_role(new.organization_id) is distinct from 'owner' then
  raise exception 'Only the organization owner manages client lifecycle';
 end if;
 return new;
end $$;
revoke all on function private.validate_client_lifecycle() from public,anon,authenticated;
create trigger client_lifecycle_validation before insert or update on public.clients
 for each row execute function private.validate_client_lifecycle();
create trigger client_lifecycle_audit after update of status,archived_at,archive_reason on public.clients
 for each row execute function public.operations_record_change();
