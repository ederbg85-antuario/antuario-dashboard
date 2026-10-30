import { test } from 'node:test'
import assert from 'node:assert/strict'
import { accountHasPaidAds } from '../components/accounts/account-scope'
import { getDemoAccount } from '../lib/client-accounts-fixtures'

test('Acriland never gains paid-ad UI from a misclassified service or snapshot', () => {
  const bundle = getDemoAccount('metrica')!
  const account = { ...bundle.account, id: 'a69fe8b1-14f5-4033-9cda-dc55d9e2726d', name: 'Cliente renombrado' }
  assert.equal(accountHasPaidAds(account, bundle), false)
  assert.equal(accountHasPaidAds({ ...account, id: 'other', name: 'ACRILAND · Taller' }, bundle), false)
})

test('Organic operation does not show campaigns, while a contracted Google Ads account can', () => {
  const organic = getDemoAccount('acriland')!
  const paid = getDemoAccount('metrica')!
  assert.equal(accountHasPaidAds(organic.account, organic), false)
  assert.equal(accountHasPaidAds(paid.account, paid), true)
})
