'use client'
import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import type { AccountAnalysis } from './AccountKpiGrid'
import { Empty, Surface } from './AccountPrimitives'
function PlotPlaceholder() {
  return (
    <div role="status" aria-label="Cargando gráfica de búsqueda">
      <div className="account-chart account-skeleton" aria-hidden="true" />
      <div
        className="account-skeleton"
        style={{ height: 15, width: '45%', marginTop: 12 }}
        aria-hidden="true"
      />
      <span className="sr-only">Cargando gráfica…</span>
    </div>
  )
}
const DynamicSeoPlot = dynamic(
  () => import('./AccountCharts').then((module) => module.SeoTrendPlot),
  { ssr: false, loading: PlotPlaceholder }
)
function DeferredSeoPlot({ analysis }: { analysis: AccountAnalysis }) {
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
    <div ref={ref} style={{ minWidth: 0 }}>
      {visible ? <DynamicSeoPlot analysis={analysis} /> : <PlotPlaceholder />}
    </div>
  )
}
export function SeoTrendChart({ analysis }: { analysis: AccountAnalysis }) {
  const hasPoints =
    analysis.byKey.seoClicks.series.some((point) => point.value !== null) ||
    analysis.byKey.seoImpressions.series.some((point) => point.value !== null)
  return (
    <Surface
      title="Visibilidad en búsqueda"
      description="Clics e impresiones · escalas independientes"
      source="Search Console · mediciones registradas del periodo. La visibilidad en IA se mantiene como frente separado hasta tener una fuente verificable."
    >
      {hasPoints ? (
        <DeferredSeoPlot analysis={analysis} />
      ) : (
        <Empty
          title="Medición orgánica por verificar"
          description="No hay snapshots de Search Console en este rango. No se sustituyen con datos publicitarios."
        />
      )}
    </Surface>
  )
}
