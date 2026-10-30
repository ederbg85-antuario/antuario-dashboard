import test from 'node:test'
import assert from 'node:assert/strict'
import type { SupabaseClient } from '@supabase/supabase-js'
import { readPagedAccountRecords } from '../lib/client-accounts-access'

const rows = (count: number, start = 0) =>
  Array.from({ length: count }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(start + i).padStart(12, '0')}`,
    created_at: '2026-10-20T00:00:00.000000+00:00',
    kind: 'snapshots',
    data: {}
  }))
function client(
  pages: {
    data: ReturnType<typeof rows>
    count: number | null
    error: { code: string; message: string } | null
  }[]
) {
  let page = 0
  const filters: { key: string; value: unknown }[] = [],
    cursors: string[] = []
  const db = {
    from(table: string) {
      assert.equal(table, 'client_account_records')
      const query = {
        select() {
          return query
        },
        eq(key: string, value: unknown) {
          filters.push({ key, value })
          return query
        },
        order() {
          return query
        },
        limit() {
          return query
        },
        or(value: string) {
          cursors.push(value)
          return query
        },
        then(resolve: (value: (typeof pages)[number]) => unknown) {
          return Promise.resolve(pages[page++]).then(resolve)
        }
      }
      return query
    }
  } as unknown as SupabaseClient
  return { db, filters, cursors }
}

test('records paginate beyond the project cap without dropping rows that share a timestamp', async () => {
  const source = rows(1973),
    mock = client([
      { data: source.slice(0, 1000), count: 1973, error: null },
      { data: source.slice(1000), count: 973, error: null }
    ])
  const result = await readPagedAccountRecords(mock.db, 1, 'exact-account')
  assert.equal(result.data.length, 1973)
  assert.equal(result.count, 1973)
  assert.equal(result.truncated, false)
  assert.equal(result.error, null)
  assert.ok(mock.cursors[0].includes('id.gt.' + source[999].id))
  assert.equal(
    mock.filters.filter((v) => v.key === 'organization_id' && v.value === 1)
      .length,
    2
  )
  assert.equal(
    mock.filters.filter(
      (v) => v.key === 'account_id' && v.value === 'exact-account'
    ).length,
    2
  )
})

test('a lower cap is discovered from exact count instead of silently presenting a partial history', async () => {
  const source = rows(1200),
    mock = client([
      { data: source.slice(0, 500), count: 1200, error: null },
      { data: source.slice(500, 1000), count: 700, error: null },
      { data: source.slice(1000), count: 200, error: null }
    ])
  const result = await readPagedAccountRecords(mock.db, 1, 'account')
  assert.equal(result.data.length, 1200)
  assert.equal(result.truncated, false)
  assert.equal(mock.cursors.length, 2)
})

test('a failing later page retains a clear error and partial flag rather than claiming a complete dataset', async () => {
  const mock = client([
    { data: rows(1000), count: 1500, error: null },
    { data: [], count: null, error: { code: '42501', message: 'Denied' } }
  ])
  const result = await readPagedAccountRecords(mock.db, 1, 'account')
  assert.equal(result.error?.code, '42501')
  assert.equal(result.data.length, 1000)
  assert.equal(result.truncated, true)
})

test('bounded pagination reports the ten-thousand row ceiling explicitly', async () => {
  const mock = client(
    Array.from({ length: 10 }, (_, page) => ({
      data: rows(1000, page * 1000),
      count: 12000 - page * 1000,
      error: null
    }))
  )
  const result = await readPagedAccountRecords(mock.db, 1, 'account')
  assert.equal(result.data.length, 10000)
  assert.equal(result.count, 12000)
  assert.equal(result.truncated, true)
})
