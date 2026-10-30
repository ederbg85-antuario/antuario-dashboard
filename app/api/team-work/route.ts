import {NextResponse} from 'next/server'
import {workspace} from '@/lib/workspace'
import {isSameOrigin} from '@/lib/request-origin'
import {canCoordinateTeamWork,listTeamWorkSchema,teamWorkSchema,type TeamWorkItem} from '@/lib/team-work'

export async function GET(request:Request){
 const c=await workspace()
 if(!c)return NextResponse.json({error:'Inicia sesión'},{status:401})
 const parsed=listTeamWorkSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
 if(!parsed.success)return NextResponse.json({error:'Filtro de trabajo inválido.'},{status:400})
 const {status,updated_after,work_id,limit,offset}=parsed.data
 let query=c.db.from('team_work_items').select('*').eq('organization_id',c.orgId).order('updated_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+limit-1)
 if(status==='open')query=query.neq('status','done')
 else if(status!=='all')query=query.eq('status',status)
 if(updated_after)query=query.gt('updated_at',updated_after)
 if(work_id)query=query.eq('id',work_id)
 const {data,error}=await query
 if(error)return NextResponse.json({error:'No se pudo cargar la bandeja.'},{status:503})
 const ids=(data??[]).map(item=>item.id)
 const events=ids.length?await c.db.from('team_work_events').select('*').eq('organization_id',c.orgId).in('work_id',ids).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(2001):{data:[],error:null}
 if(events.error)return NextResponse.json({error:'No se pudo cargar la conversación.'},{status:503})
 return NextResponse.json({items:data,events:(events.data??[]).slice(0,2000).reverse(),events_truncated:(events.data??[]).length>2000,has_more:(data??[]).length===limit,next_offset:offset+limit,server_time:new Date().toISOString()},{headers:{'Cache-Control':'private, no-store'}})
}
export async function POST(request:Request){
 if(!isSameOrigin(request))return NextResponse.json({error:'Origen no permitido'},{status:403})
 const c=await workspace()
 if(!c)return NextResponse.json({error:'Inicia sesión'},{status:401})
 if(!c.seat||c.seat.status!=='active')return NextResponse.json({error:'Necesitas un puesto activo.'},{status:403})
 let raw:string
 try{raw=await request.text()}catch{return NextResponse.json({error:'Solicitud inválida.'},{status:400})}
 if(new TextEncoder().encode(raw).length>16000)return NextResponse.json({error:'Solicitud demasiado grande.'},{status:413})
 let body:unknown
 try{body=JSON.parse(raw)}catch{return NextResponse.json({error:'Solicitud inválida.'},{status:400})}
 const parsed=teamWorkSchema.safeParse(body)
 if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0]?.message??'Revisa los campos.'},{status:400})
 const input=parsed.data,coordinator=canCoordinateTeamWork(c.role,c.seat)
 if(input.action==='comment'||input.action==='review'){
  const {data:item}=await c.db.from('team_work_items').select('id,recipient_member_id,sender_member_id,status,updated_at').eq('organization_id',c.orgId).eq('id',input.work_id).maybeSingle()
  if(!item)return NextResponse.json({error:'Asignación no disponible.'},{status:404})
  if(input.action==='review'&&(!coordinator||item.recipient_member_id===c.seat.id))return NextResponse.json({error:'Solo coordinación revisa entregas de otra persona.'},{status:403})
  if(input.action==='comment'&&!coordinator&&item.recipient_member_id!==c.seat.id&&item.sender_member_id!==c.seat.id)return NextResponse.json({error:'No participas en esta conversación.'},{status:403})
  const kind=input.action==='review'?input.verdict:'comment',source_key=input.source_key??crypto.randomUUID()
  const values={organization_id:c.orgId,work_id:input.work_id,author_member_id:c.seat.id,author_id:c.user.id,kind,body:input.body,source_key,work_updated_at:input.action==='review'?input.expected_updated_at:null}
  if(input.source_key){
   const {data:previous}=await c.db.from('team_work_events').select('*').eq('organization_id',c.orgId).eq('source_key',source_key).maybeSingle()
   if(previous){
    const identical=(['work_id','author_member_id','author_id','kind','body'] as const).every(key=>previous[key]===values[key])
    if(identical)return NextResponse.json({id:previous.id,reused:true})
    return NextResponse.json({error:'La referencia pertenece a otro mensaje.'},{status:409})
   }
  }
  const {data,error}=await c.db.from('team_work_events').insert(values).select('id').single()
  if(error?.code==='40001'||error?.code==='23505')return NextResponse.json({error:'La entrega o conversación cambió. Actualiza antes de continuar.'},{status:409})
  if(error)return NextResponse.json({error:input.action==='review'?'Solo se revisan entregas terminadas con evidencia y versión vigente.':'No se pudo registrar el mensaje.'},{status:400})
  return NextResponse.json({id:data.id},{status:201})
 }
 if(input.action==='create'){
  if(!coordinator)return NextResponse.json({error:'Solo coordinación asigna trabajo.'},{status:403})
  const {data:recipient}=await c.db.from('team_members').select('id,status,user_id,areas').eq('organization_id',c.orgId).eq('id',input.recipient_member_id).maybeSingle()
  if(!recipient||recipient.status!=='active'||!recipient.user_id||!recipient.areas.includes(input.area))return NextResponse.json({error:'El destinatario no opera esta área.'},{status:400})
  const source_key=input.source_key??crypto.randomUUID()
  const values={organization_id:c.orgId,sender_member_id:c.seat.id,recipient_member_id:input.recipient_member_id,area:input.area,title:input.title,body:input.body,priority:input.priority,due_date:input.due_date,source_key}
  const {data,error}=await c.db.from('team_work_items').insert(values).select('id').single()
  if(error?.code==='23505'){
   const {data:existing}=await c.db.from('team_work_items').select('*').eq('organization_id',c.orgId).eq('source_key',source_key).maybeSingle()
   if(existing&&(['sender_member_id','recipient_member_id','area','title','body','priority','due_date'] as const).every(k=>existing[k]===values[k]))return NextResponse.json({id:existing.id,reused:true})
   return NextResponse.json({error:'La referencia ya corresponde a otra asignación.'},{status:409})
  }
  if(error)return NextResponse.json({error:'No se pudo asignar el trabajo.'},{status:400})
  return NextResponse.json({id:data.id},{status:201})
 }
 const {data:found}=await c.db.from('team_work_items').select('*').eq('organization_id',c.orgId).eq('id',input.id).maybeSingle()
 const item=found as TeamWorkItem|null
 if(!item)return NextResponse.json({error:'Asignación no disponible.'},{status:404})
 if(!coordinator&&item.recipient_member_id!==c.seat.id)return NextResponse.json({error:'Solo puedes actualizar tu trabajo.'},{status:403})
 const {data,error}=await c.db.from('team_work_items').update({status:input.status,evidence:input.evidence,blocked_reason:input.blocked_reason}).eq('organization_id',c.orgId).eq('id',input.id).eq('updated_at',input.expected_updated_at).select('id').maybeSingle()
 if(error)return NextResponse.json({error:'No se guardó el avance.'},{status:400})
 if(!data)return NextResponse.json({error:'La asignación cambió. Actualiza la bandeja antes de guardar.'},{status:409})
 return NextResponse.json({id:data.id})
}
