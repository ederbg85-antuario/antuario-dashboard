import test from 'node:test'
import assert from 'node:assert/strict'
import {accountDataSchemas,accountProfileSchema,accountWriteSchema,recurringDates} from '../lib/client-accounts-schema'
import {accountCoordination,accountReadAccess,validFileHeader} from '../lib/client-accounts-access'
import type {AccountsContext} from '../lib/client-accounts-access'
import type {TeamMember} from '../lib/operations-types'

const CLIENT='11111111-1111-4111-8111-111111111111'
const OTHER='22222222-2222-4222-8222-222222222222'
const SEAT='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const seat=(extra:Partial<TeamMember>={}):TeamMember=>({id:SEAT,user_id:SEAT,name:'Especialista',position:'Soporte',kind:'agent',status:'active',email:'especialista@antuario.mx',areas:['production'],write_areas:['production'],client_ids:[CLIENT],access:'operator',responsibilities:null,...extra})
const context=(member:TeamMember|null,role='editor'):Pick<AccountsContext,'role'|'seat'>=>({role,seat:member})
const instance={template_id:null,title:'Revisión semanal',due_date:'2026-10-21',assignee_member_id:SEAT,status:'in_progress',evidence:'',blocked_reason:'',period_from:'2026-10-19',period_to:'2026-10-25'}
const metric={date:'2026-10-20',period_to:'2026-10-20',source:'ga4',metric:'sessions',value:5,unit:'count',grain:'daily',channel:null,campaign_id:null,evidence:'Exportación autorizada de GA4 del20oct2026'}

