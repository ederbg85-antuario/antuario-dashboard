'use client'
import {useState,type FormEvent} from 'react'
import {useRouter} from 'next/navigation'
import Link from 'next/link'
import {AREAS,areaLabels} from '@/lib/team-access'
import {WORK_STATUSES,workStatusLabels,workEventLabels,workReviewState,teamWorkCounts,type TeamWorkItem,type TeamWorkEvent,type WorkMember,type WorkStatus} from '@/lib/team-work'
import TeamPresence from './TeamPresence'
import TeamSectionNav from './TeamSectionNav'
import './team-work.css'

type Props={items:TeamWorkItem[];events:TeamWorkEvent[];eventsTruncated?:boolean;instructionsAccess?:boolean;members:WorkMember[];selfId:string|null;coordinator:boolean;error:boolean;asOf:string}
const shortDate=(date:string)=>new Date(date).toLocaleString('es-MX',{timeZone:'America/Mexico_City',dateStyle:'short',timeStyle:'short'})
export default function TeamWorkInbox({items,events,eventsTruncated=false,instructionsAccess=false,members,selfId,coordinator,error,asOf}:Props){
 const router=useRouter()
 const [tab,setTab]=useState<'received'|'sent'|'team'>(coordinator?'team':'received')
 const [filter,setFilter]=useState(coordinator?'all':'open'),[compose,setCompose]=useState(false),[requestKey,setRequestKey]=useState('')
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[problem,setProblem]=useState('')
 const [recipient,setRecipient]=useState(members.find(member=>member.id!==selfId)?.id??'')
 const eventMap=new Map<string,TeamWorkEvent[]>()
 for(const event of events){const thread=eventMap.get(event.work_id)??[];thread.push(event);eventMap.set(event.work_id,thread)}
 const threadFor=(id:string)=>eventMap.get(id)??[]
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City'}).format(new Date(asOf))
 const scoped=items.filter(item=>tab==='team'||(tab==='received'?item.recipient_member_id===selfId:item.sender_member_id===selfId))
 const counts=teamWorkCounts(scoped,today),visible=scoped.filter(item=>filter==='all'||(filter==='open'?item.status!=='done':filter==='review'?workReviewState(item,threadFor(item.id))==='awaiting_review':item.status===filter))
 const awaitingReview=scoped.filter(item=>workReviewState(item,threadFor(item.id))==='awaiting_review').length
 const name=(id:string)=>members.find(member=>member.id===id)?.name??'Integrante'
 const destination=members.find(member=>member.id===recipient)
 async function save(values:Record<string,unknown>){
  setBusy(true);setProblem('');setMessage('')
  try{
   const response=await fetch('/api/team-work',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(values)})
   const result=await response.json()
   if(!response.ok)throw new Error(result.error??'No se guardó.')
   setMessage(values.action==='create'?'Trabajo asignado.':values.action==='comment'?'Mensaje registrado.':values.action==='review'?(values.verdict==='accepted'?'Entrega aceptada.':'Cambios solicitados; tarea reabierta.'):'Avance registrado.')
   if(values.action==='create')setCompose(false)
   router.refresh()
  }catch(e){setProblem(e instanceof Error?e.message:'No se guardó.')}
  finally{setBusy(false)}
 }
 function assign(event:FormEvent<HTMLFormElement>){
  event.preventDefault();const form=new FormData(event.currentTarget)
  void save({action:'create',recipient_member_id:recipient,area:form.get('area'),title:form.get('title'),body:form.get('body'),priority:Number(form.get('priority')),due_date:form.get('due_date')||null,source_key:requestKey})
 }
 return <div className="op-workspace team-work">
  <header className="op-page-heading"><div><p className="op-eyebrow">ANTUARIO / EQUIPO</p><h1>Trabajo</h1><p className="team-work-caption">Encargos, conversación y revisión de entregas.</p></div><div className="op-heading-actions">{instructionsAccess&&<Link href="/equipo/instrucciones" className="team-work-refresh">Instrucciones WOSS</Link>}<button className="team-work-refresh" disabled={busy} onClick={()=>router.refresh()}>Actualizar ↻</button>{coordinator&&selfId&&<button className="op-button" disabled={busy||error} onClick={()=>{setCompose(value=>!value);setRequestKey(crypto.randomUUID());setProblem('')}}>{compose?'Cerrar':'＋ Asignar'}</button>}</div></header>
  <TeamSectionNav current="work" showPerformance={coordinator}/>
  {error&&<p role="alert" className="op-warning">No se pudo cargar la bandeja o su conversación. Actualiza antes de operar.</p>}
  {eventsTruncated&&<p className="op-warning" role="status">Se muestran los 2,000 mensajes y revisiones más recientes. Para comprobar un historial anterior, consulta el hilo por su ID.</p>}
  {!selfId&&<p className="op-warning" role="alert">Tu cuenta no tiene un puesto activo vinculado. El propietario debe revisarlo.</p>}
  <section className="team-work-metrics" aria-label="Resumen de trabajo">{[['Por hacer',counts.pending,'op-lavender'],['En curso',counts.inProgress,'op-blue'],['Bloqueado',counts.blocked,'op-peach'],['Por revisar',awaitingReview,'op-mint'],['Vencido',counts.overdue,'op-lavender']].map(([label,value,color])=><article key={label} className={`op-card ${color}`}><span>{label}</span><strong>{error?'—':value}</strong></article>)}</section>
  <TeamPresence/>
  <div className="team-work-toolbar"><div role="group" aria-label="Bandeja">{([['received','Para mí'],['sent','Asignado por mí'],...(coordinator?[['team','Equipo']]:[])] as [typeof tab,string][]).map(([value,label])=><button key={value} onClick={()=>setTab(value)} aria-pressed={tab===value}>{label}</button>)}</div><label><span className="sr-only">Filtrar por estado</span><select value={filter} onChange={event=>setFilter(event.target.value)}><option value="open">Abierto</option><option value="all">Todos</option><option value="review">Por revisar</option>{WORK_STATUSES.map(status=><option key={status} value={status}>{workStatusLabels[status]}</option>)}</select></label></div>
  {compose&&coordinator&&<form className="op-card team-work-compose" onSubmit={assign}>
   <header className="op-section-title"><h2>Asignar trabajo</h2><span className="op-badge op-lavender">Una tarea · un responsable</span></header>
   <div className="op-form-grid"><label><span>Responsable</span><select required value={recipient} onChange={event=>setRecipient(event.target.value)}>{members.map(member=><option value={member.id} key={member.id}>{member.name} · {member.position}</option>)}</select></label><label><span>Área</span><select required key={recipient} name="area">{AREAS.filter(area=>destination?.areas.includes(area)).map(area=><option value={area} key={area}>{areaLabels[area]}</option>)}</select></label><label className="op-field-wide"><span>Qué hay que hacer</span><input required name="title" maxLength={240}/></label><label className="op-field-wide"><span>Contexto y resultado esperado</span><textarea required name="body" maxLength={6000} rows={4}/></label><label><span>Prioridad</span><select name="priority" defaultValue="2"><option value="1">Urgente</option><option value="2">Alta</option><option value="3">Media</option><option value="4">Baja</option></select></label><label><span>Fecha acordada / propuesta</span><input type="date" name="due_date"/></label></div>
   <p className="op-footnote">Sin contraseñas ni e.firma. El destinatario toma y documenta el trabajo; WOSS revisa la entrega.</p><button className="op-button" disabled={busy||!destination}>Asignar</button>
  </form>}
  {problem&&<p className="op-warning" role="alert">{problem}</p>}{message&&<p className="team-work-success" role="status">{message}</p>}
  <section className="team-work-list" aria-label="Asignaciones">
   {!error&&!visible.length&&<article className="op-card team-work-empty"><span aria-hidden="true">✓</span><h2>Sin asignaciones en esta vista</h2><p>Los avances aparecerán cuando se registren.</p></article>}
   {visible.map(item=><WorkCard key={`${item.id}:${item.updated_at}`} item={item} events={threadFor(item.id)} name={name} selfId={selfId} coordinator={coordinator} canUpdate={!error&&(coordinator||item.recipient_member_id===selfId)} canParticipate={!error&&!!selfId&&(coordinator||item.recipient_member_id===selfId||item.sender_member_id===selfId)} busy={busy} today={today} onSave={save}/>)}
  </section>
  <p className="op-footnote">Hasta 200 asignaciones recientes por permisos. Terminado significa entrega registrada; la aceptación de coordinación se conserva por separado. La bandeja no ejecuta movimientos financieros automáticamente.</p>
 </div>
}
type WorkCardProps={item:TeamWorkItem;events:TeamWorkEvent[];name:(id:string)=>string;selfId:string|null;coordinator:boolean;canUpdate:boolean;canParticipate:boolean;busy:boolean;today:string;onSave:(values:Record<string,unknown>)=>Promise<void>}
function WorkCard({item,events,name,selfId,coordinator,canUpdate,canParticipate,busy,today,onSave}:WorkCardProps){
 const [status,setStatus]=useState<WorkStatus>(item.status),[eventKey,setEventKey]=useState(''),[reviewKey,setReviewKey]=useState('')
 const review=workReviewState(item,events)
 const canReview=canParticipate&&coordinator&&item.recipient_member_id!==selfId&&item.status==='done'&&review!=='accepted'
 function comment(event:FormEvent<HTMLFormElement>){
  event.preventDefault();const form=new FormData(event.currentTarget)
  void onSave({action:'comment',work_id:item.id,body:form.get('body'),source_key:eventKey||crypto.randomUUID()})
 }
 function reviewDelivery(event:FormEvent<HTMLFormElement>){
  event.preventDefault();const form=new FormData(event.currentTarget),submitter=(event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement|null
  if(submitter?.value!=='accepted'&&submitter?.value!=='changes_requested')return
  void onSave({action:'review',work_id:item.id,body:form.get('body'),verdict:submitter.value,expected_updated_at:item.updated_at,source_key:reviewKey||crypto.randomUUID()})
 }
 return <article className="op-card team-work-card">
  <header><div><p className="op-eyebrow">{name(item.sender_member_id)} <span aria-hidden="true">→</span> {name(item.recipient_member_id)} · {areaLabels[item.area as keyof typeof areaLabels]??item.area}</p><h2>{item.title}</h2></div><span className={`op-badge ${item.status==='blocked'?'op-peach':item.status==='done'?'op-mint':'op-lavender'}`}>{workStatusLabels[item.status]}</span></header>
  <p className="team-work-body">{item.body}</p>
  <div className="team-work-meta"><span>Prioridad {['','urgente','alta','media','baja'][item.priority]}</span>{item.due_date&&<span className={item.status!=='done'&&item.due_date<today?'team-work-overdue':''}>Fecha: {item.due_date}</span>}<span>Actualizado {shortDate(item.updated_at)}</span></div>
  {review!=='not_submitted'&&<p className={`team-work-review-state ${review==='accepted'?'op-mint':review==='changes_requested'?'op-peach':'op-lavender'}`}>{review==='accepted'?'Entrega aceptada por coordinación':review==='changes_requested'?'Cambios solicitados · tarea reabierta':'Entrega pendiente de revisión'}</p>}
  {item.blocked_reason&&<p className="team-work-blocked">{item.blocked_reason}</p>}
  {item.evidence&&<p className="team-work-evidence"><strong>Evidencia</strong>{item.evidence}</p>}
  <details className="team-work-conversation" onToggle={event=>{if(event.currentTarget.open){if(!eventKey)setEventKey(crypto.randomUUID());if(!reviewKey)setReviewKey(crypto.randomUUID())}}}>
   <summary>Conversación y feedback <span>{events.length} {events.length===1?'registro':'registros'}</span></summary>
   <div className="team-work-thread" role="log" aria-label={`Conversación de ${item.title}`}>
    {!events.length&&<p className="op-muted">Usa este hilo para instrucciones, dudas, avances y correcciones.</p>}
    {events.map(event=><article className={`team-work-message team-work-message-${event.kind}`} key={event.id}><header><strong>{name(event.author_member_id)}</strong><span>{workEventLabels[event.kind]}</span><time dateTime={event.created_at}>{shortDate(event.created_at)}</time></header><p>{event.body}</p></article>)}
   </div>
   {canParticipate&&<form className="team-work-message-form" onSubmit={comment}><label><span>Mensaje para coordinación y responsable</span><textarea name="body" required maxLength={3000} rows={3} placeholder="Contexto, duda o siguiente paso. Sin contraseñas."/></label><button className="op-button" disabled={busy}>Enviar mensaje</button></form>}
   {canReview&&<form className="team-work-review-form" onSubmit={reviewDelivery}><h3>Revisar esta entrega</h3><label><span>Qué revisaste o qué debe corregirse</span><textarea required name="body" rows={3} maxLength={3000}/></label><div><button className="op-button" type="submit" value="accepted" disabled={busy}>Aceptar entrega</button><button className="team-work-request-changes" type="submit" value="changes_requested" disabled={busy}>Pedir cambios</button></div></form>}
   {coordinator&&item.recipient_member_id===selfId&&item.status==='done'&&<p className="op-footnote">Tu propia entrega debe revisarla otra persona de coordinación.</p>}
  </details>
  {canUpdate&&<details className="team-work-update"><summary>Registrar avance</summary><form onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);void onSave({action:'update',id:item.id,expected_updated_at:item.updated_at,status,evidence:form.get('evidence'),blocked_reason:status==='blocked'?form.get('blocked_reason'):''})}}><div className="op-form-grid"><label><span>Estado</span><select value={status} onChange={event=>setStatus(event.target.value as WorkStatus)}>{WORK_STATUSES.map(value=><option value={value} key={value}>{workStatusLabels[value]}</option>)}</select></label>{status==='blocked'&&<label className="op-field-wide"><span>Qué impide continuar y siguiente paso</span><textarea name="blocked_reason" required defaultValue={item.blocked_reason} maxLength={2000} rows={2}/></label>}<label className="op-field-wide"><span>Evidencia / ID del resultado</span><textarea name="evidence" required={status==='done'} defaultValue={item.evidence} maxLength={3000} rows={2}/></label></div><button className="op-button" disabled={busy}>Guardar avance</button></form></details>}
 </article>
}
