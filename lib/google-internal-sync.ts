import 'server-only'
import {createAdminClient} from './supabase/server'
import {internalGoogleToken} from './google-internal-auth'
import {collectInternalGoogle} from './google-internal-data'
import {ANTUARIO_ORG_ID,type GoogleSource} from './internal-platform'

/** Caller must be an authenticated marketing operator, or the protected scheduler. */
export async function syncInternalGoogle(source:GoogleSource, userId:string|null) {
  const token=await internalGoogleToken(source)
  const end=new Date(),start=new Date(end.getTime()-30*86400000)
  const from=start.toISOString().slice(0,10),to=end.toISOString().slice(0,10)
  const result=await collectInternalGoogle(source,token,from,to)
  const db=createAdminClient()
  const {data:existing,error:readError}=await db.from('marketing_connections').select('id,status').eq('organization_id',ANTUARIO_ORG_ID).eq('source',source).eq('external_id',result.externalId).neq('status','revoked').order('created_at',{ascending:false}).limit(1).maybeSingle()
  if(readError)throw new Error('No se pudo consultar el registro de la fuente.')
  // Activate only after the provider has actually returned a successful response.
  let id=existing?.id as string|undefined
  if(!id){
    const {data,error}=await db.from('marketing_connections').insert({organization_id:ANTUARIO_ORG_ID,source,status:'pending',external_id:result.externalId,external_name:result.name,connected_by:userId,snapshot:{auth_mode:'server'}}).select('id').single()
    if(error||!data)throw new Error('No se pudo registrar la fuente interna.')
    id=data.id
  }
  const {data:job,error:jobError}=await db.from('marketing_sync_jobs').insert({organization_id:ANTUARIO_ORG_ID,connection_id:id,source,status:'running',date_from:from,date_to:to}).select('id').single()
  if(jobError||!job)throw new Error('No se pudo registrar la actualización.')
  try {
    if(result.metrics.length){
      const {error}=await db.rpc('upsert_marketing_metrics',{p_metrics:result.metrics.map(row=>({...row,organization_id:ANTUARIO_ORG_ID,connection_id:id,source}))})
      if(error)throw new Error('No se pudieron guardar las métricas de Google.')
    }
    const {error:activateError}=await db.rpc('finish_internal_google_sync',{p_id:id,p_snapshot:result.snapshot})
    if(activateError)throw new Error('No se pudo actualizar el estado de la fuente.')
    const {error:logError}=await db.from('marketing_sync_jobs').update({status:result.partial?'partial':'success',records_fetched:result.metrics.length,records_inserted:0,records_updated:result.metrics.length,completed_at:new Date().toISOString()}).eq('id',job.id)
    if(logError)throw new Error('La actualización se guardó, pero su registro no pudo cerrarse.')
    return {source,records:result.metrics.length,partial:result.partial}
  } catch(error) {
    await db.from('marketing_sync_jobs').update({status:'failed',error_message:error instanceof Error?error.message:'No se completó la actualización',completed_at:new Date().toISOString()}).eq('id',job.id)
    throw error
  }
}
