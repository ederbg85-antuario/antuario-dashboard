import { timingSafeEqual } from 'node:crypto'

export const METRICA_CLIENT_ID = '6257d252-eb54-423e-b72b-fe5deb3e078a'
export const METRICA_ORG_ID = 1
type Row = Record<string, unknown>
const text = (v: unknown) => typeof v === 'string' ? v : null

export function bridgeAuthorized(secret: string | undefined, header: string | null) {
  if (!secret || !header?.startsWith('Bearer ')) return false
  const expected = Buffer.from(secret), provided = Buffer.from(header.slice(7))
  return expected.length === provided.length && timingSafeEqual(expected, provided)
}

/** Deliberate client projection. Never spread database records into a response. */
export function metricaOperations(input: { projects: Row[]; tasks: Row[]; checklist: Row[]; deliveries: Row[]; members: Row[] }, asOf = new Date().toISOString()) {
  const projects = input.projects.filter(p => p.organization_id === METRICA_ORG_ID && p.client_id === METRICA_CLIENT_ID)
  const projectIds = new Set(projects.map(p => p.id))
  const tasks = input.tasks.filter(t => t.organization_id === METRICA_ORG_ID && projectIds.has(t.project_id))
  const members = input.members.filter(m => m.organization_id === METRICA_ORG_ID)
  return {
    source: 'Antuario' as const, clientId: METRICA_CLIENT_ID, asOf,
    projects: projects.map(p => ({ id: text(p.id), title: text(p.title) || text(p.name) || 'Proyecto', status: text(p.status) })),
    tasks: tasks.map(t => {
      const checklist = input.checklist.filter(c => c.organization_id === METRICA_ORG_ID && c.task_id === t.id)
      const deliveries = input.deliveries.filter(d => d.organization_id === METRICA_ORG_ID && d.task_id === t.id)
        .sort((a, b) => Number(b.version) - Number(a.version))
      const member = members.find(m => t.assignee_member_id ? m.id === t.assignee_member_id : t.assigned_to && m.user_id === t.assigned_to)
      const latest = deliveries[0]
      return {
        id: text(t.id), projectId: text(t.project_id), title: text(t.title) || 'Tarea', status: text(t.status) || 'todo',
        priority: typeof t.priority === 'number' ? t.priority : null,
        dueDate: text(t.due_date), dateKind: text(t.due_date_kind), updatedAt: text(t.updated_at), completedAt: text(t.completed_at),
        assignee: member ? { name: text(member.name), kind: text(member.kind) } : null,
        progress: { done: checklist.filter(c => c.done === true).length, total: checklist.length },
        checklist: checklist.filter(c => c.client_visible === true).map(c => ({ id: text(c.id), title: text(c.title), done: c.done === true })),
        delivery: latest ? { version: Number(latest.version), status: text(latest.status), submittedAt: text(latest.submitted_at) } : null,
      }
    }),
  }
}
