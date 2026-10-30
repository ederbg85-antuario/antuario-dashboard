import {recordedAreas,recordedTags} from './task-classification'
import {isCurrentProject} from './client-lifecycle'
import type {OpsData,Task} from './operations-types'

export const CALENDAR_ZONE = 'America/Mexico_City'
export const taskStateLabels:Record<string,string> = {todo:'Por hacer',in_progress:'En curso',review:'Revisión',done:'Terminado'}
export const dateKindLabels:Record<string,string> = {proposed:'Propuesta',confirmed:'Compromiso',follow_up:'Seguimiento'}
// A date-only value is a civil day, never a UTC instant.
export function mexicoDay(instant:string) {
  return new Intl.DateTimeFormat('en-CA',{timeZone:CALENDAR_ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(instant))
}
export function addDays(day:string,count:number) {
  const date = new Date(day+'T12:00:00Z')
  date.setUTCDate(date.getUTCDate()+count)
  return date.toISOString().slice(0,10)
}
export function movePeriod(day:string,view:'week'|'month',direction:number) {
  if(view==='week')return addDays(day,7*direction)
  const date=new Date(day.slice(0,7)+'-01T12:00:00Z')
  date.setUTCMonth(date.getUTCMonth()+direction)
  return date.toISOString().slice(0,10)
}
export function calendarDays(day:string,view:'week'|'month') {
  const first=view==='month'?day.slice(0,7)+'-01':day
  const weekday=new Date(first+'T12:00:00Z').getUTCDay()
  const start=addDays(first,-((weekday+6)%7))
  let length=7
  if(view==='month'){
    const next=movePeriod(first,'month',1)
    const span=Math.round((Date.parse(next+'T12:00:00Z')-Date.parse(start+'T12:00:00Z'))/86400000)
    length=Math.ceil(span/7)*7
  }
  return Array.from({length},(_,i)=>addDays(start,i))
}
export type CalendarFilters={client:string;person:string;priority:string;status:string;area?:string;tag?:string}
export function taskPersonKey(task:Task,data?:Partial<Pick<OpsData,'team'>>) {
  const member=data?.team?.find(m=>m.id===task.assignee_member_id)
  return member?.user_id?'user:'+member.user_id:task.assignee_member_id?'member:'+task.assignee_member_id:task.assigned_to?'user:'+task.assigned_to:'unassigned'
}
export function taskPerson(task:Task,data:Pick<OpsData,'team'|'profiles'>) {
  return data.team.find(m=>m.id===task.assignee_member_id)?.name??(task.assigned_to?data.team.find(m=>m.user_id===task.assigned_to)?.name:undefined)??data.profiles.find(p=>p.id===task.assigned_to)?.full_name??'Sin responsable'
}
/** Canonical production tasks only: inbox assignments and recurring templates are not tasks. */
export function calendarTasks(data:Pick<OpsData,'tasks'|'projects'|'clients'>&Partial<Pick<OpsData,'team'>>,filters:CalendarFilters) {
  const projects=new Map(data.projects.filter(p=>isCurrentProject(p,data.clients)).map(p=>[p.id,p]))
  return [...new Map(data.tasks.map(t=>[t.id,t])).values()].filter(t=>{
    const p=projects.get(t.project_id)
    return (!filters.area||(filters.area==='unclassified'?!recordedAreas(t).length:recordedAreas(t).includes(filters.area as keyof typeof import('./task-classification').taskAreas)))&&(!filters.tag||recordedTags(t).includes(filters.tag))&&!!p&&(!filters.client||(p.client_id??'internal')===filters.client)&&(!filters.person||taskPersonKey(t,data)===filters.person)&&(!filters.priority||String(t.priority??2)===filters.priority)&&(!filters.status||filters.status==='open'&&t.status!=='done'||filters.status==='blocked'&&!!t.blocked_reason?.trim()&&t.status!=='done'||t.status===filters.status)
  }).sort((a,b)=>(a.priority??2)-(b.priority??2)||a.title.localeCompare(b.title,'es'))
}
