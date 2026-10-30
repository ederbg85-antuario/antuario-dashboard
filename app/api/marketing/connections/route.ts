import {isSameOrigin} from '@/lib/request-origin'
import {NextRequest,NextResponse} from 'next/server'
import {workspace} from '@/lib/workspace'
import {createAdminClient} from '@/lib/supabase/server'
import {z} from 'zod'
export async function POST(req:NextRequest){
 if(!isSameOrigin(req))return NextResponse.json({error:'Origen no permitido'},{status:403})
 const context=await workspace()
 if(!context||!['owner','admin'].includes(context.role))return NextResponse.json({error:'Sin permisos'},{status:403})
 const input=z.object({id:z.uuid(),action:z.literal('revoke')}).strict().safeParse(await req.json().catch(()=>null))
 if(!input.success)return NextResponse.json({error:'Solicitud inválida'},{status:400})
 const {error}=await createAdminClient().from('marketing_connections').update({status:'revoked',access_token:null,refresh_token:null}).eq('id',input.data.id).eq('organization_id',context.orgId)
 return NextResponse.json({ok:!error},{status:error?400:200})
}
