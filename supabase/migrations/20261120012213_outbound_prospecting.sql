-- One workflow per existing outbound prospect (the company anchor).
-- Existing people and interactions remain in the CRM; historical rows are not rewritten.
create table private.outbound_cases (
  id uuid primary key references public.prospects(id) on delete restrict,
  company_key text not null unique,
  stage text not null default 'detectado',
  fit text, decision_path text, interest text, experiment text, arm text check (arm in ('base','prueba')),
  allow_whatsapp boolean not null default false, allow_call boolean not null default false,
  meeting_date timestamptz, attendees text, objective text,
  revision integer not null default 0, changed_at timestamptz not null default now()
);
create table private.outbound_settings (
  singleton boolean primary key default true check(singleton),
  handoff_to uuid not null references public.profiles(id),
  weekly_goal integer not null default 100 check(weekly_goal between 1 and 10000)
);
insert into private.outbound_settings(handoff_to)
select m.user_id from public.memberships m join public.team_members t using (organization_id,user_id)
where m.organization_id=1 and m.role='owner' and m.status='active' and t.name='Eder';
do $$ begin if not exists(select from private.outbound_settings) then raise exception 'Falta configurar al responsable de las reuniones'; end if; end $$;
create function private.outbound_key(s text) returns text language sql immutable set search_path='' as $$
 select nullif(regexp_replace(translate(lower(trim(s)), 'áéíóúüñ', 'aeiouun'), '[^[:alnum:]]+', '', 'g'),'')
$$;
insert into private.outbound_cases(id,company_key,stage,fit,changed_at)
select id,private.outbound_key(company),case when stage='descartado' then 'excluido' else 'detectado' end,need_note,coalesce(updated_at,created_at,now())
from public.prospects where organization_id=1;
alter table public.contacts add column outbound_business_id uuid references private.outbound_cases(id) on delete restrict;
create index contacts_outbound_business_idx on public.contacts(outbound_business_id) where outbound_business_id is not null;
create index outbound_activity_history_idx on public.prospect_activities(prospect_id,created_at,id);
create table private.outbound_commands (
  actor uuid not null, request_id uuid not null, business_id uuid, payload jsonb not null,
  primary key(actor,request_id)
);
revoke all on private.outbound_cases,private.outbound_settings,private.outbound_commands from public,anon,authenticated;
create function private.outbound_admin() returns boolean language sql stable security definer set search_path='' as $$
 select private.can_area(1,'sales',null,true) and exists(select from public.memberships where user_id=auth.uid() and organization_id=1 and status='active' and role in ('owner','admin'))
