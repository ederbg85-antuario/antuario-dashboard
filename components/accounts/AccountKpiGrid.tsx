'use client'
import type { AccountKpi } from '@/lib/client-accounts-metrics'
import type { accountMetrics } from '@/lib/client-accounts-metrics'
import { accountColors, Kpi, money, number } from './AccountPrimitives'
export type AccountAnalysis = ReturnType<typeof accountMetrics>
const colors = [
  accountColors.lilac,
  accountColors.mint,
  accountColors.peach,
  accountColors.blue
]
export function formatKpi(kpi: AccountKpi) {
  return ['MXN', 'USD'].includes(kpi.unit)
    ? money(kpi.value, kpi.unit)
    : kpi.value == null
      ? '—'
      : `${number(kpi.value, kpi.unit === 'position' || kpi.unit === 'percent' ? 1 : 0)}${kpi.unit === 'percent' ? '%' : ''}`
}
export function KpiGrid({
  analysis,
  compact = false,
  paidAds = true
}: {
  analysis: AccountAnalysis
  compact?: boolean
  paidAds?: boolean
}) {
  const kpis = compact
    ? ['leads', 'sessions', 'seoClicks', paidAds ? 'adSpend' : 'users'].map(
        (key) => analysis.byKey[key]
      )
    : analysis.kpis.filter((kpi) => paidAds || kpi.source !== 'google_ads')
  return (
    <div className="account-kpis">
      {kpis.map((kpi, i) => (
        <Kpi
          financial={['MXN','USD'].includes(kpi.unit)}
          key={kpi.key}
          label={kpi.label}
          value={formatKpi(kpi)}
          change={kpi.complete ? kpi.change : null}
          series={kpi.series}
          color={colors[i % colors.length]}
          improvesWhen={
            ['position', 'costPerConversion'].includes(kpi.key)
              ? 'down'
              : ['adSpend', 'adBalance'].includes(kpi.key)
                ? 'neutral'
                : 'up'
          }
          hint={`${kpi.source} · ${kpi.coverageDays}/${kpi.totalDays} días. ${kpi.note}`}
        />
      ))}
    </div>
  )
}
