import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {PGlite} from '@electric-sql/pglite'

test('client lifecycle migration keeps history, enforces consistent archive state and restricts lifecycle authority',async()=>{
 const db=new PGlite()
 try{
  await db.exec(`create schema auth; create schema private; create role anon; create role authenticated;
   create table public.clients(id uuid primary key,organization_id bigint not null,name text not null);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
   create function public.get_user_role(bigint) returns text language sql stable as $$select current_setting('test.role',true)$$;
   create function public.operations_record_change() returns trigger language plpgsql as $$begin return new; end$$;`)
  await db.exec(readFileSync(new URL('../supabase/migrations/20261020221303_client_lifecycle.sql',import.meta.url),'utf8'))
  await db.exec(`insert into clients(id,organization_id,name) values('00000000-0000-4000-8000-000000000001',1,'Historial'); set test.uid='00000000-0000-4000-8000-000000000002'; set test.role='viewer';`)
  await assert.rejects(db.exec(`update clients set status='archived',archived_at=now();`),/Only the organization owner/)
  await db.exec(`update clients set name='Nombre actualizado'; set test.role='owner';`)
  await assert.rejects(db.exec(`update clients set status='archived';`),/clients_lifecycle_consistent/)
  await db.exec(`update clients set status='archived',archived_at=now(),archive_reason='Cuenta terminada';`)
  assert.equal((await db.query<{status:string}>('select status from clients')).rows[0].status,'archived')
  await db.exec(`update clients set status='active',archived_at=null,archive_reason=null;`)
  const result=await db.query<{name:string;status:string;archived_at:string|null}>('select name,status,archived_at from clients')
  assert.deepEqual(result.rows,[{name:'Nombre actualizado',status:'active',archived_at:null}])
 }finally{await db.close()}
})
