-- Versioned evidence attached to original tasks. Approval never deploys, sends or completes a task.
begin;
create table public.task_deliveries (
 id uuid primary key default gen_random_uuid(), organization_id bigint not null references public.organizations(id),
 task_id uuid not null references public.tasks(id), version integer not null check(version>0),
 title text not null check(length(btrim(title)) between 1 and 180),
 summary text not null default '' check(length(summary)<=2000),
 artifacts jsonb not null check(jsonb_typeof(artifacts)='array' and jsonb_array_length(artifacts) between 1 and 8),
 submitted_by uuid not null references auth.users(id), responsible_member_id uuid references public.team_members(id),
 responsible_user_id uuid references auth.users(id), submitted_at timestamptz not null default now(),
 status text not null default 'review' check(status in ('review','approved','changes_requested','rejected')),
 decided_at timestamptz, request_key uuid not null,
 unique(organization_id,task_id,version), unique(organization_id,submitted_by,request_key)
);
create table public.task_delivery_events (
 id uuid primary key default gen_random_uuid(), organization_id bigint not null references public.organizations(id),
 delivery_id uuid not null references public.task_deliveries(id), task_id uuid not null references public.tasks(id),
 actor_id uuid not null references auth.users(id), action text not null check(action in ('submitted','comment','approved','changes_requested','rejected')),
 body text not null default '' check(length(body)<=5000), created_at timestamptz not null default now(),
 request_key uuid not null, unique(organization_id,actor_id,request_key)
);
create index task_delivery_events_delivery on public.task_delivery_events(delivery_id,created_at);
create index task_delivery_events_task on public.task_delivery_events(organization_id,task_id,created_at desc,id desc);
create index task_deliveries_task on public.task_deliveries(task_id,version desc);
alter table public.task_deliveries enable row level security;
alter table public.task_delivery_events enable row level security;
revoke all on public.task_deliveries,public.task_delivery_events from public,anon,authenticated;
grant select on public.task_deliveries,public.task_delivery_events to authenticated;
create policy delivery_read on public.task_deliveries for select to authenticated using(private.can_task(organization_id,task_id));
create policy delivery_events_read on public.task_delivery_events for select to authenticated using(private.can_task(organization_id,task_id));

create view public.task_delivery_latest with (security_invoker=true) as
 select distinct on (organization_id,task_id) id,organization_id,task_id,version,title,summary,submitted_by,
 responsible_member_id,responsible_user_id,submitted_at,status,decided_at,
 (select jsonb_agg(a - 'text') from jsonb_array_elements(artifacts) a) as artifacts
 from public.task_deliveries order by organization_id,task_id,version desc;
revoke all on public.task_delivery_latest from public,anon;
grant select on public.task_delivery_latest to authenticated;

-- Never let a later reassignment make the original author eligible to review their version.
create function private.can_review_delivery(org bigint, delivery uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.task_deliveries d join public.tasks t on t.id=d.task_id and t.organization_id=d.organization_id
 where d.id=delivery and d.organization_id=org and private.can_task(org,t.id,true)
 and auth.uid() is distinct from d.submitted_by and auth.uid() is distinct from d.responsible_user_id
 and (public.get_user_role(org)='owner' or exists(select 1 from public.team_members m
 where m.id=t.validator_member_id and m.organization_id=org and m.user_id=auth.uid() and m.status='active')));
$$;
revoke all on function private.can_review_delivery(bigint,uuid) from public;
grant execute on function private.can_review_delivery(bigint,uuid) to authenticated;

-- User-scoped uploads, immutable once attached. No public bucket and no remote URL fetching.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('task-deliveries','task-deliveries',false,4194304,array['image/png','image/jpeg','image/webp','application/pdf'])
 on conflict(id) do nothing;
do $$ begin
 if exists(select 1 from storage.buckets where id='task-deliveries' and public is distinct from false) then
  raise exception 'El almacenamiento de entregas debe ser privado';
 end if;
