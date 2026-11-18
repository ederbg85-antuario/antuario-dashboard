import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { bridgeAuthorized, METRICA_CLIENT_ID, METRICA_ORG_ID, metricaOperations } from '@/lib/metrica-operations'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }
const unavailable = () => NextResponse.json({ error: 'Operation source unavailable' }, { status: 503, headers })

export async function GET(request: Request) {
  if (!process.env.METRICA_OPERATIONS_BRIDGE_KEY) return unavailable()
  if (!bridgeAuthorized(process.env.METRICA_OPERATIONS_BRIDGE_KEY, request.headers.get('authorization')))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers })
  // No caller-controlled organization, client, project, task or URL.
  if (new URL(request.url).search) return NextResponse.json({ error: 'Unsupported parameters' }, { status: 400, headers })
  try {
    const db = createAdminClient()
    const projects = await db.from('projects').select('id,organization_id,client_id,title,name,status', { count: 'exact' })
      .eq('organization_id', METRICA_ORG_ID).eq('client_id', METRICA_CLIENT_ID).limit(100)
    if (projects.error || (projects.count ?? 0) > 100) return unavailable()
    const projectIds = (projects.data ?? []).map(p => p.id)
    if (!projectIds.length) return NextResponse.json(metricaOperations({ projects: [], tasks: [], checklist: [], deliveries: [], members: [] }), { headers })
    const tasks = await db.from('tasks').select('id,organization_id,project_id,title,status,priority,due_date,due_date_kind,updated_at,completed_at,assignee_member_id,assigned_to', { count: 'exact' })
      .eq('organization_id', METRICA_ORG_ID).in('project_id', projectIds).order('created_at').limit(1000)
    if (tasks.error || (tasks.count ?? 0) > 1000) return unavailable()
    const taskIds = (tasks.data ?? []).map(t => t.id)
    const checklist: Record<string, unknown>[] = [], deliveries: Record<string, unknown>[] = [], members: Record<string, unknown>[] = []
    for (let offset = 0; offset < taskIds.length; offset += 100) {
      const ids = taskIds.slice(offset, offset + 100)
      const [checks, versions] = await Promise.all([
        db.from('task_checklist').select('id,organization_id,task_id,title,done,client_visible', { count: 'exact' }).eq('organization_id', METRICA_ORG_ID).in('task_id', ids).limit(1000),
        db.from('task_deliveries').select('id,organization_id,task_id,title,version,status,submitted_at,artifacts', { count: 'exact' }).eq('organization_id', METRICA_ORG_ID).in('task_id', ids).limit(1000),
      ])
      if (checks.error || versions.error || (checks.count ?? 0) > 1000 || (versions.count ?? 0) > 1000) return unavailable()
      checklist.push(...(checks.data ?? [])); deliveries.push(...(versions.data ?? []))
    }
    const memberIds = [...new Set((tasks.data ?? []).map(t => t.assignee_member_id).filter(Boolean))]
    const userIds = [...new Set((tasks.data ?? []).filter(t => !t.assignee_member_id).map(t => t.assigned_to).filter(Boolean))]
    for (const [column, ids] of [['id', memberIds], ['user_id', userIds]] as const) {
      if (!ids.length) continue
      const result = await db.from('team_members').select('id,organization_id,user_id,name,kind').eq('organization_id', METRICA_ORG_ID).in(column, ids)
      if (result.error) return unavailable()
      members.push(...(result.data ?? []))
    }
    return NextResponse.json(metricaOperations({ projects: projects.data ?? [], tasks: tasks.data ?? [], checklist, deliveries, members }), { headers })
  } catch { return unavailable() }
}
