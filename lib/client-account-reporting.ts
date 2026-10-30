import {
  mexicoAccountDate,
  resolveAccountsRange,
  validAccountDate,
  type AccountsRange,
} from './client-accounts-metrics'
import type {
  AccountBundle,
  AccountSnapshot,
  AccountSource,
} from './client-accounts-types'

const monthFirst = (value: string) => `${value.slice(0, 7)}-01`
function monthLast(value: string) {
  const [year, month] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
}
function previousMonth(value: string) {
  const [year, month] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 10)
}
function asOf(bundle: AccountBundle) {
  return mexicoAccountDate(new Date(bundle.server_time))
}
function observations(bundle: AccountBundle, source?: AccountSource) {
  const cutoff = asOf(bundle)
  return bundle.snapshots.filter(
    (row) =>
      row.is_example === (bundle.data_mode === 'example') &&
      row.source !== 'manual' &&
      (!source || row.source === source) &&
      row.metric !== 'balance' &&
      Number.isFinite(row.value) &&
      validAccountDate(row.date) &&
      validAccountDate(row.period_to) &&
      row.date <= row.period_to &&
      row.period_to <= cutoff
  )
}
function completeCalendarMonth(row: AccountSnapshot) {
  return (
    row.grain === 'period' &&
    row.date === monthFirst(row.date) &&
    row.period_to === monthLast(row.date)
  )
}
function reportingRange(month: string, cutoff: string): AccountsRange {
  const from = monthFirst(month)
  const previousFrom = previousMonth(from)
  const to = monthLast(from)
  if (to > cutoff) {
    const current = resolveAccountsRange('month', cutoff)
    return { ...current, preset: 'custom', label: `Medición · ${monthLabel(from)}` }
  }
  return {
    from,
    to,
    previousFrom,
    previousTo: monthLast(previousFrom),
    preset: 'custom',
    label: `Informe · ${monthLabel(from)}`,
  }
}
function monthLabel(first: string) {
  return new Intl.DateTimeFormat('es-MX', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${first}T00:00:00Z`))
}

/**
 * A real calendar-month total or a month containing actual daily observations.
 * A daily-only source stops at its last observed date. Missing days inside that
 * window remain gaps; a complete period total keeps its complete calendar month.
 */
export function latestMarketingRange(
  bundle: AccountBundle,
  source?: AccountSource
): AccountsRange | null {
  const candidates = observations(bundle, source)
    .filter(
      (row) =>
        completeCalendarMonth(row) ||
        (row.grain === 'daily' && row.date === row.period_to)
    )
  const months = candidates.map((row) => monthFirst(row.date)).sort()
  const latest = months.at(-1)
  if (!latest) return null
  const latestRows = candidates.filter((row) => monthFirst(row.date) === latest)
  if (latestRows.some(completeCalendarMonth))
    return reportingRange(latest, asOf(bundle))

  const to = latestRows.map((row) => row.date).sort().at(-1)!
  const previousFrom = previousMonth(latest)
  const previousLast = monthLast(previousFrom)
  const previousTo = `${previousFrom.slice(0, 8)}${String(
    Math.min(Number(to.slice(8)), Number(previousLast.slice(8)))
  ).padStart(2, '0')}`
  const observedSource =
    source ??
    (latestRows.every((row) => row.source === latestRows[0].source)
      ? latestRows[0].source
      : undefined)
  const label =
    observedSource === 'search_console'
      ? 'Fuente SEO'
      : observedSource === 'ga4'
        ? 'Fuente GA4'
        : observedSource === 'google_ads'
          ? 'Fuente Ads'
          : 'Fuente marketing'
  return {
    from: latest,
    to,
    previousFrom,
    previousTo,
    preset: 'custom',
    label: `${label} · 1–${Number(to.slice(8))} ${monthLabel(latest).replace(' de ', ' ')}`,
  }
}

/** Keep the workshop operation current; a consolidated marketing report keeps its own dates. */
export function defaultAccountRange(bundle: AccountBundle): AccountsRange {
  const cutoff = asOf(bundle)
  const current = resolveAccountsRange('month', cutoff)
  const normalized = bundle.account.name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  if (
    bundle.account.id === 'a69fe8b1-14f5-4033-9cda-dc55d9e2726d' ||
    bundle.account.id === '22222222-2222-4222-8222-222222222222' ||
    normalized.includes('acriland')
  )
    return current

  const actual = observations(bundle)
  if (actual.some((row) => row.date >= current.from)) return current

  const reports = actual
    .filter(
      (row) =>
        row.source === 'ga4' &&
        row.metric === 'sessions' &&
        !row.channel &&
        !row.campaign_id &&
        completeCalendarMonth(row)
    )
    .map((row) => row.date)
    .sort()
  const latestReport = reports.at(-1)
  return latestReport
    ? reportingRange(latestReport, cutoff)
    : (latestMarketingRange(bundle) ?? current)
}
