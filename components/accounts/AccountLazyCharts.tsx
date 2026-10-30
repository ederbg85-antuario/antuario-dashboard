'use client'
import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { AccountBundle } from '@/lib/client-accounts-types'
import type { AccountsRange } from '@/lib/client-accounts-metrics'
import { KpiGrid, type AccountAnalysis } from './AccountKpiGrid'
export { KpiGrid } from './AccountKpiGrid'
export { BudgetCard, CampaignTable } from './AccountBudget'
export { SeoTrendChart } from './AccountSeoTrend'
import { SeoTrendChart } from './AccountSeoTrend'
import { BudgetCard, CampaignTable } from './AccountBudget'
function ChartPlaceholder() {
  return (
    <div
      className="account-surface account-chart-placeholder"
      role="status"
      aria-label="Cargando gráfica"
    >
      <div
        className="account-skeleton"
        style={{ height: 16, width: '45%', marginBottom: 25 }}
      />
      <div className="account-skeleton" style={{ height: 215 }} />
      <span className="sr-only">Cargando gráfica…</span>
    </div>
  )
}
const DynamicTraffic = dynamic(
  () => import('./AccountCharts').then((module) => module.TrafficChart),
  { ssr: false, loading: ChartPlaceholder }
)
const DynamicAdsHistory = dynamic(
  () => import('./AccountCharts').then((module) => module.AdsHistoryChart),
  { ssr: false, loading: ChartPlaceholder }
)
const DynamicBilling = dynamic(
  () => import('./AccountCharts').then((module) => module.BillingChart),
  { ssr: false, loading: ChartPlaceholder }
)
const DynamicChannels = dynamic(
  () => import('./AccountCharts').then((module) => module.ChannelsChart),
  { ssr: false, loading: ChartPlaceholder }
)
const DynamicFunnel = dynamic(
  () => import('./AccountCharts').then((module) => module.FunnelChart),
  { ssr: false, loading: ChartPlaceholder }
)
const DynamicSpend = dynamic(
  () => import('./AccountCharts').then((module) => module.SpendMixChart),
  { ssr: false, loading: ChartPlaceholder }
)
function DeferredChart({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null),
    [visible, setVisible] = useState(false)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '100px 0px' }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return (
    <div className="account-deferred-chart" ref={ref}>
      {visible ? children : <ChartPlaceholder />}
    </div>
  )
}
type ChartProps = { analysis: AccountAnalysis }
export function TrafficChart(props: ChartProps) {
  return (
    <DeferredChart>
      <DynamicTraffic {...props} />
    </DeferredChart>
  )
}
export function AdsHistoryChart(props: ChartProps & { bundle: AccountBundle }) {
  return (
    <DeferredChart>
      <DynamicAdsHistory {...props} />
    </DeferredChart>
  )
}
export function BillingChart(props: ChartProps) {
  return (
    <DeferredChart>
      <DynamicBilling {...props} />
    </DeferredChart>
  )
}
export function PerformancePanel({
  bundle,
  analysis,
  paidAds,
  onCampaign,
  onChannel
}: {
  bundle: AccountBundle
  range: AccountsRange
  analysis: AccountAnalysis
  paidAds: boolean
  onCampaign: (id: string) => void
  onChannel: (channel: string) => void
}) {
  return (
    <>
      <KpiGrid analysis={analysis} paidAds={paidAds} />
      <div className="account-grid">
        <TrafficChart analysis={analysis} />
        <DeferredChart>
          <DynamicChannels
            analysis={analysis}
            onChannel={onChannel}
            paidAds={paidAds}
          />
        </DeferredChart>
        {paidAds ? (
          <>
            <DeferredChart>
              <DynamicFunnel analysis={analysis} />
            </DeferredChart>
            <DeferredChart>
              <DynamicSpend analysis={analysis} onCampaign={onCampaign} />
            </DeferredChart>
            <BudgetCard analysis={analysis} />
            <AdsHistoryChart bundle={bundle} analysis={analysis} />
          </>
        ) : (
          <SeoTrendChart analysis={analysis} />
        )}
      </div>
      {paidAds && <CampaignTable analysis={analysis} onCampaign={onCampaign} />}
    </>
  )
}