test('A scoped account seat cannot request a different account; no seat is not coordination',()=>{
 assert.equal(accountReadAccess(context(seat()),CLIENT),true)
 assert.equal(accountReadAccess(context(seat()),OTHER),false)
 assert.equal(accountReadAccess(context(seat({status:'paused'})),CLIENT),false)
 assert.equal(accountReadAccess(context(null),CLIENT),false)
 assert.equal(accountCoordination(context(null)),false)
 assert.equal(accountCoordination(context(seat())),false)
 assert.equal(accountReadAccess(context(null,'owner'),OTHER),true)
 assert.equal(accountCoordination(context(null,'owner')),true)
 assert.equal(accountCoordination(context(seat({areas:['people'],write_areas:['people'],client_ids:[]}))),true)
})
test('Account payloads cannot set identity, actor, example classification or capability fields',()=>{
 for(const field of ['created_by','organization_id','account_id','is_example','capabilities'])assert.equal(accountDataSchemas.instances.safeParse({...instance,[field]:field==='is_example'?true:'forged'}).success,false)
 for(const field of ['id','director_member_id','director_name','status','organization_id','name'])assert.equal(accountProfileSchema.safeParse({summary:'Cambio válido',[field]:'forged'}).success,false)
 assert.equal(accountWriteSchema.safeParse({action:'save',kind:'instances',data:instance,source_key:'stable',created_by:SEAT}).success,false)
})
test('Updates need the original record version while new records require an idempotency reference',()=>{
 assert.equal(accountWriteSchema.safeParse({action:'save',kind:'instances',id:CLIENT,data:instance,source_key:'stable'}).success,false)
 assert.equal(accountWriteSchema.safeParse({action:'save',kind:'instances',id:CLIENT,expected_updated_at:'2026-10-20T18:00:00Z',data:instance,source_key:'stable'}).success,true)
 assert.equal(accountWriteSchema.safeParse({action:'save',kind:'instances',data:instance,source_key:' '}).success,false)
 assert.equal(accountWriteSchema.safeParse({action:'profile',data:{summary:'Cambio'}}).success,false)
})
test('Delivered/review work needs evidence and a blocked instance needs a reason',()=>{
 assert.equal(accountDataSchemas.instances.safeParse({...instance,status:'delivered'}).success,false)
 assert.equal(accountDataSchemas.instances.safeParse({...instance,status:'review',evidence:'PDF privado v2'}).success,true)
 assert.equal(accountDataSchemas.instances.safeParse({...instance,status:'blocked'}).success,false)
 assert.equal(accountDataSchemas.instances.safeParse({...instance,status:'blocked',blocked_reason:'Falta acceso de lectura'}).success,true)
 assert.equal(accountDataSchemas.instances.safeParse({...instance,blocked_reason:'Bloqueo que no fue resuelto'}).success,false)
})
test('Metric provenance rejects impossible dates, inverted periods and daily observations covering many days',()=>{
 assert.equal(accountDataSchemas.snapshots.safeParse(metric).success,true)
 assert.equal(accountDataSchemas.snapshots.safeParse({...metric,date:'2026-02-30',period_to:'2026-02-30'}).success,false)
 assert.equal(accountDataSchemas.snapshots.safeParse({...metric,period_to:'2026-10-21'}).success,false)
 assert.equal(accountDataSchemas.snapshots.safeParse({...metric,grain:'period',period_to:'2026-10-01'}).success,false)
 assert.equal(accountDataSchemas.snapshots.safeParse({...metric,grain:'period',period_to:'2026-10-31'}).success,true)
 assert.equal(accountDataSchemas.snapshots.safeParse({...metric,unit:'percent',value:101}).success,false)
 assert.equal(accountDataSchemas.snapshots.safeParse({...metric,value:Infinity}).success,false)
})
test('Recurring calendars clamp month ends and keep quarters/weekdays deterministic',()=>{
 assert.deepEqual(recurringDates('monthly',31,'2024-02-01','2024-03-31'),['2024-02-29','2024-03-31'])
 assert.deepEqual(recurringDates('quarterly',1,'2026-01-01','2026-12-31'),['2026-01-01','2026-04-01','2026-07-01','2026-10-01'])
 assert.deepEqual(recurringDates('weekly',6,'2026-10-20','2026-10-31'),['2026-10-24','2026-10-31'])
 assert.equal(accountDataSchemas.templates.safeParse({title:'Semanal',frequency:'weekly',day:8,assignee_member_id:SEAT,deliverable_kind:'review',enabled:true}).success,false)
 assert.equal(accountWriteSchema.safeParse({action:'materialize',period_from:'2026-01-01',period_to:'2028-01-01'}).success,false)
})
test('Invoice recording requires internally coherent totals and evidence; it is not fiscal issuance',()=>{
 const invoice={title:'Documento',uuid:null,issued_date:'2026-10-20',due_date:null,period_from:'2026-10-01',period_to:'2026-10-31',subtotal:1000,vat:160,retention:0,total:1160,currency:'MXN',status:'issued',evidence:'Documento de prueba'}
 assert.equal(accountDataSchemas.invoices.safeParse(invoice).success,true)
 assert.equal(accountDataSchemas.invoices.safeParse({...invoice,total:1000}).success,false)
 assert.equal(accountDataSchemas.invoices.safeParse({...invoice,evidence:''}).success,false)
 assert.equal(accountDataSchemas.payments.safeParse({invoice_id:null,date:'2026-10-20',amount:0,currency:'MXN',receipt_status:'pending',evidence:'Comprobante'}).success,false)
})
test('Attachment types are allowlisted and header recognition rejects scripts and incomplete files',()=>{
 assert.equal(validFileHeader('application/pdf',new TextEncoder().encode('%PDF-1.7')),true)
 assert.equal(validFileHeader('application/pdf',new TextEncoder().encode('<script>')),false)
 assert.equal(validFileHeader('image/svg+xml',new TextEncoder().encode('<svg/>')),false)
 assert.equal(validFileHeader('image/png',new Uint8Array([0x89,0x50,0x4e,0x47])),false)
 assert.equal(validFileHeader('image/webp',new Uint8Array([0x52,0x49,0x46,0x46,0,0,0,0,0x57,0x45,0x42,0x50])),true)
})
