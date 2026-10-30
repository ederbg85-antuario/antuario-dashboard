-- Called only by the authenticated server after provider-side property validation.
create function public.activate_marketing_connection(p_id uuid,p_external_id text,p_external_name text) returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare c public.marketing_connections;begin
 select * into c from public.marketing_connections where id=p_id and status='pending' for update;
 if c.id is null then raise exception 'Pending connection unavailable';end if;
 perform pg_advisory_xact_lock(c.organization_id);
 update public.marketing_connections set status='revoked',access_token=null,refresh_token=null,updated_at=now() where organization_id=c.organization_id and source=c.source and status='active' and id<>c.id;
 update public.marketing_connections set status='active',external_id=p_external_id,external_name=p_external_name,last_error=null,updated_at=now() where id=c.id;
 return c.id;
end $$;
revoke all on function public.activate_marketing_connection(uuid,text,text) from public,anon,authenticated;
grant execute on function public.activate_marketing_connection(uuid,text,text) to service_role;
