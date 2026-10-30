'use client'
import {useEffect,useRef,useState} from 'react'
import {presenceCounts,presenceFreshness,workerStateLabels,type PresenceResponse,type WorkerState} from '@/lib/team-presence'
import './team-presence.css'

export default function TeamPresence(){
 const [data,setData]=useState<PresenceResponse|null>(null),[error,setError]=useState(false),[now,setNow]=useState(0)
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[saveError,setSaveError]=useState(''),[state,setState]=useState<WorkerState>('idle'),[workId,setWorkId]=useState(''),[note,setNote]=useState(''),[ownWork,setOwnWork]=useState<{id:string;title:string}[]>([]),[workError,setWorkError]=useState(false)
 const mounted=useRef(false),checkVersion=useRef(0),workController=useRef<AbortController|null>(null),saveController=useRef<AbortController|null>(null)
 useEffect(()=>{
  mounted.current=true
  let disposed=false,inFlight=false,timer:ReturnType<typeof setTimeout>|null=null,controller:AbortController|null=null
  const cancelTimer=()=>{if(timer)clearTimeout(timer);timer=null}
  const load=async()=>{
   if(disposed||document.hidden||inFlight)return
   inFlight=true;controller=new AbortController();const version=checkVersion.current
   try{
    const response=await fetch('/api/team-presence',{cache:'no-store',signal:controller.signal})
    if(!response.ok)throw new Error('Comprobaciones no disponibles')
    const result=await response.json() as PresenceResponse
    if(!disposed&&version===checkVersion.current){setData(result);setNow(Date.now());setError(false)}
   }catch(e){if(!disposed&&!(e instanceof Error&&e.name==='AbortError'))setError(true)}
   finally{inFlight=false;if(!disposed&&!document.hidden){cancelTimer();timer=setTimeout(()=>void load(),60_000)}}
  }
  const onVisibility=()=>{cancelTimer();if(document.hidden)controller?.abort();else void load()}
  void load();document.addEventListener('visibilitychange',onVisibility)
  return()=>{disposed=true;mounted.current=false;cancelTimer();controller?.abort();workController.current?.abort();saveController.current?.abort();document.removeEventListener('visibilitychange',onVisibility)}
 },[])
 async function loadOwnWork(){
  if(!data)return
  workController.current?.abort();workController.current=new AbortController();setWorkError(false)
  try{
   const response=await fetch('/api/team-work',{cache:'no-store',signal:workController.current.signal})
   if(!response.ok)throw new Error('Encargos no disponibles')
   const result=await response.json() as {items:{id:string;title:string;recipient_member_id:string;status:string}[]}
   if(mounted.current)setOwnWork(result.items.filter(item=>item.recipient_member_id===data.self_member_id&&item.status!=='done').map(({id,title})=>({id,title})))
  }catch(e){if(mounted.current&&!(e instanceof Error&&e.name==='AbortError'))setWorkError(true)}
 }
 async function recordCheck(values:{state:WorkerState;current_work_id:string|null;note:string}){
  if(busy)return
  checkVersion.current++;setBusy(true);setMessage('');setSaveError('');saveController.current=new AbortController()
  try{
   const response=await fetch('/api/team-presence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(values),signal:saveController.current.signal})
   const result=await response.json()
   if(!response.ok)throw new Error(result.error??'No se registró la revisión.')
   if(mounted.current){
    setData(previous=>previous?{...previous,members:previous.members.map(member=>member.member_id===result.presence.member_id?{...member,...result.presence}:member)}:previous)
    setNow(Date.now());setMessage('Revisión registrada con tu sesión.')
   }
  }catch(e){if(mounted.current&&!(e instanceof Error&&e.name==='AbortError'))setSaveError(e instanceof Error?e.message:'No se registró la revisión.')}
  finally{checkVersion.current++;if(mounted.current)setBusy(false)}
 }
 const counts=data?presenceCounts(data.members,now):null
 return <section className="op-card team-presence" aria-label="Comprobaciones del equipo"><header><div><span className="op-eyebrow">ACTIVIDAD COMPROBADA</span><h2>Revisiones del equipo</h2></div><div className="team-presence-actions"><span className="team-presence-total">{data?`${data.members.length} integrantes`:'Consultando…'}</span><button type="button" disabled={!data||error||busy} onClick={()=>void recordCheck({state:'idle',current_work_id:null,note:''})}>{busy?'Registrando…':'Registrar revisión'}</button></div></header>
 {error?<p className="op-warning" role="status">No se pudo actualizar la comprobación. No se puede confirmar actividad actual.</p>:counts?<div className="team-presence-summary"><span><strong>{counts.recent}</strong> revisión reciente</span><span><strong>{counts.stale}</strong> sin revisión reciente</span><span><strong>{counts.never}</strong> sin comprobación</span></div>:<p className="team-presence-caption">Consultando el último registro autenticado…</p>}
 {data&&<details><summary>Ver última revisión por integrante</summary><div className="team-presence-members">{data.members.map(member=>{
  const freshness=presenceFreshness(member.last_checked_at,now)
  const label=freshness==='never'?'Nunca comprobado':freshness==='stale'?'Más de 25 min / fecha por verificar':'Revisión reciente'
  return <article key={member.member_id}><div><strong>{member.name}</strong><span>{member.position}</span></div><div className="team-presence-check"><span className={`team-presence-badge is-${freshness}`}>{label}</span><time dateTime={member.last_checked_at??undefined}>{member.last_checked_at?new Date(member.last_checked_at).toLocaleString('es-MX',{timeZone:'America/Mexico_City',dateStyle:'short',timeStyle:'short'}):'—'}</time>{member.state&&<span>Último estado: {workerStateLabels[member.state]}</span>}</div>{member.note&&<p>{member.note}</p>}</article>
 })}</div></details>}
 <details className="team-presence-own" onToggle={event=>{if(event.currentTarget.open)void loadOwnWork()}}><summary>Registrar mi estado y encargo</summary><form onSubmit={event=>{event.preventDefault();void recordCheck({state,current_work_id:state==='idle'?null:workId||null,note})}}><div className="team-presence-fields"><label><span>Mi estado</span><select value={state} onChange={event=>setState(event.target.value as WorkerState)}>{Object.entries(workerStateLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>{state!=='idle'&&<label><span>Mi encargo (opcional)</span><select value={workId} onChange={event=>setWorkId(event.target.value)}><option value="">Sin vincular encargo</option>{ownWork.map(work=><option value={work.id} key={work.id}>{work.title}</option>)}</select></label>}<label className="team-presence-note"><span>Nota / bloqueo y siguiente paso</span><textarea value={note} onChange={event=>setNote(event.target.value)} maxLength={500} rows={2} required={state==='blocked'}/></label></div>{workError&&<p className="team-presence-caption">No se pudo cargar tu lista de encargos. No se confirma una tarea vinculada.</p>}<button type="submit" disabled={!data||error||busy}>{busy?'Registrando…':'Guardar mi estado'}</button></form></details>
 {message&&<p className="team-presence-success" role="status">{message}</p>}{saveError&&<p className="op-warning" role="alert">{saveError}</p>}
 <p className="team-presence-caption">Una revisión acredita una consulta autenticada registrada. No confirma por sí sola una automatización activa ni una entrega validada. Sin registro o después de 25 minutos no se presume actividad.</p></section>
}
