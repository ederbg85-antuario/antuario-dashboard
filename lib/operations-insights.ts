import {addDays,calendarTasks,taskPerson,taskPersonKey,type CalendarFilters} from './operations-calendar'
import {recordedAreas,taskAreas} from './task-classification'
import type {OpsData} from './operations-types'
export const operatingStates=[{key:'todo',label:'Por hacer',color:'var(--chart-pending)'},{key:'in_progress',label:'En curso',color:'var(--chart-progress)'},{key:'review',label:'Revisión',color:'var(--chart-review)'},{key:'done',label:'Terminadas',color:'var(--chart-done)'}] as const
export function operatingInsights(data:OpsData,filters:CalendarFilters,today:string){
 const tasks=calendarTasks(data,{...filters,status:''}),open=tasks.filter(t=>t.status!=='done')
 const states=operatingStates.map(s=>({...s,value:tasks.filter(t=>t.status===s.key).length}))
 const people=[...new Set(open.map(t=>taskPersonKey(t,data)))].map(key=>{const own=open.filter(t=>taskPersonKey(t,data)===key),first=own[0];return {key,name:taskPerson(first,data),total:own.length,...Object.fromEntries(operatingStates.map(s=>[s.key,own.filter(t=>t.status===s.key).length]))}}).sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name,'es'))
 const dates=Array.from({length:7},(_,i)=>{const date=addDays(today,i),own=open.filter(t=>t.due_date===date);return {date,total:own.length,proposed:own.filter(t=>t.due_date_kind==='proposed').length,confirmed:own.filter(t=>t.due_date_kind==='confirmed').length,follow_up:own.filter(t=>t.due_date_kind==='follow_up').length,unknown:own.filter(t=>!t.due_date_kind).length}})
 const areas=[...Object.entries(taskAreas).map(([key,label])=>({key,label,value:open.filter(t=>recordedAreas(t)[0]===key).length})),{key:'unclassified',label:'Sin clasificar',value:open.filter(t=>!recordedAreas(t).length).length}]
 return {areas,states,people,dates,total:tasks.length,open:open.length,done:tasks.length-open.length,undated:open.filter(t=>!t.due_date).length,overdue:open.filter(t=>t.due_date&&t.due_date<today).length}
}
