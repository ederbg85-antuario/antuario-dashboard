import type {OpsData,Task,TeamMember} from './operations-types'
import {memberTasks} from './accountability'
import {isCurrentProject} from './client-lifecycle'
export const mexicoDate=(value:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City'}).format(new Date(value))
export const shortDate=(value:string)=>new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'))
export const taskStates=[{key:'todo',label:'Pendientes',color:'var(--chart-pending)'},{key:'in_progress',label:'En curso',color:'var(--chart-progress)'},{key:'review',label:'En revisión',color:'var(--chart-review)'},{key:'done',label:'Terminadas',color:'var(--chart-done)'}] as const
export function taskDistribution(tasks:Task[]){return taskStates.map(s=>({...s,value:tasks.filter(t=>t.status===s.key).length}))}
export function clientWork(data:Pick<OpsData,'tasks'|'projects'>&Partial<Pick<OpsData,'clients'>>){return data.tasks.filter(t=>data.projects.some(p=>p.id===t.project_id&&p.client_id&&isCurrentProject(p,data.clients)))}
export function responsibilityRows(data:Pick<OpsData,'tasks'|'projects'|'team'>&Partial<Pick<OpsData,'clients'>>){
 const work={...data,tasks:clientWork(data)}
 const rows=data.team.filter(m=>m.status==='active').map(m=>{const own=memberTasks(work,m,true).tasks;return {id:m.id,name:m.name,kind:m.kind,total:own.length,...Object.fromEntries(taskStates.map(s=>[s.key,own.filter(t=>t.status===s.key).length]))}})
 const unassigned=work.tasks.filter(t=>!data.team.some(m=>m.status==='active'&&(t.assignee_member_id?t.assignee_member_id===m.id:!!m.user_id&&t.assigned_to===m.user_id)))
 if(unassigned.length)rows.push({id:'unassigned',name:'Sin responsable',kind:'human',total:unassigned.length,...Object.fromEntries(taskStates.map(s=>[s.key,unassigned.filter(t=>t.status===s.key).length]))})
 return rows.sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name,'es'))
}
export function deliverySeries(data:Pick<OpsData,'tasks'|'reports'|'asOf'>,days:number,member?:TeamMember){
 const end=mexicoDate(data.asOf),start=new Date(end+'T12:00:00Z');start.setUTCDate(start.getUTCDate()-days+1)
 return Array.from({length:days},(_,i)=>{const day=new Date(start);day.setUTCDate(day.getUTCDate()+i);const date=day.toISOString().slice(0,10);return {date,deliveries:data.tasks.filter(t=>t.status==='done'&&t.completed_at&&mexicoDate(t.completed_at)===date).length,reports:data.reports.filter(r=>r.report_date===date&&(!member||r.member_id===member.id)).length}})
}
export function cashSeries(data:Pick<OpsData,'entries'|'asOf'>,month:string){
 const today=mexicoDate(data.asOf),last=new Date(month+'-01T12:00:00Z');last.setUTCMonth(last.getUTCMonth()+1);last.setUTCDate(0)
 const end=[last.toISOString().slice(0,10),today].sort()[0]
 if(end<month+'-01')return []
 const days=Number(end.slice(8,10)),rows=data.entries.filter(e=>e.evidence!=='planned'&&e.currency==='MXN'&&e.category!=='transfer'&&e.cash_date?.slice(0,7)===month&&e.cash_date<=end)
 return Array.from({length:days},(_,i)=>{const date=month+'-'+String(i+1).padStart(2,'0'),through=rows.filter(e=>e.cash_date!<=date),sum=(direction:string)=>Math.round(through.filter(e=>e.direction===direction).reduce((n,e)=>n+Math.round(Number(e.cash_amount)*100),0))/100;return {date,income:sum('income'),expense:sum('expense')}})
}
export function dailyMarketing(data:Pick<OpsData,'metrics'|'asOf'>,month:string,source:string,key:string){
 const rows=data.metrics.filter(m=>m.source===source&&m.metric_key===key&&m.date.slice(0,7)===month&&m.date<=mexicoDate(data.asOf))
 return rows.map(m=>({date:m.date,value:Number(m.daily_total)})).sort((a,b)=>a.date.localeCompare(b.date))
}
