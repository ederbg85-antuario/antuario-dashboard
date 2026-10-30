import {workspace} from '@/lib/workspace';
import {FCM_CLIENT_ID} from '@/lib/attention-supervision';
export const dynamic='force-dynamic';
async function proxy(request:Request,write:boolean){
 const c=await workspace();if(!c)return Response.json({error:'Inicia sesión'},{status:401});
 if(!c.can('production',write,FCM_CLIENT_ID))return Response.json({error:'Fuera de tu ámbito'},{status:403});
 if(write&&request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Origen inválido'},{status:403});
 const canPublish=c.role==='owner',key=process.env.FCM_STATUS_BRIDGE_KEY;
 if(!key)return Response.json({error:'Catálogo no configurado'},{status:503});
 try{
  let body:string|undefined;if(write){const text=await request.text();if(Buffer.byteLength(text)>16000)return Response.json({error:'Formulario demasiado grande'},{status:413});const command=JSON.parse(text);if(command.action!=='save'&&!canPublish)return Response.json({error:'Puedes preparar borradores; la publicación requiere aprobación.'},{status:403});body=JSON.stringify({command,actor:c.user.id,canPublish});}
  const r=await fetch('https://francesconmarie.antuario.mx/api/management/dynamics',{method:write?'POST':'GET',headers:{authorization:`Bearer ${key}`,'Content-Type':'application/json'},body,cache:'no-store',signal:AbortSignal.timeout(15000)});
  const b=await r.json();return Response.json(r.ok?{...b,canEdit:c.can('production',true,FCM_CLIENT_ID),canPublish}:b,{status:r.status,headers:{'Cache-Control':'private, no-store'}});
 }catch{return Response.json({error:'Catálogo temporalmente no disponible. No equivale a catálogo vacío.'},{status:503});}
}
export const GET=(r:Request)=>proxy(r,false);
export const POST=(r:Request)=>proxy(r,true);
