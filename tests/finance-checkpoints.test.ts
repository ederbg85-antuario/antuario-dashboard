import {test} from 'node:test'
import assert from 'node:assert/strict'
import {financeSummary,isExpectedCash,recognizedRevenue} from '../lib/finance'
import type {Account,Document,Entry,OpsData} from '../lib/operations-types'
import {PGlite} from '@electric-sql/pglite'
import {readFile} from 'node:fs/promises'

const base:Pick<OpsData,'entries'|'documents'|'accounts'|'closings'>={entries:[],documents:[],accounts:[],closings:[]}
const account=(id:string,amount:number):Account=>({id,name:id,kind:'bank',currency:'MXN',opening_balance:null,opening_date:null,balance_snapshot_amount:amount,balance_snapshot_date:'2026-10-20',balance_snapshot_source:'Eder · saldos reportados el 20 de octubre'})
const entry=(changes:Partial<Entry>={}):Entry=>({id:'movement',title:'Movimiento',direction:'expense',category:'opex',account_id:null,document_id:null,recognition_date:'2026-10-05',cash_date:'2026-10-05',currency:'MXN',subtotal:100,cash_amount:100,vat:0,retention:0,evidence:'reported',source:'Prueba',notes:null,...changes})
const accounts=[account('bbva',1122),account('azteca',821),{id:'old',name:'Caja provisional histórica',kind:'provisional' as const,currency:'MXN',opening_balance:3000,opening_date:'2026-10-10'}]

test('reported account cash replaces the older provisional total and historical unassigned cash',()=>{
 const result=financeSummary({...base,accounts,entries:[entry()]},'2026-10','2026-10-20')
 assert.equal(result.balance,1943)
 assert.equal(result.balanceReported,true)
 assert.equal(result.balanceProvisional,false)
 assert.equal(result.balanceDate,'2026-10-20')
 assert.deepEqual(result.accountBalances.filter(a=>a.kind!=='provisional').map(a=>a.balance),[1122,821])
 // Cash reporting does not rewrite the October expense or net cash history.
 assert.equal(result.outflow,100)
 assert.equal(result.opex,100)
 assert.equal(financeSummary({...base,accounts},'2026-10','2026-10-19').balance,3000)
})

test('day precision adds only later assigned cash and never turns an unknown balance into the stale provisional total',()=>{
 const sameDay=entry({account_id:'bbva',cash_date:'2026-10-20',cash_amount:10})
 const later=entry({id:'later',account_id:'bbva',cash_date:'2026-10-21',cash_amount:50})
 const planned=entry({id:'planned',account_id:'azteca',cash_date:'2026-10-21',cash_amount:2500,direction:'income',evidence:'planned'})
 assert.equal(financeSummary({...base,accounts,entries:[sameDay,later,planned]},'2026-10','2026-10-21').balance,1893)
 assert.equal(financeSummary({...base,accounts,entries:[{...later,account_id:null}]},'2026-10','2026-10-21').balance,null)
 assert.equal(financeSummary({...base,accounts,entries:[{...later,currency:'USD',account_id:null}]},'2026-10','2026-10-21').balance,1943)
})

test('a requested CFDI cancellation removes its collection plan without claiming fiscal cancellation or rewriting historical revenue',()=>{
 const document:Document={id:'d',uuid:'CEDECFF5-02B7-4AC9-BB81-E17B8A386EEF',title:'Iguala FCM',client_name:'Francés con Marie',kind:'invoice',issued_date:'2026-10-13',service_date:'2026-10-13',service_end:null,currency:'MXN',subtotal:11500,vat:1840,retention:0,total:13340,paid_amount:0,due_date:'2026-10-13',source:'CFDI original',notes:null,collection_status:'cancellation_requested'}
 const withdrawn=entry({direction:'income',category:'revenue',cash_amount:13340,evidence:'planned',forecast_status:'withdrawn'})
 const summary=financeSummary({...base,documents:[document],entries:[withdrawn]},'2026-10','2026-10-20')
 assert.equal(summary.receivable,0)
 assert.equal(summary.inflow,0)
 assert.equal(summary.revenue,11500)
 assert.equal(recognizedRevenue({...document,collection_status:'active'},'2026-10','2026-10-20'),summary.revenue)
 assert.equal(isExpectedCash(withdrawn),false)
 assert.equal(isExpectedCash({...withdrawn,forecast_status:'active'}),true)
})

test('checkpoint migration keeps partial checkpoints and withdrawals of actual payments out of the database',async()=>{
 const db=new PGlite()
 try{
  await db.exec(`create table finance_accounts(id int primary key,kind text not null);
   create table finance_documents(id int primary key);
   create table finance_entries(id int primary key,evidence text not null);`)
  await db.exec(await readFile(new URL('../supabase/migrations/20261020221307_account_cash_checkpoints.sql',import.meta.url),'utf8'))
  await assert.rejects(db.exec("insert into finance_accounts(id,kind,balance_snapshot_amount) values(1,'bank',1122)"))
  await assert.rejects(db.exec("insert into finance_accounts(id,kind,balance_snapshot_amount,balance_snapshot_date,balance_snapshot_source) values(1,'provisional',1122,'2026-10-20','Eder')"))
  await db.exec("insert into finance_accounts(id,kind,balance_snapshot_amount,balance_snapshot_date,balance_snapshot_source) values(1,'bank',1122,'2026-10-20','Eder'); insert into finance_documents(id,collection_status) values(1,'cancellation_requested'); insert into finance_entries(id,evidence,forecast_status) values(1,'planned','withdrawn');")
  await assert.rejects(db.exec("insert into finance_entries(id,evidence,forecast_status) values(2,'confirmed','withdrawn')"))
  const rows=await db.query<{balance_snapshot_amount:string}>('select balance_snapshot_amount from finance_accounts where id=1')
  assert.equal(Number(rows.rows[0].balance_snapshot_amount),1122)
 }finally{await db.close()}
})
