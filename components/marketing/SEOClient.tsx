'use client'

import { useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { CARD_S, PAGE_WRAP, PageHeader } from '@/components/ui/dashboard'
import type { DateFilter } from '@/lib/date-filter'
import { formatDateRange } from '@/lib/date-filter'

type MetricRow = { metric_key: string; value: number; date?: string }
type DimRow = { dimension_value: string | null; value: number; metric_key: string }
type TrendRow = { date: string; metric_key: string; daily_total: number }
type Connection = { id: string; status: string; external_name: string | null; last_sync_at: string | null } | null

type Props = {
  connection: Connection
  globalMetrics: MetricRow[]
  prevMetrics: MetricRow[]
  trendData: TrendRow[]
  topKeywords: DimRow[]
  topPages: DimRow[]
  opportunityKeywords: DimRow[]
  dateFilter?: DateFilter
}

function sumM(rows: MetricRow[], key: string) { return rows.filter(r => r.metric_key === key).reduce((s, r) => s + r.value, 0) }
function avgM(rows: MetricRow[], key: string) { const f = rows.filter(r => r.metric_key === key); return f.length ? f.reduce((s, r) => s + r.value, 0) / f.length : 0 }
function calcDelta(cur: number, prev: number) { if (!prev) return 0; return ((cur - prev) / prev) * 100 }
function fmtN(n: number) { if (n >= 1000) return `${(n / 1000).toFixed(1)}k`; return n.toFixed(n % 1 === 0 ? 0 : 1) }

export default function SEOClient({ connection, globalMetrics, prevMetrics, trendData, topKeywords, opportunityKeywords, dateFilter }: Props) {
  const hasData = globalMetrics.length > 0

  const m = useMemo(() => {
    const clicks = sumM(globalMetrics, 'clicks')
    const impressions = sumM(globalMetrics, 'impressions')
    const ctr = avgM(globalMetrics, 'ctr') * 100
    const position = avgM(globalMetrics, 'position')
    return {
      clicks, impressions, ctr, position,
      deltaClicks: calcDelta(clicks, sumM(prevMetrics, 'clicks')),
      deltaImpr: calcDelta(impressions, sumM(prevMetrics, 'impressions')),
      deltaCtr: calcDelta(ctr, avgM(prevMetrics, 'ctr') * 100),
      deltaPos: calcDelta(position, avgM(prevMetrics, 'position')),
    }
  }, [globalMetrics, prevMetrics])

  const trend = useMemo(() => {
    const map: Record<string, { date: string; clicks: number; impressions: number }> = {}
    trendData.forEach(r => {
      if (!map[r.date]) map[r.date] = { date: r.date, clicks: 0, impressions: 0 }
      if (r.metric_key === 'clicks') map[r.date].clicks = r.daily_total
      if (r.metric_key === 'impressions') map[r.date].impressions = r.daily_total
    })
    return Object.values(map).sort((a, b) => a.date < b.date ? -1 : 1)
  }, [trendData])

  const kwMap = useMemo(() => {
    const byKw: Record<string, Record<string, number>> = {}
    topKeywords.forEach(r => {
      const kw = r.dimension_value ?? '—'
      if (!byKw[kw]) byKw[kw] = {}
      byKw[kw][r.metric_key] = (byKw[kw][r.metric_key] ?? 0) + r.value
    })
    return Object.entries(byKw)
      .map(([kw, vals]) => ({ kw, clicks: vals.clicks ?? 0, impressions: vals.impressions ?? 0, ctr: vals.ctr ? vals.ctr * 100 : 0, position: vals.position ?? 0 }))
      .sort((a, b) => b.clicks - a.clicks).slice(0, 20)
  }, [topKeywords])

  const opportunities = useMemo(() => opportunityKeywords.filter(r => r.dimension_value).slice(0, 10)
    .map(r => ({ kw: r.dimension_value ?? '—', impressions: r.value, estimatedClicks: Math.round(r.value * 0.03) })), [opportunityKeywords])

  if (!connection) return <ConnectCTA label="Google Search Console" />
  if (!hasData) return <NoData label="Search Console" lastSync={connection.last_sync_at} />

  return (
    <div className={PAGE_WRAP}>
      <PageHeader eyebrow="Marketing" title="SEO — Search Console" sub={`${connection.external_name ?? 'Propiedad conectada'} · ${dateFilter ? formatDateRange(dateFilter) : 'Últimos 30 días'}`} />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <KpiCard label="Clics orgánicos" value={fmtN(m.clicks)} delta={m.deltaClicks} positiveIsGood sub="búsquedas que llegan" />
        <KpiCard label="Impresiones" value={fmtN(m.impressions)} delta={m.deltaImpr} positiveIsGood sub="apariciones en Google" />
        <KpiCard label="CTR promedio" value={`${m.ctr.toFixed(1)}%`} delta={m.deltaCtr} positiveIsGood sub="impresiones → clics" />
        <KpiCard label="Posición promedio" value={m.position.toFixed(1)} delta={m.deltaPos} positiveIsGood={false} sub="menor es mejor" />
      </div>

      <div className="bg-white dark:bg-[#1e2535] rounded-3xl p-6" style={CARD_S}>
        <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-slate-400 dark:text-slate-500 mb-6">Clics vs Impresiones — últimos 6 meses</p>
        <ResponsiveContainer width="100%" height={190}>
          <AreaChart data={trend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="gClicksSEO" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.45} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="gImprSEO" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" vertical={false} />
            <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 500 }} />
            <YAxis yAxisId="left" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 500 }} />
            <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 500 }} />
            <Tooltip contentStyle={{ background: 'rgba(15,20,35,0.92)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', fontSize: 12, color: '#e2e8f0' }} itemStyle={{ color: '#e2e8f0', fontWeight: 600 }} labelStyle={{ color: '#94a3b8', fontWeight: 500 }} cursor={{ stroke: 'rgba(148,163,184,0.2)', strokeWidth: 1.5 }} />
            <Area yAxisId="left" type="monotone" dataKey="clicks" stroke="#10b981" strokeWidth={3} fill="url(#gClicksSEO)" name="Clics" dot={false} activeDot={{ r: 5, strokeWidth: 0 }} />
            <Area yAxisId="right" type="monotone" dataKey="impressions" stroke="#6366f1" strokeWidth={2.5} fill="url(#gImprSEO)" name="Impresiones" dot={false} activeDot={{ r: 5, strokeWidth: 0 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-[#1e2535] rounded-3xl p-6" style={CARD_S}>
          <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-slate-400 dark:text-slate-500 mb-4">Top 20 Keywords por clics</p>
          <div className="overflow-x-auto max-h-80">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-white/[0.05]">
                  <th className="text-left pb-2 font-semibold">Keyword</th>
                  <th className="text-right pb-2 font-semibold">Clics</th>
                  <th className="text-right pb-2 font-semibold">Impr.</th>
                  <th className="text-right pb-2 font-semibold">CTR</th>
                  <th className="text-right pb-2 font-semibold">Pos.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {kwMap.length === 0
                  ? <tr><td colSpan={5} className="py-8 text-center text-slate-400 dark:text-slate-500 text-xs">Sin datos de keywords</td></tr>
                  : kwMap.map((kw, i) => (
                    <tr key={i} className="hover:bg-slate-50 dark:bg-[#1a2030] transition-colors">
                      <td className="py-2 pr-4 text-slate-700 dark:text-slate-200 dark:text-slate-200 truncate max-w-[180px]">{kw.kw}</td>
                      <td className="py-2 text-right font-semibold text-emerald-700 dark:text-emerald-400">{fmtN(kw.clicks)}</td>
                      <td className="py-2 text-right text-slate-500">{fmtN(kw.impressions)}</td>
                      <td className="py-2 text-right text-slate-500">{kw.ctr.toFixed(1)}%</td>
                      <td className="py-2 text-right text-slate-500">{kw.position.toFixed(1)}</td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white dark:bg-[#1e2535] rounded-3xl p-6 border border-amber-100" style={CARD_S}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-amber-500 text-lg">⚡</span>
            <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-slate-400">Oportunidades de crecimiento</p>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">Keywords con muchas impresiones pero CTR bajo — mejorar su título puede generar clics sin costo extra.</p>
          {opportunities.length === 0
            ? <p className="text-sm text-slate-400 dark:text-slate-500 py-8 text-center">Sin oportunidades identificadas</p>
            : <div className="space-y-2">
              {opportunities.map((op, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-900/20 rounded-2xl">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 dark:text-slate-200 truncate">{op.kw}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{fmtN(op.impressions)} impresiones</p>
                  </div>
                  <div className="text-right shrink-0 pl-3">
                    <p className="text-xs text-amber-700 dark:text-amber-400 font-bold">+{fmtN(op.estimatedClicks)} clics pot.</p>
                    <p className="text-xs text-slate-400">si CTR → 3%</p>
                  </div>
                </div>
              ))}
            </div>
          }
        </div>
      </div>
    </div>
  )
}

function KpiCard({ label, value, delta, positiveIsGood, sub }: { label: string; value: string; delta: number; positiveIsGood: boolean; sub: string }) {
  const dc = delta === 0 ? 'text-slate-400' : (positiveIsGood ? delta > 0 : delta < 0) ? 'text-emerald-600' : 'text-red-500'
  return (
    <div className="bg-white dark:bg-[#1e2535] rounded-3xl p-4 md:p-5" style={CARD_S}>
      <p className="text-[9px] md:text-[10px] font-bold tracking-[0.14em] uppercase text-slate-400 dark:text-slate-500 mb-2 md:mb-3">{label}</p>
      <p className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-slate-50 dark:text-white tabular-nums mb-1">{value}</p>
      <div className="flex items-center gap-2">
        {delta !== 0 && <span className={`text-xs font-semibold ${dc}`}>{delta > 0 ? '+' : ''}{delta.toFixed(1)}%</span>}
        <span className="text-xs text-slate-400">{sub}</span>
      </div>
    </div>
  )
}

function ConnectCTA({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-center px-8">
      <div className="w-14 h-14 rounded-3xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center mb-5">
        <svg className="w-7 h-7 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
      </div>
      <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 dark:text-slate-100 mb-2">Conecta {label}</h3>
      <p className="text-slate-500 mb-6 max-w-sm">Vincula tu cuenta para ver datos de rendimiento SEO en tiempo real.</p>
      <a href="/configuracion/integraciones" className="bg-gradient-to-r from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 text-white text-sm font-semibold px-6 py-3 rounded-xl transition-all shadow-md">
        Ir a Integraciones →
      </a>
    </div>
  )
}

function NoData({ label, lastSync }: { label: string; lastSync: string | null }) {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-center px-8">
      <div className="w-14 h-14 rounded-3xl bg-slate-100 dark:bg-[#1a2030] flex items-center justify-center mb-5">
        <svg className="w-7 h-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200 dark:text-slate-200 mb-2">{label} conectado — sync pendiente</h3>
      <p className="text-slate-400 text-sm">Los datos se sincronizarán automáticamente esta noche a las 2 AM.</p>
      {lastSync && <p className="text-slate-400 text-xs mt-2">Último sync: {new Date(lastSync).toLocaleString('es-MX')}</p>}
    </div>
  )
}
