import test from 'node:test'
import assert from 'node:assert/strict'
import {
  acrilandOperations,
  isAcrilandAccount
} from '../lib/client-account-focus'
import { getDemoAccount } from '../lib/client-accounts-fixtures'
import type { AccountSnapshot } from '../lib/client-accounts-types'

function bundle() {
  const example = getDemoAccount('acriland')!
  return {
    ...example,
    account: {
      ...example.account,
      id: 'a69fe8b1-14f5-4033-9cda-dc55d9e2726d',
      name: 'Acriland',
      is_example: false
    },
    snapshots: [] as AccountSnapshot[]
  }
}
function observation(
  metric: string,
  value: number,
  overrides: Partial<AccountSnapshot> = {}
): AccountSnapshot {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    account_id: 'a69fe8b1-14f5-4033-9cda-dc55d9e2726d',
    organization_id: 1,
    source_key: 'focus-' + metric,
    created_by: 'test',
    created_at: '2026-10-21T05:11:43Z',
    updated_at: '2026-10-21T05:11:43Z',
    is_example: false,
    metric,
    value,
    date: '2026-10-20',
    period_to: '2026-10-20',
    source: 'manual',
    unit: 'count',
    grain: 'period',
    channel: null,
    campaign_id: null,
    evidence:
      'Supabase · lectura SQL 2026-10-20T23:11:43.253026-06:00 · read-only',
    ...overrides
  }
}
test('Acriland identity survives a display-name change; other customers are excluded', () => {
  assert.equal(
    isAcrilandAccount({
      id: 'a69fe8b1-14f5-4033-9cda-dc55d9e2726d',
      name: 'Cuenta renombrada'
    }),
    true
  )
  assert.equal(isAcrilandAccount({ id: 'other', name: 'ACRILAND' }), true)
  const data = bundle()
  data.account.id = 'other'
  data.account.name = 'Métrica BTL'
  data.snapshots = [observation('support_open', 5)]
  assert.equal(acrilandOperations(data), null)
})
test('missing measurements are not converted into zero', () => {
  const data = bundle()
  assert.equal(acrilandOperations(data), null)
  data.snapshots = [observation('support_open', 5)]
  const result = acrilandOperations(data)!
  assert.equal(result.value('support_open'), 5)
  assert.equal(result.value('inventory_items'), null)
  assert.equal(result.workshopComplete, false)
})
test('latest point-in-time observation is selected instead of summed', () => {
  const data = bundle()
  data.snapshots = [
    observation('support_open', 9, { period_to: '2026-10-19' }),
    observation('support_open', 5)
  ]
  const original = structuredClone(data)
  assert.equal(acrilandOperations(data)!.value('support_open'), 5)
  assert.deepEqual(data, original)
})
test('authentic zero is retained while examples, negative and noninteger counts are rejected', () => {
  const data = bundle()
  data.snapshots = [
    observation('support_open', 0),
    observation('inventory_items', 55, { is_example: true }),
    observation('inventory_negative', -1),
    observation('inventory_below_min', 1.5)
  ]
  const result = acrilandOperations(data)!
  assert.equal(result.value('support_open'), 0)
  assert.equal(result.value('inventory_items'), null)
  assert.equal(result.value('inventory_negative'), null)
  assert.equal(result.value('inventory_below_min'), null)
  data.account.is_example = true
  assert.equal(acrilandOperations(data), null)
})
test('workshop distribution requires the same complete population and cutoff', () => {
  const data = bundle()
  data.snapshots = [
    observation('workshop_total', 49),
    observation('workshop_delivered', 43),
    observation('workshop_ready', 5),
    observation('workshop_scheduled', 1)
  ]
  assert.equal(acrilandOperations(data)!.workshopComplete, true)
  data.snapshots[0].value = 50
  assert.equal(acrilandOperations(data)!.workshopComplete, false)
  data.snapshots[0].value = 49
  data.snapshots[1].evidence =
    'Supabase · lectura SQL 2026-10-20T22:11:43.253026-06:00'
  assert.equal(acrilandOperations(data)!.workshopComplete, false)
})
test('capture and action interval stay attributable to their original snapshot', () => {
  const data = bundle()
  data.snapshots = [
    observation('products_total', 55),
    observation('jaime_actions_executed_7d', 2256, { date: '2026-10-13' })
  ]
  const result = acrilandOperations(data)!
  assert.equal(result.asOf, '2026-10-20T23:11:43.253026-06:00')
  assert.deepEqual(result.actionWindow, {
    from: '2026-10-13',
    to: '2026-10-20'
  })
})
