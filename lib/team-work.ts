import {z} from 'zod'
import {AREAS} from './team-access'

export const WORK_STATUSES=['pending','in_progress','blocked','done'] as const
export const workStatusLabels:Record<WorkStatus,string>={pending:'Por hacer',in_progress:'En curso',blocked:'Bloqueado',done:'Terminado'}
export type WorkStatus=typeof WORK_STATUSES[number]
export type WorkMember={id:string;name:string;position:string;user_id:string|null;areas:string[];status:string}
export type TeamWorkItem={id:string;organization_id:number;sender_member_id:string;recipient_member_id:string;area:string;title:string;body:string;status:WorkStatus;priority:number;due_date:string|null;evidence:string;blocked_reason:string;source_key:string;created_by:string|null;updated_by:string|null;created_at:string;updated_at:string;submission_version?:number}
export const WORK_EVENT_KINDS=['comment','accepted','changes_requested'] as const
export type WorkEventKind=typeof WORK_EVENT_KINDS[number]
export type TeamWorkEvent={id:string;organization_id:number;work_id:string;author_member_id:string;author_id:string;kind:WorkEventKind;body:string;work_version:number;work_updated_at:string;source_key:string;created_at:string}
export const workEventLabels:Record<WorkEventKind,string>={comment:'Mensaje',accepted:'Entrega aceptada',changes_requested:'Cambios solicitados'}

const short=z.string().trim().min(1).max(240)
export const createTeamWorkSchema=z.object({
 action:z.literal('create'),recipient_member_id:z.uuid(),area:z.enum(AREAS),title:short,
 body:z.string().trim().min(1).max(6000),priority:z.number().int().min(1).max(4).default(2),
 due_date:z.iso.date().nullable().default(null),source_key:z.string().trim().min(1).max(160).regex(/^[a-zA-Z0-9_:.\/-]+$/).optional(),
}).strict()
export const updateTeamWorkSchema=z.object({
 action:z.literal('update'),id:z.uuid(),expected_updated_at:z.iso.datetime({offset:true}),
 status:z.enum(WORK_STATUSES),evidence:z.string().trim().max(3000),blocked_reason:z.string().trim().max(2000),
}).strict().superRefine((value,ctx)=>{
 if(value.status==='done'&&!value.evidence)ctx.addIssue({code:'custom',path:['evidence'],message:'Agrega evidencia antes de terminar.'})
 if(value.status==='blocked'&&!value.blocked_reason)ctx.addIssue({code:'custom',path:['blocked_reason'],message:'Explica el bloqueo.'})
 if(value.status!=='blocked'&&value.blocked_reason)ctx.addIssue({code:'custom',path:['blocked_reason'],message:'Resuelve o conserva el estado de bloqueo.'})
})
const eventReference={work_id:z.uuid(),body:z.string().trim().min(1).max(3000),source_key:z.string().trim().min(1).max(160).regex(/^[a-zA-Z0-9_:.\/-]+$/).optional()}
export const commentTeamWorkSchema=z.object({action:z.literal('comment'),...eventReference}).strict()
export const reviewTeamWorkSchema=z.object({action:z.literal('review'),...eventReference,verdict:z.enum(['accepted','changes_requested']),expected_updated_at:z.iso.datetime({offset:true})}).strict()
export const teamWorkSchema=z.union([createTeamWorkSchema,updateTeamWorkSchema,commentTeamWorkSchema,reviewTeamWorkSchema])
export const listTeamWorkSchema=z.object({
 status:z.enum(['open','all',...WORK_STATUSES]).default('all'),
 updated_after:z.iso.datetime({offset:true}).optional(),
 work_id:z.uuid().optional(),
 limit:z.coerce.number().int().min(1).max(200).default(200),
 offset:z.coerce.number().int().min(0).max(10000).default(0),
}).strict()
export type WorkReviewState='accepted'|'changes_requested'|'awaiting_review'|'not_submitted'
export function workReviewState(item:Pick<TeamWorkItem,'status'|'submission_version'>,events:TeamWorkEvent[]):WorkReviewState{
 const reviews=events.filter(event=>event.kind!=='comment').sort((a,b)=>b.work_version-a.work_version||b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id))
 const latest=reviews[0]
 if(item.status==='done')return latest?.kind==='accepted'&&latest.work_version===(item.submission_version??0)?'accepted':'awaiting_review'
 return latest?.kind==='changes_requested'?'changes_requested':'not_submitted'
}
export function canCoordinateTeamWork(role:string,seat:{status?:string;access?:string;write_areas?:string[];client_ids?:string[]}|null){
 return role==='owner'||!!(seat?.status==='active'&&seat.access==='operator'&&seat.write_areas?.includes('people')&&!seat.client_ids?.length)
}
export function teamWorkCounts(items:TeamWorkItem[],today:string){
 return {pending:items.filter(i=>i.status==='pending').length,inProgress:items.filter(i=>i.status==='in_progress').length,blocked:items.filter(i=>i.status==='blocked').length,overdue:items.filter(i=>i.status!=='done'&&i.due_date&&i.due_date<today).length}
}
