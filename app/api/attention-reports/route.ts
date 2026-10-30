import {NextRequest,NextResponse} from 'next/server'
import {workspace} from '@/lib/workspace'
import {isSameOrigin} from '@/lib/request-origin'
import {attentionReportSchema} from '@/lib/attention-supervision'
export async function GET(request:NextRequest){
 const context=await workspace();if(!context)return NextResponse.json({error:'Inicia sesión'},{status:401})
 const project=request.nextUrl.searchParams.get('project');if(!project)return NextResponse.json({error:'Proyecto requerido'},{status:400})
 const {data,error}=await context.db.from('account_attention_reports').select('*').eq('organization_id',context.orgId).eq('project_id',project).order('cut_date',{ascending:false}).order('cut_hour',{ascending:false}).limit(90)
 return NextResponse.json(error?{error:'No se pudieron leer los reportes'}:{reports:data,asOf:new Date().toISOString()},{status:error?503:200,headers:{'Cache-Control':'no-store'}})
}
export async function POST(request:NextRequest){
 if(!isSameOrigin(request))return NextResponse.json({error:'Origen no permitido'},{status:403})
 const context=await workspace();if(!context)return NextResponse.json({error:'Inicia sesión'},{status:401})
 if(!context.seat?.user_id||context.seat.user_id!==context.user.id||context.seat.status!=='active')return NextResponse.json({error:'Se requiere tu identidad individual'},{status:403})
 if(Number(request.headers.get('content-length')??0)>32000)return NextResponse.json({error:'Solicitud demasiado grande'},{status:413})
 let input:unknown;try{input=await request.json()}catch{return NextResponse.json({error:'Datos inválidos'},{status:400})}
 const parsed=attentionReportSchema.safeParse(input);if(!parsed.success)return NextResponse.json({error:'Revisa los campos del reporte'},{status:400})
 const {data:project}=await context.db.from('projects').select('client_id').eq('organization_id',context.orgId).eq('id',parsed.data.project_id).maybeSingle()
 if(!project||!context.can('production',true,project.client_id))return NextResponse.json({error:'Proyecto fuera de tu ámbito'},{status:403})
 const {data,error}=await context.db.from('account_attention_reports').insert({...parsed.data,organization_id:context.orgId,member_id:context.seat.id,author_id:context.user.id}).select('id').single()
 return NextResponse.json(error?{error:error.code==='23505'?'Ya existe un reporte para ese corte. Su autoría se conserva.':'No se guardó. Comprueba periodo y corte; no pueden ser futuros.'}:{id:data.id},{status:error?400:201})
}
