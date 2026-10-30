import {z} from 'zod'
export const FCM_PROJECT_ID='96b3d40b-21e4-449e-857c-5cf2c419a031'
export const FCM_CLIENT_ID='ed4f0ac7-e9f4-4185-a90b-48ef02536444'
export const attentionReportSchema=z.object({
 project_id:z.uuid(),cut_date:z.iso.date(),cut_hour:z.union([z.literal(10),z.literal(15),z.literal(19)]),
 period_from:z.iso.datetime({offset:true}),period_to:z.iso.datetime({offset:true}),
 coverage:z.string().trim().min(1).max(3000),reviewed_count:z.number().int().min(0).max(100000),
 attention_state:z.enum(['pending','stable','needs_review','blocked']),
 public_summary:z.string().trim().min(1).max(5000),evidence:z.string().trim().min(1).max(10000),next_actions:z.string().trim().min(1).max(5000)
}).strict().refine(r=>new Date(r.period_from)<=new Date(r.period_to),{message:'Periodo inválido',path:['period_to']})
export type AttentionReport=z.infer<typeof attentionReportSchema>&{id:string;member_id:string;author_id:string;created_at:string}
/** Operational agents are internal. Public status is attributed to Antuario. */
export function clientManagementText(value:string){return value.replace(/\bde Lisa\b/gi,'de la cuenta').replace(/\bLisa\b/gi,'el equipo').replace(/\bGrok\b/gi,'la supervisión interna')}
/** Client projection is explicit: internal evidence, comments, profiles and financial scope never cross the bridge. */
export function clientAttentionReport(r:AttentionReport){
 return {id:r.id,cut_date:r.cut_date,cut_hour:r.cut_hour,period_from:r.period_from,period_to:r.period_to,coverage:clientManagementText(r.coverage),reviewed_count:r.reviewed_count,attention_state:r.attention_state,summary:clientManagementText(r.public_summary),next_actions:clientManagementText(r.next_actions),created_at:r.created_at}
}
