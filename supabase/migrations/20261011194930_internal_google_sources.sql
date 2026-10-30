-- Internal workspace: no self-service tenant creation. Existing data is retained.
alter policy antuario_orgs_insert on public.organizations with check (false);

-- Finish a verified Google read atomically; callable only by the backend.
create function public.finish_internal_google_sync(p_id uuid,p_snapshot jsonb) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
declare c public.marketing_connections;
begin
 perform pg_advisory_xact_lock(1);
 select * into c from public.marketing_connections where id=p_id for update;
 if c.id is null or c.organization_id<>1 or c.source not in ('ga4','search_console','gtm')
    or coalesce(p_snapshot->>'auth_mode','')<>'server' then
   raise exception 'Invalid internal Google source';
 end if;
 update public.marketing_connections set status='revoked',access_token=null,refresh_token=null,
   token_expires_at=null,updated_at=now()
   where organization_id=1 and source=c.source and id<>c.id and status<>'revoked';
 update public.marketing_connections set status='active',access_token=null,refresh_token=null,
   token_expires_at=null,snapshot=p_snapshot,last_error=null,last_sync_at=now(),updated_at=now()
   where id=c.id;
end $$;
revoke all on function public.finish_internal_google_sync(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.finish_internal_google_sync(uuid,jsonb) to service_role;
