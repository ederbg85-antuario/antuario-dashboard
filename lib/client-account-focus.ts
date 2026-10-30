import type {
  AccountBundle,
  AccountProfile,
  AccountSnapshot
} from './client-accounts-types'

const ACRILAND_ID = 'a69fe8b1-14f5-4033-9cda-dc55d9e2726d'
export const ACRILAND_OPERATION_METRICS = [
  'products_total',
  'products_published',
  'catalog_variants',
  'catalog_sector_assigned',
  'catalog_published_unclassified',
  'inventory_items',
  'inventory_negative',
  'inventory_below_min',
  'workshop_total',
  'workshop_delivered',
  'workshop_ready',
  'workshop_scheduled',
  'workshop_open',
  'workshop_past_due',
  'workshop_unassigned',
  'orders_total',
  'orders_delivered',
  'orders_ready',
  'orders_confirmed',
  'orders_cancelled',
  'support_open',
  'jaime_actions_executed_7d',
  'jaime_actions_blocked_7d',
  'jaime_actions_pending_7d',
  'tocho_failed_7d'
] as const
export type AcrilandOperationMetric =
  (typeof ACRILAND_OPERATION_METRICS)[number]
const snapshotCapture = (row: AccountSnapshot | null) =>
  row?.evidence.match(
    /lectura SQL\s+(\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2}))/i
  )?.[1] ??
  row?.period_to ??
  null

export function isAcrilandAccount(
  account: Pick<AccountProfile, 'id' | 'name'>
) {
  return (
    account.id === ACRILAND_ID ||
    account.name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .includes('acriland')
  )
}

/** A stock/operational snapshot is a point-in-time observation, never an additive flow. */
export function acrilandOperations(bundle: AccountBundle) {
  if (!isAcrilandAccount(bundle.account) || bundle.account.is_example)
    return null
  const candidates = bundle.snapshots.filter(
    (row) =>
      row.source === 'manual' &&
      !row.is_example &&
      row.unit === 'count' &&
      Number.isSafeInteger(row.value) &&
      row.value >= 0
  )
  const records = Object.fromEntries(
    ACRILAND_OPERATION_METRICS.map((metric) => {
      const rows = candidates
        .filter((row) => row.metric === metric)
        .sort(
          (a, b) =>
            b.period_to.localeCompare(a.period_to) ||
            (Date.parse(b.updated_at) || 0) - (Date.parse(a.updated_at) || 0)
        )
      return [metric, rows[0] ?? null]
    })
  ) as Record<AcrilandOperationMetric, AccountSnapshot | null>
  if (!Object.values(records).some(Boolean)) return null
  const value = (metric: AcrilandOperationMetric) =>
    records[metric]?.value ?? null
  const states = [
    {
      key: 'delivered',
      label: 'Entregados',
      metric: 'workshop_delivered',
      color: 'var(--account-lilac)'
    },
    {
      key: 'ready',
      label: 'Listos para entregar',
      metric: 'workshop_ready',
      color: 'var(--account-mint)'
    },
    {
      key: 'scheduled',
      label: 'Recolección programada',
      metric: 'workshop_scheduled',
      color: 'var(--account-peach)'
    }
  ] as const
  const workshop = states.map((row) => ({ ...row, value: value(row.metric) }))
  const workshopComplete =
    workshop.every((row) => row.value != null) &&
    value('workshop_total') != null &&
    workshop.reduce((sum, row) => sum + (row.value ?? 0), 0) ===
      value('workshop_total') &&
    new Set(
      ['workshop_total', ...states.map((row) => row.metric)].map((metric) =>
        snapshotCapture(records[metric as AcrilandOperationMetric])
      )
    ).size === 1
  const observedDates = [
    ...new Set(
      Object.values(records)
        .filter((row): row is AccountSnapshot => row != null)
        .map((row) => row.period_to)
    )
  ].sort()
  const pointRecord =
    records.products_total ??
    records.inventory_items ??
    Object.values(records).find(Boolean)!
  const capture = snapshotCapture(pointRecord)
  return {
    records,
    value,
    workshop,
    workshopComplete,
    observedDates,
    asOf: capture ?? pointRecord.period_to,
    source: 'Supabase · plataforma Acriland',
    actionWindow: records.jaime_actions_executed_7d
      ? {
          from: records.jaime_actions_executed_7d.date,
          to: records.jaime_actions_executed_7d.period_to
        }
      : null
  }
}
