import test from 'node:test'
import assert from 'node:assert/strict'
import { metricaOperations, bridgeAuthorized, METRICA_CLIENT_ID } from '../lib/metrica-operations'

test('bridge rejects missing, partial, wrong and cross-client credentials', () => {
  for (const header of [null, '', 'Bearer ', 'Bearer wrong', 'Bearer correct-extra', 'Basic correct']) assert.equal(bridgeAuthorized('correct', header), false)
  assert.equal(bridgeAuthorized(undefined, 'Bearer correct'), false)
  assert.equal(bridgeAuthorized('correct', 'Bearer correct'), true)
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
