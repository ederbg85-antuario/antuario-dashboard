import {NextRequest,NextResponse} from 'next/server'
import {z} from 'zod'
import {workspace} from '@/lib/workspace'
import {isSameOrigin} from '@/lib/request-origin'

const schema=z.object({id:z.uuid(),status:z.enum(['active','archived']),reason:z.string().trim().max(2000).optional()}).strict()

export async function POST(request:NextRequest){
 if(!isSameOrigin(request))return NextResponse.json({error:'Origen no permitido'},{status:403})
 if(Number(request.headers.get('content-length')??0)>32000)return NextResponse.json({error:'Solicitud demasiado grande'},{status:413})
 const context=await workspace()
 if(!context||context.role!=='owner')return NextResponse.json({error:'Solo el propietario administra las cuentas activas'},{status:403})
 let body:unknown
 try{body=await request.json()}catch{return NextResponse.json({error:'Solicitud inválida'},{status:400})}
 const parsed=schema.safeParse(body)
 if(!parsed.success)return NextResponse.json({error:'Revisa el cliente y su estado'},{status:400})
 const {id,status,reason}=parsed.data
 const {data:existing,error:readError}=await context.db.from('clients').select('*').eq('organization_id',context.orgId).eq('id',id).maybeSingle()
 if(readError)return NextResponse.json({error:'No se pudo consultar la cuenta'},{status:400})
 if(!existing)return NextResponse.json({error:'Cliente no disponible'},{status:404})
 if(existing.status===status)return NextResponse.json({client:existing})
 const {data,error}=await context.db.from('clients').update({status,archived_at:status==='archived'?new Date().toISOString():null,archive_reason:status==='archived'?reason||'Relación comercial finalizada':null}).eq('organization_id',context.orgId).eq('id',id).select('*').maybeSingle()
 if(error)return NextResponse.json({error:'No se pudo actualizar la cuenta'},{status:400})
 if(!data)return NextResponse.json({error:'Cliente no disponible'},{status:404})
 return NextResponse.json({client:data})
}
