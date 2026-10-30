import {NextResponse} from 'next/server'
import {workspace} from '@/lib/workspace'
import {isSameOrigin} from '@/lib/request-origin'
import {canCoordinateTeamWork} from '@/lib/team-work'
import {workerHeartbeatSchema,type WorkerPresence} from '@/lib/team-presence'

const privateHeaders={'Cache-Control':'private, no-store'}
export async function GET(){
 const c=await workspace()
 if(!c)return NextResponse.json({error:'Inicia sesión'},{status:401,headers:privateHeaders})
 if(!c.seat||c.seat.status!=='active')return NextResponse.json({error:'Necesitas un puesto activo.'},{status:403,headers:privateHeaders})
 const coordinator=canCoordinateTeamWork(c.role,c.seat)
 let memberQuery=c.db.from('team_members').select('id,name,position,kind').eq('organization_id',c.orgId).eq('status','active').not('user_id','is',null).order('name')
 if(!coordinator)memberQuery=memberQuery.eq('id',c.seat.id)
 const [memberResult,presenceResult]=await Promise.all([
  memberQuery,
  c.db.from('team_worker_presence').select('member_id,last_checked_at,state,current_work_id,note').eq('organization_id',c.orgId),
 ])
 if(memberResult.error||presenceResult.error)return NextResponse.json({error:'No se pudieron consultar las comprobaciones.'},{status:503,headers:privateHeaders})
 const byMember=new Map((presenceResult.data??[]).map(p=>[p.member_id,p]))
 const members:WorkerPresence[]=(memberResult.data??[]).map(m=>{
  const presence=byMember.get(m.id)
  return {member_id:m.id,name:m.name,position:m.position,kind:m.kind,last_checked_at:presence?.last_checked_at??null,state:presence?.state??null,current_work_id:presence?.current_work_id??null,note:presence?.note??''}
 })
 return NextResponse.json({members,self_member_id:c.seat.id,checked_at:new Date().toISOString()},{headers:privateHeaders})
}
export async function POST(request:Request){
 if(!isSameOrigin(request))return NextResponse.json({error:'Origen no permitido'},{status:403,headers:privateHeaders})
 const c=await workspace()
 if(!c)return NextResponse.json({error:'Inicia sesión'},{status:401,headers:privateHeaders})
 if(!c.seat||c.seat.status!=='active')return NextResponse.json({error:'Necesitas un puesto activo.'},{status:403,headers:privateHeaders})
 let raw:string
 try{raw=await request.text()}catch{return NextResponse.json({error:'Solicitud inválida.'},{status:400,headers:privateHeaders})}
 if(new TextEncoder().encode(raw).length>3000)return NextResponse.json({error:'Solicitud demasiado grande.'},{status:413,headers:privateHeaders})
 let body:unknown
 try{body=JSON.parse(raw)}catch{return NextResponse.json({error:'Solicitud inválida.'},{status:400,headers:privateHeaders})}
 const parsed=workerHeartbeatSchema.safeParse(body)
 if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0]?.message??'Revisa los campos.'},{status:400,headers:privateHeaders})
 const values=parsed.data
 if(values.current_work_id){
  const {data:work}=await c.db.from('team_work_items').select('id,recipient_member_id').eq('organization_id',c.orgId).eq('id',values.current_work_id).maybeSingle()
  if(!work||(!canCoordinateTeamWork(c.role,c.seat)&&work.recipient_member_id!==c.seat.id))return NextResponse.json({error:'El encargo no pertenece a tu ámbito.'},{status:403,headers:privateHeaders})
 }
 const {data,error}=await c.db.from('team_worker_presence').upsert({organization_id:c.orgId,member_id:c.seat.id,...values},{onConflict:'organization_id,member_id'}).select('member_id,last_checked_at,state,current_work_id,note').single()
 if(error)return NextResponse.json({error:'No se registró la comprobación.'},{status:400,headers:privateHeaders})
 return NextResponse.json({presence:data},{headers:privateHeaders})
}
