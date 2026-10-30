import 'server-only'
import { cache } from 'react'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import {canArea,AREAS} from '@/lib/team-access'
import type {TeamMember,OpsData} from '@/lib/operations-types'
import {ANTUARIO_ORG_ID} from '@/lib/internal-platform'

// Deduplicate layout/page identity checks only within the current React render pass.
// Route handlers still validate every call; no identity is cached across requests.
export const workspace = cache(async function workspace() {
 const db = await createClient()
 const { data: { user } } = await db.auth.getUser()
 if (!user) return null
 const [{data:member,error},{data:seat}]=await Promise.all([
  db.from('memberships').select('organization_id,role').eq('user_id',user.id).eq('organization_id',ANTUARIO_ORG_ID).eq('status','active').order('created_at').limit(1).maybeSingle(),
  db.from('team_members').select('*').eq('organization_id',ANTUARIO_ORG_ID).eq('user_id',user.id).maybeSingle(),
 ])
 if (error || !member) return null
 const can=(area:import('./team-access').Area,write=false,clientId?:string|null)=>canArea(member.role,seat as TeamMember|null,area,write,clientId)
 return { db, user, orgId: member.organization_id as number, role: member.role as string,can,seat }
})
export async function requireWorkspace() {
 const context = await workspace()
 if (!context) redirect('/login')
 return context
}
export async function operationsData() {
 const context = await requireWorkspace()
 const {db,orgId,role} = context
 const owner = context.can('finance')
 const queries = {
 communications:db.from("client_communications").select("*").eq("organization_id",orgId).order("created_at",{ascending:false}).limit(500),
 reports:db.from("agent_reports").select("*").eq("organization_id",orgId).order("report_date",{ascending:false}).limit(1000),
 reviews:db.from("agent_reviews").select("*").eq("organization_id",orgId).order("created_at",{ascending:false}).limit(1000),
 strategies:db.from("strategy_plans").select("*").eq("organization_id",orgId).order("updated_at",{ascending:false}),
 contentJobs:db.from('content_jobs').select('id,content_id,action,status,requested_at,result_url,error').eq('organization_id',orgId).order('requested_at',{ascending:false}).limit(500),
 team:db.from('team_members').select('*').eq('organization_id',orgId).order('created_at'),
 checklists:db.from('task_checklist').select('*').eq('organization_id',orgId).order('created_at'),
 comments:db.from('task_comments').select('id,task_id,author_id,body,created_at').eq('organization_id',orgId).order('created_at',{ascending:false}).limit(1000),
 activity:db.from('operations_audit').select('id,actor_id,entity,record_id,operation,created_at,after_data,before_data').eq('organization_id',orgId).order('created_at',{ascending:false}).limit(120),
 ads:db.from('ads_campaign_reports').select('*').eq('organization_id',orgId).order('period_to',{ascending:false}),
  accounts: owner ? db.from('finance_accounts').select('*').eq('organization_id',orgId).order('name') : Promise.resolve({data:[],error:null}),
  entries: owner ? db.from('finance_entries').select('*').eq('organization_id',orgId).order('created_at',{ascending:false}).limit(1000) : Promise.resolve({data:[],error:null}),
  documents: owner ? db.from('finance_documents').select('*').eq('organization_id',orgId).order('issued_date',{ascending:false}).limit(1000) : Promise.resolve({data:[],error:null}),
  subscriptions: owner ? db.from('finance_subscriptions').select('*').eq('organization_id',orgId).order('next_due') : Promise.resolve({data:[],error:null}),
  closings: owner ? db.from('finance_closings').select('*').eq('organization_id',orgId) : Promise.resolve({data:[],error:null}),
  accounting: context.can('accounting') ? db.from('accounting_items').select('*').eq('organization_id',orgId).order('created_at') : Promise.resolve({data:[],error:null}),
  content: db.from('content_items').select('*').eq('organization_id',orgId).order('created_at',{ascending:false}).limit(500),
  projects: db.from('projects').select('id,title,name,client_id,status,description,due_date,owner_id,color,priority,director_member_id,next_action').eq('organization_id',orgId).order('created_at'),
  tasks: db.from('tasks').select('*').eq('organization_id',orgId).order('created_at'),
  clients: db.from('clients').select('id,name,contracted_services,status,archived_at,archive_reason').eq('organization_id',orgId).order('name'),
  proposals: db.from('proposals').select('id,title,status,stage,total,subtotal,currency,billing_type,created_at,presented_at,decided_at').eq('organization_id',orgId).order('created_at',{ascending:false}),
  connections: db.from('marketing_connections').select('id,source,status,external_name,external_id,last_sync_at,last_error,token_expires_at,snapshot').eq('organization_id',orgId).order('created_at'),
  metrics: db.from('marketing_daily_summary').select('source,date,metric_key,daily_total').eq('organization_id',orgId).lte('date',new Date().toISOString().slice(0,10)).order('date',{ascending:false}).limit(1000),
 }
 const results = await Promise.all(Object.entries(queries).map(async ([key,q])=>({key,...await q})))
 const errors=results.filter(r=>r.error).map(r=>r.key)
 const data=Object.fromEntries(results.map(r=>[r.key,r.data??[]]))
 // Explicit member IDs before the only privileged profile query; never enumerate all users.
 const {data:members}=await db.from('memberships').select('user_id').eq('organization_id',orgId).eq('status','active')
 const {data:profiles}=await createAdminClient().from('profiles').select('id,full_name').in('id',(members??[]).map(m=>m.user_id))
 return { ...data, profiles: profiles??[], errors, owner, role, orgId,userId:context.user.id,capabilities:Object.fromEntries(AREAS.flatMap(area=>[[area,context.can(area)||!!(context.seat?.status==='active'&&context.seat?.areas.includes(area))],[area+'Write',context.can(area,true)||!!(context.seat?.status==='active'&&context.seat?.access==='operator'&&(context.seat?.write_areas??context.seat?.areas).includes(area))]])), asOf:new Date().toISOString() } as OpsData
}
