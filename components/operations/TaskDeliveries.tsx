'use client'
import {lazy,Suspense,useCallback,useEffect,useState} from 'react'
import type {Task,OpsData} from '@/lib/operations-types'
import {artifactUrl,deliveryDate,deliveryLabels,type Delivery} from '@/lib/task-deliveries'
import './deliveries.css'
const Review=lazy(()=>import('./DeliveryReview'))
const Submission=lazy(()=>import('./DeliverySubmission'))
export default function TaskDeliveries({task,data,onChange,onTask}:{task:Task;data:Pick<OpsData,'team'|'profiles'|'capabilities'>;onChange:()=>void;onTask:()=>void}) {
 const [latest,setLatest]=useState<Delivery|null>(null),[selected,setSelected]=useState<string|null>(null),[creating,setCreating]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState('')
 const load=useCallback(async(signal?:AbortSignal)=>{try{const res=await fetch(`/api/operations/deliveries?task=${encodeURIComponent(task.id)}&status=all`,{cache:'no-store',signal}),body=await res.json();if(signal?.aborted)return;if(!res.ok)throw new Error(body.error??'No se pudieron cargar las entregas.');setLatest(body.deliveries[0]??null);setError('')}catch(e){if(!signal?.aborted)setError(e instanceof Error?e.message:'No se pudieron cargar las entregas.')}finally{if(!signal?.aborted)setLoading(false)}},[task.id])
 useEffect(()=>{const abort=new AbortController();
 // Updates follow a network response; the effect only initiates and cancels the request.
 // eslint-disable-next-line react-hooks/set-state-in-effect
 void load(abort.signal);return()=>abort.abort()},[load])
 const changed=()=>{void load();onChange()}
 if(selected)return <Suspense fallback={<p role="status">Abriendo entrega…</p>}><Review key={selected} id={selected} data={{tasks:[task],team:data.team,profiles:data.profiles}} embedded close={()=>setSelected(null)} onVersion={setSelected} onTask={onTask} onChange={changed}/></Suspense>
 const imageIndex=latest?.artifacts.findIndex(a=>a.kind==='image')??-1
 return <section className="task-deliveries" aria-label="Entregas de esta tarea"><header><div><h3>Trabajo para revisar</h3><p>Archivos, versiones y decisiones de esta tarea.</p></div>{data.capabilities.productionWrite&&task.status!=='done'&&<button className="op-button" onClick={()=>setCreating(true)}>{latest?'Nueva versión':'Entregar trabajo'}</button>}</header>{error?<p role="alert" className="op-warning">{error} <button onClick={()=>void load()}>Reintentar</button></p>:loading?<p role="status">Cargando entregas…</p>:latest?<button className="task-delivery-card" onClick={()=>setSelected(latest.id)}>{imageIndex>=0?<div className="task-delivery-image">{/* Authenticated private assets cannot use the public image proxy. */}
{/* eslint-disable-next-line @next/next/no-img-element */}
<img src={artifactUrl(latest.id,imageIndex)} alt={latest.artifacts[imageIndex].name}/></div>:<div className="task-delivery-image is-document" aria-hidden="true"><span>Aa</span></div>}<div><span className={`delivery-status is-${latest.status}`}>{deliveryLabels[latest.status]}</span><h4>{latest.title}</h4><p>v{latest.version} · {latest.artifacts.length} archivos · {deliveryDate(latest.submitted_at)}</p><strong>Abrir revisión →</strong></div></button>:<div className="task-workspace-empty"><strong>Aún no hay entregas</strong><p>La primera versión aparecerá aquí con sus archivos y revisión.</p></div>}{task.deliverable_url&&<a className="task-original-link" href={task.deliverable_url} target="_blank" rel="noopener noreferrer">Resultado anterior ↗</a>}{creating&&<Suspense fallback={<p role="status">Abriendo formulario…</p>}><Submission data={{tasks:[task]}} taskId={task.id} close={()=>setCreating(false)} onCreated={id=>{setCreating(false);setSelected(id);changed()}}/></Suspense>}</section>
}
