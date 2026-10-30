alter table public.agent_reports add constraint report_not_future check(report_date<=(now() at time zone 'America/Mexico_City')::date);
create or replace function private.communication_transition() returns trigger language plpgsql set search_path='' as $$ begin if (old.status='approved' and new.status not in ('approved','sent','cancelled')) or (old.status='pending' and new.status not in ('pending','approved','cancelled')) then raise exception 'Invalid communication transition'; end if;return new; end $$;
revoke all on function private.communication_transition() from public;
create trigger communication_transition before update on public.client_communications for each row execute function private.communication_transition();
