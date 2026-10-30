import {NextRequest,NextResponse} from 'next/server'
import {z} from 'zod'
import {workspace} from '@/lib/workspace'
import {ANTUARIO_ORG_ID,GOOGLE_SOURCES} from '@/lib/internal-platform'
import {isSameOrigin} from '@/lib/request-origin'
import {syncInternalGoogle} from '@/lib/google-internal-sync'
export const maxDuration=60
export async function POST(req:NextRequest){
  if(!isSameOrigin(req))return NextResponse.json({message:'Origen no permitido'},{status:403})
  const context=await workspace()
  if(!context)return NextResponse.json({message:'Sesión requerida'},{status:401})
  if(context.orgId!==ANTUARIO_ORG_ID||!context.can('marketing',true))return NextResponse.json({message:'Sin permisos'},{status:403})
  if(Number(req.headers.get('content-length')??0)>1000)return NextResponse.json({message:'Solicitud demasiado grande'},{status:413})
  const body=z.object({source:z.enum(GOOGLE_SOURCES)}).strict().safeParse(await req.json().catch(()=>null))
  if(!body.success)return NextResponse.json({message:'Fuente inválida'},{status:400})
  try {return NextResponse.json({ok:true,...await syncInternalGoogle(body.data.source,context.user.id)})}
  catch(error){
    console.error('internal_google_sync_failed',{source:body.data.source,message:error instanceof Error?error.message:'Error interno'})
    return NextResponse.json({message:'No se pudo actualizar Google. Revisa la cuenta técnica, sus permisos y las APIs habilitadas.'},{status:502})
  }
}
