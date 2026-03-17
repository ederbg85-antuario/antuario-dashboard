'use client'

import { useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'
import { CARD_S, PAGE_WRAP, PageHeader } from '@/components/ui/dashboard'

// ─── Types ────────────────────────────────────────────────────────────────────

type Connection = {
  id: string; source: string; status: string
  external_name: string | null; last_sync_at: string | null
}
type MetricRow = { source: string; metric_key: string; value: number; date?: string }
type TrendRow = { source: string; date: string; metric_key: string; daily_total: number }

type Props = {
  orgId: number
  connections: Connection[]
  currentMetrics: MetricRow[]
  previousMetrics: MetricRow[]
  trendData: TrendRow[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SOURCE_META: Record<string, { label: string; color: string; icon: string }> = {
  ga4: { label: 'Web (GA4)', color: '#3b82f6', icon: '◉' },
  search_console: { label: 'SEO', color: '#10b981', icon: '◎' },
  google_ads: { label: 'Google Ads', color: '#f59e0b', icon: '◆' },
  google_business_profile: { label: 'Google Business Profile', color: '#ef4444', icon: '◍' },
}

const ALL_SOURCES = ['ga4', 'search_console', 'google_ads', 'google_business_profile']

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sumMetric(metrics: MetricRow[], source: string, key: string) {
  return metrics
    .filter(m => m.source === source && m.metric_key === key)
    .reduce((s, m) => s + (m.value ?? 0), 0)
}

function fmtN(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toFixed(0)
}

function fmtCurrency(n: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)
}

function fmtPct(n: number) { return `${n.toFixed(1)}%` }

function deltaColor(delta: number, positiveIsGood = true) {
  if (delta === 0) return 'text-slate-400'
  const good = positiveIsGood ? delta > 0 : delta < 0
  return good ? 'text-emerald-600' : 'text-red-500'
}

function deltaLabel(delta: number) {
  const sign = delta > 0 ? '+' : ''
  return `${sign}${delta.toFixed(1)}%`
}

function calcDelta(current: number, previous: number) {
  if (!previous) return 0
  return ((current - previous) / previous) * 100
}

// ─── No Connection State ──────────────────────────────────────────────────────

function NoConnections() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center py-32 px-8 text-center">
      <div className="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-[#1a2030] flex items-center justify-center mb-5">
        <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      </div>
      <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 dark:text-slate-100 mb-2">Conecta tus fuentes de Marketing</h3>
      <p className="text-slate-500 mb-6 max-w-md">
        Conecta Google Analytics, Search Console, Google Ads y Google Maps para ver tu visión estratégica unificada.
      </p>
      <a href="/configuracion/integraciones"
        className="bg-gradient-to-r from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 text-white text-sm font-semibold px-6 py-3 rounded-xl transition-all shadow-md">
        Ir a Integraciones →
      </a>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function VisionMarketingClient({
  connections, currentMetrics, previousMetrics, trendData,
}: Props) {
  const hasConnections = connections.some(c => c.status === 'active')
  const hasData = currentMetrics.length > 0

  const metrics = useMemo(() => {
    const cur_ga4_conv = sumMetric(currentMetrics, 'ga4', 'conversions')
    const cur_ads_conv = sumMetric(currentMetrics, 'google_ads', 'conversions')
    const cur_ads_cost = sumMetric(currentMetrics, 'google_ads', 'cost')
    const cur_sc_clicks = sumMetric(currentMetrics, 'search_console', 'clicks')
    const cur_ga4_sess = sumMetric(currentMetrics, 'ga4', 'sessions')
    const cur_gmb_calls = sumMetric(currentMetrics, 'google_business_profile', 'phone_calls')
    const cur_gmb_clicks = sumMetric(currentMetrics, 'google_business_profile', 'website_clicks')
    const cur_gmb_dir = sumMetric(currentMetrics, 'google_business_profile', 'direction_requests')

    const prv_ga4_conv = sumMetric(previousMetrics, 'ga4', 'conversions')
    const prv_ads_conv = sumMetric(previousMetrics, 'google_ads', 'conversions')
    const prv_ads_cost = sumMetric(previousMetrics, 'google_ads', 'cost')
    const prv_sc_clicks = sumMetric(previousMetrics, 'search_console', 'clicks')

    const totalConversions = cur_ga4_conv + cur_ads_conv
    const prevTotalConv = prv_ga4_conv + prv_ads_conv
    const adsDependency = totalConversions > 0
      ? (cur_ads_conv / totalConversions) * 100 : 0
    const cpa = cur_ads_conv > 0 ? cur_ads_cost / cur_ads_conv : 0
    const gmb_actions = cur_gmb_calls + cur_gmb_clicks + cur_gmb_dir

    return {
      totalConversions,
      deltaConv: calcDelta(totalConversions, prevTotalConv),
      adsDependency,
      cpa,
      deltaCpa: calcDelta(cpa, prv_ads_cost > 0 && prv_ads_conv > 0 ? prv_ads_cost / prv_ads_conv : 0),
      adsInvestment: cur_ads_cost,
      deltaAds: calcDelta(cur_ads_cost, prv_ads_cost),
      organicClicks: cur_sc_clicks,
      deltaOrganic: calcDelta(cur_sc_clicks, prv_sc_clicks),
      sessions: cur_ga4_sess,
      gmb_actions,
      channelMix: [
        { name: 'Google Ads', value: cur_ads_conv, color: '#f59e0b' },
        { name: 'Web Orgánico', value: cur_ga4_conv, color: '#3b82f6' },
        { name: 'SEO Clicks', value: cur_sc_clicks, color: '#10b981' },
        { name: 'Maps Actions', value: gmb_actions, color: '#ef4444' },
      ].filter(c => c.value > 0),
    }
  }, [currentMetrics, previousMetrics])

  const trendByDate = useMemo(() => {
    const map: Record<string, Record<string, number>> = {}
    trendData.forEach(row => {
      const week = row.date.slice(0, 7)
      if (!map[week]) map[week] = { date: week as unknown as number, ads: 0, organic: 0, seo: 0 }
      if (row.source === 'google_ads' && row.metric_key === 'conversions') map[week].ads += row.daily_total
      if (row.source === 'ga4' && row.metric_key === 'conversions') map[week].organic += row.daily_total
      if (row.source === 'search_console' && row.metric_key === 'clicks') map[week].seo += row.daily_total
    })
    return Object.values(map).sort((a, b) => String(a.date) < String(b.date) ? -1 : 1)
  }, [trendData])

  const insights = useMemo(() => {
    const list: { type: 'warning' | 'success' | 'info'; text: string }[] = []
    if (metrics.adsDependency > 70)
      list.push({ type: 'warning', text: `El ${fmtPct(metrics.adsDependency)} de tus conversiones vienen de Google Ads. Alta dependencia — si paras Ads, pierdes la mayoría de leads.` })
    else if (metrics.adsDependency < 30 && metrics.adsDependency > 0)
      list.push({ type: 'success', text: `Solo el ${fmtPct(metrics.adsDependency)} de conversiones vienen de Ads. Tu tráfico orgánico es fuerte.` })
    if (metrics.deltaCpa > 30)
      list.push({ type: 'warning', text: `Tu CPA subió ${fmtPct(metrics.deltaCpa)} vs el período anterior. Revisa el rendimiento de tus campañas.` })
    if (metrics.deltaOrganic > 20)
      list.push({ type: 'success', text: `El tráfico SEO creció ${fmtPct(metrics.deltaOrganic)}. Buen momento para fortalecer contenido orgánico.` })
    if (metrics.deltaConv < -15)
      list.push({ type: 'warning', text: `Las conversiones totales cayeron ${fmtPct(Math.abs(metrics.deltaConv))}. Revisa landing pages y campañas activas.` })
    return list
  }, [metrics])

  const depColor = metrics.adsDependency > 70 ? '#ef4444'
    : metrics.adsDependency > 40 ? '#f59e0b' : '#10b981'

  if (!hasConnections) return <NoConnections />

  return (
    <div className={PAGE_WRAP}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          eyebrow="Marketing"
          title="Visión General de Marketing"
          sub="Últimos 30 días · Todas las fuentes"
        />
        <div className="flex items-center gap-2 flex-wrap justify-end mt-1">
          {ALL_SOURCES.map(s => {
            const meta = SOURCE_META[s]
            const conn = connections.find(c => c.source === s)
            return (
              <div key={s} className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium ${conn ? 'border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' : 'border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-[#1a2030] dark:bg-[#0d1117] text-slate-400'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${conn ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                {meta.label}
              </div>
            )
          })}
        </div>
      </div>

      {!hasData ? (
        <div className="bg-white dark:bg-[#1e2535] rounded-3xl p-16 text-center" style={CARD_S}>
          <p className="text-slate-500 font-medium">Fuentes conectadas — esperando primera sincronización</p>
          <p className="text-slate-400 text-sm mt-1">Los datos aparecerán después del primer sync automático (2 AM)</p>
          <a href="/configuracion/integraciones" className="inline-block mt-4 text-sm text-slate-700 dark:text-slate-200 dark:text-slate-200 border border-slate-200 dark:border-white/[0.08] px-4 py-2 rounded-xl hover:bg-slate-50 dark:bg-[#1a2030] transition-colors">
            Ver estado de sincronización →
          </a>
        </div>
      ) : (
        <>
          {/* ── KPIs ─────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-4 gap-4">
            <KpiCard label="Conversiones totales" value={fmtN(metrics.totalConversions)} delta={metrics.deltaConv} positiveIsGood sub="vs 30 días anteriores" />
            <KpiCard label="Inversión en Ads" value={fmtCurrency(metrics.adsInvestment)} delta={metrics.deltaAds} positiveIsGood={false} sub="Google Ads" />
            <KpiCard label="CPA global" value={metrics.cpa > 0 ? fmtCurrency(metrics.cpa) : '—'} delta={metrics.deltaCpa} positiveIsGood={false} sub="Costo por conversión Ads" />
            <KpiCard label="Clics orgánicos" value={fmtN(metrics.organicClicks)} delta={metrics.deltaOrganic} positiveIsGood sub="Search Console" />
          </div>

          {/* ── Índice de dependencia + Mix + Insights ───────────────────── */}
          <div className="grid grid-cols-3 gap-4">

            {/* Dependencia publicitaria */}
            <div className="col-span-1 bg-white dark:bg-[#1e2535] rounded-3xl p-6" style={CARD_S}>
              <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-slate-400 dark:text-slate-500 mb-4">
                Índice de dependencia publicitaria
              </p>
              <div className="flex items-end justify-between mb-3">
                <p className="text-5xl font-extrabold tabular-nums" style={{ color: depColor }}>
                  {metrics.adsDependency.toFixed(0)}%
                </p>
                <div className="text-right text-xs text-slate-400 dark:text-slate-500 pb-1">
                  de conversiones<br />vienen de Ads
                </div>
              </div>
              <div className="w-full h-3 bg-slate-100 dark:bg-[#1a2030] rounded-full overflow-hidden mb-4">
                <div className="h-3 rounded-full transition-all duration-700"
                  style={{ width: `${metrics.adsDependency}%`, backgroundColor: depColor }} />
              </div>
              <div className="text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">Riesgo bajo</span>
                  <span className="text-slate-400">&lt; 30%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Riesgo medio</span>
                  <span className="text-slate-400">30–70%</span>
                </div>
                <div className="flex justify-between font-semibold" style={{ color: depColor }}>
                  <span>Riesgo alto</span>
                  <span>&gt; 70%</span>
                </div>
              </div>
            </div>

            {/* Mix de canales */}
            <div className="col-span-1 bg-white dark:bg-[#1e2535] rounded-3xl p-6" style={CARD_S}>
              <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-slate-400 dark:text-slate-500 mb-4">
                Mix de canales
              </p>
              {metrics.channelMix.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={140}>
                    <PieChart>
                      <Pie data={metrics.channelMix} cx="50%" cy="50%" innerRadius={40} outerRadius={65}
                        dataKey="value" paddingAngle={2}>
                        {metrics.channelMix.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        formatter={(v: any) => fmtN(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5 mt-2">
                    {metrics.channelMix.map(c => (
                      <div key={c.name} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                          <span className="text-slate-500">{c.name}</span>
                        </div>
                        <span className="font-semibold text-slate-700 dark:text-slate-200">{fmtN(c.value)}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-40 text-sm text-slate-400">Sin datos</div>
              )}
            </div>

            {/* Insights automáticos */}
            <div className="col-span-1 bg-white dark:bg-[#1e2535] rounded-3xl p-6" style={CARD_S}>
              <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-slate-400 dark:text-slate-500 mb-4">
                Insights automáticos
              </p>
              {insights.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-center">
                  <p className="text-slate-400 text-sm">Todo está en rangos normales</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {insights.map((ins, i) => (
                    <div key={i} className={`rounded-2xl p-3 text-sm ${ins.type === 'warning' ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-800' :
                        ins.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800' :
                          'bg-blue-50 dark:bg-blue-900/20 text-blue-800'
                      }`}>
                      <div className="flex gap-2">
                        <span className="shrink-0 mt-0.5 font-bold">
                          {ins.type === 'warning' ? '⚠' : ins.type === 'success' ? '✓' : 'ℹ'}
                        </span>
                        <p className="text-xs leading-relaxed">{ins.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Tendencia 6 meses ─────────────────────────────────────────── */}
          <div className="bg-white dark:bg-[#1e2535] rounded-3xl p-6" style={CARD_S}>
            <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-slate-400 dark:text-slate-500 mb-6">
              Tendencia — Conversiones por canal (6 meses)
            </p>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trendByDate} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gAds" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gOrganic" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gSeo" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: '16px', border: '1px solid #e2e8f0', fontSize: 12 }} />
                <Area type="monotone" dataKey="ads" stroke="#f59e0b" fill="url(#gAds)" name="Google Ads" strokeWidth={2} />
                <Area type="monotone" dataKey="organic" stroke="#3b82f6" fill="url(#gOrganic)" name="Web Orgánico" strokeWidth={2} />
                <Area type="monotone" dataKey="seo" stroke="#10b981" fill="url(#gSeo)" name="SEO Clics" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* ── Estado de conexiones ──────────────────────────────────────── */}
          <div className="bg-white dark:bg-[#1e2535] rounded-3xl p-6" style={CARD_S}>
            <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-slate-400 dark:text-slate-500 mb-4">
              Estado de fuentes
            </p>
            <div className="grid grid-cols-4 gap-4">
              {ALL_SOURCES.map(source => {
                const meta = SOURCE_META[source]
                const conn = connections.find(c => c.source === source)
                return (
                  <div key={source} className={`rounded-2xl border p-4 ${conn ? 'border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20' : 'border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-[#1a2030]'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`w-2 h-2 rounded-full ${conn ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{meta.label}</p>
                    </div>
                    {conn ? (
                      <>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{conn.external_name ?? 'Conectado'}</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                          Sync: {conn.last_sync_at
                            ? new Date(conn.last_sync_at).toLocaleDateString('es-MX')
                            : 'Pendiente'}
                        </p>
                      </>
                    ) : (
                      <a href="/configuracion/integraciones" className="text-xs text-blue-600 hover:underline">
                        Conectar →
                      </a>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, delta, positiveIsGood, sub }: {
  label: string; value: string; delta: number; positiveIsGood: boolean; sub: string
}) {
  return (
    <div className="bg-white dark:bg-[#1e2535] rounded-3xl p-5" style={CARD_S}>
      <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-slate-400 dark:text-slate-500 mb-3">{label}</p>
      <p className="text-3xl font-extrabold text-slate-900 dark:text-slate-50 dark:text-white tabular-nums mb-1">{value}</p>
      <div className="flex items-center gap-2">
        {delta !== 0 && (
          <span className={`text-xs font-semibold ${deltaColor(delta, positiveIsGood)}`}>
            {deltaLabel(delta)}
          </span>
        )}
        <span className="text-xs text-slate-400">{sub}</span>
      </div>
    </div>
  )
}