end $$;
create function private.delivery_object_access(object_name text, writing boolean default false) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare parts text[]; org bigint; task uuid;
begin
 if object_name !~ '^[0-9]+/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-7]-[0-9a-f]{64}\.(png|jpg|webp|pdf)$' then return false; end if;
 parts:=string_to_array(object_name,'/'); org:=parts[1]::bigint; task:=parts[2]::uuid;
 if not private.can_task(org,task,writing) then return false; end if;
 if writing then
  return parts[3]=auth.uid()::text and not exists(select 1 from public.task_deliveries d where d.organization_id=org and d.task_id=task and d.artifacts @> jsonb_build_array(jsonb_build_object('path',object_name)));
 end if;
 return parts[3]=auth.uid()::text or exists(select 1 from public.task_deliveries d where d.organization_id=org and d.task_id=task and d.artifacts @> jsonb_build_array(jsonb_build_object('path',object_name)));
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end $$;
revoke all on function private.delivery_object_access(text,boolean) from public;
grant execute on function private.delivery_object_access(text,boolean) to authenticated;
create policy task_delivery_objects_read on storage.objects for select to authenticated using(bucket_id='task-deliveries' and private.delivery_object_access(name));
create policy task_delivery_objects_insert on storage.objects for insert to authenticated with check(bucket_id='task-deliveries' and private.delivery_object_access(name,true));
create policy task_delivery_objects_cleanup on storage.objects for delete to authenticated using(bucket_id='task-deliveries' and private.delivery_object_access(name,true));

