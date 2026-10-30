"use client"
import {useState} from 'react'
import Link from 'next/link'

type Connection={id:string;source:string;status:string;external_name:string|null;external_id:string|null;last_sync_at:string|null;last_error:string|null;token_expires_at:string|null;snapshot?:{auth_mode?:string}|null}
type Job={id:string;source:string;status:string;date_from:string;date_to:string;records_inserted:number;records_updated:number;started_at:string;completed_at:string|null;error_message:string|null}
type Props={orgId:number;currentUserId:string;currentUserRole:string;initialConnections:Connection[];syncJobs:Job[];mensajeriaActiva:boolean;chatwootInboxId:number|null;googleConfigured:boolean;asOf:number}
const sources=[
 {key:'ga4',name:'Google Analytics',note:'Tráfico y eventos de Antuario Web',icon:'◉',href:'/marketing/web',google:true},
 {key:'search_console',name:'Search Console',note:'Búsquedas y posicionamiento de antuario.mx',icon:'⌕',href:'/marketing/seo',google:true},
 {key:'gtm',name:'Tag Manager',note:'Versión publicada y control de etiquetas',icon:'◇',href:'/indicadores',google:true},
 {key:'meta_ads',name:'Meta Ads',note:'Inversión y resultados de campañas',icon:'↗',href:'/marketing/meta',google:false},
 {key:'facebook',name:'Facebook',note:'Actividad de la página de Antuario',icon:'f',href:'/marketing/facebook',google:false},
 {key:'instagram',name:'Instagram',note:'Actividad del perfil de Antuario',icon:'◎',href:'/marketing/instagram',google:false},
]
const date=(value:string|null)=>value?new Date(value).toLocaleString('es-MX',{timeZone:'America/Mexico_City',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'Sin actualización'
export default function IntegracionesClient({initialConnections,syncJobs,mensajeriaActiva,chatwootInboxId,currentUserRole,googleConfigured,asOf}:Props){
 const [tab,setTab]=useState<'sources'|'history'>('sources'),[busy,setBusy]=useState<string|null>(null),[notice,setNotice]=useState('')
 const canUpdate=['owner','admin'].includes(currentUserRole)
 const update=async(source:string,id?:string)=>{
  setBusy(source);setNotice('')
  try{
   const google=sources.find(s=>s.key===source)?.google
   const response=await fetch(google?'/api/internal/google/sync':'/api/marketing/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(google?{source}:{connection_id:id})})
   const result=await response.json()
   if(!response.ok){setNotice(result.message??'La fuente no pudo actualizarse.');return}
   setNotice(result.partial?'Actualización parcial; revisa la cobertura del reporte.':'Datos actualizados.')
   window.location.reload()
  }catch{setNotice('No se pudo contactar al servidor.')}
  finally{setBusy(null)}
 }
 return <div className="op-workspace op-integrations-settings">
  <div className="op-page-heading"><div><p className="op-eyebrow">ANTUARIO / FUENTES</p><h1>Tu información, conectada.</h1><p>Consulta el estado y la última actualización de tus plataformas.</p></div></div>
  <div className="op-tabs"><button aria-pressed={tab==='sources'} onClick={()=>setTab('sources')}>Fuentes</button><button aria-pressed={tab==='history'} onClick={()=>setTab('history')}>Historial</button></div>
  {notice&&<p className="op-warning" role="status">{notice}</p>}
  {tab==='sources'?<><section className="op-integration-grid">{sources.map(source=>{
   const connection=[...initialConnections].reverse().find(c=>c.source===source.key&&c.status!=='revoked')
   const direct=source.google&&googleConfigured
   const serverVerified=connection?.snapshot?.auth_mode==='server'
   const expired=!source.google&&!!connection?.token_expires_at&&new Date(connection.token_expires_at).getTime()<asOf
   const available=source.google?direct:!!connection&&connection.status==='active'&&!expired
   const confirmed=available&&!!connection?.last_sync_at&&(!source.google||serverVerified)&&connection?.status==='active'&&!connection?.last_error
   const label=confirmed?'Actualizada':available?'Por verificar':'Configuración pendiente'
   return <article className="op-card" key={source.key}><div className="op-section-title"><span className="op-next-icon" aria-hidden>{source.icon}</span><span className={confirmed?'op-badge op-mint':'op-badge op-lavender'}>{label}</span></div><h2>{source.name}</h2><p className="op-muted">{source.note}</p><div className="op-list-row"><span>Última consulta</span><strong>{date(connection?.last_sync_at??null)}</strong></div>{connection?.last_error&&<p className="op-footnote">La última consulta requiere revisión.</p>}{!available&&<p className="op-footnote">La conexión se configura desde el servidor de Antuario.</p>}<div className="op-dialog-actions"><Link href={source.href} className="op-text-button">Ver datos ↗</Link>{canUpdate&&available&&<button className="op-button" disabled={!!busy} onClick={()=>void update(source.key,connection?.id)}>{busy===source.key?'Actualizando…':'Actualizar'}</button>}</div></article>
  })}</section><article className="op-card"><div className="op-section-title"><h2>Bandeja de entrada</h2><span className="op-badge">{mensajeriaActiva&&chatwootInboxId?'Disponible':'Revisión pendiente'}</span></div><p>Conversaciones y contactos de Antuario.</p>{mensajeriaActiva&&chatwootInboxId&&<Link href="/ventas/bandeja" className="op-text-button">Abrir bandeja ↗</Link>}</article></>:<article className="op-card"><h2>Últimas actualizaciones</h2>{!syncJobs.length?<p>Sin consultas registradas todavía.</p>:syncJobs.map(job=><div className="op-list-row" key={job.id}><div><strong>{sources.find(s=>s.key===job.source)?.name??job.source}</strong><p className="op-footnote">{date(job.started_at)} · {job.date_from} — {job.date_to}</p>{job.error_message&&<p className="op-footnote">La consulta requiere revisión.</p>}</div><span className="op-badge">{['completed','success'].includes(job.status)?`${job.records_inserted+job.records_updated} registros`:['error','failed'].includes(job.status)?'Revisar':job.status==='running'?'En curso':'Parcial'}</span></div>)}</article>}
 </div>
}
