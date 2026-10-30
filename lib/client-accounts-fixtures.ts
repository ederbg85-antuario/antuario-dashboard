import type {AccountBundle,AccountRecordBase,AccountSnapshot,AccountSource,AccountProfile} from './client-accounts-types'
import {accountRangeDays,resolveAccountsRange} from './client-accounts-metrics'

/** Local presentation fixtures only. Never imported by API write handlers or database seeds. */
export const ACCOUNTS_EXAMPLE_AS_OF='2026-10-20'
const CREATED='2026-10-20T18:00:00.000Z'
const MEMBER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ids={metrica:'11111111-1111-4111-8111-111111111111',acriland:'22222222-2222-4222-8222-222222222222'} as const
type DemoSlug=keyof typeof ids
function base(accountId:string,key:string):AccountRecordBase{return {id:`example-${key}`,account_id:accountId,organization_id:1,source_key:`example:${key}`,created_by:MEMBER,created_at:CREATED,updated_at:CREATED,is_example:true}}
function snapshot(accountId:string,date:string,source:AccountSource,metric:string,value:number,unit:AccountSnapshot['unit']='count',extra:Partial<AccountSnapshot>={}):AccountSnapshot{
 const key=[date,source,metric,extra.grain??'daily',extra.period_to??date,extra.channel??'total',extra.campaign_id??'total'].join(':')
 return {...base(accountId,key),date,period_to:date,source,metric,value,unit,grain:'daily',channel:null,campaign_id:null,evidence:'Datos de ejemplo locales para explorar la interfaz; no son resultados del cliente.',...extra}
}
function profile(slug:DemoSlug):AccountProfile{
 const metrica=slug==='metrica'
 return {id:ids[slug],organization_id:1,name:metrica?'Cuenta de ejemplo · Captación':'Cuenta de ejemplo · Operación',status:'active',logo_url:null,director_member_id:MEMBER,director_name:'Dirección de ejemplo',services:metrica?['SEO','Google Ads','Web','Reportes','Dashboard']:['SEO','Visibilidad en plataformas IA','Plataforma','Taller e inventario','Agentes Jaime y Tocho','Soporte'],monthly_fee:null,currency:'MXN',billing_cadence:metrica?'monthly':'weekly',fee_basis:'Estructura de ejemplo, sin condiciones comerciales ni movimientos reales.',health:metrica?'attention':'healthy',summary:metrica?'Ejemplo de estructura para captación y medición; sus métricas son ficticias.':'Ejemplo de estructura para SEO, visibilidad en IA, soporte, taller y agentes; sus métricas son ficticias.',updated_at:CREATED,is_example:true}
}
export function getDemoAccount(slugOrId:string):AccountBundle|null{
 const normalized=slugOrId.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
 const slug:DemoSlug|null=normalized==='metrica'||normalized==='metrica-btl'||normalized===ids.metrica?'metrica':normalized==='acriland'||normalized===ids.acriland?'acriland':null
 if(!slug)return null
 const account=profile(slug),accountId=account.id,metrica=slug==='metrica'
 const campaignA=`${slug}-search-example`,campaignB=`${slug}-brand-example`
 const snapshots:AccountSnapshot[]=[]
 const dailyUsers=new Map<string,Set<number>>()
 const allDays=accountRangeDays('2026-07-01',ACCOUNTS_EXAMPLE_AS_OF)
 allDays.forEach((date,index)=>{
  const factor=metrica?1:.62
  const sessions=Math.round((72+index%11*4+Math.floor(index/19)*2)*factor)
  const users=Math.floor(sessions*.77)
  const organic=Math.floor((2+index%4)*factor),paid=metrica?Math.max(1,Math.floor((3+index%3)*factor)):0,direct=index%3===0?1:0,referral=index%5===0?1:0
  const leads=organic+paid+direct+referral
  const seoImpressions=Math.round((700+index%13*47+index*1.5)*factor),seoClicks=Math.round(seoImpressions*(.028+index%4*.002))
  const position=Number((12.6-index*.018+(index%5)*.12).toFixed(2))
  snapshots.push(snapshot(accountId,date,'ga4','sessions',sessions),snapshot(accountId,date,'ga4','users',users),snapshot(accountId,date,'ga4','leads',leads),snapshot(accountId,date,'ga4','quotes',Math.max(0,Math.floor(leads*.45))))
  for(const [channel,value] of [['organic',organic],['paid',paid],['direct',direct],['referral',referral]] as const){if(channel==='paid'&&!metrica)continue;snapshots.push(snapshot(accountId,date,'ga4','leads',value,'count',{channel}))}
  snapshots.push(snapshot(accountId,date,'search_console','impressions',seoImpressions),snapshot(accountId,date,'search_console','clicks',seoClicks),snapshot(accountId,date,'search_console','position',position,'position'))
  const campaigns=[{id:campaignA,cost:Number(((125+index%7*9)*factor).toFixed(2)),clicks:Math.round((28+index%7*3)*factor),impressions:Math.round((600+index%8*30)*factor),conversions:Math.max(1,Math.round(paid*.72)),quotes:Math.max(0,Math.floor(paid*.38))},{id:campaignB,cost:Number(((39+index%5*5)*factor).toFixed(2)),clicks:Math.round((10+index%4*2)*factor),impressions:Math.round((200+index%5*20)*factor),conversions:index%3===0?1:0,quotes:index%6===0?1:0}]
  if(metrica)for(const metric of ['cost','clicks','impressions','conversions','quotes'] as const){
   snapshots.push(snapshot(accountId,date,'google_ads',metric,campaigns.reduce((sum,campaign)=>sum+campaign[metric],0),metric==='cost'?'MXN':'count'))
   for(const campaign of campaigns)snapshots.push(snapshot(accountId,date,'google_ads',metric,campaign[metric],metric==='cost'?'MXN':'count',{campaign_id:campaign.id}))
  }
  // Explicitly simulated audience identity lets period examples demonstrate genuine set unions.
  dailyUsers.set(date,new Set(Array.from({length:users},(_,offset)=>(index*13+offset)%(metrica?1100:750))))
 })
 const periods=new Map<string,{from:string;to:string}>()
 for(const preset of ['7d','30d','month','quarter'] as const){const range=resolveAccountsRange(preset,ACCOUNTS_EXAMPLE_AS_OF);periods.set(`${range.from}:${range.to}`,range);periods.set(`${range.previousFrom}:${range.previousTo}`,{from:range.previousFrom,to:range.previousTo})}
 for(const {from,to} of periods.values()){
  const dates=accountRangeDays(from,to)
  if(dates.some(date=>!dailyUsers.has(date)))continue
  const audience=new Set<number>();for(const date of dates)for(const user of dailyUsers.get(date)??[])audience.add(user)
  snapshots.push(snapshot(accountId,from,'ga4','users',audience.size,'count',{grain:'period',period_to:to}))
 }
 if(metrica)snapshots.push(snapshot(accountId,ACCOUNTS_EXAMPLE_AS_OF,'google_ads','balance',980,'MXN'))
 const periodFrom='2026-10-01',periodTo='2026-10-31'
 const templates=[
  {...base(accountId,`${slug}-monthly-report`),title:metrica?'Reporte mensual de marketing':'Reporte mensual de operación y marketing',frequency:'monthly' as const,day:1,assignee_member_id:MEMBER,deliverable_kind:'report' as const,enabled:true},
  {...base(accountId,`${slug}-quarterly-report`),title:'Reporte trimestral',frequency:'quarterly' as const,day:1,assignee_member_id:MEMBER,deliverable_kind:'report' as const,enabled:true},
  {...base(accountId,`${slug}-weekly-review`),title:metrica?'Revisión de Ads y calidad de leads':'Revisión de plataforma, agentes e incidencias',frequency:'weekly' as const,day:metrica?1:5,assignee_member_id:MEMBER,deliverable_kind:metrica?'review' as const:'support' as const,enabled:true},
  {...base(accountId,`${slug}-invoice`),title:metrica?'Preparar documentación mensual':'Revisar documentación semanal',frequency:metrica?'monthly' as const:'weekly' as const,day:metrica?1:6,assignee_member_id:MEMBER,deliverable_kind:metrica?'invoice' as const:'payment_receipt' as const,enabled:true},
 ]
 return {
  account,contacts:[{...base(accountId,`${slug}-contact`),name:'Contacto de ejemplo',role:metrica?'Coordinación comercial':'Operación del taller',email:null,access_location:'Acceso de ejemplo: gestor privado del equipo. No contiene credenciales.'}],
  fronts:(metrica?[
   {key:'web',title:'Web',health:'attention' as const,status:'Migración por validar',next_action:'Confirmar checklist y fecha de migración.'},
   {key:'ads',title:'Google Ads',health:'attention' as const,status:'Presupuesto en seguimiento',next_action:'Revisar saldo y calidad de leads.'},
   {key:'seo',title:'SEO',health:'healthy' as const,status:'Medición y optimización',next_action:'Priorizar páginas según consultas y cobertura.'},
   {key:'proposal',title:'Plataforma',health:'attention' as const,status:'Alcance en evaluación',next_action:'Confirmar encaje de la solución y precio definitivo.'},
   {key:'billing',title:'Cobranza',health:'attention' as const,status:'Conciliación documental',next_action:'Verificar factura y depósito del periodo.'},
  ]:[
   {key:'platform',title:'Plataforma',health:'healthy' as const,status:'Soporte operativo',next_action:'Ordenar solicitudes del taller y probar entregas.'},
   {key:'workshop',title:'Taller e inventario',health:'healthy' as const,status:'Flujo en seguimiento',next_action:'Verificar incidencias de inventario, entregas y pagos.'},
   {key:'agents',title:'Asistentes de ejemplo',health:'attention' as const,status:'Auditoría de atención',next_action:'Documentar evidencia antes de proponer cambios de configuración.'},
   {key:'marketing',title:'SEO y visibilidad IA',health:'attention' as const,status:'Primer reporte estructurado',next_action:'Preparar línea base de SEO, visibilidad en plataformas IA y sitio; sin campañas pagadas.'},
   {key:'billing',title:'Documentación semanal',health:'unknown' as const,status:'Sin movimientos en este ejemplo',next_action:'Conservar el soporte de cada movimiento; no extrapolar pagos.'},
  ]).map(front=>({...base(accountId,`${slug}-front-${front.key}`),...front,owner_member_id:MEMBER})),
  milestones:[{...base(accountId,`${slug}-milestone-1`),date:'2026-10-06',title:metrica?'Revisión del nuevo sitio':'Revisión de soporte del taller',description:'Hito de ejemplo para mostrar decisiones y próximos pasos.',kind:'milestone'},{...base(accountId,`${slug}-milestone-2`),date:'2026-10-16',title:metrica?'Validación de campaña':'Priorización de incidencias',description:'Decisión ilustrativa, pendiente de sustituir por evidencia real.',kind:'decision'}],
  snapshots,campaigns:metrica?[{...base(accountId,`${slug}-campaign-search`),id:campaignA,name:'Captación de ejemplo · Búsqueda',platform:'google_ads',status:'active',daily_budget:190,period_budget:5900,balance:null,currency:'MXN',period_from:periodFrom,period_to:periodTo,evidence:'Campaña ficticia local, no conectada a Google Ads.'},{...base(accountId,`${slug}-campaign-brand`),id:campaignB,name:'Marca de ejemplo · Búsqueda',platform:'google_ads',status:'paused',daily_budget:55,period_budget:1700,balance:null,currency:'MXN',period_from:periodFrom,period_to:periodTo,evidence:'Campaña ficticia local.'}]:[],
  changes:metrica?[{...base(accountId,`${slug}-change-1`),date:'2026-10-12T17:00:00.000Z',platform:'google_ads',campaign_id:campaignA,action:'Cambiar presupuesto',before:'$170 / día (ejemplo)',after:'$190 / día (ejemplo)',authorized_by:'Coordinación de ejemplo',reason:'Ajuste ilustrativo tras revisar calidad y saldo.',evidence:'Ejemplo de bitácora; no se ejecutó una acción en Ads.'}]:[],
  templates,instances:[{...base(accountId,`${slug}-instance-report`),template_id:templates[0].id,title:metrica?'Reporte mensual de captación':'Reporte de operación y marketing',due_date:'2026-10-19',assignee_member_id:MEMBER,status:'review',evidence:'Borrador ilustrativo disponible en esta vista de ejemplo.',blocked_reason:'',period_from:'2026-09-01',period_to:'2026-09-30'},{...base(accountId,`${slug}-instance-review`),template_id:templates[2].id,title:templates[2].title,due_date:'2026-10-23',assignee_member_id:MEMBER,status:'in_progress',evidence:'',blocked_reason:'',period_from:'2026-10-19',period_to:'2026-10-25'},{...base(accountId,`${slug}-instance-billing`),template_id:templates[3].id,title:templates[3].title,due_date:metrica?'2026-10-21':'2026-10-24',assignee_member_id:MEMBER,status:'pending',evidence:'',blocked_reason:'',period_from:periodFrom,period_to:periodTo}],
  attachments:[],
  // Presentation examples never include fabricated invoices, collections or balances receivable.
  invoices:[],payments:[],opportunities:[],
  capabilities:{read:true,manage:false,manage_billing:false,write_own_instances:false,upload:false,archived:false,member_id:MEMBER},server_time:CREATED,schema_ready:true,data_mode:'example',errors:[],
 }
}
export function getDemoAccounts():AccountBundle[]{return ['metrica','acriland'].map(slug=>getDemoAccount(slug)).filter((bundle):bundle is AccountBundle=>bundle!==null)}
