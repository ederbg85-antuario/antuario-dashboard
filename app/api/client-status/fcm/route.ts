import {timingSafeEqual} from 'node:crypto'
import {NextRequest,NextResponse} from 'next/server'
import {createAdminClient} from '@/lib/supabase/server'
import {FCM_PROJECT_ID,FCM_CLIENT_ID,clientAttentionReport,clientManagementText,type AttentionReport} from '@/lib/attention-supervision'
export async function GET(request:NextRequest){
 const secret=process.env.FCM_STATUS_BRIDGE_KEY,provided=request.headers.get('authorization')?.replace(/^Bearer /,'')??''
 if(!secret)return NextResponse.json({error:'Bridge not configured'},{status:503})
 const a=Buffer.from(secret),b=Buffer.from(provided)
 if(a.length!==b.length||!timingSafeEqual(a,b))return NextResponse.json({error:'Unauthorized'},{status:401})
 const db=createAdminClient()
 const {data:project,error:projectError}=await db.from('projects').select('id,title,status').eq('organization_id',1).eq('client_id',FCM_CLIENT_ID).eq('id',FCM_PROJECT_ID).single()
 if(projectError)return NextResponse.json({error:'Source unavailable'},{status:503})
 const [tasks,reports]=await Promise.all([
  db.from('tasks').select('id,title,status,due_date').eq('organization_id',1).eq('project_id',project.id).order('created_at'),
  db.from('account_attention_reports').select('*').eq('organization_id',1).eq('project_id',project.id).order('cut_date',{ascending:false}).order('cut_hour',{ascending:false}).limit(90)
 ])
 if(tasks.error||reports.error)return NextResponse.json({error:'Source unavailable'},{status:503})
 const ids=(tasks.data??[]).map(t=>t.id)
 const {data:checklists,error}=ids.length?await db.from('task_checklist').select('id,task_id,title,done').eq('organization_id',1).in('task_id',ids):{data:[],error:null}
 if(error)return NextResponse.json({error:'Source unavailable'},{status:503})
 return NextResponse.json({source:'Antuario',project:{...project,title:clientManagementText(project.title)},tasks:tasks.data.map(t=>({...t,title:clientManagementText(t.title)})),checklists:checklists.map(c=>({...c,title:clientManagementText(c.title)})),reports:(reports.data as AttentionReport[]).map(clientAttentionReport),asOf:new Date().toISOString(),cadence:{timezone:'Europe/Paris',hours:[10,15,19],executionVerified:false}},{headers:{'Cache-Control':'no-store'}})
}
