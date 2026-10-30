import type {OpsData} from './operations-types'
import {calendarTasks,mexicoDay,addDays} from './operations-calendar'
import {financeSummary} from './finance'
import {isArchivedClient} from './client-lifecycle'

const unique=<T extends {id:string}>(rows:T[])=>[...new Map(rows.map(row=>[row.id,row])).values()]
export function businessOverview(data:OpsData,month:string){
 const today=mexicoDay(data.asOf),first=month+'-01',next=new Date(first+'T12:00:00Z');next.setUTCMonth(next.getUTCMonth()+1)
 const end=[addDays(next.toISOString().slice(0,10),-1),today].sort()[0]
 const financeReady=!data.errors.some(key=>['accounts','entries','documents','closings'].includes(key))
 const marketingReady=!data.errors.some(key=>['metrics','connections'].includes(key))
 const operationsReady=!data.errors.some(key=>['tasks','projects','clients'].includes(key))
 const salesReady=!data.errors.includes('proposals')
 const tasks=calendarTasks(data,{client:'',person:'',priority:'',status:''}),open=tasks.filter(t=>t.status!=='done')
 const states=[{key:'todo',name:'Por hacer',color:'#9569df'},{key:'in_progress',name:'En curso',color:'#4c9fd6'},{key:'review',name:'En revisión',color:'#db9074'},{key:'done',name:'Terminadas',color:'#3ba68d'}].map(s=>({...s,value:tasks.filter(t=>t.status===s.key).length}))
 const proposals=unique(data.proposals).filter(p=>p.created_at.slice(0,10)<=today)
 const proposalStates=[{key:'draft',name:'Borrador',color:'#acb4c7'},{key:'sent',name:'Enviadas',color:'#7292da'},{key:'viewed',name:'Vistas',color:'#8a70ca'},{key:'accepted',name:'Aceptadas',color:'#268975'},{key:'rejected',name:'Rechazadas',color:'#c67b72'},{key:'expired',name:'Vencidas',color:'#d6ab61'},{key:'cancelled',name:'Canceladas',color:'#a3a8b4'}].map(s=>({...s,value:proposals.filter(p=>p.status===s.key).length}))
 const proposalOther=proposals.filter(p=>!proposalStates.some(s=>s.key===p.status)).length
 if(proposalOther)proposalStates.push({key:'other',name:'Otros estados',color:'#a3a8b4',value:proposalOther})
 const openProposals=proposals.filter(p=>!['accepted','rejected','expired','cancelled'].includes(p.status))
 const metrics=[...new Map(data.metrics.filter(m=>m.date>=first&&m.date<=end&&Number.isFinite(Number(m.daily_total))).map(m=>[m.source+'|'+m.metric_key+'|'+m.date,m])).values()]
 const value=(date:string,source:string,key:string)=>{const row=metrics.find(m=>m.date===date&&m.source===source&&m.metric_key===key);return row?Number(row.daily_total):null}
 const days=end>=first?Array.from({length:Number(end.slice(-2))},(_,i)=>{const date=first.slice(0,8)+String(i+1).padStart(2,'0');return {date,sessions:value(date,'ga4','sessions'),clicks:value(date,'search_console','clicks'),events:value(date,'ga4','key_events')??value(date,'ga4','conversions')}}):[]
 const total=(key:'sessions'|'clicks'|'events')=>{const recorded=days.filter(d=>d[key]!=null);return recorded.length?recorded.reduce((n,d)=>n+d[key]!,0):null}
 const cashEntries=data.entries.filter(e=>e.currency==='MXN'&&e.evidence!=='planned'&&e.category!=='transfer'&&e.cash_date&&e.cash_date>=first&&e.cash_date<=end)
 const cash=days.map(d=>({date:d.date,income:cashEntries.filter(e=>e.direction==='income'&&e.cash_date===d.date).reduce((n,e)=>n+Number(e.cash_amount),0),expense:cashEntries.filter(e=>e.direction==='expense'&&e.cash_date===d.date).reduce((n,e)=>n+Number(e.cash_amount),0)}))
 const clientRows=data.clients.filter(c=>!isArchivedClient(c)).map(c=>{const own=tasks.filter(t=>data.projects.find(p=>p.id===t.project_id)?.client_id===c.id);return {id:c.id,name:c.name,total:own.length,open:own.filter(t=>t.status!=='done').length,blocked:own.filter(t=>t.status!=='done'&&t.blocked_reason?.trim()).length,states:states.map(s=>({...s,value:own.filter(t=>t.status===s.key).length}))}}).filter(c=>c.total).sort((a,b)=>b.blocked-a.blocked||b.open-a.open)
 const content=unique(data.content),contentStates=[{key:'idea',name:'Ideas',color:'#acb4c7'},{key:'draft',name:'Borradores',color:'#92a5d8'},{key:'review',name:'Revisión',color:'#c99a58'},{key:'approved',name:'Aprobadas',color:'#8e75c7'},{key:'published',name:'Publicadas',color:'#288975'}].map(s=>({...s,value:content.filter(c=>c.status===s.key).length}))
 const accounting=unique(data.accounting),accountingStates=[{key:'pending',name:'Pendientes',color:'#d59e50'},{key:'prepared',name:'Preparados',color:'#7e92bd'},{key:'done',name:'Terminados',color:'#288975'}].map(s=>({...s,value:accounting.filter(a=>a.status===s.key).length}))
 const team=unique(data.team).filter(m=>m.status==='active'),peopleAreas=[['production','Producción'],['marketing','Marketing'],['sales','Ventas'],['finance','Finanzas'],['accounting','Contabilidad'],['people','Equipo']].map(([key,name])=>({key,name,value:team.filter(m=>m.areas.includes(key)).length}))
 const connections=unique(data.connections),needsConnection=connections.filter(c=>c.status!=='active'||!c.last_sync_at)
 const ads=unique(data.ads).filter(a=>a.period_from>=first&&a.period_to<=end).sort((a,b)=>b.conversions-a.conversions)
 return {today,first,end,financeReady,marketingReady,operationsReady,salesReady,finance:financeSummary(data,month,today),cash,cashEntries:cashEntries.length,tasks,open,states,blocked:open.filter(t=>t.blocked_reason?.trim()),overdue:open.filter(t=>t.due_date&&t.due_date<today),now:open.filter(t=>t.status==='in_progress'),proposals,proposalStates,openProposals,days,sessions:total('sessions'),clicks:total('clicks'),events:total('events'),marketingDays:days.filter(d=>d.sessions!=null).length,clientRows,contentStates,contentTotal:content.length,accountingStates,accountingTotal:accounting.length,team,peopleAreas,connections,needsConnection,ads}
}
