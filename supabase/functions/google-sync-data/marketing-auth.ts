import {createClient} from 'https://esm.sh/@supabase/supabase-js@2'
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Content-Type':'application/json'}
const deny=(status:number,message:string)=>new Response(JSON.stringify({error:message}),{status,headers})
export function withMarketingAuth(handler:(req:Request)=>Promise<Response>){
 return async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers})
  if(req.method!=='POST')return deny(405,'Método no permitido')
  const bearer=req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
  if(!bearer)return deny(401,'Autenticación requerida')
  const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,url=Deno.env.get('SUPABASE_URL')!
  const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}})
  const privileged=bearer===service
  let userId:string|null=null
  if(!privileged){const {data:{user},error}=await admin.auth.getUser(bearer);if(error||!user)return deny(401,'Sesión inválida');userId=user.id}
  let body:Record<string,unknown>
  try{const text=await req.clone().text();if(text.length>32000)return deny(413,'Solicitud demasiado grande');body=JSON.parse(text)}catch{return deny(400,'Solicitud inválida')}
  if(typeof body.connection_id!=='string'||!/^[0-9a-f-]{36}$/i.test(body.connection_id))return deny(400,'Conexión requerida')
  const {data:connection}=await admin.from('marketing_connections').select('organization_id,source,status').eq('id',body.connection_id).maybeSingle()
  if(!connection||['revoked','inactive'].includes(connection.status))return deny(404,'Conexión no disponible')
  if(body.source&&body.source!==connection.source)return deny(400,'La fuente no coincide con la conexión')
  if(!privileged){const {data:member}=await admin.from('memberships').select('role').eq('organization_id',connection.organization_id).eq('user_id',userId).eq('status','active').maybeSingle();if(!member||!['owner','admin'].includes(member.role))return deny(403,'Sin permisos para esta conexión')}
  const start=typeof body.date_from==='string'?body.date_from:null,end=typeof body.date_to==='string'?body.date_to:null
  if(start||end){const valid=(x:string)=>/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x));const today=new Date().toISOString().slice(0,10);if(start&&!valid(start)||end&&(!valid(end)||end>today)||start&&end&&(start>end||Date.parse(end)-Date.parse(start)>93*86400000))return deny(400,'Periodo inválido; máximo 93 días y sin fechas futuras')}
  return handler(req)
 }
}