$$;
create function private.outbound_visible(b uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.can_area(1,'sales') and exists(select from public.prospects p where p.organization_id=1 and p.id=b and (p.assigned_to=auth.uid() or private.outbound_admin()))
$$;
create function private.outbound_roster() returns table(id uuid,label text,manager boolean,writable boolean) language sql stable security definer set search_path='' as $$
 select m.user_id,coalesce(t.name,p.full_name,p.email,'Integrante'),m.role in ('owner','admin'),
 (m.role='owner' or (t.id is null and m.role in ('admin','editor')) or (t.access='operator' and 'sales'=any(t.write_areas)))
 from public.memberships m join public.profiles p on p.id=m.user_id left join public.team_members t on t.organization_id=m.organization_id and t.user_id=m.user_id
 where m.organization_id=1 and m.status='active' and (m.role='owner' or (t.id is null and m.role in ('admin','editor')) or (t.status='active' and 'sales'=any(t.areas) and cardinality(t.client_ids)=0))
$$;
revoke all on function private.outbound_roster() from public,anon,authenticated;
-- Restrictive policies compose with existing organization policies, including old CRM routes.
create policy outbound_prospect_read on public.prospects as restrictive for select to authenticated
 using (organization_id<>1 or (private.can_area(1,'sales') and (assigned_to=auth.uid() or private.outbound_admin())));
create policy outbound_activity_read on public.prospect_activities as restrictive for select to authenticated
 using (organization_id<>1 or private.outbound_visible(prospect_id));
create policy outbound_contact_read on public.contacts as restrictive for select to authenticated
 using (outbound_business_id is null or private.outbound_visible(outbound_business_id));
do $$ declare t text; predicate text; begin
 foreach t in array array['prospects','prospect_activities','contacts'] loop
   predicate:=case when t='contacts' then 'outbound_business_id is null' else 'organization_id <> 1' end;
   execute format('create policy outbound_write_insert on public.%I as restrictive for insert to authenticated with check (%s)',t,predicate);
   execute format('create policy outbound_write_update on public.%I as restrictive for update to authenticated using (%s) with check (%s)',t,predicate,predicate);
   execute format('create policy outbound_write_delete on public.%I as restrictive for delete to authenticated using (%s)',t,predicate);
 end loop;
 foreach t in array array['contact_notes','contact_files','contact_channels','contact_tags'] loop
   execute format('create policy outbound_parent_scope on public.%I as restrictive for all to authenticated using (exists (select 1 from public.contacts c where c.id=%I.contact_id)) with check (exists (select 1 from public.contacts c where c.id=%I.contact_id))',t,t,t);
 end loop;
end $$;
-- Server-side projection only; inaccessible and nonexistent direct links produce the same result.
create function private.outbound_workspace(b uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; admin_ok boolean:=private.outbound_admin();
begin
 if auth.uid() is null or not private.can_area(1,'sales') then raise exception 'Sin acceso' using errcode='42501'; end if;
 select jsonb_build_object(
 'userId',auth.uid(),'admin',admin_ok,'canWrite',private.can_area(1,'sales',null,true),
 'handoff',s.handoff_to,'goal',s.weekly_goal,
 'members',coalesce((select jsonb_agg(to_jsonb(r) order by label) from private.outbound_roster() r where admin_ok or r.id in (auth.uid(),s.handoff_to)),'[]'),
 'deals',coalesce((select jsonb_agg(jsonb_build_object(
 'id',p.id,'company',p.company,'owner',p.assigned_to,'source',p.source,'zone',p.company_city,'name',p.full_name,'position',p.title,
 'email',p.email,'phone',p.phone,'primaryContact',p.contact_id,'nextAction',p.next_action,'due',p.next_action_at,
 'stage',c.stage,'fit',c.fit,'decision',c.decision_path,'interest',c.interest,'experiment',c.experiment,'arm',c.arm,
 'wa',c.allow_whatsapp,'call',c.allow_call,'meeting',c.meeting_date,'attendees',c.attendees,'objective',c.objective,
 'revision',c.revision,'changed',c.changed_at,
 'people',coalesce((select jsonb_agg(jsonb_build_object('id',k.id,'name',k.full_name,'position',k.position,'email',k.email,'phone',k.phone) order by k.created_at) from public.contacts k where k.outbound_business_id=p.id),'[]'),
 'history',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'type',a.type,'channel',a.channel,'outcome',a.outcome,'body',a.body,'at',a.created_at,'author',coalesce(u.full_name,'Sin autor registrado')) order by a.created_at desc,a.id desc) from public.prospect_activities a left join public.profiles u on u.id=a.created_by where a.prospect_id=p.id and a.organization_id=1),'[]')
 ) order by p.next_action_at nulls last,p.company) from private.outbound_cases c join public.prospects p using(id)
 where p.organization_id=1 and (admin_ok or p.assigned_to=auth.uid()) and (b is null or c.id=b)),'[]')
 ) into result from private.outbound_settings s;
 return result;
