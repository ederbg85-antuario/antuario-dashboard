import type {TeamMember} from './operations-types'
export const AREAS=['production','marketing','sales','finance','accounting','people'] as const
export type Area=typeof AREAS[number]
export function isScopedProductionSeat(role:string,seat:TeamMember|null){return role!=='owner'&&seat?.status==='active'&&seat.areas.length===1&&seat.areas[0]==='production'&&seat.client_ids.length>0}
export function scopedProductionPath(path:string){return ['/proyectos','/produccion','/cuentas','/api/accounts','/perfil','/mi-trabajo'].some(prefix=>path===prefix||path.startsWith(prefix+'/'))||path==='/equipo/trabajo'||path==='/api/team-work'||path==='/api/team-presence'||path==='/api/attention-reports'||path==='/api/attention-source'||path==='/api/dynamics'||path==='/api/operations'||path==='/api/operations/export'}
export const areaLabels:Record<Area,string>={production:'Producción',marketing:'Marketing',sales:'Ventas',finance:'Finanzas',accounting:'Contabilidad',people:'Equipo'}
/** A planned seat has no login. Only an active seat linked to a current member grants access. */
export function canArea(role:string,seat:TeamMember|null,area:Area,write=false,clientId?:string|null){
 if(role==='owner')return true
 if(!seat)return !['finance','accounting','people'].includes(area)&&(!write||['admin','editor'].includes(role))
 return seat.status==='active'&&seat.areas.includes(area)&&(!write||(seat.access==='operator'&&(seat.write_areas??seat.areas).includes(area)))&&(!seat.client_ids.length||(!!clientId&&seat.client_ids.includes(clientId)))
}
export function taskCompletionError(status:string,blockedReason:string|null|undefined,checklist:{done:boolean}[]){
 if(status!=='done')return null
 if(blockedReason?.trim())return 'Resuelve el bloqueo antes de completar la tarea.'
 if(checklist.some(item=>!item.done))return 'Completa el checklist antes de terminar la tarea.'
 return null
}
/** Reviews only: root operations supervises human leadership's work without changing ownership. */
export function canReviewMember(role:string,current:TeamMember|null,target:Pick<TeamMember,'id'|'user_id'|'kind'|'reports_to_member_id'>,userId:string){
 if(target.user_id===userId)return false
 if(role==='owner')return true
 if(!current||!canArea(role,current,'people',true))return false
 return target.reports_to_member_id===current.id||(target.kind==='human'&&!target.reports_to_member_id&&!!target.user_id&&current.kind==='agent'&&!current.reports_to_member_id)
}
