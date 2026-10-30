-- Additive operations model. Financial data is restricted to the organization owner.
create table public.finance_accounts (
 id uuid primary key default gen_random_uuid(), organization_id bigint not null references public.organizations(id),
 name text not null check(length(name) between 1 and 120), currency text not null default 'MXN' check(currency in ('MXN','USD')),
 opening_balance numeric(14,2), opening_date date, created_at timestamptz not null default now(),
 check((opening_balance is null) = (opening_date is null)), unique(id,organization_id)
);
create table public.finance_documents (
 id uuid primary key default gen_random_uuid(), organization_id bigint not null references public.organizations(id),
 uuid text, title text not null, client_name text, kind text not null check(kind in ('invoice','payment','draft')),
 issued_date date not null, service_date date, service_end date, currency text not null default 'MXN',
 subtotal numeric(14,2) not null default 0, vat numeric(14,2) not null default 0, retention numeric(14,2) not null default 0,
 total numeric(14,2) not null default 0, paid_amount numeric(14,2) not null default 0,
 due_date date, source text not null, notes text, created_at timestamptz not null default now(),
 unique(organization_id,uuid), unique(id,organization_id), check(paid_amount>=0 and total>=0 and paid_amount<=total)
);
create table public.finance_entries (
 id uuid primary key default gen_random_uuid(), organization_id bigint not null references public.organizations(id),
 account_id uuid, document_id uuid, source_key text, title text not null,
 direction text not null check(direction in ('income','expense')), category text not null check(category in ('revenue','cogs','opex','depreciation','interest','income_tax','transfer')),
 recognition_date date, cash_date date, currency text not null default 'MXN' check(currency in ('MXN','USD')),
 subtotal numeric(14,2), cash_amount numeric(14,2) not null check(cash_amount>=0),
 vat numeric(14,2) not null default 0, retention numeric(14,2) not null default 0,
 evidence text not null check(evidence in ('confirmed','reported','planned')), source text not null, notes text,
 created_at timestamptz not null default now(),
 foreign key(account_id,organization_id) references public.finance_accounts(id,organization_id),
 foreign key(document_id,organization_id) references public.finance_documents(id,organization_id),
 unique(organization_id,source_key), check(subtotal is null or subtotal>=0)
);
create table public.finance_subscriptions (
 id uuid primary key default gen_random_uuid(), organization_id bigint not null references public.organizations(id),
 provider text not null, plan text, amount numeric(14,2), currency text not null default 'MXN' check(currency in ('MXN','USD')),
 cadence text not null default 'monthly' check(cadence in ('monthly','annual','variable')),
 next_due date, status text not null check(status in ('active','paused','unverified','cancelled')),
 scope text not null default 'business' check(scope in ('business','review','personal')), source text not null, notes text,
 updated_at timestamptz not null default now(), unique(organization_id,provider)
);
create table public.finance_closings (
 id uuid primary key default gen_random_uuid(), organization_id bigint not null references public.organizations(id),
 month date not null check(extract(day from month)=1), revenue_complete boolean not null default false,
 costs_complete boolean not null default false, taxes_complete boolean not null default false,
 notes text, updated_at timestamptz not null default now(), unique(organization_id,month)
);
create table public.accounting_items (
 id uuid primary key default gen_random_uuid(), organization_id bigint not null references public.organizations(id),
 title text not null, kind text not null default 'review', due_date date,
 status text not null default 'pending' check(status in ('pending','prepared','done')),
 source text, notes text, created_at timestamptz not null default now()
);
create table public.content_items (
 id uuid primary key default gen_random_uuid(), organization_id bigint not null references public.organizations(id),
 title text not null, channel text not null default 'instagram', format text not null default 'reel',
 status text not null default 'idea' check(status in ('idea','draft','review','approved','published')),
 scheduled_date date, brief text, asset_url text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.operations_audit (
 id bigint generated always as identity primary key, organization_id bigint not null references public.organizations(id),
 actor_id uuid, entity text not null, record_id uuid not null, operation text not null,
 before_data jsonb, after_data jsonb, created_at timestamptz not null default now()
);
create function public.operations_record_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.operations_audit(organization_id,actor_id,entity,record_id,operation,before_data,after_data)
 values(coalesce(new.organization_id,old.organization_id),auth.uid(),tg_table_name,coalesce(new.id,old.id),tg_op,
 case when tg_op='INSERT' then null else to_jsonb(old) end,case when tg_op='DELETE' then null else to_jsonb(new) end);
 return coalesce(new,old);
end $$;
revoke all on function public.operations_record_change() from public,anon,authenticated;
do $$ declare t text; begin
 foreach t in array array['finance_accounts','finance_documents','finance_entries','finance_subscriptions','finance_closings','accounting_items'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant select,insert,update on public.%I to authenticated',t);
 execute format('create policy owner_access on public.%I for all to authenticated using (exists(select 1 from public.memberships m where m.organization_id=%I.organization_id and m.user_id=(select auth.uid()) and m.status=''active'' and m.role=''owner'')) with check (exists(select 1 from public.memberships m where m.organization_id=%I.organization_id and m.user_id=(select auth.uid()) and m.status=''active'' and m.role=''owner''))',t,t,t);
 execute format('create index on public.%I(organization_id)',t);
 execute format('create trigger operations_change after insert or update or delete on public.%I for each row execute function public.operations_record_change()',t);
 end loop;
end $$;
alter table public.content_items enable row level security;
revoke all on public.content_items from anon,authenticated;
grant select,insert,update on public.content_items to authenticated;
create policy content_members on public.content_items for select to authenticated using (organization_id in (select public.get_user_org_ids()));
create policy content_editors on public.content_items for all to authenticated using (public.get_user_role(organization_id) in ('owner','admin','editor')) with check(public.get_user_role(organization_id) in ('owner','admin','editor'));
create index on public.content_items(organization_id);
alter table public.operations_audit enable row level security;
revoke all on public.operations_audit from anon,authenticated;
grant select on public.operations_audit to authenticated;
create policy audit_owner on public.operations_audit for select to authenticated using(public.get_user_role(organization_id)='owner');
create index on public.operations_audit(organization_id,created_at);
-- Close exposed marketing RPCs: queries obey caller RLS, ingestion is server-only.
alter view public.marketing_daily_summary set(security_invoker=true);
alter function public.get_marketing_summary(bigint,text,date,date) security invoker;
alter function public.get_marketing_top_dimensions(bigint,text,text,text,date,date,integer) security invoker;
revoke execute on function public.upsert_marketing_metrics(jsonb) from public,anon,authenticated;
grant execute on function public.upsert_marketing_metrics(jsonb) to service_role;
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature,p.prorettype='trigger'::regtype as is_trigger
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' loop
 execute format('alter function %s set search_path=public,pg_temp',f.signature);
 if f.is_trigger then execute format('revoke execute on function %s from public,anon,authenticated',f.signature); end if;
 end loop;
end $$;
-- Browser clients may inspect metadata but must never read or write OAuth credentials.
revoke all on public.marketing_connections from anon,authenticated;
grant select(id,organization_id,source,status,scopes,external_id,external_name,connected_by,last_sync_at,last_error,created_at,updated_at,token_expires_at) on public.marketing_connections to authenticated;
-- Remove permissive duplicate policies; retain role-aware Antuario policies.
drop policy if exists projects_insert on public.projects;
drop policy if exists projects_update on public.projects;
drop policy if exists projects_delete on public.projects;