end $$;
create function public.outbound_workspace(b uuid default null) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.outbound_workspace(b) $$;
create function private.outbound_command(cmd jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare
 actor_id uuid:=auth.uid(); admin_ok boolean:=private.outbound_admin(); op text:=cmd->>'op';
 bid uuid:=nullif(cmd->>'id','')::uuid; req uuid:=(cmd->>'request')::uuid;
 owner_id uuid; p public.prospects; c private.outbound_cases; prior private.outbound_commands;
 note text:=nullif(trim(cmd->>'note'),''); dest text:=cmd->>'stage'; chan text:=cmd->>'channel';
 today date:=(now() at time zone 'America/Mexico_City')::date;
 kind text:='nota'; event_outcome text:=op; event_direction text; person_id uuid;
 company_name text:=nullif(trim(cmd->>'company'),''); person_name text:=nullif(trim(cmd->>'name'),'');
 mail text:=nullif(lower(trim(cmd->>'email')),''); key_name text:=private.outbound_key(company_name);
 phone_key text:=nullif(regexp_replace(cmd->>'phone','[^0-9]','','g'),'');
 domain_key text:=nullif(lower(trim(cmd->>'domain')),'');
 cadence text[]:=array['detectado','validado','correo','seguimiento','whatsapp','llamada','sin_respuesta'];
 conversation text[]:=array['respondio','prospectado','interes','agendada','realizada','propuesta'];
begin
 if actor_id is null or not private.can_area(1,'sales',null,true) then raise exception 'Sin permiso para gestionar esta cartera' using errcode='42501'; end if;
 if req is null or length(cmd::text)>18000 then raise exception 'Solicitud inválida'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor_id::text||req::text,0));
 select * into prior from private.outbound_commands where outbound_commands.actor=actor_id and request_id=req;
 if found then
   if prior.payload<>cmd then raise exception 'La operación ya se registró'; end if;
   return prior.business_id;
 end if;
 if op='goal' then
   if not admin_ok then raise exception 'Se requiere administrador' using errcode='42501'; end if;
   update private.outbound_settings set weekly_goal=(cmd->>'goal')::int;
 elsif op='create' then
   if key_name is null or nullif(trim(cmd->>'source'),'') is null then raise exception 'Indica negocio y origen'; end if;
   if domain_key is not null and domain_key !~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$' then raise exception 'Escribe sólo el dominio del negocio'; end if;
   perform pg_advisory_xact_lock(hashtextextended('outbound-create',0));
   if exists(select from private.outbound_cases where company_key=key_name)
      or exists(select from public.contacts where organization_id=1 and (private.outbound_key(company)=key_name or lower(email)=mail or (length(phone_key)>=8 and regexp_replace(phone,'[^0-9]','','g')=phone_key)))
      or exists(select from public.companies where organization_id=1 and (private.outbound_key(name)=key_name or lower(regexp_replace(split_part(regexp_replace(website,'^https?://','','i'),'/',1),'^www\.','','i'))=domain_key))
      or exists(select from public.prospects where organization_id=1 and (private.outbound_key(company)=key_name or lower(email)=mail or lower(company_domain)=domain_key or (length(phone_key)>=8 and regexp_replace(phone,'[^0-9]','','g')=phone_key)))
   then raise exception 'Posible duplicado. Solicita revisión a un administrador.'; end if;
   owner_id:=case when admin_ok and cmd ? 'owner' then nullif(cmd->>'owner','')::uuid else actor_id end;
   if owner_id is not null and not exists(select from private.outbound_roster() where id=owner_id and writable) then raise exception 'Responsable no habilitado'; end if;
   insert into public.prospects(organization_id,company,company_domain,company_city,source,assigned_to,full_name,title,email,phone,stage,next_action,next_action_at)
   values(1,company_name,domain_key,nullif(trim(cmd->>'zone'),''),trim(cmd->>'source'),owner_id,person_name,nullif(trim(cmd->>'position'),''),mail,nullif(trim(cmd->>'phone'),''),'por_investigar','Revisar encaje',today)
   returning id into bid;
   insert into private.outbound_cases(id,company_key) values(bid,key_name);
   note:='Alta del negocio'; chan:=null;
 else
   select * into p from public.prospects where id=bid and organization_id=1 and (admin_ok or assigned_to=actor_id) for update;
   if not found then raise exception 'Ficha no disponible' using errcode='42501'; end if;
   select * into strict c from private.outbound_cases where id=bid for update;
   if c.revision is distinct from (cmd->>'revision')::integer then raise exception 'La ficha cambió. Vuelve a abrirla.'; end if;
   case op
   when 'assign' then
     if not admin_ok then raise exception 'Se requiere administrador' using errcode='42501'; end if;
     owner_id:=nullif(cmd->>'owner','')::uuid;
     if owner_id is not null and not exists(select from private.outbound_roster() where id=owner_id and writable) then raise exception 'Responsable no habilitado'; end if;
     update public.prospects set assigned_to=owner_id,assigned_seller=(select label from private.outbound_roster() where id=owner_id) where id=bid;
     update public.contacts set assigned_to=owner_id where outbound_business_id=bid;
     note:='Asignación a '||coalesce((select label from private.outbound_roster() where id=owner_id),'Sin asignar');
   when 'details' then
     if (nullif(cmd->>'experiment','') is null)<>(nullif(cmd->>'arm','') is null) then raise exception 'Indica experimento y grupo juntos'; end if;
     if (c.experiment is distinct from nullif(cmd->>'experiment','') or c.arm is distinct from nullif(cmd->>'arm','')) and exists(select from public.prospect_activities where prospect_id=bid and type='toque' and direction='saliente') then raise exception 'El grupo queda fijado con el primer abordaje'; end if;
     if c.stage=any(conversation[2:6]) and (nullif(trim(cmd->>'fit'),'') is null or nullif(trim(cmd->>'decision'),'') is null) then raise exception 'Conserva el encaje y el decisor'; end if;
     if c.stage=any(conversation[3:6]) and nullif(trim(cmd->>'interest'),'') is null then raise exception 'Conserva la señal de interés'; end if;
     update private.outbound_cases set fit=nullif(trim(cmd->>'fit'),''),decision_path=nullif(trim(cmd->>'decision'),''),
       interest=nullif(trim(cmd->>'interest'),''),allow_whatsapp=coalesce((cmd->>'wa')::boolean,false),allow_call=coalesce((cmd->>'call')::boolean,false),
       experiment=nullif(cmd->>'experiment',''),arm=nullif(cmd->>'arm','') where id=bid;
     if nullif(trim(cmd->>'source'),'') is null or (nullif(trim(cmd->>'nextAction'),'') is null)<>(nullif(cmd->>'due','') is null) then raise exception 'Revisa origen y próxima acción con fecha'; end if;
     update public.prospects set source=trim(cmd->>'source'),company_city=nullif(trim(cmd->>'zone'),''),next_action=nullif(trim(cmd->>'nextAction'),''),next_action_at=nullif(cmd->>'due','')::date where id=bid;
     note:='Ficha y seguimiento actualizados';
   when 'person','convert' then
     if op='convert' then
       if p.contact_id is not null then raise exception 'El contacto principal ya está vinculado'; end if;
       person_name:=nullif(trim(p.full_name),''); mail:=nullif(lower(trim(p.email)),'');
     end if;
     if person_name is null then raise exception 'Indica la persona de contacto'; end if;
     perform pg_advisory_xact_lock(hashtextextended('outbound-create',0));
     if exists(select from public.contacts where organization_id=1 and (lower(email)=mail or (outbound_business_id=bid and lower(trim(full_name))=lower(person_name))))
       or exists(select from public.prospects where organization_id=1 and lower(email)=mail and (id<>bid or op<>'convert'))
       or (op='person' and lower(trim(p.full_name))=lower(person_name))
     then raise exception 'Posible duplicado. Solicita revisión a un administrador.'; end if;
     insert into public.contacts(organization_id,company,full_name,position,email,phone,assigned_to,created_by,source,outbound_business_id)
       values(1,p.company,person_name,case when op='convert' then p.title else cmd->>'position' end,mail,case when op='convert' then p.phone else cmd->>'phone' end,p.assigned_to,actor_id,'prospeccion',bid) returning id into person_id;
     if op='convert' then update public.prospects set contact_id=person_id where id=bid; end if;
     note:='Contacto vinculado · '||person_name;
   when 'note' then
     if note is null then raise exception 'Escribe la nota'; end if;
   when 'attempt' then
     if not(c.stage=any(array['correo','seguimiento','whatsapp','llamada'])) or chan is distinct from (case c.stage when 'correo' then 'email' when 'seguimiento' then 'email' else c.stage end)
        or (chan='whatsapp' and not c.allow_whatsapp) or (chan='llamada' and not c.allow_call) or note is null then raise exception 'Revisa la etapa, el canal permitido y el intento real'; end if;
     kind:='toque'; event_direction:='saliente';
   when 'cancel','no_show' then
     if c.stage<>'agendada' or note is null then raise exception 'Registra el motivo en una reunión agendada'; end if;
     update private.outbound_cases set stage='interes',meeting_date=null where id=bid;
     update public.prospects set stage='interesado',next_action='Acordar nueva fecha',next_action_at=today where id=bid;
     kind:='reunion';
   when 'move','skip' then
     if dest is null or dest=c.stage then raise exception 'Selecciona una etapa distinta'; end if;
     if dest='excluido' then
       if note is null then raise exception 'Registra el motivo de no contactar'; end if;
       update public.prospects set next_action=null,next_action_at=null where id=bid;
     elsif dest='respondio' and c.stage=any(cadence) then
       if op='skip' or note is null or chan is null or chan not in ('email','whatsapp','llamada','visita','linkedin') then raise exception 'Registra la respuesta real y el canal'; end if;
       kind:='respuesta'; event_direction:='entrante';
       update public.prospects set next_action='Validar encaje y decisor',next_action_at=today where id=bid;
     elsif dest=any(cadence) and array_position(cadence,dest)=array_position(cadence,c.stage)+1 then
       if op='skip' and (dest not in ('whatsapp','llamada') or note is null) then raise exception 'Indica el canal omitido y el motivo'; end if;
       if dest='validado' and c.fit is null then raise exception 'Registra la evidencia de encaje en la ficha'; end if;
       if dest='seguimiento' and (exists(select from public.prospect_activities where prospect_id=bid and outcome='correo' and (created_at at time zone 'America/Mexico_City')::date>=today) or not coalesce((cmd->>'thread')::boolean,false)) then raise exception 'Registra el seguimiento al día siguiente en el mismo hilo'; end if;
       if dest in ('correo','seguimiento','whatsapp','llamada') and op<>'skip' then
         if note is null or (dest='whatsapp' and not c.allow_whatsapp) or (dest='llamada' and not c.allow_call) then raise exception 'Registra el abordaje manual y comprueba el permiso del canal'; end if;
         chan:=case when dest in ('correo','seguimiento') then 'email' else dest end;
         kind:='toque'; event_direction:='saliente';
       end if;
       update public.prospects set next_action=case dest when 'validado' then 'Preparar correo inicial' when 'correo' then 'Responder en el mismo hilo' when 'seguimiento' then 'Revisar permiso de WhatsApp' when 'whatsapp' then 'Revisar permiso de llamada' when 'llamada' then 'Revisar respuesta' end,
        next_action_at=case when dest='sin_respuesta' then null else today+1 end where id=bid;
     elsif dest=any(conversation) and array_position(conversation,dest)=array_position(conversation,c.stage)+1 and op='move' then
       if dest='prospectado' and (c.fit is null or c.decision_path is null) then raise exception 'Documenta el encaje y el decisor o vía de acceso'; end if;
       if dest='interes' and c.interest is null then raise exception 'Documenta la señal explícita de interés'; end if;
       if dest='agendada' then
         if nullif(cmd->>'meeting','') is null or nullif(trim(cmd->>'attendees'),'') is null or nullif(trim(cmd->>'objective'),'') is null then raise exception 'Completa fecha, asistentes y objetivo'; end if;
         select handoff_to into owner_id from private.outbound_settings;
         if not exists(select from private.outbound_roster() where id=owner_id and writable) then raise exception 'Revisa el responsable de reuniones'; end if;
         update private.outbound_cases set meeting_date=(cmd->>'meeting')::timestamptz,attendees=cmd->>'attendees',objective=cmd->>'objective' where id=bid;
         update public.prospects set assigned_to=owner_id,assigned_seller=(select label from private.outbound_roster() where id=owner_id) where id=bid;
         update public.contacts set assigned_to=owner_id where outbound_business_id=bid;
         note:='Reunión entregada a '||(select label from private.outbound_roster() where id=owner_id)||' · '||(cmd->>'attendees')||' · '||(cmd->>'objective');
       end if;
       if dest in ('realizada','propuesta') and (not admin_ok or note is null) then raise exception 'La dirección registra el resultado o la propuesta'; end if;
       update public.prospects set next_action=case dest when 'prospectado' then 'Confirmar interés' when 'interes' then 'Acordar reunión' when 'agendada' then 'Tomar la reunión' when 'realizada' then 'Preparar propuesta' else 'Dar seguimiento a la propuesta' end,
        next_action_at=case when dest='agendada' then ((cmd->>'meeting')::timestamptz at time zone 'America/Mexico_City')::date else today+1 end where id=bid;
     else raise exception 'Movimiento fuera de secuencia'; end if;
     event_outcome:=case when op='skip' then 'omitido_'||dest else dest end;
     if kind='nota' then kind:='etapa'; end if;
     update private.outbound_cases set stage=dest where id=bid;
     update public.prospects set stage=case
       when dest in ('sin_respuesta','excluido') then 'descartado'
       when dest='validado' then 'por_contactar' when dest='correo' then 'contactado'
       when dest in ('seguimiento','whatsapp','llamada','respondio','prospectado') then 'siguiendo'
       when dest='interes' then 'interesado' when dest in ('agendada','realizada') then 'reunion_agendada'
       when dest='propuesta' then case when contact_id is not null then 'convertido' else 'interesado' end
       else stage end where id=bid;
   else raise exception 'Operación desconocida'; end case;
   update public.prospects set updated_at=now() where id=bid;
   update private.outbound_cases set revision=revision+1,changed_at=now() where id=bid;
 end if;
 if op<>'goal' then
   insert into public.prospect_activities(organization_id,prospect_id,type,channel,direction,outcome,body,created_by)
   values(1,bid,kind,case when kind in ('toque','respuesta') then chan end,event_direction,event_outcome,note,actor_id);
   if kind='toque' then update public.prospects set touches=coalesce(touches,0)+1,last_contacted_at=now() where id=bid; end if;
 end if;
 insert into private.outbound_commands values(actor_id,req,bid,cmd);
 return bid;
