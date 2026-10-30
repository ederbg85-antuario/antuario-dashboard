import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  defaultAccountRange,
  latestMarketingRange,
} from '../lib/client-account-reporting'
import { getDemoAccount } from '../lib/client-accounts-fixtures'
import { accountMetrics } from '../lib/client-accounts-metrics'
import type { AccountBundle, AccountSnapshot } from '../lib/client-accounts-types'

function empty(): AccountBundle {
  const example = getDemoAccount('metrica')!
  return {
    ...example,
    account: { ...example.account, is_example: false },
    data_mode: 'live',
    snapshots: [],
    server_time: '2026-10-20T18:00:00Z',
  }
}
function snapshot(
  date: string,
  periodTo: string,
  extra: Partial<AccountSnapshot> = {}
): AccountSnapshot {
  return {
    id: `${date}:${periodTo}`,
    account_id: 'unit-account',
    organization_id: 1,
    source_key: `unit-report:${date}:${periodTo}`,
    created_by: 'unit-importer',
    created_at: '2026-10-20T18:00:00Z',
    updated_at: '2026-10-20T18:00:00Z',
    is_example: false,
    date,
    period_to: periodTo,
    source: 'ga4',
    metric: 'sessions',
    value: 343,
    unit: 'count',
    grain: 'period',
    channel: null,
    campaign_id: null,
    evidence: 'Unit test only; no business measurement.',
    ...extra,
  }
}

test('the latest complete GA4 report compares full calendar months, not equal-length trailing days', () => {
  const bundle = empty()
  bundle.snapshots = [
    snapshot('2026-08-01', '2026-08-31', { value: 420 }),
    snapshot('2026-09-01', '2026-09-30'),
    snapshot('2026-07-01', '2026-09-30', { value: 1257 }),
  ]
  const before = structuredClone(bundle)
  const range = defaultAccountRange(bundle)
  assert.deepEqual(range, {
    from: '2026-09-01',
    to: '2026-09-30',
    previousFrom: '2026-08-01',
    previousTo: '2026-08-31',
    preset: 'custom',
    label: 'Informe · septiembre de 2026',
  })
  const analysis = accountMetrics(bundle, range)
  assert.equal(analysis.byKey.sessions.value, 343)
  assert.equal(analysis.byKey.sessions.previous, 420)
  assert.deepEqual(bundle, before)
})

test('actual current-month measurement takes priority, including a genuinely observed zero', () => {
  const bundle = empty()
  bundle.snapshots = [
    snapshot('2026-09-01', '2026-09-30'),
    snapshot('2026-10-19', '2026-10-19', {
      source: 'search_console',
      metric: 'clicks',
      grain: 'daily',
      value: 0,
    }),
  ]
  const range = defaultAccountRange(bundle)
  assert.equal(range.from, '2026-10-01')
  assert.equal(range.to, '2026-10-20')
  assert.equal(range.previousTo, '2026-09-20')
  assert.equal(range.preset, 'month')
})

test('Acriland operation stays in the current month despite older SEO data', () => {
  const bundle = empty()
  bundle.account.id = 'a69fe8b1-14f5-4033-9cda-dc55d9e2726d'
  bundle.snapshots = [snapshot('2026-09-01', '2026-09-30')]
  assert.equal(defaultAccountRange(bundle).from, '2026-10-01')
  assert.equal(defaultAccountRange(bundle).to, '2026-10-20')
})

test('SEO can open its authentic daily-source month while daily gaps remain unavailable', () => {
  const bundle = empty()
  bundle.snapshots = [
    snapshot('2026-09-01', '2026-09-30'),
    snapshot('2026-07-29', '2026-07-29', {
      source: 'search_console',
      metric: 'clicks',
      grain: 'daily',
      value: 7,
    }),
  ]
  const range = latestMarketingRange(bundle, 'search_console')!
  assert.equal(range.from, '2026-07-01')
  assert.equal(range.to, '2026-07-29')
  assert.equal(range.previousFrom, '2026-06-01')
  assert.equal(range.previousTo, '2026-06-29')
  const clicks = accountMetrics(bundle, range).byKey.seoClicks
  assert.equal(clicks.coverageDays, 1)
  assert.equal(clicks.complete, false)
  assert.equal(clicks.series[0].value, null)
  assert.equal(clicks.series[28].value, 7)
})

