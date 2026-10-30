-- Additive account workspace. Existing work items, comments, client permissions and balances are untouched.
-- Rollback instructions: docs/accounts-api.md. No production example metrics are seeded.
create table public.client_account_profiles (
 id uuid primary key references public.clients(id),
 organization_id bigint not null references public.organizations(id),
 name text not null check(length(name) between 1 and 240),
 status text not null check(status in ('active','archived')),
 logo_url text check(logo_url is null or logo_url ~ '^https://'),
 director_member_id uuid references public.team_members(id),
 director_name text,
 services text[] not null default '{}',
 monthly_fee numeric check(monthly_fee between 0 and 999999999),
 currency text not null default 'MXN' check(currency in ('MXN','USD')),
 billing_cadence text not null default 'monthly' check(billing_cadence in ('monthly','weekly')),
 fee_basis text check(length(fee_basis)<=1000),
 health text not null default 'unknown' check(health in ('healthy','attention','blocked','unknown')),
 summary text not null default '' check(length(summary)<=4000),
 is_example boolean not null default false check(not is_example),
 created_by uuid references auth.users(id),updated_by uuid references auth.users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index client_account_profiles_org on public.client_account_profiles(organization_id,status);

create table public.client_account_records (
 id uuid primary key default gen_random_uuid(),
 organization_id bigint not null references public.organizations(id),
 account_id uuid not null references public.client_account_profiles(id),
 kind text not null check(kind in ('contacts','fronts','milestones','snapshots','campaigns','changes','templates','instances','attachments','invoices','payments','opportunities')),
 data jsonb not null check(jsonb_typeof(data)='object' and octet_length(data::text)<=24000),
 initial_data jsonb not null default '{}'::jsonb,
 source_key text not null check(length(btrim(source_key)) between 1 and 160),
 is_example boolean not null default false check(not is_example),
 created_by uuid not null references auth.users(id),updated_by uuid references auth.users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,account_id,kind,source_key)
);
create index client_account_records_lookup on public.client_account_records(organization_id,account_id,kind,created_at desc);
create index client_account_records_assignee on public.client_account_records((data->>'assignee_member_id')) where kind='instances';

-- These narrow identity lookups need to read canonical memberships, seats and clients despite their own RLS.
-- They accept no arbitrary SQL and are inaccessible to anonymous callers.
create function private.can_read_account(org bigint, client uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.clients c join public.memberships m on m.organization_id=c.organization_id
 where c.id=client and c.organization_id=org and m.user_id=(select auth.uid()) and m.status='active' and (
 m.role='owner' or exists(select 1 from public.team_members s where s.organization_id=org and s.user_id=m.user_id
 and s.status='active' and s.areas && array['production','marketing','sales','finance','accounting','people']::text[]
 and (cardinality(s.client_ids)=0 or client=any(s.client_ids)))));
