import { GOOGLE_TARGETS, type GoogleSource } from './internal-platform'

export type MetricSeed = {date:string; metric_key:string; value:number; dimension_type:string; dimension_value:string|null}
type GaRow = {dimensionValues:{value:string}[]; metricValues:{value:string}[]}
type SearchRow = {keys:string[]; clicks:number; impressions:number; ctr:number; position:number}
type Container = {path:string; publicId:string; name:string}
type LiveVersion = {container?:Container;containerVersionId?:string;tag?:unknown[];trigger?:unknown[];variable?:unknown[]}

export async function collectInternalGoogle(source:GoogleSource, token:string, from:string, to:string, request:typeof fetch=fetch) {
  async function api<T>(url:string, body?:unknown):Promise<T> {
    const response=await request(url,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:AbortSignal.timeout(20000)})
    if(!response.ok) throw new Error(response.status===403?'Google rechazó la lectura: revisa los permisos de la cuenta técnica y las APIs habilitadas.':`La API de Google respondió ${response.status}.`)
    return response.json() as Promise<T>
  }
  const metrics:MetricSeed[]=[]
  const push=(date:string,key:string,value:number,dimension='global',detail:string|null=null)=>{
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<from||date>to||!Number.isFinite(value))throw new Error('La fuente devolvió una métrica inválida.')
    metrics.push({date,metric_key:key,value,dimension_type:dimension,dimension_value:detail})
  }
  let partial=false
  if(source==='ga4') {
    const names=['sessions','activeUsers','newUsers','bounceRate','averageSessionDuration','screenPageViews','keyEvents','engagementRate','sessionKeyEventRate','engagedSessions']
    const keys=['sessions','active_users','new_users','bounce_rate','avg_session_duration','pageviews','conversions','engagement_rate','conversion_rate','engaged_sessions']
    const report=async(dimensions:string[],selected:string[])=>{
      const rows:GaRow[]=[]
      for(let offset=0;offset<50000;offset+=10000){
        const data=await api<{rows?:GaRow[];rowCount?:number}>(`https://analyticsdata.googleapis.com/v1beta/properties/${GOOGLE_TARGETS.ga4}:runReport`,{dateRanges:[{startDate:from,endDate:to}],dimensions:dimensions.map(name=>({name})),metrics:selected.map(name=>({name})),limit:10000,offset})
        rows.push(...data.rows??[])
        if(rows.length>=(data.rowCount??rows.length))return rows
        if(!data.rows?.length)throw new Error('Google devolvió una página incompleta del reporte.')
      }
      partial=true; return rows
    }
    const [daily,channels,pages,period,unique]=await Promise.all([report(['date'],names),report(['date','sessionDefaultChannelGroup'],['sessions']),report(['date','pagePath'],['screenPageViews','keyEvents']),report([],names),report([],['totalUsers'])])
    const date=(raw:string)=>`${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}`
    for(const row of daily) row.metricValues.forEach((value,i)=>push(date(row.dimensionValues[0].value),keys[i],Number(value.value)))
    for(const row of channels)push(date(row.dimensionValues[0].value),'sessions',Number(row.metricValues[0].value),'channel',row.dimensionValues[1].value)
    for(const row of pages){push(date(row.dimensionValues[0].value),'pageviews',Number(row.metricValues[0].value),'page',row.dimensionValues[1].value);push(date(row.dimensionValues[0].value),'conversions',Number(row.metricValues[1].value),'page',row.dimensionValues[1].value)}
    return {externalId:GOOGLE_TARGETS.ga4,name:'Antuario Web',metrics,partial,snapshot:{auth_mode:'server',coverage:partial?'partial':'complete',period:{from,to,totals:({...Object.fromEntries(keys.map((key,i)=>[key,Number(period[0]?.metricValues?.[i]?.value??0)])),total_users:Number(unique[0]?.metricValues?.[0]?.value??0)} as Record<string,number>)}}}
  }
  if(source==='search_console') {
    const query=async(dimensions:string[])=>api<{rows?:SearchRow[]}>(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(GOOGLE_TARGETS.search_console)}/searchAnalytics/query`,{startDate:from,endDate:to,dimensions,dataState:'final',rowLimit:25000})
    const [daily,keywords]=await Promise.all([query(['date']),query(['date','query'])])
    for(const row of daily.rows??[])for(const key of ['clicks','impressions','ctr','position'] as const)push(row.keys[0],key,row[key])
    for(const row of keywords.rows??[])for(const key of ['clicks','impressions','ctr','position'] as const)push(row.keys[0],key,row[key],'keyword',row.keys[1])
    return {externalId:GOOGLE_TARGETS.search_console,name:'www.antuario.mx',metrics,partial:false,snapshot:{auth_mode:'server',data_state:'final',keyword_coverage:'top_queries_subset'}}
  }
  // Resolve only Antuario's published container; never choose the first account.
  let container:Container|undefined
  const accounts:{path:string}[]=[]
  let accountPage:string|undefined
  for(let page=0;page<100;page++){
    const url=new URL('https://tagmanager.googleapis.com/tagmanager/v2/accounts')
    if(accountPage)url.searchParams.set('pageToken',accountPage)
    const data=await api<{account?:{path:string}[];nextPageToken?:string}>(url.href)
    accounts.push(...data.account??[])
    accountPage=data.nextPageToken
    if(!accountPage)break
    if(page===99)throw new Error('No fue posible completar la consulta de Tag Manager.')
  }
  for(const account of accounts) {
    if(!/^accounts\/\d+$/.test(account.path))continue
    let pageToken:string|undefined
    for(let page=0;page<100;page++) {
      const url=new URL(`https://tagmanager.googleapis.com/tagmanager/v2/${account.path}/containers`)
      if(pageToken)url.searchParams.set('pageToken',pageToken)
      const data=await api<{container?:Container[];nextPageToken?:string}>(url.href)
      container=data.container?.find(item=>item.publicId===GOOGLE_TARGETS.gtm)
      if(container)break
      pageToken=data.nextPageToken
      if(!pageToken)break
      if(page===99)throw new Error('No fue posible completar la búsqueda del contenedor de Antuario.')
    }
    if(container)break
  }
  if(!container||!/^accounts\/\d+\/containers\/\d+$/.test(container.path))throw new Error('La cuenta técnica aún no puede leer el contenedor de Antuario.')
  const live=await api<LiveVersion>(`https://tagmanager.googleapis.com/tagmanager/v2/${container.path}/versions:live`)
  if(live.container?.publicId!==GOOGLE_TARGETS.gtm)throw new Error('La versión publicada no corresponde a Antuario.')
  return {externalId:container.path,name:container.name,metrics,partial:false,snapshot:{auth_mode:'server',public_id:GOOGLE_TARGETS.gtm,version:live.containerVersionId??null,tags:live.tag?.length??0,triggers:live.trigger?.length??0,variables:live.variable?.length??0}}
}