test('a historical SEO export ending July 27 compares the same elapsed June days, unless a complete monthly total exists', () => {
  const bundle = empty()
  bundle.account.id = 'a69fe8b1-14f5-4033-9cda-dc55d9e2726d'
  for (const month of ['06', '07']) {
    for (let day = 1; day <= 27; day++) {
      const date = `2026-${month}-${String(day).padStart(2, '0')}`
      bundle.snapshots.push(snapshot(date, date, {
        source: 'search_console',
        metric: 'clicks',
        grain: 'daily',
        value: month === '07' ? 1 : 2,
      }))
    }
  }
  const range = latestMarketingRange(bundle, 'search_console')!
  assert.deepEqual(range, {
    from: '2026-07-01',
    to: '2026-07-27',
    previousFrom: '2026-06-01',
    previousTo: '2026-06-27',
    preset: 'custom',
    label: 'Fuente SEO · 1–27 julio 2026',
  })
  const clicks = accountMetrics(bundle, range).byKey.seoClicks
  assert.equal(clicks.value, 27)
  assert.equal(clicks.previous, 54)
  assert.equal(clicks.complete, true)
  assert.equal(clicks.series.length, 27)
  assert.equal(defaultAccountRange(bundle).from, '2026-10-01')
  bundle.snapshots.push(snapshot('2026-07-01', '2026-07-31', {
    source: 'search_console', metric: 'clicks', value: 31,
  }))
  const completeRange = latestMarketingRange(bundle, 'search_console')!
  assert.equal(completeRange.to, '2026-07-31')
  assert.equal(completeRange.previousTo, '2026-06-30')
})

test('quarter totals, future data, manual operations, balances and foreign example rows do not invent a report month', () => {
  const bundle = empty()
  bundle.snapshots = [
    snapshot('2026-07-01', '2026-09-30'),
    snapshot('2026-10-01', '2026-10-31'),
    snapshot('2026-10-19', '2026-10-19', { source: 'manual', grain: 'daily' }),
    snapshot('2026-10-19', '2026-10-19', { source: 'google_ads', metric: 'balance', grain: 'daily', unit: 'MXN' }),
    snapshot('2026-09-01', '2026-09-30', { is_example: true }),
  ]
  assert.equal(latestMarketingRange(bundle), null)
  assert.equal(defaultAccountRange(bundle).preset, 'month')
  assert.equal(defaultAccountRange(bundle).from, '2026-10-01')
})

test('calendar comparison handles January year rollover and leap-year February', () => {
  const bundle = empty()
  bundle.server_time = '2024-03-20T18:00:00Z'
  bundle.snapshots = [snapshot('2024-02-01', '2024-02-29')]
  let range = defaultAccountRange(bundle)
  assert.equal(range.to, '2024-02-29')
  assert.equal(range.previousFrom, '2024-01-01')
  assert.equal(range.previousTo, '2024-01-31')
  bundle.server_time = '2026-02-20T18:00:00Z'
  bundle.snapshots = [snapshot('2026-01-01', '2026-01-31')]
  range = defaultAccountRange(bundle)
  assert.equal(range.previousFrom, '2025-12-01')
  assert.equal(range.previousTo, '2025-12-31')
})

test('a channel subtotal cannot replace an available account-total report', () => {
  const bundle = empty()
  bundle.snapshots = [
    snapshot('2026-08-01', '2026-08-31'),
    snapshot('2026-09-01', '2026-09-30', { channel: 'organic' }),
  ]
  assert.equal(defaultAccountRange(bundle).from, '2026-08-01')
})
