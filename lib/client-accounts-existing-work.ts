import type { SupabaseClient } from '@supabase/supabase-js'

/** Original operating records. They are projected for context, never copied into new work. */
export type ExistingAccountWork = {
  projects: {
    id: string
    title: string
    status: string
    next_action: string | null
    description: string | null
  }[]
  tasks: {
    id: string
    project_id: string
    title: string
    status: string
    due_date: string | null
    priority?: number | null
    validator_member_id?: string | null
    client_dependency?: string | null
    client_dependency_owner?: string | null
    client_dependency_impact?: string | null
    assignee_member_id: string | null
    description: string | null
    acceptance: string | null
    next_action: string | null
    blocked_reason: string | null
    deliverable_url: string | null
    checklist: { id: string; title: string; done: boolean; client_visible?:boolean }[]
  }[]
  work_items: {
    id: string
    title: string
    body: string
    status: string
    priority: number
    due_date: string | null
    recipient_member_id: string
    sender_member_id: string
    evidence: string
    blocked_reason: string
    updated_at: string
  }[]
  coverage: {
    projects_read: boolean
    tasks_read: boolean
    work_read: boolean
    truncated: boolean
    errors: string[]
    as_of: string
  }
}

// The legacy inbox has no client_id. These relationships were checked against
// the original assignment and client project on20 Oct2026, not inferred from a title.
export const VERIFIED_ACCOUNT_WORK: Readonly<
  Record<string, readonly string[]>
> = {
  '6257d252-eb54-423e-b72b-fe5deb3e078a': [
    'b34b3726-1a83-4588-9c37-117e70f4bf4e'
  ],
  'a69fe8b1-14f5-4033-9cda-dc55d9e2726d': [
    '789cea83-2e54-4164-bb7e-2069bb29be5d',
    'c1aea108-d2ce-4a85-9d00-822c77f469cc',
    'aef7c86d-352c-4cbd-8b92-3098d9e1abb1',
    '7396a66b-da27-4c41-91ae-dfee5c31f041',
    '47d64e49-ee24-4ebb-8c87-27ce78d9f00b'
  ]
}

type Row = Record<string, unknown>
const text = (v: unknown) => (typeof v === 'string' ? v : '')
const nullable = (v: unknown) => (typeof v === 'string' && v ? v : null)
const unique = (rows: Row[]) =>
  Array.from(new Map(rows.map((row) => [row.id, row])).values())

export function projectExistingAccountWork(input: {
  accountId: string
  orgId: number
  projects: Row[]
  tasks: Row[]
  checklists: Row[]
  workItems: Row[]
  coverage: ExistingAccountWork['coverage']
}): ExistingAccountWork {
  const projects = unique(
    input.projects.filter(
      (row) =>
        row.organization_id === input.orgId && row.client_id === input.accountId
    )
  )
  const projectIds = new Set(projects.map((row) => row.id))
  const tasks = unique(
    input.tasks.filter(
      (row) =>
        row.organization_id === input.orgId && projectIds.has(row.project_id)
    )
  )
  const checkedWork = new Set(VERIFIED_ACCOUNT_WORK[input.accountId] ?? [])
  return {
    projects: projects.map((row) => ({
      id: text(row.id),
      title: text(row.title) || text(row.name),
      status: text(row.status),
      next_action: nullable(row.next_action),
      description: nullable(row.description)
    })),
    tasks: tasks.map((row) => ({
      id: text(row.id),
      project_id: text(row.project_id),
      title: text(row.title),
      status: text(row.status),
      due_date: nullable(row.due_date),
      assignee_member_id: nullable(row.assignee_member_id),
      priority: typeof row.priority==='number'?row.priority:null,
      validator_member_id: nullable(row.validator_member_id),
      client_dependency: nullable(row.client_dependency),
      client_dependency_owner: nullable(row.client_dependency_owner),
      client_dependency_impact: nullable(row.client_dependency_impact),
      description: nullable(row.description),
      acceptance: nullable(row.acceptance),
      next_action: nullable(row.next_action),
      blocked_reason: nullable(row.blocked_reason),
      deliverable_url: nullable(row.deliverable_url),
      checklist: unique(
        input.checklists.filter(
          (item) =>
            item.organization_id === input.orgId && item.task_id === row.id
        )
      ).map((item) => ({
        id: text(item.id),
        title: text(item.title),
        done: item.done === true,
        client_visible: item.client_visible === true
      }))
    })),
    work_items: unique(
      input.workItems.filter(
        (row) =>
          row.organization_id === input.orgId && checkedWork.has(text(row.id))
      )
    ).map((row) => ({
      id: text(row.id),
      title: text(row.title),
      body: text(row.body),
      status: text(row.status),
      priority: typeof row.priority === 'number' ? row.priority : 0,
      due_date: nullable(row.due_date),
      recipient_member_id: text(row.recipient_member_id),
      sender_member_id: text(row.sender_member_id),
      evidence: text(row.evidence),
      blocked_reason: text(row.blocked_reason),
      updated_at: text(row.updated_at)
    })),
    coverage: input.coverage
  }
}

