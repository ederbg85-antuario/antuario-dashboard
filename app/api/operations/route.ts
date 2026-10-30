import {canReviewMember} from '@/lib/team-access'
import {isSameOrigin} from '@/lib/request-origin'
import { NextRequest,NextResponse } from 'next/server'
import { workspace } from '@/lib/workspace'
import {operationSchemas,financeTables,type OperationTable} from '@/lib/operations-schema'
import {taskCompletionError,type Area} from '@/lib/team-access'
import {z} from 'zod'

export async function POST(request:NextRequest){
 if(!isSameOrigin(request)) return NextResponse.json({error:'Origen no permitido'},{status:403})
 const context=await workspace()
 if(!context) return NextResponse.json({error:'Inicia sesión'},{status:401})
 if(Number(request.headers.get('content-length')??0)>32000) return NextResponse.json({error:'Solicitud demasiado grande'},{status:413})
 let body:unknown
 try{body=await request.json()}catch{return NextResponse.json({error:'Solicitud inválida'},{status:400})}
 const envelope=z.object({table:z.enum(Object.keys(operationSchemas) as [OperationTable,...OperationTable[]]),id:z.uuid().optional(),expected_updated_at:z.iso.datetime({offset:true}).optional(),values:z.record(z.string(),z.unknown())}).strict().safeParse(body)
 if(!envelope.success) return NextResponse.json({error:'Datos inválidos'},{status:400})
 const {table,id,values,expected_updated_at}=envelope.data
 if(expected_updated_at&&(table!=='tasks'||!id))return NextResponse.json({error:'Versión inválida'},{status:400})
 if(table==='team_members'&&context.role!=='owner')return NextResponse.json({error:'Solo el propietario administra el equipo'},{status:403})
 if(['agent_reports','agent_reviews'].includes(table)&&id)return NextResponse.json({error:'Los reportes y revisiones conservan su autoría'},{status:400})
 if(table==='content_jobs'&&id)return NextResponse.json({error:'El ejecutor registra el resultado de los trabajos'},{status:400})
 if(table==='task_comments'&&id)return NextResponse.json({error:'Los comentarios conservan su autor y contenido'},{status:400})
 const parsed=(id?operationSchemas[table].partial():operationSchemas[table]).safeParse(values)
 if(!parsed.success) return NextResponse.json({error:'Revisa los campos',details:parsed.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`)},{status:400})
 const record:Record<string,unknown>=parsed.data
 let existing:Record<string,unknown>={}
 if(id){const {data:previous}=await context.db.from(table).select('*').eq('id',id).eq('organization_id',context.orgId).maybeSingle();if(!previous)return NextResponse.json({error:'Registro no disponible'},{status:404});existing=previous}
 const merged={...existing,...record}
 let clientId:string|null=null
 const area:Area=table==='accounting_items'?'accounting':financeTables.has(table)?'finance':['projects','tasks','task_checklist','task_comments'].includes(table)?'production':table==='proposals'?'sales':'marketing'
 if(table==='projects'||table==='client_communications')clientId=merged.client_id as string|null
 if(['tasks','task_checklist','task_comments'].includes(table)){
 let projectId=merged.project_id
 if(table!=='tasks'){const {data:task}=await context.db.from('tasks').select('project_id').eq('organization_id',context.orgId).eq('id',merged.task_id).maybeSingle();if(!task)return NextResponse.json({error:'Tarea no disponible'},{status:404});projectId=task.project_id}
 const {data:project}=await context.db.from('projects').select('client_id').eq('organization_id',context.orgId).eq('id',projectId).maybeSingle();if(!project)return NextResponse.json({error:'Proyecto no disponible'},{status:404});clientId=project.client_id
 }
 if(['agent_reports','agent_reviews'].includes(table)){
 const {data:seat}=await context.db.from('team_members').select('id,user_id,kind,reports_to_member_id').eq('organization_id',context.orgId).eq('id',merged.member_id).maybeSingle();
 const self=seat?.user_id===context.user.id,manager=seat?canReviewMember(context.role,context.seat,seat,context.user.id):false;
 if(!seat||(table==='agent_reports'?!self&&context.role!=='owner':self||!manager))return NextResponse.json({error:'Sin permiso para este reporte'},{status:403});
 }
 if(!['team_members','agent_reports','agent_reviews','client_communications'].includes(table)&&!context.can(area,true,clientId))return NextResponse.json({error:'Sin permisos para esta área o cliente'},{status:403})
 if(table==='client_communications'&&!context.can('production',false,clientId))return NextResponse.json({error:'Cliente fuera de tu ámbito'},{status:403})
 if(table==='agent_reports'&&String(merged.report_date)>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City'}).format(new Date()))return NextResponse.json({error:'No registres reportes futuros'},{status:400})
 if(table==='tasks'&&merged.status==='done'){const {data:list,error:checkError}=id?await context.db.from('task_checklist').select('done').eq('organization_id',context.orgId).eq('task_id',id):{data:[],error:null};if(checkError)return NextResponse.json({error:'No se pudo validar el checklist'},{status:400});const reason=taskCompletionError(String(merged.status),merged.blocked_reason as string|null,list??[]);if(reason)return NextResponse.json({error:reason},{status:400})}
 if(table==='team_members'){for(const client of record.client_ids as string[]??[]){const {data:found}=await context.db.from('clients').select('id').eq('organization_id',context.orgId).eq('id',client).maybeSingle();if(!found)return NextResponse.json({error:'Cliente no disponible'},{status:400})}}
 if(table==='content_items'&&merged.status==='published'&&!merged.asset_url)return NextResponse.json({error:'Agrega el enlace como evidencia de publicación'},{status:400})
 if(table==='strategy_plans'&&String(merged.period_to)<String(merged.period_from))return NextResponse.json({error:'Periodo inválido'},{status:400})
 if(table==='ads_campaign_reports'&&String(merged.period_to)<String(merged.period_from))return NextResponse.json({error:'Periodo inválido'},{status:400})
 for(const key of ['assignee_member_id','validator_member_id','director_member_id'])if(record[key]){const {data:seat}=await context.db.from('team_members').select('id,areas,client_ids,status').eq('organization_id',context.orgId).eq('id',record[key]).maybeSingle();if(!seat||seat.status==='paused'||!seat.areas.includes('production')||(seat.client_ids.length&&!seat.client_ids.includes(clientId)))return NextResponse.json({error:'El puesto no tiene acceso a este cliente'},{status:400})}

 if(['finance_entries','finance_documents'].includes(table)){if((merged.fx_rate==null)!=(merged.fx_source==null))return NextResponse.json({error:'Agrega el tipo de cambio y su comprobante juntos'},{status:400})}
 if(table==='finance_documents'){if(Number(merged.paid_amount)>Number(merged.total))return NextResponse.json({error:'El importe pagado excede el total'},{status:400});if(merged.service_date&&merged.service_end&&String(merged.service_end)<String(merged.service_date))return NextResponse.json({error:'El periodo de servicio no es válido'},{status:400})}
 if(table==='finance_accounts'&&merged.kind==='provisional'&&merged.currency!=='MXN')return NextResponse.json({error:'La caja provisional se registra en MXN'},{status:400})
 if(table==='finance_accounts'){
  const snapshot=[merged.balance_snapshot_amount,merged.balance_snapshot_date,merged.balance_snapshot_source]
  if(snapshot.some(v=>v!=null)&&(snapshot.some(v=>v==null)||merged.kind==='provisional'))return NextResponse.json({error:'Completa importe, fecha y fuente del saldo reportado de la cuenta'},{status:400})
  if(merged.balance_snapshot_date&&String(merged.balance_snapshot_date)>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City'}).format(new Date()))return NextResponse.json({error:'El saldo reportado no puede tener fecha futura'},{status:400})
 }
 if(table==='finance_entries'&&merged.account_id){const {data:account}=await context.db.from('finance_accounts').select('currency,kind').eq('id',merged.account_id).eq('organization_id',context.orgId).maybeSingle();if(!account||account.kind==='provisional'||account.currency!==merged.currency)return NextResponse.json({error:'La moneda del movimiento debe coincidir con la cuenta'},{status:400})}
 if(table==='finance_entries'&&merged.forecast_status==='withdrawn'&&merged.evidence!=='planned')return NextResponse.json({error:'Solo se retiran previsiones; conserva los movimientos reportados o comprobados'},{status:400})
 const refTables:Record<string,string>={account_id:'finance_accounts',document_id:'finance_documents',project_id:'projects',client_id:'clients'}
 for(const [key,target]of Object.entries(refTables))if(record[key]){
  const {data:ref}=await context.db.from(target).select('id').eq('id',record[key]).eq('organization_id',context.orgId).maybeSingle()
  if(!ref)return NextResponse.json({error:'La referencia no pertenece a tu organización'},{status:400})
 }
 for(const key of ['assigned_to','owner_id'])if(record[key]){
  const {data:member}=await context.db.from('memberships').select('id').eq('user_id',record[key]).eq('organization_id',context.orgId).eq('status','active').maybeSingle()
  if(!member)return NextResponse.json({error:'Responsable no disponible'},{status:400})
 }
 if(table==='tasks'&&record.status)record.completed_at=record.status==='done'?new Date().toISOString():null
 if(table==='projects'&&record.status)record.completed_at=record.status==='completed'?new Date().toISOString():null
 if(table==='finance_entries'&&merged.evidence!=='planned'&&typeof merged.cash_date==='string'&&merged.cash_date>new Date().toISOString().slice(0,10))return NextResponse.json({error:'Un pago futuro debe quedar como previsto'},{status:400})
 if(table==='finance_closings'&&(merged.revenue_complete||merged.costs_complete||merged.taxes_complete)&&String(merged.month).slice(0,7)>=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City'}).format(new Date()).slice(0,7))return NextResponse.json({error:'El cierre definitivo se registra después de terminar el mes'},{status:400})
 if(table==='finance_closings'&&String(merged.month).slice(-2)!=='01')return NextResponse.json({error:'El cierre corresponde al primer día del mes'},{status:400})
 if(table==='tasks'&&record.due_date===null&&Object.hasOwn(record,'due_date_kind'))record.due_date_kind=null
 if(table==='tasks'&&record.due_date_kind&&!merged.due_date)return NextResponse.json({error:'Agrega una fecha antes de clasificarla'},{status:400})
 const query=id?context.db.from(table).update(record).eq('id',id).eq('organization_id',context.orgId):context.db.from(table).insert({...record,organization_id:context.orgId})
 const guarded=expected_updated_at?query.eq('updated_at',expected_updated_at):query
 const {data,error}=await guarded.select('id').maybeSingle()
 if(!error&&!data)return NextResponse.json({error:'La tarea cambió mientras editabas. Cierra y vuelve a abrir para revisar la versión actual.'},{status:409})
 if(error)return NextResponse.json({error:'No se guardó. Revisa las referencias y los campos.'},{status:400})
 return NextResponse.json({id:data!.id})
}
