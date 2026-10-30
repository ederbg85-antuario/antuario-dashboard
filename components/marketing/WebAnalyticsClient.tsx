'use client'

import { useMemo } from 'react'
import {analyticsSummary} from '@/lib/marketing-math'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { CARD_S, PAGE_WRAP, PageHeader } from '@/components/ui/dashboard'
import type { DateFilter } from '@/lib/date-filter'
import { formatDateRange } from '@/lib/date-filter'

type MetricRow = { metric_key: string; value: number; date?: string }
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
  dateFilter?: DateFilter
}

function calcDelta(cur: number, prev: number) { if (!prev) return 0; return ((cur - prev) / prev) * 100 }
function fmtN(n: number) { if (n >= 1000) return `${(n / 1000).toFixed(1)}k`; return n.toFixed(0) }
function fmtDuration(s: number) { const m = Math.floor(s / 60); const sec = Math.round(s % 60); return `${m}:${sec.toString().padStart(2, '0')}` }

export default function WebAnalyticsClient({ connection, globalMetrics, prevMetrics, trendData, topPages, channelData, dateFilter }: Props) {
  const hasData = globalMetrics.length > 0

  const m = useMemo(() => {
    const cur=analyticsSummary(globalMetrics),prev=analyticsSummary(prevMetrics)
    return {...cur,conversions:cur.keyEvents,convRate:cur.keyEventRate===null?null:cur.keyEventRate*100,
      engagement:cur.engagement===null?null:cur.engagement*100,
      deltaSess:calcDelta(cur.sessions,prev.sessions),deltaConv:calcDelta(cur.keyEvents,prev.keyEvents),
      deltaRate:cur.keyEventRate!==null&&prev.keyEventRate!==null?calcDelta(cur.keyEventRate,prev.keyEventRate):0}
  },[globalMetrics,prevMetrics])

  const pages = useMemo(() => {
    const map: Record<string, Record<string, number>> = {}
    topPages.forEach(r => {
      const pg = r.dimension_value ?? '/'
      if (!map[pg]) map[pg] = {}
      map[pg][r.metric_key] = (map[pg][r.metric_key] ?? 0) + r.value
    })
    return Object.entries(map).map(([pg, vals]) => ({
      pg,
      sessions: vals.pageviews ?? 0,
      conversions: vals.conversions ?? 0,
      convRate: vals.sessions > 0 && vals.conversions > 0 ? (vals.conversions / vals.sessions) * 100 : 0,
    })).filter(p=>p.sessions>0).sort((a, b) => b.sessions - a.sessions).slice(0, 15)
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
        sub={`${connection.external_name ?? 'Propiedad GA4'} · ${dateFilter ? formatDateRange(dateFilter) : 'Últimos 30 días'}`}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <KpiCard label="Sesiones" value={fmtN(m.sessions)} delta={m.deltaSess} positiveIsGood sub="visitas totales" />
        <KpiCard label="Eventos clave" value={fmtN(m.conversions)} delta={m.deltaConv} positiveIsGood sub="eventos definidos en GA4" />
        <KpiCard label="Sesiones con evento clave" value={m.convRate===null?'—':`${m.convRate.toFixed(2)}%`} delta={m.deltaRate} positiveIsGood sub="sesiones → conversión" />
        <KpiCard label="Engagement" value={m.engagement===null?'—':`${m.engagement.toFixed(1)}%`} delta={0} positiveIsGood sub={m.duration===null?'Actualiza la fuente':`${fmtDuration(m.duration)} por sesión`} />
      </div>

      <div className="op-card">
        <h2 className="text-base font-semibold mb-4">Actividad de la propiedad</h2>
        <div className="op-definition-grid">
          <div><small>Usuarios activos · media diaria</small><p>{m.dailyActiveUsers===null?'—':fmtN(m.dailyActiveUsers)}</p></div>
          <div><small>Sesiones</small><p>{fmtN(m.sessions)}</p></div>
          <div><small>Eventos clave</small><p>{fmtN(m.keyEvents)}</p></div>
        </div>
        <p className="text-xs text-slate-500 mt-4">Los eventos clave dependen de la configuración de GA4. La media diaria de usuarios no representa personas únicas del periodo.</p>
      </div>

      {/* Tendencia + Canales */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white dark:bg-[#1e2535] rounded-3xl p-6" style={CARD_S}>
          <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-slate-400 dark:text-slate-500 mb-6">Sesiones y conversiones — 6 meses</p>
          <ResponsiveContainer width="100%" height={190}>
            <AreaChart data={trend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="gSessWA" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="gConvWA" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 500 }} />
              <YAxis yAxisId="left" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 500 }} />
              <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 500 }} />
              <Tooltip contentStyle={{ background: 'rgba(15,20,35,0.92)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', fontSize: 12, color: '#e2e8f0' }} itemStyle={{ color: '#e2e8f0', fontWeight: 600 }} labelStyle={{ color: '#94a3b8', fontWeight: 500 }} cursor={{ stroke: 'rgba(148,163,184,0.2)', strokeWidth: 1.5 }} />
              <Area yAxisId="left" type="monotone" dataKey="sessions" stroke="#3b82f6" strokeWidth={3} fill="url(#gSessWA)" name="Sesiones" dot={false} activeDot={{ r: 5, strokeWidth: 0 }} />
              <Area yAxisId="right" type="monotone" dataKey="conversions" stroke="#10b981" strokeWidth={2.5} fill="url(#gConvWA)" name="Eventos clave" dot={false} activeDot={{ r: 5, strokeWidth: 0 }} />
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

      <div className="op-card">
        <h2 className="text-base font-semibold mb-4">Páginas principales · filas disponibles</h2>
        <div className="overflow-x-auto"><table className="op-table"><thead><tr><th>Página</th><th>Vistas</th><th>Eventos clave</th></tr></thead><tbody>
        {pages.length===0?<tr><td colSpan={3}>Actualiza la fuente para consultar vistas por página.</td></tr>:pages.map(p=><tr key={p.pg}><td>{p.pg}</td><td>{fmtN(p.sessions)}</td><td>{fmtN(p.conversions)}</td></tr>)}
        </tbody></table></div>
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
      <div className="w-14 h-14 rounded-3xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center mb-5">
        <svg className="w-7 h-7 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      </div>
      <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 dark:text-slate-100 mb-2">{label}: datos pendientes</h3>
      <p className="text-slate-500 mb-6 max-w-sm">Analytics de Antuario está pendiente de lectura desde el servidor.</p>
      <a href="/configuracion/integraciones" className="bg-gradient-to-r from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 text-white text-sm font-semibold px-6 py-3 rounded-xl transition-all shadow-md">
        Ver estado de fuentes →
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
