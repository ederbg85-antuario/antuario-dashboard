'use client'
import {useCallback,useEffect,useRef,useState} from 'react'
import {useRouter} from 'next/navigation'
import TaskDetail from './TaskDetail'
import './calendar.css'
import type {TaskDetailResponse} from '@/lib/operations-task-types'
import type {OperationTable} from '@/lib/operations-schema'

export default function TaskDialog({taskId,accountId,onSaved,close}:{taskId:string;accountId?:string;onSaved?:()=>void;close:()=>void}) {
  const router=useRouter(),lock=useRef(false)
  const [payload,setPayload]=useState<TaskDetailResponse|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[reloadRequired,setReloadRequired]=useState(false)
  const url='/api/operations/tasks/'+encodeURIComponent(taskId)+(accountId?'?account='+encodeURIComponent(accountId):'')
  const load=useCallback(async(signal?:AbortSignal)=>{
    const res=await fetch(url,{cache:'no-store',signal}),body=await res.json()
    if(!res.ok)throw new Error(body.error??'No se pudo cargar la tarea')
    return body as TaskDetailResponse
  },[url])
  useEffect(()=>{const abort=new AbortController();load(abort.signal).then(setPayload).catch(e=>{if(!abort.signal.aborted)setError(e.message)});return()=>abort.abort()},[load])
  async function save(table:OperationTable,values:Record<string,unknown>,id?:string) {
    if(lock.current||!payload)return
    lock.current=true;setBusy(true);setError('');setNotice('')
    try{
      const res=await fetch('/api/operations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({table,values,...(id?{id}:{}),...(table==='tasks'&&payload.task.updated_at?{expected_updated_at:payload.task.updated_at}:{})})}),result=await res.json()
      if(!res.ok)throw new Error(result.details?.join(' · ')??result.error??'No se guardó')
      // Reload the authoritative record; never turn a failed refresh into a silent success.
      try{const fresh=await load();setPayload(table==='tasks'?fresh:{...fresh,task:payload.task});setNotice('Guardado')}catch{setReloadRequired(true);setError('El cambio se guardó, pero no pudimos recargar el detalle. Cierra y vuelve a abrir antes de editar.');return}
      onSaved?.();router.refresh();return result.id as string
    }catch(e){setError(e instanceof Error?e.message:'No se guardó')}finally{lock.current=false;setBusy(false)}
  }
  if(!payload)return <LoadingTask error={error} close={close}/>
  return <><TaskDetail task={payload.task} data={reloadRequired?{...payload.data,capabilities:{...payload.data.capabilities,productionWrite:false}}:payload.data} busy={busy} error={error} save={save} close={close}/>{notice&&<span role="status" className="task-save-status">{notice}</span>}</>
}

function LoadingTask({error,close}:{error:string;close:()=>void}){
 const ref=useRef<HTMLDialogElement>(null)
 useEffect(()=>{const node=ref.current;node?.showModal();return()=>node?.close()},[])
 return <dialog ref={ref} className="op-dialog task-dialog" aria-label="Cargando tarea" onCancel={e=>{e.preventDefault();close()}}><p role={error?'alert':'status'}>{error||'Cargando tarea…'}</p><button className="op-button" onClick={close}>Cerrar</button></dialog>
}
