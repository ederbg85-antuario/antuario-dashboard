import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {workspace} from '@/lib/workspace';
import {FCM_CLIENT_ID} from '@/lib/attention-supervision';
const query=z.object({conversation:z.uuid().optional(),before:z.string().max(300).optional(),media:z.uuid().optional(),index:z.coerce.number().int().min(0).max(3).optional(),status:z.literal('1').optional()}).strict()
 .refine(q=>!q.before||Boolean(q.conversation))
 .refine(q=>!q.media||(Boolean(q.conversation)&&q.index!==undefined&&!q.before))
 .refine(q=>q.index===undefined||Boolean(q.media))
 .refine(q=>!q.status||(!q.conversation&&!q.before&&!q.media&&q.index===undefined));
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
 const context=await workspace();if(!context)return NextResponse.json({error:'Inicia sesión'},{status:401});
 if(!context.can('production',false,FCM_CLIENT_ID))return NextResponse.json({error:'Fuera de tu ámbito'},{status:403});
 const parsed=query.safeParse(Object.fromEntries(request.nextUrl.searchParams));
 if(!parsed.success)return NextResponse.json({error:'Consulta inválida'},{status:400});
 const key=process.env.FCM_STATUS_BRIDGE_KEY;if(!key)return NextResponse.json({error:'Fuente no configurada'},{status:503});
 const params=new URLSearchParams();for(const [k,v] of Object.entries(parsed.data))if(v!==undefined)params.set(k,String(v));
 const media=Boolean(parsed.data.media);
 try{
  const result=await fetch('https://francesconmarie.antuario.mx/api/management/attention-source'+(media?'/media':'')+(params.size?'?'+params:''),{headers:{authorization:`Bearer ${key}`},cache:'no-store',signal:AbortSignal.timeout(media?25000:15000)});
  if(!result.ok)return NextResponse.json({error:media?'Archivo no disponible, vencido o no verificable. Conserva el pendiente.':'No se pudo consultar ese historial. No equivale a cero pendientes.'},{status:[400,404,422].includes(result.status)?result.status:503,headers:{'Cache-Control':'private, no-store'}});
  if(media){
   const mime=result.headers.get('content-type')??'';
   if(!/^(?:audio\/(?:mp4|mpeg|ogg|wav|webm)|video\/(?:mp4|webm)|image\/(?:png|jpeg|webp)|application\/pdf)$/.test(mime))throw Error();
   return new Response(result.body,{headers:{'Content-Type':mime,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Content-Disposition':'inline'}});
  }
  return NextResponse.json(await result.json(),{headers:{'Cache-Control':'private, no-store'}});
 }catch{return NextResponse.json({error:'Fuente no disponible. Los datos anteriores pueden estar desactualizados.'},{status:503,headers:{'Cache-Control':'private, no-store'}})}
}
