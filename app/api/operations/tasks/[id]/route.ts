import {NextRequest,NextResponse} from 'next/server'
import {z} from 'zod'
import {workspace} from '@/lib/workspace'
import type {TaskDetailResponse} from '@/lib/operations-task-types'
import type {Task,TeamMember} from '@/lib/operations-types'

export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}) {
  const c=await workspace()
  if(!c)return NextResponse.json({error:'Inicia sesión'},{status:401})
  const {id}=await params,account=request.nextUrl.searchParams.get('account')
  if(!z.uuid().safeParse(id).success||(account&&!z.uuid().safeParse(account).success))return NextResponse.json({error:'Referencia inválida'},{status:400})
  const taskResult=await c.db.from('tasks').select('*').eq('organization_id',c.orgId).eq('id',id).maybeSingle()
  if(taskResult.error)return NextResponse.json({error:'No se pudo leer la tarea'},{status:503})
  const task=taskResult.data as Task|null
  if(!task)return NextResponse.json({error:'Tarea no disponible'},{status:404})
  const projectResult=await c.db.from('projects').select('*').eq('organization_id',c.orgId).eq('id',task.project_id).maybeSingle()
  const project=projectResult.data
  if(!project||(account&&project.client_id!==account)||!c.can('production',false,project.client_id))return NextResponse.json({error:'Tarea no disponible'},{status:404})
  const [clients,team,checklists,comments,activity]=await Promise.all([
    project.client_id?c.db.from('clients').select('id,name,status,contracted_services').eq('organization_id',c.orgId).eq('id',project.client_id):Promise.resolve({data:[],error:null}),
    c.db.from('team_members').select('id,name,position,kind,status,user_id,areas,client_ids,access').eq('organization_id',c.orgId),
    c.db.from('task_checklist').select('*').eq('organization_id',c.orgId).eq('task_id',id).order('created_at'),
    c.db.from('task_comments').select('id,task_id,author_id,body,created_at').eq('organization_id',c.orgId).eq('task_id',id).order('created_at'),
    c.db.from('operations_audit').select('id,actor_id,entity,record_id,operation,created_at,after_data,before_data').eq('organization_id',c.orgId).in('entity',['tasks','task_checklist','task_comments']).or(`record_id.eq.${id},after_data->>task_id.eq.${id},before_data->>task_id.eq.${id}`).order('created_at',{ascending:false}).limit(100)
  ])
  if([clients,team,checklists,comments,activity].some(r=>r.error))return NextResponse.json({error:'No se pudo cargar el detalle completo. Vuelve a intentar.'},{status:503})
  const members=(team.data??[]).filter(m=>!m.client_ids.length||m.client_ids.includes(project.client_id))
  const payload:TaskDetailResponse={task,data:{projects:[project],clients:clients.data??[],team:members.map(m=>({...m,email:null,responsibilities:null})) as TeamMember[],profiles:members.flatMap(m=>m.user_id?[{id:m.user_id,full_name:m.name}]:[]),checklists:checklists.data??[],comments:comments.data??[],activity:activity.data??[],capabilities:{productionWrite:c.can('production',true,project.client_id)},classificationReady:Object.hasOwn(task,'task_areas')&&Object.hasOwn(task,'task_tags'),dateKindsReady:Object.hasOwn(task,'due_date_kind')}}
  return NextResponse.json(payload,{headers:{'Cache-Control':'private, no-store'}})
}
