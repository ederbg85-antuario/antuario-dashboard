import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { asUser, deliveryFixtureSchema, people } from './delivery-db-fixture'
export { asUser }
export const actors = { admin: people.owner, a: people.author, b: people.validator }
export async function outboundFixture() {
  const db = new PGlite()
  await db.exec(deliveryFixtureSchema())
  await db.exec(`
 alter table team_members add column name text;
 update team_members set name=case user_id when '${actors.admin}' then 'Eder' when '${actors.a}' then 'Vendedor A' else 'Vendedor B' end,
 areas=array['sales'],write_areas=array['sales'] where user_id in ('${actors.admin}','${actors.a}','${actors.b}');
 update memberships set role='viewer' where user_id in ('${actors.a}','${actors.b}');
 create table profiles(id uuid primary key,full_name text,email text);
 insert into profiles select user_id,name,null from team_members;
 create table companies(id uuid primary key,organization_id bigint,name text,website text);
 create table prospects(id uuid primary key default gen_random_uuid(),organization_id bigint,company text,company_domain text,source text,company_city text,
 full_name text,title text,email text,phone text,assigned_to uuid,assigned_seller text,stage text,next_action text,next_action_at date,
 need_note text,contact_id uuid,touches int default 0,last_contacted_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now());
 create table prospect_activities(id uuid primary key default gen_random_uuid(),organization_id bigint,prospect_id uuid references prospects,
 type text,channel text,direction text,outcome text,body text,created_by uuid,created_at timestamptz default now());
 create table contacts(id uuid primary key default gen_random_uuid(),organization_id bigint,company text,full_name text,position text,email text,phone text,assigned_to uuid,created_by uuid,source text,created_at timestamptz default now());
 create table contact_notes(id uuid primary key,contact_id uuid);create table contact_channels(like contact_notes);
 create table contact_files(like contact_notes);create table contact_tags(like contact_notes);
 insert into prospects(organization_id,company,source,stage,assigned_to) values(1,'Histórico de prueba','apollo','por_contactar','${actors.admin}');
 do $$ declare t text; begin foreach t in array array['prospects','contacts','prospect_activities','contact_notes','contact_channels','contact_files','contact_tags'] loop
 execute format('alter table %I enable row level security',t);
 execute format('create policy legacy on %I to authenticated using(true) with check(true)',t);
 execute format('grant select,insert,update,delete on %I to authenticated',t);
 end loop;end $$;
 `)
  await db.exec(
    readFileSync(
      new URL('../../supabase/migrations/20261120012213_outbound_prospecting.sql', import.meta.url),
      'utf8',
    ),
  )
  return db
}
export async function rpc<T>(
  db: PGlite,
  fn: 'workspace' | 'command' | 'metrics',
  args: unknown[] = [],
) {
  const parameters = args.map((_, i) => '$' + (i + 1)).join(',')
  const r = await db.query<{ v: T }>(
    'select public.outbound_' + fn + '(' + parameters + ') as v',
    args,
  )
  return r.rows[0].v
}
