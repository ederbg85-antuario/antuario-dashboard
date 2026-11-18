import test from 'node:test'
import assert from 'node:assert/strict'
import { metricaOperations, bridgeAuthorized, METRICA_CLIENT_ID, clientDeliveryArtifact } from '../lib/metrica-operations'

test('bridge rejects missing, partial, wrong and cross-client credentials', () => {
  for (const header of [null, '', 'Bearer ', 'Bearer wrong', 'Bearer correct-extra', 'Basic correct']) assert.equal(bridgeAuthorized('correct', header), false)
  assert.equal(bridgeAuthorized(undefined, 'Bearer correct'), false)
  assert.equal(bridgeAuthorized('correct', 'Bearer correct'), true)
})
test('deliverables keep source file indices, expose latest client version only and never internal notes or storage paths', () => {
  const result = metricaOperations({ projects: [{ id: 'p', organization_id: 1, client_id: METRICA_CLIENT_ID }], tasks: [{ id: 't', organization_id: 1, project_id: 'p' }], checklist: [], members: [], deliveries: [
    { id: 'old', organization_id: 1, task_id: 't', version: 1, artifacts: [{ kind: 'pdf', name: 'old.pdf' }] },
    { id: 'new', organization_id: 1, task_id: 't', version: 2, title: 'Entrega', artifacts: [{ kind: 'document', name: 'internal.md', text: 'SECRET' }, { kind: 'image', name: 'preview.jpg', path: 'SECRET', sha256: 'SECRET' }, { kind: 'pdf', name: 'proposal.pdf', path: 'SECRET' }, { kind: 'document', name: 'invoice.xml', text: 'SECRET' }] },
    { id: 'other', organization_id: 1, task_id: 'another-client', version: 9, artifacts: [{ kind: 'pdf', name: 'other.pdf' }] },
  ] })
  assert.equal(result.deliveries.length, 1); assert.equal(result.deliveries[0].id, 'new')
  assert.deepEqual(result.deliveries[0].artifacts.map(a => a.index), [1, 2, 3])
  assert.doesNotMatch(JSON.stringify(result), /SECRET|internal.md|other.pdf|old.pdf/)
  for (const url of ['http://metricabtl.com.mx', 'https://other-client.antuario.mx', 'https://metricabtl.com.mx.evil.test', 'https://user:password@metricabtl.com.mx']) assert.equal(clientDeliveryArtifact({ kind: 'link', name: 'Site', url }), false)
  assert.equal(clientDeliveryArtifact({ kind: 'link', name: 'Prototype', url: 'https://bancoazteca.antuario.mx' }), true)
})
test('client projection cannot leak other clients, organizations, notes or private artifacts', () => {
  const result = metricaOperations({
    projects: [{ id: 'p', organization_id: 1, client_id: METRICA_CLIENT_ID, title: 'Métrica' }, { id: 'acri', organization_id: 1, client_id: 'other', title: 'Acriland' }, { id: 'wrong-org', organization_id: 2, client_id: METRICA_CLIENT_ID }],
    tasks: [{ id: 't', organization_id: 1, project_id: 'p', title: 'Métrica task', description: 'SECRET', next_action: 'SECRET', acceptance: 'SECRET', status: 'review', assigned_to: 'u' }, { id: 'other', organization_id: 1, project_id: 'acri', title: 'Acriland' }, { id: 'other-org', organization_id: 2, project_id: 'p' }],
    checklist: [{ id: 'c', organization_id: 1, task_id: 't', title: 'SECRET', done: true }, { id: 'ok', organization_id: 1, task_id: 't', title: 'Publicado', client_visible: true, done: false }, { organization_id: 2, task_id: 't', done: true }],
    deliveries: [{ organization_id: 1, task_id: 't', version: 1, summary: 'SECRET', artifacts: ['SECRET'], status: 'approved' }, { organization_id: 1, task_id: 't', version: 2, status: 'review' }, { organization_id: 2, task_id: 't', version: 99 }],
    members: [{ organization_id: 1, user_id: 'u', name: 'Eder', kind: 'human', email: 'SECRET' }],
  })
  assert.equal(result.tasks.length, 1); assert.equal(result.projects.length, 1)
  assert.deepEqual(result.tasks[0].progress, { done: 1, total: 2 })
  assert.equal(result.tasks[0].checklist.length, 1)
  assert.equal(result.tasks[0].delivery?.version, 2)
  assert.equal(result.tasks[0].assignee?.name, 'Eder')
  assert.doesNotMatch(JSON.stringify(result), /SECRET|Acriland|other-org/)
})

test('monthly recap uses full original history, unique tasks and Mexico City dates', () => {
  const result = metricaOperations({ projects: [{ id: 'p', organization_id: 1, client_id: METRICA_CLIENT_ID }], tasks: [{ id: 't', organization_id: 1, project_id: 'p', status: 'done', completed_at: '2026-11-18T20:00:00Z' }], checklist: [], members: [], deliveries: [
    { id: 'oct', organization_id: 1, task_id: 't', version: 1, submitted_at: '2026-11-01T04:00:00Z' },
    { id: 'nov1', organization_id: 1, task_id: 't', version: 2, submitted_at: '2026-11-01T12:00:00Z' },
    { id: 'nov2', organization_id: 1, task_id: 't', version: 3, submitted_at: '2026-11-18T20:00:00Z' },
    { id: 'nov2', organization_id: 1, task_id: 't', version: 3, submitted_at: '2026-11-18T20:00:00Z' },
    { id: 'private', organization_id: 1, task_id: 'other-client', version: 9, submitted_at: '2026-11-18T20:00:00Z' },
  ] })
  assert.deepEqual(result.activity, [
    { month: '2026-10', submittedTaskIds: ['t'], versions: 1, completedTaskIds: [] },
    { month: '2026-11', submittedTaskIds: ['t'], versions: 2, completedTaskIds: ['t'] },
  ])
})
