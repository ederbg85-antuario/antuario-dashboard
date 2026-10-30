import test from 'node:test'
import assert from 'node:assert/strict'
import {attentionReportSchema,clientAttentionReport,clientManagementText,type AttentionReport} from '../lib/attention-supervision'
const report={project_id:'96b3d40b-21e4-449e-857c-5cf2c419a031',cut_date:'2026-10-12',cut_hour:10,period_from:'2026-10-12T06:00:00Z',period_to:'2026-10-12T08:00:00Z',coverage:'5 contextos completos; resto pendiente',reviewed_count:5,attention_state:'needs_review',public_summary:'Una entrega pendiente',evidence:'INTERNAL provider-id and context',next_actions:'Solicitar corrección a Eder'}
test('cannot forge report author or identity in the request',()=>{assert.equal(attentionReportSchema.safeParse({...report,author_id:'a'}).success,false);assert.equal(attentionReportSchema.safeParse({...report,member_id:'b'}).success,false)})
test('requires evidence, a valid review cut and ordered timestamps',()=>{for(const values of [{evidence:''},{cut_hour:11},{reviewed_count:-1},{period_from:'2026-10-12T09:00:00Z'}])assert.equal(attentionReportSchema.safeParse({...report,...values}).success,false);assert.equal(attentionReportSchema.safeParse(report).success,true)})
test('client bridge never shares internal evidence or author identity',()=>{const projected=clientAttentionReport({...report,id:'id',author_id:'private-user',member_id:'private-member',created_at:'2026-10-12T09:00:00Z'} as AttentionReport);assert.equal('evidence' in projected,false);assert.equal('author_id' in projected,false);assert.equal('member_id' in projected,false);assert.equal(JSON.stringify(projected).includes('INTERNAL'),false);assert.equal(projected.summary,report.public_summary)})
test('client projection keeps internal agent names out of every public text',()=>{const projected=clientAttentionReport({...report,id:'id',author_id:'private-user',member_id:'private-member',created_at:'2026-10-12T09:00:00Z',coverage:'Lisa revisó 5 contextos',public_summary:'Informe de Lisa en Grok',next_actions:'Lisa verificará la entrega'} as AttentionReport);assert.doesNotMatch(JSON.stringify(projected),/Lisa|Grok/i);assert.equal(clientManagementText('Preparar supervisión de Lisa · tres cortes'),'Preparar supervisión de la cuenta · tres cortes')})

import {isScopedProductionSeat,scopedProductionPath} from '../lib/team-access'
import type {TeamMember} from '../lib/operations-types'
test('FCM production-only identity has an explicit navigation and API scope',()=>{
 const seat={id:'m',name:'Lisa',position:'Directora',kind:'agent',status:'active',email:'lisa@antuario.mx',user_id:'u',areas:['production'],write_areas:['production'],client_ids:['fcm'],access:'operator',responsibilities:null} as TeamMember;
 assert.equal(isScopedProductionSeat('viewer',seat),true);assert.equal(isScopedProductionSeat('owner',seat),false);
 for(const path of ['/proyectos','/produccion','/perfil','/api/attention-reports','/api/attention-source','/api/operations'])assert.equal(scopedProductionPath(path),true);
 for(const path of ['/marketing','/finanzas','/ventas/bandeja','/equipo','/configuracion/integraciones','/api/marketing/connections','/api/chatwoot/conversations','/api/operations-untrusted'])assert.equal(scopedProductionPath(path),false);
})