export async function loadExistingAccountWork(
  db: SupabaseClient,
  orgId: number,
  accountId: string
): Promise<ExistingAccountWork> {
  const verifiedIds = [...(VERIFIED_ACCOUNT_WORK[accountId] ?? [])]
  const [projects, work] = await Promise.all([
    db
      .from('projects')
      .select(
        'id,organization_id,client_id,title,name,status,next_action,description',
        { count: 'exact' }
      )
      .eq('organization_id', orgId)
      .eq('client_id', accountId)
      .order('created_at')
      .limit(501),
    verifiedIds.length
      ? db
          .from('team_work_items')
          .select(
            'id,organization_id,title,body,status,priority,due_date,recipient_member_id,sender_member_id,evidence,blocked_reason,updated_at'
          )
          .eq('organization_id', orgId)
          .in('id', verifiedIds)
          .order('created_at')
      : Promise.resolve({ data: [], error: null })
  ])
  const projectIds = (projects.error ? [] : (projects.data ?? []))
    .slice(0, 500)
    .map((row) => row.id)
  const tasks = projectIds.length
    ? await db
        .from('tasks')
        .select(
          '*',
          { count: 'exact' }
        )
        .eq('organization_id', orgId)
        .in('project_id', projectIds)
        .order('created_at')
        .limit(2001)
    : { data: [], error: null, count: 0 }
  const taskIds = (tasks.error ? [] : (tasks.data ?? []))
    .slice(0, 2000)
    .map((row) => row.id)
  const checklistParts = []
  for (let offset = 0; offset < taskIds.length; offset += 100) {
    checklistParts.push(
      await db
        .from('task_checklist')
        .select('*', { count: 'exact' })
        .eq('organization_id', orgId)
        .in('task_id', taskIds.slice(offset, offset + 100))
        .order('created_at')
        .limit(4001)
    )
  }
  const errors = [
    ...(projects.error ? ['existing_projects'] : []),
    ...(tasks.error ? ['existing_tasks'] : []),
    ...(work.error ? ['existing_work_items'] : []),
    ...(checklistParts.some((part) => part.error)
      ? ['existing_checklists']
      : [])
  ]
  return projectExistingAccountWork({
    accountId,
    orgId,
    projects: projects.error ? [] : (projects.data ?? []).slice(0, 500),
    tasks: tasks.error ? [] : (tasks.data ?? []).slice(0, 2000),
    checklists: checklistParts.flatMap((part) =>
      part.error ? [] : (part.data ?? []).slice(0, 4000)
    ),
    workItems: work.error ? [] : (work.data ?? []),
    coverage: {
      projects_read: !projects.error,
      tasks_read:
        !projects.error &&
        !tasks.error &&
        !checklistParts.some((part) => part.error),
      work_read: !work.error,
      truncated:
        (projects.count ?? projects.data?.length ?? 0) >
          Math.min(500, projects.data?.length ?? 0) ||
        (tasks.count ?? tasks.data?.length ?? 0) >
          Math.min(2000, tasks.data?.length ?? 0) ||
        checklistParts.some(
          (part) =>
            (part.count ?? part.data?.length ?? 0) >
            Math.min(4000, part.data?.length ?? 0)
        ),
      errors,
      as_of: new Date().toISOString()
    }
  })
}
