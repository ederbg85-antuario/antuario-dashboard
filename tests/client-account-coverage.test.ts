import assert from 'node:assert/strict'
import { test } from 'node:test'
import { accountFinanceIsPartial } from '../components/accounts/account-scope'
import { getDemoAccount } from '../lib/client-accounts-fixtures'
import type { AccountBundle } from '../lib/client-accounts-types'

type Coverage = NonNullable<AccountBundle['finance_coverage']>

const base = getDemoAccount('metrica')!
const fullCoverage: Coverage = {
  legacy_read: true,
  new_ledger_read: true,
  legacy_documents: 4,
  confirmed_entries: 3,
  truncated: false,
  as_of: '2026-10-20T18:00:00.000Z',
  errors: [],
}

function bundle(
  coverage: Partial<Coverage> = {},
  schemaReady = true
): AccountBundle {
  return {
    ...base,
    schema_ready: schemaReady,
    data_mode: 'live',
    finance_coverage: { ...fullCoverage, ...coverage },
  }
}

test('complete legacy and new-ledger reads do not show a partial-finance warning', () => {
  assert.equal(accountFinanceIsPartial(bundle()), false)
  assert.equal(
    accountFinanceIsPartial(
      bundle({ legacy_documents: 0, confirmed_entries: 0 })
    ),
    false,
    'a successful empty source is distinct from an unavailable source'
  )
})

test('complete legacy data stays complete while the new-ledger migration is pending', () => {
  assert.equal(
    accountFinanceIsPartial(bundle({ new_ledger_read: false }, false)),
    false
  )
})

test('truncation warns even when both source reads returned financial records', () => {
  assert.equal(accountFinanceIsPartial(bundle({ truncated: true })), true)
})

test('a source error marks returned financial data as partial', () => {
  assert.equal(
    accountFinanceIsPartial(
      bundle({ errors: ['legacy_finance_entries: read failed'] })
    ),
    true
  )
  assert.equal(
    accountFinanceIsPartial(
      bundle(
        { new_ledger_read: false, errors: ['legacy_finance_documents: read failed'] },
        false
      )
    ),
    true,
    'a pending migration must not conceal a failure of an existing source'
  )
})

test('an existing new ledger that cannot be read makes coverage partial', () => {
  assert.equal(
    accountFinanceIsPartial(bundle({ new_ledger_read: false })),
    true
  )
})

test('a legacy permission denial remains unknown instead of a successful empty source', () => {
  const denied = bundle(
    {
      legacy_read: false,
      new_ledger_read: false,
      legacy_documents: 0,
      confirmed_entries: 0,
    },
    false
  )
  assert.equal(accountFinanceIsPartial(denied), true)
  assert.equal(
    accountFinanceIsPartial({
      ...denied,
      schema_ready: true,
      finance_coverage: { ...denied.finance_coverage!, new_ledger_read: true },
    }),
    true,
    'new-ledger access does not establish access to the legacy financial history'
  )
})
