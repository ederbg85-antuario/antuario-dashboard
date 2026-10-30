'use client'
import {lazy,Suspense,useEffect,useRef,useState} from 'react'
import {artifactUrl,type Delivery} from '@/lib/task-deliveries'
import {deliveryCoverIndex,documentCoverText} from '@/lib/delivery-cover'
const Pdf=lazy(()=>import('./DeliveryPdf'))
function linkHost(url:string){try{return new URL(url).hostname}catch{return 'Enlace adjunto'}}

function DocumentCover({url,name}:{url:string;name:string}) {
 const [result,setResult]=useState<{text:string;failed:boolean}|null>(null)
 useEffect(()=>{
  const abort=new AbortController()
  void fetch(url,{cache:'no-store',signal:abort.signal}).then(async res=>{if(!res.ok)throw new Error('Unavailable');return res.text()}).then(text=>{if(!abort.signal.aborted)setResult({text:documentCoverText(text),failed:false})}).catch(()=>{if(!abort.signal.aborted)setResult({text:'',failed:true})})
  return()=>abort.abort()
 },[url])
 return <div className="delivery-text-cover">{result?.text?<p>{result.text}</p>:<strong>{result?.failed?'Vista no disponible':name}</strong>}<small>{result?.failed?'Abre la entrega para revisar el original':result?'Extracto del documento':'Cargando documento…'}</small></div>
}

/** Authenticated assets only; thumbnails never alter the original or fetch external links. */
export default function DeliveryCover({delivery}:{delivery:Delivery}) {
 const container=useRef<HTMLDivElement>(null),[visible,setVisible]=useState(false),[failed,setFailed]=useState(false)
 const index=deliveryCoverIndex(delivery.artifacts),artifact=delivery.artifacts[index]
 useEffect(()=>{
  if(!container.current)return
  const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){setVisible(true);observer.disconnect()}},{rootMargin:'160px'})
  observer.observe(container.current);return()=>observer.disconnect()
 },[])
 const xml=artifact?.name.toLowerCase().endsWith('.xml')
 const type=xml?'XML original':artifact?.kind==='pdf'?'PDF':artifact?.kind==='image'?'Imagen':artifact?.kind==='link'?'Enlace':'Documento'
 const fallback=<div className="delivery-file-cover"><svg aria-hidden="true" width="26" height="30" viewBox="0 0 24 28" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H5a2 2 0 0 0-2 2v20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9Z"/><path d="M14 2v7h7M7 15h10M7 20h7"/></svg><strong>{type}</strong><span>{artifact?.kind==='link'?linkHost(artifact.url):artifact?.name??'Sin archivo'}</span><small>{failed?'Vista no disponible · original en la entrega':artifact?.kind==='link'?'Enlace adjunto · abrir desde la entrega':xml?'Descarga íntegra en la entrega':'Vista previa de esta versión'}</small></div>
 return <div ref={container} className={`delivery-thumb delivery-cover is-${artifact?.kind??'empty'}`} aria-label={`Portada de ${delivery.title}, versión ${delivery.version}`}>
  {!visible||!artifact||failed?fallback:artifact.kind==='image'?<>
   {/* Private files must not be sent through the public Next image proxy. */}
   {/* eslint-disable-next-line @next/next/no-img-element */}
   <img src={artifactUrl(delivery.id,index)} alt={artifact.name} loading="lazy" onError={()=>setFailed(true)}/>
   <small className="delivery-cover-caption">Imagen adjunta · v{delivery.version}</small>
  </>:artifact.kind==='pdf'?<Suspense fallback={fallback}><Pdf key={delivery.id+':'+index} url={artifactUrl(delivery.id,index)} name={artifact.name} preview/></Suspense>:artifact.kind==='document'&&!xml?<DocumentCover key={delivery.id+':'+index} url={artifactUrl(delivery.id,index)} name={artifact.name}/>:fallback}
 </div>
}
