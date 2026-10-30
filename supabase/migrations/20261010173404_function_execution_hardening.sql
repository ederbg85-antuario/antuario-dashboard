-- RLS identity helpers are intentionally SECURITY DEFINER to avoid recursive membership policies.
-- They return only the caller's own organization/role and are not callable anonymously.
revoke execute on function public.get_user_org_ids() from public,anon;
revoke execute on function public.get_user_role(bigint) from public,anon;
grant execute on function public.get_user_org_ids() to authenticated,service_role;
grant execute on function public.get_user_role(bigint) to authenticated,service_role;
-- Event triggers are internal maintenance, never client APIs.
revoke execute on function public.rls_auto_enable() from public,anon,authenticated;
