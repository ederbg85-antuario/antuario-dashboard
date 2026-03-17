'use client'

import { useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { CARD_S, PAGE_WRAP, PageHeader } from '@/components/ui/dashboard'

type MetricRow = { metric_key: string; value: number }
type DimRow = { dimension_value: string | null; metric_key: string; value: number }
type TrendRow = { date: string; metric_key: string; daily_total: number }
type Connection = { id: string; status: string; external_name: string | null; last_sync_at: string | null } | null

type Props = {
  connection: Connection
  globalMetrics: MetricRow[]
  prevMetrics: MetricRow[]
  trendData: TrendRow[]
  topPages: DimRow[]
  channelData: DimRow[]
}

function sumM(rows: MetricRow[], key: string) { return rows.filter(r => r.metric_key === key).reduce((s, r) => s + r.value, 0) }
function avgM(rows: MetricRow[], key: string) { const f = rows.filter(r => r.metric_key === key); return f.length ? f.reduce((s, r) => s + r.value, 0) / f.length : 0 }
function calcDelta(cur: number, prev: number) { if (!prev) return 0; return ((cur - prev) / prev) * 100 }
function fmtN(n: number) { if (n >= 1000) return `${(n / 1000).toFixed(1)}k`; return n.toFixed(0) }
function fmtDuration(s: number) { const m = Math.floor(s / 60); const sec = Math.round(s % 60); return `${m}:${sec.toString().padStart(2, '0')}` }

export default function WebAnalyticsClient({ connection, globalMetrics, prevMetrics, trendData, topPages, channelData }: Props) {
  const hasData = globalMetrics.length > 0

  const m = useMemo(() => {
    const sessions = sumM(globalMetrics, 'sessions')
    const users = sumM(globalMetrics, 'active_users')
    const conversions = sumM(globalMetrics, 'conversions')
    const convRate = avgM(globalMetrics, 'conversion_rate') * 100
    const engagement = avgM(globalMetrics, 'engagement_rate') * 100
    const duration = avgM(globalMetrics, 'avg_session_duration')
    return {
      sessions, users, conversions, convRate, engagement, duration,
      deltaSess: calcDelta(sessions, sumM(prevMetrics, 'sessions')),
      deltaConv: calcDelta(conversions, sumM(prevMetrics, 'conversions')),
      deltaRate: calcDelta(convRate, avgM(prevMetrics, 'conversion_rate') * 100),
    }
  }, [globalMetrics, prevMetrics])

  const pages = useMemo(() => {
    const map: Record<string, Record<string, number>> = {}
    topPages.forEach(r => {
      const pg = r.dimension_value ?? '/'
      if (!map[pg]) map[pg] = {}
      map[pg][r.metric_key] = (map[pg][r.metric_key] ?? 0) + r.value
    })
    return Object.entries(map).map(([pg, vals]) => ({
      pg,
      sessions: vals.sessions ?? 0,
      conversions: vals.conversions ?? 0,
      convRate: vals.sessions > 0 && vals.conversions > 0 ? (vals.conversions / vals.sessions) * 100 : 0,
    })).sort((a, b) => b.sessions - a.sessions).slice(0, 15)
  }, [topPages])

  const trend = useMemo(() => {
    const map: Record<string, { date: string; sessions: number; conversions: number }> = {}
    trendData.forEach(r => {
      const month = r.date.slice(0, 7)
      if (!map[month]) map[month] = { date: month, sessions: 0, conversions: 0 }
      if (r.metric_key === 'sessions') map[month].sessions += r.daily_total
      if (r.metric_key === 'conversions') map[month].conversions += r.daily_total
    })
    return Object.values(map).sort((a, b) => a.date < b.date ? -1 : 1)
  }, [trendData])

  const channels = useMemo(() => {
    const map: Record<string, number> = {}
    channelData.forEach(r => {
      if (r.metric_key === 'sessions') {
        const ch = r.dimension_value ?? 'Directo'
        map[ch] = (map[ch] ?? 0) + r.value
      }
    })
    const total = Object.values(map).reduce((s, v) => s + v, 0)
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4']
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([name, value], i) => ({ name, value, pct: total > 0 ? (value / total) * 100 : 0, color: colors[i] }))
  }, [channelData])

  if (!connection) return <ConnectCTA label="Google Analytics (GA4)" />
  if (!hasData) return <NoData label="Google Analytics" lastSync={connection.last_sync_at} />

  return (
    <div className={PAGE_WRAP}>
      <PageHeader
        eyebrow="Marketing"
        title="Página Web — Analytics"
        sub={`${connection.external_name ?? 'Propiedad GA4'} · Últimos 30 días`}
      />

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard label="Sesiones" value={fmtN(m.sessions)} delta={m.deltaSess} positiveIsGood sub="visitas totales" />
        <KpiCard label="Conversiones" value={fmtN(m.conversions)} delta={m.deltaConv} positiveIsGood sub="acciones completadas" />
        <KpiCard label="Tasa de conversión" value={`${m.convRate.toFixed(2)}%`} delta={m.deltaRate} positiveIsGood sub="sesiones → conversión" />
        <KpiCard label="Engagement" value={`${m.engagement.toFixed(1)}%`} delta={0} positiveIsGood sub={`${fmtDuration(m.duration)} promedio`} />
      </div>

      {/* Embudo */}
      <div className="bg-white dark:bg-[#1e2535] rounded-3xl p-6" style={CARD_S}>
        <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-slate-400 dark:text-slate-500 mb-6">Embudo de conversión</p>
        <div className="flex items-center gap-6">
          {[
            { label: 'Visitantes', value: m.users, color: 'bg-blue-500', pct: 100 },
            { label: 'Sesiones engaged', value: Math.round(m.sessions * m.engagement / 100), color: 'bg-blue-400', pct: m.engagement },
            { label: 'Conversiones', value: m.conversions, color: 'bg-emerald-400', pct: m.convRate },
          ].map((step, i) => (
            <div key={i} className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <div className={`h-10 rounded-xl ${step.color} opacity-80`}
                  style={{ width: `${Math.max(20, step.pct)}%`, minWidth: '40px' }} />
                <div>
                  <p className="text-xl font-extrabold text-slate-900 dark:text-slate-50 dark:text-white tabular-nums">{fmtN(step.value)}</p>
                  <p className="text-xs text-slate-400">{step.label}</p>
                </div>
              </div>
              {i < 2 && (
                <p className="text-xs text-slate-400 dark:text-slate-500 pl-2">↓ {step.pct.toFixed(1)}% continúan</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Tendencia + Canales */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 bg-white dark:bg-[#1e2535] rounded-3xl p-6" style={CARD_S}>
          <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-slate-400 dark:text-slate-500 mb-6">Sesiones y conversiones — 6 meses</p>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={trend}>
              <defs>
                <linearGradient id="gSess" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ borderRadius: '16px', border: '1px solid #e2e8f0', fontSize: 11 }} />
              <Area yAxisId="left" type="monotone" dataKey="sessions" stroke="#3b82f6" fill="url(#gSess)" name="Sesiones" strokeWidth={2} />
              <Area yAxisId="right" type="monotone" dataKey="conversions" stroke="#10b981" fill="none" name="Conversiones" strokeWidth={2} strokeDasharray="4 2" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white dark:bg-[#1e2535] rounded-3xl p-6" style={CARD_S}>
          <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-slate-400 dark:text-slate-500 mb-4">Fuentes de tráfico</p>
          {channels.length === 0
            ? <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-10">Sin datos de canal</p>
            : <div className="space-y-3">
              {channels.map(ch => (
                <div key={ch.name}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-slate-600 dark:text-slate-300 dark:text-slate-300 truncate max-w-[140px]">{ch.name}</span>
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{fmtN(ch.value)}</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 dark:bg-[#1a2030] rounded-full overflow-hidden">
                    <div className="h-1.5 rounded-full" style={{ width: `${ch.pct}%`, backgroundColor: ch.color }} />
                  </div>
                  <p className="text-xs text-slate-400 dark:text-slate-500 text-right mt-0.5">{ch.pct.toFixed(1)}%</p>
                </div>
              ))}
            </div>
          }
        </div>
      </div>

      {/* Top páginas */}
      <div className="bg-white dark:bg-[#1e2535] rounded-3xl p-6" style={CARD_S}>
        <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-slate-400 dark:text-slate-500 mb-4">Páginas principales — tráfico y conversión</p>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-white/[0.05]">
                <th className="text-left pb-2 font-semibold">Página</th>
                <th className="text-right pb-2 font-semibold">Sesiones</th>
                <th className="text-right pb-2 font-semibold">Conv.</th>
                <th className="text-right pb-2 font-semibold">Tasa conv.</th>
                <th className="text-left pb-2 font-semibold pl-4">Rendimiento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {pages.length === 0
                ? <tr><td colSpan={5} className="py-8 text-center text-slate-400 dark:text-slate-500 text-xs">Sin datos de páginas</td></tr>
                : pages.map((p, i) => {
                  const isTop = p.convRate > 3
                  const isLow = p.sessions > 500 && p.convRate < 1
                  return (
                    <tr key={i} className="hover:bg-slate-50 dark:bg-[#1a2030] transition-colors">
                      <td className="py-2.5 pr-4 text-slate-700 dark:text-slate-200 dark:text-slate-200 font-mono text-xs max-w-[280px] truncate">{p.pg}</td>
                      <td className="py-2.5 text-right text-slate-500">{fmtN(p.sessions)}</td>
                      <td className="py-2.5 text-right font-semibold text-slate-800 dark:text-slate-100">{fmtN(p.conversions)}</td>
                      <td className={`py-2.5 text-right font-bold ${isTop ? 'text-emerald-600' : isLow ? 'text-red-500' : 'text-slate-600 dark:text-slate-300'}`}>
                        {p.convRate.toFixed(1)}%
                      </td>
                      <td className="py-2.5 pl-4">
                        {isTop && <span className="text-xs bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full font-medium">↑ Escalar</span>}
                        {isLow && <span className="text-xs bg-red-50 dark:bg-red-900/20 text-red-600 px-2 py-0.5 rounded-full font-medium">↓ Mejorar CTA</span>}
                      </td>
                    </tr>
                  )
                })
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function KpiCard({ label, value, delta, positiveIsGood, sub }: { label: string; value: string; delta: number; positiveIsGood: boolean; sub: string }) {
  const dc = delta === 0 ? 'text-slate-400' : (positiveIsGood ? delta > 0 : delta < 0) ? 'text-emerald-600' : 'text-red-500'
  return (
    <div className="bg-white dark:bg-[#1e2535] rounded-3xl p-5" style={CARD_S}>
      <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-slate-400 dark:text-slate-500 mb-3">{label}</p>
      <p className="text-3xl font-extrabold text-slate-900 dark:text-slate-50 dark:text-white tabular-nums mb-1">{value}</p>
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
      <div className="w-14 h-14 rounded-3xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center mb-5">
        <svg className="w-7 h-7 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      </div>
      <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 dark:text-slate-100 mb-2">Conecta {label}</h3>
      <p className="text-slate-500 mb-6 max-w-sm">Vincula tu propiedad de GA4 para analizar el rendimiento real de tu sitio web.</p>
      <a href="/configuracion/integraciones" className="bg-gradient-to-r from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 text-white text-sm font-semibold px-6 py-3 rounded-xl transition-all shadow-md">
        Ir a Integraciones →
      </a>
    </div>
  )
}

function NoData({ label, lastSync }: { label: string; lastSync: string | null }) {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-center px-8">
      <p className="text-slate-500 font-medium">{label} conectado — sync pendiente</p>
      {lastSync && <p className="text-slate-400 text-sm mt-2">Último sync: {new Date(lastSync).toLocaleString('es-MX')}</p>}
    </div>
  )
}
