create or replace function private.validate_team_scope() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from unnest(new.client_ids) c(id) where not exists(select 1 from public.clients where id=c.id and organization_id=new.organization_id)) then raise exception 'Team client scope mismatch'; end if;
 if new.user_id is not null and not exists(select 1 from public.memberships where organization_id=new.organization_id and user_id=new.user_id and status='active') then raise exception 'Team identity must be an active organization member'; end if;
 return new;
end $$;
revoke all on function private.validate_team_scope() from public,anon,authenticated;