create function public.submit_task_delivery(p_org bigint,p_task uuid,p_title text,p_summary text,p_artifacts jsonb,p_request_key uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare t public.tasks%rowtype; d public.task_deliveries%rowtype; a jsonb; n integer; responsible uuid; total_bytes bigint:=0;
begin
 if auth.uid() is null or not private.can_task(p_org,p_task,true) then raise exception 'Sin permiso para entregar esta tarea' using errcode='42501'; end if;
 select * into t from public.tasks where id=p_task and organization_id=p_org for update;
 if not found then raise exception 'Tarea no disponible' using errcode='P0002'; end if;
 select * into d from public.task_deliveries where organization_id=p_org and submitted_by=auth.uid() and request_key=p_request_key;
 if found then
  if d.task_id=p_task and d.title=btrim(p_title) and d.summary=coalesce(p_summary,'') and d.artifacts=p_artifacts then return d.id; end if;
  raise exception 'La referencia ya contiene otra entrega' using errcode='23505';
 end if;
 if t.status='done' then raise exception 'Reabre la tarea antes de entregar otra versión' using errcode='55000'; end if;
 if p_request_key is null or length(btrim(coalesce(p_title,''))) not between 1 and 180 or length(coalesce(p_summary,''))>2000
 or p_artifacts is null or jsonb_typeof(p_artifacts)<>'array' or jsonb_array_length(p_artifacts) not between 1 and 8 or octet_length(p_artifacts::text)>524288 then
  raise exception 'Revisa el título y los archivos de la entrega' using errcode='22023';
 end if;
 for a in select value from jsonb_array_elements(p_artifacts) loop
  if jsonb_typeof(a)<>'object' or jsonb_typeof(a->'name') is distinct from 'string' or length(btrim(a->>'name')) not between 1 and 180 then raise exception 'Archivo sin nombre válido' using errcode='22023'; end if;
  if a->>'kind'='document' then
   if jsonb_typeof(a->'text') is distinct from 'string' or (length(btrim(a->>'text'))=0 or length(a->>'text')>64000) or coalesce(a->>'format','') not in ('markdown','text','csv') then raise exception 'Documento inválido' using errcode='22023'; end if;
   total_bytes:=total_bytes+octet_length(a->>'text');
  elsif a->>'kind'='link' then
   if jsonb_typeof(a->'url') is distinct from 'string' or length(a->>'url')>2000 or (a->>'url') !~ '^https://[^[:space:]]+$' then raise exception 'Usa un enlace HTTPS' using errcode='22023'; end if;
  elsif a->>'kind' in ('image','pdf') then
   if (a->>'path') is null or (a->>'path') not like p_org::text||'/'||p_task::text||'/'||auth.uid()::text||'/'||p_request_key::text||'/%'
   or not private.delivery_object_access(a->>'path',true) or coalesce(a->>'sha256','') !~ '^[0-9a-f]{64}$'
   or coalesce(a->>'size','') !~ '^[0-9]{1,8}$' or (a->>'size')::bigint not between 1 and 4194304
   or not exists(select 1 from storage.objects o where o.bucket_id='task-deliveries' and o.name=a->>'path'
     and o.metadata->>'mimetype'=a->>'mime' and (o.metadata->>'size')::bigint=(a->>'size')::bigint)
   or (a->>'kind'='image' and coalesce(a->>'mime','') not in ('image/png','image/jpeg','image/webp'))
   or (a->>'kind'='pdf' and a->>'mime' is distinct from 'application/pdf') then raise exception 'Archivo pendiente o fuera de esta entrega' using errcode='22023'; end if;
   total_bytes:=total_bytes+(a->>'size')::bigint;
  else raise exception 'Tipo de evidencia no permitido' using errcode='22023'; end if;
 end loop;
 if total_bytes>4194304 then raise exception 'La entrega supera 4 MB' using errcode='22023'; end if;
 select coalesce(max(version),0)+1 into n from public.task_deliveries where organization_id=p_org and task_id=p_task;
 select user_id into responsible from public.team_members where id=t.assignee_member_id and organization_id=p_org;
 insert into public.task_deliveries(organization_id,task_id,version,title,summary,artifacts,submitted_by,responsible_member_id,responsible_user_id,request_key)
 values(p_org,p_task,n,btrim(p_title),coalesce(p_summary,''),p_artifacts,auth.uid(),t.assignee_member_id,coalesce(responsible,t.assigned_to),p_request_key) returning * into d;
 insert into public.task_delivery_events(organization_id,delivery_id,task_id,actor_id,action,body,request_key)
 values(p_org,d.id,p_task,auth.uid(),'submitted','Entrega v'||n,p_request_key);
 update public.tasks set status='review' where id=p_task and organization_id=p_org;
 return d.id;
end $$;
revoke all on function public.submit_task_delivery(bigint,uuid,text,text,jsonb,uuid) from public,anon;
grant execute on function public.submit_task_delivery(bigint,uuid,text,text,jsonb,uuid) to authenticated;

create function public.respond_task_delivery(p_org bigint,p_delivery uuid,p_action text,p_body text,p_expected_status text,p_request_key uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare d public.task_deliveries%rowtype; e public.task_delivery_events%rowtype; task uuid;
begin
 select task_id into task from public.task_deliveries where id=p_delivery and organization_id=p_org;
 if auth.uid() is null or task is null or not private.can_task(p_org,task,true) then raise exception 'Entrega no disponible' using errcode='42501'; end if;
 perform 1 from public.tasks where id=task and organization_id=p_org for update;
 select * into d from public.task_deliveries where id=p_delivery and organization_id=p_org for update;
 select * into e from public.task_delivery_events where organization_id=p_org and actor_id=auth.uid() and request_key=p_request_key;
 if found then
  if e.delivery_id=p_delivery and e.action=p_action and e.body=btrim(coalesce(p_body,'')) then return e.id; end if;
  raise exception 'La referencia ya contiene otra respuesta' using errcode='23505';
 end if;
 if p_request_key is null or coalesce(p_action,'') not in ('comment','approved','changes_requested','rejected') or length(coalesce(p_body,''))>5000
 or (p_action<>'approved' and length(btrim(coalesce(p_body,'')))=0) then raise exception 'Escribe un comentario o motivo' using errcode='22023'; end if;
 if p_action<>'comment' then
  if not private.can_review_delivery(p_org,p_delivery) then raise exception 'Sólo el validador o dirección pueden decidir; no se permite autoaprobación' using errcode='42501'; end if;
  if d.status is distinct from p_expected_status or d.status<>'review'
   or exists(select 1 from public.task_deliveries where organization_id=p_org and task_id=task and version>d.version)
  then raise exception 'La entrega cambió; recarga antes de decidir' using errcode='40001'; end if;
  update public.task_deliveries set status=p_action,decided_at=now() where id=d.id;
  if p_action in ('changes_requested','rejected') then update public.tasks set status='in_progress' where id=task and status='review'; end if;
 end if;
 insert into public.task_delivery_events(organization_id,delivery_id,task_id,actor_id,action,body,request_key)
 values(p_org,d.id,task,auth.uid(),p_action,btrim(coalesce(p_body,'')),p_request_key) returning * into e;
 return e.id;
end $$;
revoke all on function public.respond_task_delivery(bigint,uuid,text,text,text,uuid) from public,anon;
grant execute on function public.respond_task_delivery(bigint,uuid,text,text,text,uuid) to authenticated;

create function private.require_accepted_task_delivery() returns trigger language plpgsql security definer set search_path='' as $$
declare last_status text;
begin
 if new.status='done' and old.status is distinct from 'done' then
  select status into last_status from public.task_deliveries where organization_id=new.organization_id and task_id=new.id order by version desc limit 1;
  if found and last_status<>'approved' then raise exception 'Aprueba la última entrega antes de terminar la tarea' using errcode='23514'; end if;
 end if;
 return new;
end $$;
revoke all on function private.require_accepted_task_delivery() from public;
create trigger require_accepted_task_delivery before update on public.tasks for each row execute function private.require_accepted_task_delivery();
commit;
