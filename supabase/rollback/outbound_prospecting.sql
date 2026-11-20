-- Reversal for an unused rollout only. Never remove live workflow or authored history.
begin;
lock table private.outbound_commands, private.outbound_cases, public.prospects, public.contacts, public.prospect_activities in access exclusive mode;
do $$ begin
 if exists(select from private.outbound_commands) or exists(select from private.outbound_cases where revision<>0)
 or exists(select from public.contacts where outbound_business_id is not null)
 then raise exception 'Hay actividad posterior al despliegue. Conservar datos y permisos; corregir hacia delante.'; end if;
end $$;
do $$ declare t text; begin
 foreach t in array array['contact_notes','contact_files','contact_channels','contact_tags'] loop
 execute format('drop policy outbound_parent_scope on public.%I',t);
 end loop;
 foreach t in array array['prospects','prospect_activities','contacts'] loop
 execute format('drop policy outbound_write_insert on public.%I',t);
 execute format('drop policy outbound_write_update on public.%I',t);
 execute format('drop policy outbound_write_delete on public.%I',t);
 end loop;
end $$;
drop policy outbound_contact_objects on storage.objects;
drop policy outbound_contact_objects_delete on storage.objects;
drop function private.outbound_file_visible(text,boolean);
drop policy outbound_prospect_read on public.prospects;
drop policy outbound_activity_read on public.prospect_activities;
drop policy outbound_contact_read on public.contacts;
drop function public.outbound_metrics(date,uuid), public.outbound_workspace(uuid), public.outbound_command(jsonb);
drop function private.outbound_metrics(date,uuid), private.outbound_workspace(uuid), private.outbound_command(jsonb);
drop function private.outbound_visible(uuid),private.outbound_admin(),private.outbound_roster(),private.outbound_key(text);
drop index public.outbound_activity_history_idx;
alter table public.contacts drop column outbound_business_id;
drop table private.outbound_commands,private.outbound_cases,private.outbound_settings;
commit;
