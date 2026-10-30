'use client'
import {useEffect,useState} from 'react'
type Attachment={index:number;kind:string;src:string;source:string}
type Message={id:string;external_message_id:string|null;direction:string;body:string;status:string;created_at:string;attachments:Attachment[];interpretation:{audioTranscript:string|null;attachmentSummary:string|null;readAt:string|null;source:string};resource:{key:string;title:string;url:string|null}|null}
type Context={id:string;external_thread_id:string|null;state:{paused:boolean;paused_reason:string|null}|null;messages:Message[];storedMessageCount:number|null;storedHistoryTruncated:boolean;nextBefore:string|null;documentedOriginals:{id:string;day:string;observedAt:string;body:string|null;direction:string;source:string;dateBasis:string;resource:string|null}[];manualArchiveIncluded:boolean;handoff:{kind:string;reasons:string[];pending:string[];authorized:false}}
type Source={asOf:string;coverage:string;runtime:{mode:string;last_worker_at:string|null};contexts:Context[]}
type RuntimeStatus={asOf:string;runtime:{mode:string;last_worker_at:string|null;live_started_at:string|null;external_readmission_started_at?:string|null};version:{guide:string;policy:string};catalog:{revision:number;active:number};admissionEnabled:boolean;scope:string;metrics:{paused:number;inbound:number|null;acceptedPieces:number|null;failedPieces:number|null;uncertainPieces:number|null;queuedPieces:number|null;pendingTurns:number|null}}
function statusTime(value:string|null){return value?new Intl.DateTimeFormat('es-MX',{dateStyle:'medium',timeStyle:'medium',timeZone:'America/Mexico_City'}).format(new Date(value)):'Sin registro'}
function OriginalMedia({file}:{file:Attachment}){
 const [failed,setFailed]=useState(false);
 if(failed)return <p role="status">Archivo no disponible o vencido. Conserva el pendiente; no acredita comprensión.</p>;
 return <div className="attention-media"><small>{file.source} · {file.kind}</small>{file.kind==='audio'?<audio controls preload="none" src={file.src} onError={()=>setFailed(true)} aria-label="Audio original"/>:file.kind==='video'?<video controls preload="none" src={file.src} onError={()=>setFailed(true)} aria-label="Video original"/>:file.kind==='image'?<a href={file.src} target="_blank" rel="noreferrer">Consultar imagen original ↗</a>:<a href={file.src} target="_blank" rel="noreferrer">Consultar archivo original ↗</a>}</div>
}
export default function AttentionSource(){
 const [data,setData]=useState<Source|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[conversation,setConversation]=useState('');
 const [status,setStatus]=useState<RuntimeStatus|null>(null),[statusError,setStatusError]=useState('');
 useEffect(()=>{
  let alive=true;let timer:ReturnType<typeof setTimeout>;const controller=new AbortController();
  const load=async()=>{
   try{if(!document.hidden){const r=await fetch('/api/attention-source?status=1',{cache:'no-store',signal:controller.signal}),json=await r.json();if(!r.ok)throw Error(json.error||'Estado no disponible');if(alive){setStatus(json);setStatusError('')}}}
   catch(e){if(alive)setStatusError(e instanceof Error?e.message:'Estado no disponible')}
   finally{if(alive)timer=setTimeout(()=>void load(),15000)}
  };
  void load();return()=>{alive=false;controller.abort();clearTimeout(timer)};
 },[]);
 async function read(id?:string,before?:string){
  setBusy(true);setError('');
  try{
   const params=new URLSearchParams();if(id)params.set('conversation',id);if(before)params.set('before',before);
   const response=await fetch('/api/attention-source'+(params.size?'?'+params:''),{cache:'no-store'}),json=await response.json();if(!response.ok)throw Error(json.error);
   const next=json as Source;
   if(before){setData(old=>old?{...old,asOf:next.asOf,contexts:old.contexts.map(c=>{const page=next.contexts.find(p=>p.id===c.id);if(!page)return c;const unique=new Map([...page.messages,...c.messages].map(m=>[m.id,m]));return {...page,storedMessageCount:c.storedMessageCount,messages:[...unique.values()].sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id))}})}:next)}else setData(next);
  }catch(e){setError(e instanceof Error?e.message:'Fuente no disponible')}finally{setBusy(false)}
 }
 return <section className="op-card attention-source">
  <section className="attention-handoff" aria-label="Estado actual del agente">
   <div className="op-section-title"><strong>Estado actual del agente</strong>{status&&<span className={'op-badge '+(status.admissionEnabled?'op-mint':'op-peach')}>{status.admissionEnabled?'Live · entradas nuevas elegibles':`Modo ${status.runtime.mode}`}</span>}</div>
   {statusError&&<p className="op-warning" role="alert">{statusError}. El último estado puede estar desactualizado.</p>}
   {!status&&!statusError&&<p role="status">Consultando el estado vigente…</p>}
   {status&&<><p>{status.scope}</p><p><strong>Inicio de admisión:</strong> {statusTime(status.runtime.live_started_at)} México · <strong>Último proceso:</strong> {statusTime(status.runtime.last_worker_at)} México</p><p><strong>Continuidad tras apertura externa:</strong> {status.admissionEnabled&&status.runtime.external_readmission_started_at?`Activa desde ${statusTime(status.runtime.external_readmission_started_at)} México`:'Aún sin activación comprobada'}</p><p><strong>Guía:</strong> {status.version.guide} · <strong>Política:</strong> {status.version.policy} · <strong>Dinámicas activas:</strong> {status.catalog.active} (revisión {status.catalog.revision})</p>
    <p><strong>Hilos protegidos:</strong> {status.metrics.paused} · <strong>Entradas desde el inicio:</strong> {status.metrics.inbound??'Sin corte activo'} · <strong>Turnos pendientes:</strong> {status.metrics.pendingTurns??'Sin corte activo'}</p>
    <p><strong>Piezas aceptadas por el canal:</strong> {status.metrics.acceptedPieces??'Sin corte activo'} · <strong>En cola:</strong> {status.metrics.queuedPieces??'Sin corte activo'} · <strong>Fallidas:</strong> {status.metrics.failedPieces??'Sin corte activo'} · <strong>Entrega incierta:</strong> {status.metrics.uncertainPieces??'Sin corte activo'}</p>
    <small>Conteos posteriores al inicio, excluyen pruebas. Una pieza aceptada requiere verificar acuse de Meta y fallos posteriores; no acredita lectura o reproducción. Consulta {statusTime(status.asOf)} México. Estado automático cada15s; historias y adjuntos se consultan por separado.</small></>}
  </section>
  <div className="op-pagehead"><div><span className="op-eyebrow">FUENTE DE ATENCIÓN · SOLO LECTURA</span><h3>Originales disponibles en FCM</h3></div><button className="op-button" disabled={busy} onClick={()=>read()}>{busy?'Consultando…':'Consultar hasta cinco hilos'}</button></div>
  <p>Historia CRM por páginas, medios disponibles e interpretaciones guardadas. Sin envío, cambio de pausa ni marcas de leído. Si falta contexto, conserva el pendiente.</p>
  <form className="attention-thread-search" onSubmit={e=>{e.preventDefault();void read(conversation.trim())}}><label>Consultar un hilo por su ID CRM<input value={conversation} onChange={e=>setConversation(e.target.value)} placeholder="ID UUID de la conversación" required pattern="[a-fA-F0-9-]{36}"/></label><button className="op-button" disabled={busy}>Consultar hilo</button></form>
  {error&&<p role="alert">{error} Los datos anteriores pueden estar desactualizados.</p>}
  {data&&<><p>Modo {data.runtime.mode} · Última consulta {new Date(data.asOf).toLocaleString('es-MX',{timeZone:'Europe/Paris'})} París</p><p>{data.coverage}</p>{!data.contexts.length&&<p>No hay contextos disponibles en esta consulta.</p>}
   {data.contexts.map(c=><details key={c.id}><summary>{c.external_thread_id??c.id} · {c.state?.paused?'Protegido: '+c.state.paused_reason:'Sin pausa registrada'} · {c.storedMessageCount??'cantidad desconocida'} mensajes guardados</summary>
    <small>ID CRM: {c.id} · Historia nativa sin comprobar{c.manualArchiveIncluded?' · Archivo documental enlazado por ID comprobado':' · Archivo documental no enlazado'}</small>
    <div className="attention-handoff"><strong>Comprobación previa al relevo</strong>{c.handoff.reasons.length?<ul>{c.handoff.reasons.map(r=><li key={r}>{r}</li>)}</ul>:<p>Sin bloqueo técnico en estos metadatos; aún requiere revisión del contexto.</p>}<ul>{c.handoff.pending.map(p=><li key={p}>{p}</li>)}</ul><small>Esta consulta no autoriza atención ni comprueba propiedad del hilo en Meta.</small></div>
    {c.nextBefore&&<button className="op-button" disabled={busy} onClick={()=>read(c.id,c.nextBefore!)}>Cargar mensajes anteriores</button>}
    <p>{c.messages.length} originales CRM cargados{c.nextBefore?' · faltan páginas anteriores':' · páginas anteriores disponibles consultadas'}. No acredita historia completa de Instagram.</p>
    {c.messages.map(m=><article key={m.id} className="attention-original"><small>{m.direction} · {m.status} · {new Date(m.created_at).toISOString()} · original {m.external_message_id??'ID externo no disponible'}</small><p>{m.body||'Sin texto: contenido pendiente de lectura original'}</p>
     {m.resource&&<p>Recurso registrado: {m.resource.url?<a href={m.resource.url} target="_blank" rel="noreferrer">{m.resource.title} ↗</a>:m.resource.title}. El registro no acredita reproducción.</p>}
     {m.attachments?.map(a=><OriginalMedia key={a.index} file={a}/>)}
     {(m.interpretation?.audioTranscript||m.interpretation?.attachmentSummary)&&<details><summary>Interpretación guardada · contrastar con el original</summary><small>{m.interpretation.source} · {m.interpretation.readAt??'fecha no disponible'}</small>{m.interpretation.audioTranscript&&<p><strong>Transcripción guardada:</strong> {m.interpretation.audioTranscript}</p>}{m.interpretation.attachmentSummary&&<p><strong>Resumen del adjunto:</strong> {m.interpretation.attachmentSummary}</p>}</details>}
    </article>)}
    {Boolean(c.documentedOriginals?.length)&&<details><summary>Originales documentados · fuente separada y parcial ({c.documentedOriginals.length})</summary><p>No se fusionan ni se correlacionan mensajes por nombre o texto. La fecha original puede tener precisión de día; la fecha de observación no la sustituye.</p>{c.documentedOriginals.map(o=><article key={o.id} className="attention-original"><small>{o.direction} · original {o.id} · fecha original {o.day} · observado {o.observedAt} · {o.source} · {o.dateBasis}</small><p>{o.body||'Contenido no transcrito; conservar pendiente'}</p>{o.resource&&<small>Recurso documentado: {o.resource}. No acredita reproducción.</small>}</article>)}</details>}
   </details>)}
  </>}
 </section>
}
