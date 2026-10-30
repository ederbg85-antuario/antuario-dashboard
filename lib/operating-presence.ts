import {presenceFreshness,type WorkerPresence} from './team-presence'
import {calendarTasks,taskPersonKey} from './operations-calendar'
import type {OpsData,TeamMember} from './operations-types'
export function operationalSignal(member:Pick<TeamMember,'status'>,signal:WorkerPresence|undefined,now:number,available=true) {
 if(member.status==='paused')return {key:'paused',label:'Pausado'}
 if(!available)return {key:'unavailable',label:'Señal no disponible'}
 const freshness=presenceFreshness(signal?.last_checked_at??null,now)
 if(freshness==='never')return {key:'never',label:'Sin señal'}
 if(freshness==='stale')return {key:'stale',label:'Desactualizado'}
 if(signal?.state==='working')return {key:'working',label:'Reporta trabajo'}
 if(signal?.state==='blocked')return {key:'blocked',label:'Reporta bloqueo'}
 return {key:'idle',label:'Sin ejecución reportada'}
}
export function operationalWorkload(data:Pick<OpsData,'tasks'|'team'|'projects'|'clients'>) {
 const tasks=calendarTasks(data,{client:'',person:'',priority:'',status:'in_progress'})
 return new Map(data.team.map(member=>[member.id,tasks.filter(task=>taskPersonKey(task,data)===(member.user_id?'user:'+member.user_id:'member:'+member.id))]))
}
