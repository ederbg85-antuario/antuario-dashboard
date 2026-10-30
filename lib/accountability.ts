import type {OpsData,TeamMember,StrategyPlan} from './operations-types'
import {isCurrentProject} from './client-lifecycle'
export function memberTasks(data:Pick<OpsData,'tasks'>&Partial<Pick<OpsData,'projects'|'clients'>>,member:TeamMember,ownOnly=false){
 const currentProjects=data.projects?.filter(p=>p.client_id&&isCurrentProject(p,data.clients))
 const directed=currentProjects?.filter(p=>p.director_member_id===member.id)
 const managed=!ownOnly&&member.kind==='agent'?(directed?.length?directed.map(p=>p.id):member.areas.includes('people')?currentProjects?.map(p=>p.id):undefined):undefined
 const tasks=data.tasks.filter(t=>managed?managed.includes(t.project_id):t.assignee_member_id?t.assignee_member_id===member.id:!!member.user_id&&t.assigned_to===member.user_id)
 return {tasks,managed:managed!==undefined}
}
export function agentMetrics(data:Pick<OpsData,'tasks'|'reports'|'reviews'|'asOf'>&Partial<Pick<OpsData,'projects'|'clients'>>,member:TeamMember){
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City'}).format(new Date(data.asOf))
 const {tasks:assigned,managed}=memberTasks(data,member),done=assigned.filter(t=>t.status==='done'),dated=done.filter(t=>t.due_date&&t.completed_at),onTime=dated.filter(t=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City'}).format(new Date(t.completed_at!))<=t.due_date!)
 const reports=data.reports.filter(r=>r.member_id===member.id),reviews=data.reviews.filter(r=>r.member_id===member.id)
 return {scope:managed?'Tareas de clientes bajo gestión':'Tareas asignadas visibles',assigned:assigned.length,done:done.length,overdue:assigned.filter(t=>t.status!=='done'&&t.due_date&&t.due_date<today).length,blocked:assigned.filter(t=>t.status!=='done'&&t.blocked_reason?.trim()).length,onTime:dated.length?Math.round(onTime.length/dated.length*100):null,onTimeSample:dated.length,acceptance:reviews.length?Math.round(reviews.filter(r=>r.verdict==='accepted').length/reviews.length*100):null,reviews:reviews.length,reports:reports.length,pendingReview:reports.filter(r=>!reviews.some(v=>v.report_id===r.id)).length,todayReported:reports.some(r=>r.report_date===today)}
}
export const strategyMetricLabels:Record<string,string>={seo_clicks:'Clics orgánicos',seo_ctr:'CTR orgánico (%)',ga_sessions:'Sesiones GA4',ga_key_events:'Eventos clave GA4',content_published:'Contenido publicado'}
export function strategyMeasurement(data:Pick<OpsData,'metrics'|'connections'|'content'>,plan:StrategyPlan){
 const isSeo=plan.metric_key.startsWith('seo_'),source=isSeo?'search_console':'ga4',rows=data.metrics.filter(m=>m.source===source&&m.date>=plan.period_from&&m.date<=plan.period_to)
 if(plan.metric_key==='content_published'){const published=data.content.filter(c=>c.status==='published');if(published.some(c=>!c.published_at))return {value:null,coverage:'Hay publicaciones sin fecha efectiva registrada'};return {value:published.filter(c=>{const d=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City'}).format(new Date(c.published_at!));return d>=plan.period_from&&d<=plan.period_to}).length,coverage:'Publicaciones registradas con enlace y fecha efectiva · sin usar la programación'}}
 const from=rows.length?rows.reduce((a,m)=>m.date<a?m.date:a,rows[0].date):null,to=rows.length?rows.reduce((a,m)=>m.date>a?m.date:a,rows[0].date):null
 const key=isSeo?'clicks':plan.metric_key==='ga_sessions'?'sessions':'conversions',values=rows.filter(m=>m.metric_key===key),sum=values.reduce((s,m)=>s+Number(m.daily_total),0)
 const impressions=rows.filter(m=>m.metric_key==='impressions').reduce((s,m)=>s+Number(m.daily_total),0)
 return {value:!values.length?null:plan.metric_key==='seo_ctr'?(impressions?Math.round(sum/impressions*10000)/100:null):sum,coverage:from?`${source==='ga4'?'GA4':'Search Console'} · ${from} — ${to}${from>plan.period_from||to!<plan.period_to?' · cobertura parcial':''}`:'Sin datos para este periodo'}
}
