import test from 'node:test'
import assert from 'node:assert/strict'
import {
  projectExistingAccountWork,
  VERIFIED_ACCOUNT_WORK
} from '../lib/client-accounts-existing-work'

const accountId = 'a69fe8b1-14f5-4033-9cda-dc55d9e2726d'
const base = {
  accountId,
  orgId: 1,
  projects: [
    {
      id: 'p1',
      organization_id: 1,
      client_id: accountId,
      title: 'Acriland',
      status: 'active'
    }
  ],
  tasks: [],
  checklists: [],
  workItems: [],
  coverage: {
    projects_read: true,
    tasks_read: true,
    work_read: true,
    truncated: false,
    errors: [],
    as_of: '2026-10-20T00:00:00Z'
  }
}

test('original tasks remain scoped to the exact client and organization, with original checklist IDs', () => {
  const projected = projectExistingAccountWork({
    ...base,
    projects: [
      ...base.projects,
      { id: 'foreign', organization_id: 1, client_id: 'other' }
    ],
    tasks: [
      {
        id: 't1',
        organization_id: 1,
        project_id: 'p1',
        title: 'Real task',
        status: 'todo'
      },
      {
        id: 't2',
        organization_id: 1,
        project_id: 'foreign',
        title: 'Not this client'
      },
      {
        id: 't3',
        organization_id: 2,
        project_id: 'p1',
        title: 'Not this organization'
      }
    ],
    checklists: [
      {
        id: 'c1',
        organization_id: 1,
        task_id: 't1',
        title: 'Original',
        done: true
      },
      {
        id: 'c2',
        organization_id: 2,
        task_id: 't1',
        title: 'Foreign',
        done: true
      },
      {
        id: 'c3',
        organization_id: 1,
        task_id: 't2',
        title: 'Wrong client',
        done: true
      }
    ]
  })
  assert.equal(projected.projects.length, 1)
  assert.equal(projected.tasks.length, 1)
  assert.equal(projected.tasks[0].id, 't1')
  assert.equal(projected.tasks[0].status, 'todo')
  assert.deepEqual(projected.tasks[0].checklist, [
    { id: 'c1', title: 'Original', done: true, client_visible:false }
  ])
})

test('unlinked inbox title mentions cannot inject another client assignment', () => {
  const id = VERIFIED_ACCOUNT_WORK[accountId][0]
  const projected = projectExistingAccountWork({
    ...base,
    workItems: [
      { id, organization_id: 1, title: 'Verified', status: 'pending' },
      {
        id: VERIFIED_ACCOUNT_WORK['6257d252-eb54-423e-b72b-fe5deb3e078a'][0],
        organization_id: 1,
        title: 'Acriland fake mention'
      },
      {
        id: 'unverified',
        organization_id: 1,
        title: 'Acriland real-looking title'
      },
      { id, organization_id: 2, title: 'Foreign organization' }
    ]
  })
  assert.equal(projected.work_items.length, 1)
  assert.equal(projected.work_items[0].id, id)
  assert.equal(projected.work_items[0].status, 'pending')
  assert.equal(projected.work_items[0].evidence, '')
})

test('duplicates preserve original identity without manufacturing completion, dates or evidence', () => {
  const row = {
    id: 't1',
    organization_id: 1,
    project_id: 'p1',
    title: 'Pending work',
    status: 'todo'
  }
  const projected = projectExistingAccountWork({
    ...base,
    tasks: [row, row],
    coverage: {
      ...base.coverage,
      errors: ['existing_work_items'],
      work_read: false
    }
  })
  assert.equal(projected.tasks.length, 1)
  assert.equal(projected.tasks[0].due_date, null)
  assert.equal(projected.tasks[0].deliverable_url, null)
  assert.equal(projected.tasks[0].assignee_member_id, null)
  assert.equal(projected.coverage.work_read, false)
  assert.deepEqual(projected.coverage.errors, ['existing_work_items'])
})
