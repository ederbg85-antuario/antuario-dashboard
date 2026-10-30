import type { AccountBundle, AccountProfile } from '@/lib/client-accounts-types'
/** Contracted services define the interface. Acriland has no paid-ads contract. */
export function accountHasPaidAds(
  account: AccountProfile,
  bundle?: AccountBundle | null,
  observedGoogleAdsSnapshots = false
) {
  const name = account.name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  if (
    account.id === 'a69fe8b1-14f5-4033-9cda-dc55d9e2726d' ||
    account.id === '22222222-2222-4222-8222-222222222222' ||
    name.includes('acriland')
  )
    return false
  return (
    account.services.some((service) => /google\s*ads/i.test(service)) ||
    !!bundle?.campaigns.length ||
    observedGoogleAdsSnapshots ||
    !!bundle?.snapshots.some((snapshot) => snapshot.source === 'google_ads')
  )
}
/** A not-yet-created ledger is not a failed read. Existing-source failures and truncation are partial. */
export function accountFinanceIsPartial(bundle: AccountBundle) {
  const coverage = bundle.finance_coverage
  return (
    !!coverage &&
    (!coverage.legacy_read ||
      coverage.truncated ||
      coverage.errors.length > 0 ||
      (bundle.schema_ready && !coverage.new_ledger_read))
  )
}