end $$;
create function public.outbound_command(cmd jsonb) returns uuid language sql security invoker set search_path='' as $$ select private.outbound_command(cmd) $$;
create function private.outbound_metrics(week_of date, seller uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare who uuid:=seller; w date:=date_trunc('week',coalesce(week_of,(now() at time zone 'America/Mexico_City')::date))::date; result jsonb; goal integer;
begin
 if auth.uid() is null or not private.can_area(1,'sales') then raise exception 'Sin acceso' using errcode='42501'; end if;
 if not private.outbound_admin() then
   if who is not null and who<>auth.uid() then raise exception 'Sin acceso' using errcode='42501'; end if;
   who:=auth.uid();
 end if;
 select weekly_goal into goal from private.outbound_settings;
 with activity as materialized (
   select a.*, (a.created_at at time zone 'America/Mexico_City')::date as day
   from public.prospect_activities a join private.outbound_cases c on c.id=a.prospect_id where a.organization_id=1
 ), first_touch as (
   select distinct on (prospect_id) prospect_id,day,created_by from activity where type='toque' and direction='saliente'
   order by prospect_id,created_at,id
 ), attributed as (
   select * from first_touch where who is null or created_by=who
 ), cohort as (
   select f.prospect_id,c.experiment,c.arm, coalesce(array_agg(a.outcome) filter(where a.type in ('respuesta','etapa')),array[]::text[]) outcomes
   from attributed f join private.outbound_cases c on c.id=f.prospect_id left join activity a on a.prospect_id=f.prospect_id
   where f.day>=w and f.day<w+7 group by f.prospect_id,c.experiment,c.arm
 ), weeks as (
   select n, w-n*7 as start,count(f.prospect_id)::int as total from generate_series(0,3) n
   left join attributed f on f.day>=w-n*7 and f.day<w-n*7+7 group by n
 ), attempts as (
   select a.*,exists(select from activity r where r.prospect_id=a.prospect_id and r.type='respuesta' and r.channel=a.channel and (r.created_at,r.id)>(a.created_at,a.id)
     and not exists(select from activity x where x.prospect_id=a.prospect_id and x.type='toque' and x.direction='saliente' and x.channel=a.channel and (x.created_at,x.id)>(a.created_at,a.id) and (x.created_at,x.id)<(r.created_at,r.id))) answered
   from activity a where a.type='toque' and a.direction='saliente' and a.day>=w and a.day<w+7 and (who is null or a.created_by=who)
 ), experiments as (
   select experiment, count(*) filter(where arm='base') base,count(*) filter(where arm='prueba') test,
   count(*) filter(where arm='base' and 'respondio'=any(outcomes)) base_yes,count(*) filter(where arm='prueba' and 'respondio'=any(outcomes)) test_yes
   from cohort where experiment is not null group by experiment
 )
 select jsonb_build_object('week',w,'goal',goal * case when who is not null then 1 else greatest(1,(select count(*) from private.outbound_roster() r where r.writable and (not r.manager or exists(select from first_touch f where f.created_by=r.id and f.day>=w and f.day<w+7)))) end,
 'trend',(select jsonb_agg(jsonb_build_object('week',start,'n',total) order by start) from weeks),
 'funnel',(select jsonb_build_array(count(*),count(*) filter(where 'respondio'=any(outcomes)),count(*) filter(where 'prospectado'=any(outcomes)),count(*) filter(where 'interes'=any(outcomes)),count(*) filter(where 'agendada'=any(outcomes)),count(*) filter(where 'realizada'=any(outcomes))) from cohort),
 'channels',(select jsonb_agg(jsonb_build_object('channel',ch,'attempts',n,'responses',r) order by ch) from (select ch,count(a.id) n,count(a.id) filter(where a.answered) r from unnest(array['email','whatsapp','llamada','linkedin','visita']) ch left join attempts a on a.channel=ch group by ch) z),
 'overdue',(select count(*) from public.prospects p join private.outbound_cases c using(id) where (who is null or p.assigned_to=who) and p.next_action_at<(now() at time zone 'America/Mexico_City')::date and c.stage not in ('sin_respuesta','excluido')),
 'experiments',coalesce((select jsonb_agg(to_jsonb(e) order by experiment) from experiments e),'[]')
 ) into result;
 return result;
end $$;
create function public.outbound_metrics(week_of date default null,seller uuid default null) returns jsonb language sql stable security invoker set search_path='' as $$ select private.outbound_metrics(week_of,seller) $$;
do $$ declare f regprocedure; begin
 foreach f in array array['private.outbound_workspace(uuid)'::regprocedure,'public.outbound_workspace(uuid)'::regprocedure,'private.outbound_command(jsonb)'::regprocedure,'public.outbound_command(jsonb)'::regprocedure,'private.outbound_metrics(date,uuid)'::regprocedure,'public.outbound_metrics(date,uuid)'::regprocedure,'private.outbound_visible(uuid)'::regprocedure,'private.outbound_admin()'::regprocedure] loop
 execute format('revoke all on function %s from public,anon,authenticated',f);
 execute format('grant execute on function %s to authenticated',f);
 end loop;
end $$;
-- File paths on the existing private contact bucket are organization/contact/file.
-- Apply the same owner boundary to normal storage reads and writes of linked people.
create function private.outbound_file_visible(object_name text, writing boolean)
returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select from public.contacts c where c.organization_id=1 and c.outbound_business_id is not null
 and split_part(object_name,'/',1)='1' and split_part(object_name,'/',2)=c.id::text
 and (not private.outbound_visible(c.outbound_business_id) or (writing and not private.can_area(1,'sales',null,true))))
$$;
revoke all on function private.outbound_file_visible(text,boolean) from public;
grant execute on function private.outbound_file_visible(text,boolean) to authenticated,anon;
create policy outbound_contact_objects on storage.objects as restrictive for all
 using(bucket_id<>'contact-files' or private.outbound_file_visible(name,false))
 with check(bucket_id<>'contact-files' or private.outbound_file_visible(name,true));
create policy outbound_contact_objects_delete on storage.objects as restrictive for delete
 using(bucket_id<>'contact-files' or private.outbound_file_visible(name,true));
