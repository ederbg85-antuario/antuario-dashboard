import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

export const did = (n: number) =>
  `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const people = {
  owner: did(1),
  author: did(2),
  validator: did(3),
  reader: did(4),
  otherClient: did(5),
  otherOrg: did(6),
  inactive: did(7),
  operator: did(8),
};
export const taskId = did(100),
  projectId = did(200),
  clientId = did(300);
const source = (name: string) =>
  readFileSync(
    new URL("../../supabase/migrations/" + name, import.meta.url),
    "utf8",
  );
/** Actual production access functions, executed with restricted roles in a local database. */
export function deliveryFixtureSchema() {
  const currentAccess = source(
    "20261011213659_agent_accountability_and_strategy.sql",
  ).match(/create or replace function private.can_area[\s\S]*?\$\$;/)![0];
  const initial = source("20261011204318_internal_operational_workspace.sql");
  const functions = ["can_project", "can_task"]
    .map(
      (name) =>
        initial.match(
          new RegExp(
            `create or replace function private.${name}[\\s\\S]*?\\$\\$;`,
          ),
        )![0],
    )
    .join("\n");
  return `create role authenticated; create role anon;
 create schema auth;create schema private;create schema storage;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table public.organizations(id bigint primary key);
 create table public.memberships(organization_id bigint,user_id uuid,role text,status text);
 create table public.team_members(id uuid primary key,organization_id bigint,user_id uuid,status text,areas text[],write_areas text[],client_ids uuid[],access text);
 create table public.projects(id uuid primary key,organization_id bigint,client_id uuid);
 create table public.tasks(id uuid primary key,organization_id bigint,project_id uuid,title text,status text,assignee_member_id uuid,assigned_to uuid,validator_member_id uuid);
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name));
 alter table storage.objects enable row level security;
 grant usage on schema auth,private,storage to authenticated;
 grant select,insert,delete on storage.objects to authenticated;
 create function public.get_user_role(org bigint) returns text language sql stable security definer set search_path='' as $$select role from public.memberships where organization_id=org and user_id=auth.uid() and status='active' limit 1$$;
 ${currentAccess}\n${functions}
 alter table public.tasks enable row level security;
 create policy task_read on public.tasks for select to authenticated using(private.can_task(organization_id,id));
 create policy task_write on public.tasks for update to authenticated using(private.can_task(organization_id,id,true)) with check(private.can_task(organization_id,id,true));
 grant select,update on public.tasks to authenticated;
 grant select on public.projects,public.team_members to authenticated;
 insert into organizations values(1),(2);
 ${Object.entries(people)
   .map(
     ([name, id], i) => `insert into auth.users values('${id}');
 insert into memberships values(${name === "otherOrg" ? 2 : 1},'${id}','${name === "owner" ? "owner" : "editor"}','active');
 insert into team_members values('${did(20 + i)}',${name === "otherOrg" ? 2 : 1},'${id}','${name === "inactive" ? "inactive" : "active"}',array['production'],${name === "reader" ? "'{}'::text[]" : "array['production']"},${name === "otherClient" ? `array['${did(301)}']::uuid[]` : "'{}'::uuid[]"},'${name === "reader" ? "read" : "operator"}');`,
   )
   .join("\n")}
 insert into projects values('${projectId}',1,'${clientId}'),('${did(201)}',2,'${did(301)}');
 insert into tasks values('${taskId}',1,'${projectId}','Diseño de prueba','in_progress','${did(21)}',null,'${did(22)}'),('${did(101)}',2,'${did(201)}','Privada','in_progress',null,null,null),('${did(102)}',1,'${projectId}','Sin entrega','todo',null,null,null);
 `;
}
export const deliveryMigration = () =>
  source("20261030011228_task_delivery_review_center.sql");
export async function createDeliveryDb() {
  const db = new PGlite();
  await db.exec(deliveryFixtureSchema());
  await db.exec(deliveryMigration());
  return db;
}
export async function asUser(db: PGlite, id: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("set role authenticated");
}
export const documentEvidence = [
  {
    kind: "document",
    name: "resultado.md",
    format: "markdown",
    text: "\n# Resultado\n\nDocumento completo.\n",
  },
];
export async function submitDelivery(
  db: PGlite,
  key = crypto.randomUUID(),
  artifacts: unknown = documentEvidence,
  task = taskId,
) {
  return (
    await db.query<{ id: string }>(
      "select public.submit_task_delivery(1,$1,$2,$3,$4::jsonb,$5) id",
      [
        task,
        "Diseño operativo",
        "Revisar la captura",
        JSON.stringify(artifacts),
        key,
      ],
    )
  ).rows[0].id;
}
export async function respondDelivery(
  db: PGlite,
  id: string,
  action = "approved",
  body = "",
  key = crypto.randomUUID(),
  status = "review",
) {
  return (
    await db.query<{ id: string }>(
      "select public.respond_task_delivery(1,$1,$2,$3,$4,$5) id",
      [id, action, body, status, key],
    )
  ).rows[0].id;
}
