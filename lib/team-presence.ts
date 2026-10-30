import {z} from 'zod'

export const WORKER_STATES=['idle','working','blocked'] as const
export type WorkerState=typeof WORKER_STATES[number]
export type WorkerPresence={member_id:string;name:string;position:string;kind:'agent'|'human';last_checked_at:string|null;state:WorkerState|null;current_work_id:string|null;note:string}
export type PresenceResponse={members:WorkerPresence[];self_member_id:string;checked_at:string}
export const PRESENCE_STALE_MINUTES=25
export const workerStateLabels:Record<WorkerState,string>={idle:'Sin tarea en curso',working:'Trabajando',blocked:'Bloqueado'}

export const workerHeartbeatSchema=z.object({
 state:z.enum(WORKER_STATES),current_work_id:z.uuid().nullable().default(null),note:z.string().trim().max(500).default(''),
}).strict().superRefine((value,ctx)=>{
 if(value.state==='blocked'&&!value.note)ctx.addIssue({code:'custom',path:['note'],message:'Indica el bloqueo y el siguiente paso.'})
 if(value.state==='idle'&&value.current_work_id)ctx.addIssue({code:'custom',path:['current_work_id'],message:'Un estado sin trabajo no conserva un encargo activo.'})
})

export function presenceFreshness(lastCheckedAt:string|null,now:number):'never'|'recent'|'stale'{
 if(!lastCheckedAt)return 'never'
 const time=Date.parse(lastCheckedAt)
 if(!Number.isFinite(time))return 'never'
 return time>now+60_000||now-time>PRESENCE_STALE_MINUTES*60_000?'stale':'recent'
}
export function presenceCounts(members:WorkerPresence[],now:number){
 return members.reduce((counts,member)=>{counts[presenceFreshness(member.last_checked_at,now)]++;return counts},{recent:0,stale:0,never:0})
}
