import {isSameOrigin} from '@/lib/request-origin'
import 'server-only'
import {NextRequest,NextResponse} from 'next/server'
import {workspace} from '@/lib/workspace'
import {createAdminClient} from '@/lib/supabase/server'
import {z} from 'zod'
export async function confirmIntegration(req:NextRequest,provider:'google'|'meta'){
 if(!isSameOrigin(req))return NextResponse.json({message:'Origen no permitido'},{status:403})
 const context=await workspace();if(!context||!['owner','admin'].includes(context.role))return NextResponse.json({message:'Sin permisos'},{status:403})
 const parsed=z.object({connection_id:z.uuid(),property_id:z.string().min(1).max(500).optional(),account_id:z.string().min(1).max(500).optional(),account_name:z.string().max(200).optional()}).strict().safeParse(await req.json().catch(()=>null))
 if(!parsed.success)return NextResponse.json({message:'Datos inválidos'},{status:400})
 const id=parsed.data.connection_id,external=provider==='google'?parsed.data.property_id:parsed.data.account_id
 if(!external)return NextResponse.json({message:'Selecciona una propiedad'},{status:400})
 const admin=createAdminClient();const {data:conn}=await admin.from('marketing_connections').select('id,source,access_token,connected_by').eq('id',id).eq('organization_id',context.orgId).eq('status','pending').maybeSingle()
 if(!conn||conn.connected_by!==context.user.id||!conn.access_token)return NextResponse.json({message:'Sesión de conexión no disponible'},{status:404})
 let endpoint:string,normalized=external
 if(provider==='meta'){
  if(!['facebook','instagram','meta_ads'].includes(conn.source)||!/^(act_)?\d+$/.test(external))return NextResponse.json({message:'Cuenta inválida'},{status:400})
  endpoint=`https://graph.facebook.com/v21.0/${external}?fields=id,name`
 }else if(conn.source==='gtm'){
  if(!/^accounts\/\d+\/containers\/\d+$/.test(external))return NextResponse.json({message:'Contenedor inválido'},{status:400})
  endpoint=`https://tagmanager.googleapis.com/tagmanager/v2/${external}`
 }else if(conn.source==='ga4'){
  if(!/^(properties\/)?\d+$/.test(external))return NextResponse.json({message:'Propiedad inválida'},{status:400})
  normalized=external.replace('properties/','');endpoint=`https://analyticsadmin.googleapis.com/v1beta/properties/${normalized}`
 }else if(conn.source==='search_console'){
  if(!/^https?:\/\//.test(external)&&!/^sc-domain:[a-z0-9.-]+$/i.test(external))return NextResponse.json({message:'Sitio inválido'},{status:400})
  endpoint=`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(external)}`
 }else return NextResponse.json({message:'Esta fuente conserva su configuración anterior; conecta GA4, GSC o GTM desde este panel.'},{status:400})
 const response=await fetch(endpoint,{headers:{Authorization:`Bearer ${conn.access_token}`},cache:'no-store'});const property=await response.json().catch(()=>null)
 if(!response.ok||!property)return NextResponse.json({message:'No se pudo validar el acceso a esta propiedad; revisa permisos y API habilitada.'},{status:502})
 const name=property.displayName??property.name??property.siteUrl??external
 const {data:activeId,error}=await admin.rpc('activate_marketing_connection',{p_id:id,p_external_id:normalized,p_external_name:String(name).slice(0,300)})
 if(error)return NextResponse.json({message:'No se pudo activar la conexión'},{status:500})
 return NextResponse.json({ok:true,source:conn.source,active_connection_id:activeId})
}
export async function cancelIntegration(req:NextRequest){
 if(!isSameOrigin(req))return NextResponse.json({message:'Origen no permitido'},{status:403})
 const context=await workspace();if(!context||!['owner','admin'].includes(context.role))return NextResponse.json({message:'Sin permisos'},{status:403})
 const parsed=z.object({connection_id:z.uuid()}).strict().safeParse(await req.json().catch(()=>null));if(!parsed.success)return NextResponse.json({message:'Datos inválidos'},{status:400})
 const {error}=await createAdminClient().from('marketing_connections').update({status:'revoked',access_token:null,refresh_token:null}).eq('id',parsed.data.connection_id).eq('organization_id',context.orgId).eq('connected_by',context.user.id).eq('status','pending')
 return NextResponse.json({ok:!error},{status:error?500:200})
}