$$;
create function private.can_manage_account(org bigint, client uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.can_read_account(org,client) and exists(select 1 from public.clients c where c.id=client and c.organization_id=org and c.status='active') and (
 public.get_user_role(org)='owner' or private.can_area(org,'people',null,true) or exists(
 select 1 from public.team_members s join public.client_account_profiles p on p.director_member_id=s.id
 where s.organization_id=org and p.organization_id=org and p.id=client and s.user_id=(select auth.uid())
 and s.status='active' and s.access='operator' and 'production'=any(s.write_areas)
 and (cardinality(s.client_ids)=0 or client=any(s.client_ids))));
$$;
create function private.can_bill_account(org bigint, client uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.can_read_account(org,client) and exists(select 1 from public.clients c where c.id=client and c.organization_id=org and c.status='active')
 and (public.get_user_role(org)='owner' or private.can_area(org,'finance',client,true) or private.can_area(org,'accounting',client,true));
$$;
create function private.owns_account_instance(org bigint,client uuid,instance uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.can_read_account(org,client) and exists(select 1 from public.client_account_records r join public.team_members s on s.id=(r.data->>'assignee_member_id')::uuid
 where r.id=instance and r.organization_id=org and r.account_id=client and r.kind='instances' and s.user_id=(select auth.uid()) and s.status='active'
 and s.access='operator' and cardinality(s.write_areas)>0);
$$;
create function private.can_write_account_record(org bigint,client uuid,record_kind text,payload jsonb) returns boolean language sql stable security definer set search_path='' as $$
 select private.can_read_account(org,client) and exists(select 1 from public.clients c where c.id=client and c.organization_id=org and c.status='active') and (
 case when record_kind in ('invoices','payments') then private.can_bill_account(org,client)
 when private.can_manage_account(org,client) then true
 when record_kind='instances' then exists(select 1 from public.team_members s where s.id=nullif(payload->>'assignee_member_id','')::uuid and s.organization_id=org and s.user_id=(select auth.uid()) and s.status='active' and s.access='operator' and cardinality(s.write_areas)>0)
 when record_kind='attachments' then (
 (payload->>'instance_id' is not null or payload->>'work_id' is not null)
 and (payload->>'instance_id' is null or private.owns_account_instance(org,client,nullif(payload->>'instance_id','')::uuid))
 and (payload->>'work_id' is null or exists(select 1 from public.team_work_items w join public.team_members s on s.id=w.recipient_member_id
 where w.id=nullif(payload->>'work_id','')::uuid and w.organization_id=org and s.user_id=(select auth.uid()) and s.status='active' and s.access='operator' and cardinality(s.write_areas)>0)))
 else false end);
$$;
revoke all on function private.can_read_account(bigint,uuid),private.can_manage_account(bigint,uuid),private.can_bill_account(bigint,uuid),private.owns_account_instance(bigint,uuid,uuid),private.can_write_account_record(bigint,uuid,text,jsonb) from public,anon;
grant execute on function private.can_read_account(bigint,uuid),private.can_manage_account(bigint,uuid),private.can_bill_account(bigint,uuid),private.owns_account_instance(bigint,uuid,uuid),private.can_write_account_record(bigint,uuid,text,jsonb) to authenticated;

create function private.validate_account_profile() returns trigger language plpgsql security definer set search_path='' as $$
declare canonical public.clients;
begin
 select * into canonical from public.clients where id=new.id and organization_id=new.organization_id;
 if canonical.id is null then raise exception 'Account client scope mismatch'; end if;
 if tg_op='UPDATE' and (new.id is distinct from old.id or new.organization_id is distinct from old.organization_id or new.created_at is distinct from old.created_at or new.created_by is distinct from old.created_by or new.director_member_id is distinct from old.director_member_id or new.director_name is distinct from old.director_name or new.is_example is distinct from old.is_example) then raise exception 'Account identity is immutable'; end if;
 if auth.uid() is not null and pg_trigger_depth()=1 and not private.can_manage_account(new.organization_id,new.id) then raise exception 'Only account coordination manages profile'; end if;
 new.name=canonical.name;new.status=canonical.status;new.updated_by=auth.uid();new.updated_at=clock_timestamp();
 if tg_op='INSERT' then new.created_by=auth.uid();new.created_at=clock_timestamp();end if;
 return new;
end $$;
revoke all on function private.validate_account_profile() from public,anon,authenticated;
create trigger account_profile_validation before insert or update on public.client_account_profiles for each row execute function private.validate_account_profile();

create function private.validate_account_record() returns trigger language plpgsql security definer set search_path='' as $$
declare p jsonb;allowed text[];nullable_keys text[];k text;ref uuid;target public.client_account_records;seat public.team_members;account_org bigint;
begin
 p=new.data;
 if tg_op='INSERT' then new.initial_data=p;end if;
 if tg_op='INSERT' and auth.uid() is not null then new.created_by=auth.uid();end if;
 select organization_id into account_org from public.client_account_profiles where id=new.account_id;
 if account_org is distinct from new.organization_id then raise exception 'Account record scope mismatch'; end if;
 if tg_op='UPDATE' and (new.id is distinct from old.id or new.organization_id is distinct from old.organization_id or new.account_id is distinct from old.account_id or new.kind is distinct from old.kind or new.initial_data is distinct from old.initial_data or new.source_key is distinct from old.source_key or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at or new.is_example is distinct from old.is_example) then raise exception 'Account record identity is immutable';end if;
 allowed=case new.kind
 when 'contacts' then array['name','role','email','access_location']
 when 'fronts' then array['key','title','health','status','next_action','owner_member_id']
 when 'milestones' then array['date','title','description','kind']
 when 'snapshots' then array['date','period_to','source','metric','value','unit','grain','channel','campaign_id','evidence']
 when 'campaigns' then array['name','platform','status','daily_budget','period_budget','balance','currency','period_from','period_to','evidence']
 when 'changes' then array['date','platform','campaign_id','action','before','after','authorized_by','reason','evidence']
 when 'templates' then array['title','frequency','day','assignee_member_id','deliverable_kind','enabled']
 when 'instances' then array['template_id','title','due_date','assignee_member_id','status','evidence','blocked_reason','period_from','period_to']
 when 'attachments' then array['name','mime_type','size','storage_path','instance_id','work_id','stage','version','upload_status','sha256']
 when 'invoices' then array['title','uuid','issued_date','due_date','period_from','period_to','subtotal','vat','retention','total','currency','status','evidence']
 when 'payments' then array['invoice_id','date','amount','currency','receipt_status','evidence']
 when 'opportunities' then array['title','stage','development_estimate','monthly_estimate','currency','tax_basis','next_action','evidence'] end;
 nullable_keys=case new.kind when 'contacts' then array['email','access_location'] when 'fronts' then array['owner_member_id'] when 'snapshots' then array['channel','campaign_id'] when 'campaigns' then array['daily_budget','period_budget','balance'] when 'changes' then array['campaign_id'] when 'templates' then array['assignee_member_id'] when 'instances' then array['template_id','assignee_member_id','period_from','period_to'] when 'attachments' then array['instance_id','work_id'] when 'invoices' then array['uuid','due_date'] when 'payments' then array['invoice_id'] when 'opportunities' then array['development_estimate','monthly_estimate'] else array[]::text[] end;
 if exists(select 1 from jsonb_each(p) e where e.value='null'::jsonb and not e.key=any(nullable_keys)) then raise exception 'Required account field is null';end if;
 if not(p ?& allowed) or exists(select 1 from jsonb_object_keys(p) v(key) where not v.key=any(allowed)) then raise exception 'Unexpected or missing account fields';end if;
 if exists(select 1 from jsonb_each(p) e where e.value<>'null'::jsonb and jsonb_typeof(e.value)<>'string' and not e.key=any(array['value','daily_budget','period_budget','balance','subtotal','vat','retention','total','amount','development_estimate','monthly_estimate','size','version','day','enabled'])) then raise exception 'Invalid account scalar';end if;
 foreach k in array array['name','title','role','key','status','action','platform','authorized_by'] loop
 if p?k and (jsonb_typeof(p->k)<>'string' or length(btrim(p->>k)) not between 1 and 240) then raise exception 'Invalid account text';end if;end loop;
 foreach k in array array['description','next_action','summary','evidence','blocked_reason','before','after','reason','access_location','email','channel'] loop
 if p?k and p->k<>'null'::jsonb and (jsonb_typeof(p->k)<>'string' or length(p->>k)>4000) then raise exception 'Invalid account detail';end if;end loop;
 foreach k in array array['value','daily_budget','period_budget','balance','subtotal','vat','retention','total','amount','development_estimate','monthly_estimate','size','version','day'] loop
 if p?k and p->k<>'null'::jsonb and (jsonb_typeof(p->k)<>'number' or (p->>k)::numeric not between 0 and 999999999) then raise exception 'Invalid account number';end if;end loop;
 foreach k in array array['period_from','period_to','issued_date','due_date'] loop
 if p?k and p->k<>'null'::jsonb then if p->>k !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid account date';end if;perform (p->>k)::date;end if;end loop;
 if p?'date' then
 if new.kind='changes' then perform (p->>'date')::timestamptz;
 else if p->>'date' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid account date';end if;perform (p->>'date')::date;end if;end if;
 if p?'period_to' and p->'period_to'<>'null'::jsonb and coalesce(p->>'period_from',p->>'date')>(p->>'period_to') then raise exception 'Invalid account period';end if;
 foreach k in array array['template_id','instance_id','invoice_id','campaign_id'] loop
 ref=nullif(p->>k,'')::uuid;
 if ref is not null then select * into target from public.client_account_records where id=ref;
 if target.account_id is distinct from new.account_id or target.organization_id is distinct from new.organization_id or target.kind is distinct from (case k when 'template_id' then 'templates' when 'instance_id' then 'instances' when 'invoice_id' then 'invoices' else 'campaigns' end) then raise exception 'Account reference scope mismatch';end if;
 end if;end loop;
 foreach k in array array['assignee_member_id','owner_member_id'] loop
 ref=nullif(p->>k,'')::uuid;
 if ref is not null then select * into seat from public.team_members where id=ref;
 if seat.organization_id is distinct from new.organization_id or seat.status<>'active' or seat.user_id is null or (cardinality(seat.client_ids)>0 and not new.account_id=any(seat.client_ids)) then raise exception 'Account assignee scope mismatch';end if;
 end if;end loop;
 if new.kind='snapshots' and (p->>'source' not in ('ga4','search_console','google_ads','manual') or p->>'grain' not in ('daily','period') or p->>'unit' not in ('count','MXN','USD','percent','position','seconds') or p->>'metric' !~ '^[a-z][a-z0-9_]{0,79}$' or (p->>'grain'='daily' and p->>'date'<>p->>'period_to') or (p->>'unit'='percent' and (p->>'value')::numeric>100) or length(btrim(p->>'evidence'))=0) then raise exception 'Invalid metric provenance';end if;
 if new.kind='fronts' and p->>'health' not in ('healthy','attention','blocked','unknown') then raise exception 'Invalid account health';end if;
 if new.kind='milestones' and p->>'kind' not in ('milestone','decision','delivery') then raise exception 'Invalid milestone kind';end if;
 if new.kind='campaigns' and (p->>'platform' not in ('google_ads','meta','other') or p->>'status' not in ('active','paused','ended','draft')) then raise exception 'Invalid campaign';end if;
 if new.kind='templates' and (p->>'frequency' not in ('weekly','monthly','quarterly') or (p->>'day')::int not between 1 and (case when p->>'frequency'='weekly' then 7 else 31 end) or p->>'deliverable_kind' not in ('report','invoice','payment_receipt','review','support') or jsonb_typeof(p->'enabled')<>'boolean') then raise exception 'Invalid recurring template';end if;
 if new.kind='instances' then
 if p->>'status' not in ('pending','in_progress','review','delivered','blocked') or (p->>'status' in ('review','delivered') and length(btrim(p->>'evidence'))=0) or ((p->>'status'='blocked') is distinct from (length(btrim(p->>'blocked_reason'))>0)) then raise exception 'Evidence or blocker missing';end if;
 if auth.uid() is not null and not private.can_manage_account(new.organization_id,new.account_id) and (tg_op='INSERT' or (p-array['status','evidence','blocked_reason']) is distinct from (old.data-array['status','evidence','blocked_reason'])) then raise exception 'Specialists update own instance progress only';end if;
 end if;
 if p?'uuid' and p->>'uuid' is not null then perform (p->>'uuid')::uuid;end if;
 if new.kind='invoices' and (p->>'status' not in ('draft','issued','cancelled') or abs((p->>'subtotal')::numeric+(p->>'vat')::numeric-(p->>'retention')::numeric-(p->>'total')::numeric)>.02 or (p->>'status'<>'draft' and length(btrim(p->>'evidence'))=0)) then raise exception 'Invalid invoice accounting';end if;
 if new.kind='payments' and ((p->>'amount')::numeric<=0 or p->>'receipt_status' not in ('not_required','pending','issued') or length(btrim(p->>'evidence'))=0 or (p->>'invoice_id' is not null and p->>'currency'<>target.data->>'currency')) then raise exception 'Invalid payment';end if;
 if new.kind='opportunities' and (p->>'stage' not in ('discovery','proposal','negotiation','won','lost') or p->>'tax_basis' not in ('plus_vat','included','unconfirmed')) then raise exception 'Invalid opportunity';end if;
 if p?'currency' and p->>'currency' not in ('MXN','USD') then raise exception 'Invalid currency';end if;
 if new.kind='attachments' then
 if tg_op='INSERT' and p->>'upload_status'<>'pending' then raise exception 'New uploads start pending';end if;
 if tg_op='UPDATE' and old.data->>'upload_status'='ready' and p->>'upload_status'<>'ready' then raise exception 'Ready attachments cannot become pending';end if;
 if p->>'sha256' !~ '^[a-f0-9]{64}$' then raise exception 'Attachment digest required';end if;
 if p->>'mime_type' not in ('application/pdf','image/png','image/jpeg','image/webp') or (p->>'size')::int not between 1 and 4194304 or (p->>'version')::int not between 1 and 9999 or p->>'stage' not in ('draft','final') or p->>'upload_status' not in ('pending','ready') then raise exception 'Invalid attachment';end if;
 if p->>'storage_path' !~ ('^'||new.organization_id::text||'/'||new.account_id::text||'/'||new.created_by::text||'/[0-9a-f-]+/[a-zA-Z0-9._-]+$') then raise exception 'Invalid private attachment path';end if;
 ref=nullif(p->>'work_id','')::uuid;
 if ref is not null and not exists(select 1 from public.team_work_items w where w.id=ref and w.organization_id=new.organization_id) then raise exception 'Work reference scope mismatch';end if;
 if p->>'upload_status'='ready' and not exists(select 1 from storage.objects o where o.bucket_id='client-account-deliverables' and o.name=p->>'storage_path') then raise exception 'Upload the private object before marking ready';end if;
 if tg_op='UPDATE' and (new.data-'upload_status') is distinct from (old.data-'upload_status') then raise exception 'Attachment versions are append only';end if;
 end if;
 if auth.uid() is not null then
 if not private.can_write_account_record(new.organization_id,new.account_id,new.kind,p) then raise exception 'Account write denied';end if;
 if tg_op='INSERT' then new.created_by=auth.uid();elsif new.kind='attachments' and new.created_by<>auth.uid() and not private.can_manage_account(new.organization_id,new.account_id) then raise exception 'Attachment ownership mismatch';end if;
 end if;
 if tg_op='INSERT' then new.created_at=clock_timestamp();end if;
 new.updated_at=clock_timestamp();new.updated_by=auth.uid();return new;
end $$;
revoke all on function private.validate_account_record() from public,anon,authenticated;
create trigger account_record_validation before insert or update on public.client_account_records for each row execute function private.validate_account_record();

alter table public.client_account_profiles enable row level security;
alter table public.client_account_records enable row level security;
revoke all on public.client_account_profiles,public.client_account_records from anon,authenticated;
grant select,insert,update on public.client_account_profiles,public.client_account_records to authenticated;
create policy account_profile_read on public.client_account_profiles for select to authenticated using(private.can_read_account(organization_id,id));
create policy account_profile_insert on public.client_account_profiles for insert to authenticated with check(private.can_manage_account(organization_id,id));
create policy account_profile_update on public.client_account_profiles for update to authenticated using(private.can_manage_account(organization_id,id)) with check(private.can_manage_account(organization_id,id));
create policy account_record_read on public.client_account_records for select to authenticated using(private.can_read_account(organization_id,account_id));
create policy account_record_insert on public.client_account_records for insert to authenticated with check(created_by=(select auth.uid()) and private.can_write_account_record(organization_id,account_id,kind,data));
create policy account_record_update on public.client_account_records for update to authenticated using(private.can_write_account_record(organization_id,account_id,kind,data)) with check(private.can_write_account_record(organization_id,account_id,kind,data));
create trigger account_profile_audit after insert or update on public.client_account_profiles for each row execute function public.operations_record_change();
create trigger account_record_audit after insert or update on public.client_account_records for each row execute function public.operations_record_change();

-- Atomic idempotent creates; the original actor and complete payload must match on a retry.
create function public.save_account_records(account uuid,record_kind text,records jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare item jsonb;existing public.client_account_records;saved public.client_account_records;org bigint;out jsonb='[]';
begin
 if jsonb_typeof(records)<>'array' or jsonb_array_length(records) not between 1 and 250 then raise exception 'Invalid record batch';end if;
 select organization_id into org from public.client_account_profiles where id=account;
 if org is null then raise exception 'Account not available';end if;
 for item in select value from jsonb_array_elements(records) loop
 begin
 insert into public.client_account_records(organization_id,account_id,kind,data,source_key,created_by) values(org,account,record_kind,item->'data',item->>'source_key',auth.uid()) returning * into saved;
 out=out||jsonb_build_array(jsonb_build_object('id',saved.id,'updated_at',saved.updated_at,'reused',false));
 exception when unique_violation then
 select * into existing from public.client_account_records where organization_id=org and account_id=account and kind=record_kind and source_key=item->>'source_key';
 if existing.id is null or existing.created_by is distinct from auth.uid() or existing.initial_data is distinct from item->'data' then raise exception 'Idempotency reference conflict' using errcode='23505';end if;
 out=out||jsonb_build_array(jsonb_build_object('id',existing.id,'updated_at',existing.updated_at,'reused',true));
 end;
 end loop;
 return out;
end $$;
revoke all on function public.save_account_records(uuid,text,jsonb) from public,anon;
grant execute on function public.save_account_records(uuid,text,jsonb) to authenticated;

-- Canonical lifecycle/name changes keep account history readable and disable every write immediately.
create function private.sync_account_client() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
 insert into public.client_account_profiles(id,organization_id,name,status,services) values(new.id,new.organization_id,new.name,new.status,coalesce(new.contracted_services,'{}')) on conflict(id) do nothing;
 else update public.client_account_profiles set name=new.name,status=new.status where id=new.id;end if;
 return new;
end $$;
revoke all on function private.sync_account_client() from public,anon,authenticated;
create trigger account_client_sync after insert or update of name,status on public.clients for each row execute function private.sync_account_client();

-- Existing clients get an empty, truthful account shell; no invented performance, invoices or contacts.
insert into public.client_account_profiles(id,organization_id,name,status,services,director_member_id,director_name)
select c.id,c.organization_id,c.name,c.status,coalesce(c.contracted_services,'{}'),director.id,director.name
from public.clients c left join lateral (select m.id,m.name from public.projects p join public.team_members m on m.id=p.director_member_id where p.client_id=c.id and p.organization_id=c.organization_id and m.organization_id=c.organization_id and m.status='active' order by p.id limit 1) director on true;

-- Private, immutable file objects. Registration happens first, and each upload is bound to its own actor.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('client-account-deliverables','client-account-deliverables',false,4194304,array['application/pdf','image/png','image/jpeg','image/webp']) on conflict(id) do nothing;
create function private.account_object_read(path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.client_account_records r where r.kind='attachments' and r.data->>'storage_path'=path and private.can_read_account(r.organization_id,r.account_id) and (r.data->>'upload_status'='ready' or (r.data->>'upload_status'='pending' and r.created_by=(select auth.uid()) and private.can_write_account_record(r.organization_id,r.account_id,r.kind,r.data))));
$$;
create function private.account_object_upload(path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.client_account_records r where r.kind='attachments' and r.data->>'storage_path'=path and r.created_by=(select auth.uid()) and r.data->>'upload_status'='pending' and private.can_write_account_record(r.organization_id,r.account_id,r.kind,r.data));
$$;
revoke all on function private.account_object_read(text),private.account_object_upload(text) from public,anon;
grant execute on function private.account_object_read(text),private.account_object_upload(text) to authenticated;
create policy account_deliverables_read on storage.objects for select to authenticated using(bucket_id='client-account-deliverables' and private.account_object_read(name));
create policy account_deliverables_insert on storage.objects for insert to authenticated with check(bucket_id='client-account-deliverables' and private.account_object_upload(name));

create policy client_accounts_audit_read on public.operations_audit for select to authenticated using(
 entity in ('client_account_profiles','client_account_records') and private.can_read_account(organization_id,
 case when entity='client_account_profiles' then record_id else coalesce(after_data->>'account_id',before_data->>'account_id')::uuid end));

create function public.account_capabilities(account uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('read',private.can_read_account(p.organization_id,p.id),'manage',private.can_manage_account(p.organization_id,p.id),'manage_billing',private.can_bill_account(p.organization_id,p.id),
 'write_own_instances',p.status='active' and exists(select 1 from public.team_members s where s.organization_id=p.organization_id and s.user_id=auth.uid() and s.status='active' and s.access='operator' and cardinality(s.write_areas)>0),
 'upload',p.status='active' and (private.can_manage_account(p.organization_id,p.id) or exists(select 1 from public.team_members s where s.organization_id=p.organization_id and s.user_id=auth.uid() and s.status='active' and s.access='operator' and cardinality(s.write_areas)>0)),
 'archived',p.status='archived','member_id',(select s.id from public.team_members s where s.organization_id=p.organization_id and s.user_id=auth.uid() and s.status='active' limit 1))
 from public.client_account_profiles p where p.id=account;
$$;
revoke all on function public.account_capabilities(uuid) from public,anon;
grant execute on function public.account_capabilities(uuid) to authenticated;

-- Future permissive policies on other buckets cannot accidentally widen this bucket's scope.
create policy account_deliverables_read_guard on storage.objects as restrictive for select to authenticated using(bucket_id<>'client-account-deliverables' or private.account_object_read(name));
create policy account_deliverables_insert_guard on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'client-account-deliverables' or private.account_object_upload(name));
create policy account_deliverables_update_guard on storage.objects as restrictive for update to authenticated using(bucket_id<>'client-account-deliverables') with check(bucket_id<>'client-account-deliverables');
create policy account_deliverables_delete_guard on storage.objects as restrictive for delete to authenticated using(bucket_id<>'client-account-deliverables');
