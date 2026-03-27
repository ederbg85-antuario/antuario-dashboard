'use client'

import { useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { CARD_S, PAGE_WRAP, PageHeader } from '@/components/ui/dashboard'
import type { DateFilter } from '@/lib/date-filter'
import { formatDateRange } from '@/lib/date-filter'

type MetricRow = { metric_key: string; value: number; date?: string }
type TrendRow = { date: string; metric_key: string; daily_total: number }
type Connection = { id: string; status: string; external_name: string | null; last_sync_at: string | null } | null

type Props = {
  connection: Connection
  globalMetrics: MetricRow[]
  prevMetrics: MetricRow[]
  trendData: TrendRow[]
  dateFilter?: DateFilter
}

function sumM(rows: MetricRow[], key: string) {
  return rows.filter(r => r.metric_key === key).reduce((s, r) => s + r.value, 0)
}
function calcDelta(cur: number, prev: number) {
  if (!prev) return 0
  return ((cur - prev) / prev) * 100
}
function fmtN(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return n.toFixed(0)
}

export default function GMBClient({ connection, globalMetrics, prevMetrics, trendData, dateFilter }: Props) {
  const hasData = globalMetrics.length > 0

  const m = useMemo(() => {
    const views = sumM(globalMetrics, 'profile_views')
    const calls = sumM(globalMetrics, 'phone_calls')
    const webClicks = sumM(globalMetrics, 'website_clicks')
    const dirs = sumM(globalMetrics, 'direction_requests')
    const actions = calls + webClicks + dirs
    const actionRate = views > 0 ? (actions / views) * 100 : 0

    const pViews = sumM(prevMetrics, 'profile_views')
    const pActions = sumM(prevMetrics, 'phone_calls') + sumM(prevMetrics, 'website_clicks') + sumM(prevMetrics, 'direction_requests')

    return {
      views, calls, webClicks, dirs, actions, actionRate,
      deltaViews: calcDelta(views, pViews),
      deltaActions: calcDelta(actions, pActions),
    }
  }, [globalMetrics, prevMetrics])

  const trend = useMemo(() => {
    const map: Record<string, Record<string, number>> = {}
    trendData.forEach(r => {
      const month = r.date.slice(0, 7)
      if (!map[month]) map[month] = {}
      map[month][r.metric_key] = (map[month][r.metric_key] ?? 0) + r.daily_total
    })
    return Object.entries(map).sort(([a], [b]) => a < b ? -1 : 1).map(([date, vals]) => ({
      date,
      views: vals.profile_views ?? 0,
      calls: vals.phone_calls ?? 0,
      webClicks: vals.website_clicks ?? 0,
      dirs: vals.direction_requests ?? 0,
    }))
  }, [trendData])

  const actionsBreakdown = [
    { name: 'Llamadas', value: m.calls, color: '#10b981', icon: '☎️' },
    { name: 'Clics al sitio', value: m.webClicks, color: '#3b82f6', icon: '<' },
    { name: 'Rutas solicitadas', value: m.dirs, color: '#f59e0b', icon: '📍' },
  ]

  const actionRateStatus =
    m.actionRate > 5 ? { label: 'Perfil muy efectivo', color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100', bar: '#10b981' } :
      m.actionRate > 2 ? { label: 'Perfil en rango normal', color: 'text-blue-700 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20 border border-blue-100', bar: '#3b82f6' } :
        { label: 'Perfil necesita mejoras', color: 'text-red-700 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20 border border-red-100', bar: '#ef4444' }

  if (!connection) return <ConnectCTA />
  if (!hasData) return <NoData lastSync={connection.last_sync_at} />

  return (
    <div className={PAGE_WRAP}>

      <PageHeader
        eyebrow="Marketing"
        title="Google Maps  My Business"
        sub={`${connection.external_name ?? 'Perfil conectado'} • ${dateFilter ? formatDateRange(dateFilter) : 'Últimos 30 días'}`}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <KpiCard label="Visualizaciones" value={fmtN(m.views)} delta={m.deltaViews} positiveIsGood sub="vistas del perfil" />
        <KpiCard label="Llamadas directas" value={fmtN(m.calls)} delta={0} positiveIsGood sub="desde Google Maps" />
        <KpiCard label="Clics al sitio" value={fmtN(m.webClicks)} delta={0} positiveIsGood sub="hacia tu web" />
        <KpiCard label="Solicitudes ruta" value={fmtN(m.dirs)} delta={m.deltaActions} positiveIsGood sub="cómo llegar" />
      </div>

      {/* Tasa de acción */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className={`rounded-3xl p-6 ${actionRateStatus.bg}`}>
          <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-slate-400 dark:text-slate-500 mb-4">
            Tasa de acción del perfil
          </p>
          <p className={`text-5xl font-extrabold tabular-nums mb-2 ${actionRateStatus.color}`}>
            {m.actionRate.toFixed(1)}%
          </p>
          <div className="w-full h-3 bg-white dark:bg-[#1e2535]/70 rounded-full overflow-hidden mb-3">
            <div className="h-3 rounded-full transition-all duration-700"
              style={{ width: `${Math.min(100, m.actionRate * 10)}%`, backgroundColor: actionRateStatus.bar }} />
          </div>
          <p className={`text-sm font-semibold ${actionRateStatus.color}`}>{actionRateStatus.label}</p>
          <div className="mt-3 space-y-1 text-xs text-slate-500">
            <div className="flex justify-between"><span>Excelente</span><span>&gt; 5%</span></div>
            <div className="flex justify-between"><span>Normal</span><span>2  5%</span></div>
            <div className="flex justify-between"><span>Mejorar</span><span>&lt; 2%</span></div>
          </div>
        </div>

        {/* Acciones breakdown */}
        <div className="bg-white dark:bg-[#1e2535] rounded-3xl p-6" style={CARD_S}>
          <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-slate-400 dark:text-slate-500 mb-4">
            Desglose de acciones ({fmtN(m.actions)} total)
          </p>
          <div className="space-y-4">
            {actionsBreakdown.map(a => {
              const pct = m.actions > 0 ? (a.value / m.actions) * 100 : 0
              return (
                <div key={a.name}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span>{a.icon}</span>
                      <span className="text-sm text-slate-600 dark:text-slate-300">{a.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-800 dark:text-slate-100 dark:text-slate-100 tabular-nums">{fmtN(a.value)}</span>
                      <span className="text-xs text-slate-400">{pct.toFixed(0)}%</span>
                    </div>
                  </div>
                  <div className="w-full h-2 bg-slate-100 dark:bg-[#1a2030] rounded-full overflow-hidden">
                    <div className="h-2 rounded-full" style={{ width: `${pct}%`, backgroundColor: a.color }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Tips de mejora */}
        <div className="bg-white dark:bg-[#1e2535] rounded-3xl p-6" style={CARD_S}>
          <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-slate-400 dark:text-slate-500 mb-4">
            Cómo mejorar tu perfil
          </p>
          <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
            {[
              { icon: '📷', tip: 'Agrega fotos actualizadas cada mes. Los perfiles con fotos reciben 42% más solicitudes de ruta.' },
              { icon: '💬', tip: 'Responde todas las reseñas en menos de 24 horas. Mejora el ranking local.' },
              { icon: '📝', tip: 'Publica una actualización semanal (oferta, evento o novedad) para mantenerte relevante.' },
              { icon: '🕐', tip: 'Verifica que tus horarios sean exactos, especialmente en días festivos.' },
            ].map((item, i) => (
              <div key={i} className="flex gap-2">
                <span className="shrink-0">{item.icon}</span>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{item.tip}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tendencia */}
      <div className="bg-white dark:bg-[#1e2535] rounded-3xl p-6" style={CARD_S}>
        <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-slate-400 dark:text-slate-500 mb-6">
          Tendencia de visualizaciónes y acciones  6 meses
        </p>
        <ResponsiveContainer width="100%" height={190}>
          <AreaChart data={trend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="gViewsGMB" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.45} />
                <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="gCallsGMB" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="gClicksGMB" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" vertical={false} />
            <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 500 }} />
            <YAxis yAxisId="left" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 500 }} />
            <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 500 }} />
            <Tooltip contentStyle={{ background: 'rgba(15,20,35,0.92)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', fontSize: 12, color: '#e2e8f0' }} itemStyle={{ color: '#e2e8f0', fontWeight: 600 }} labelStyle={{ color: '#94a3b8', fontWeight: 500 }} cursor={{ stroke: 'rgba(148,163,184,0.2)', strokeWidth: 1.5 }} />
            <Area yAxisId="left" type="monotone" dataKey="views" stroke="#f43f5e" strokeWidth={3} fill="url(#gViewsGMB)" name="Visualizaciones" dot={false} activeDot={{ r: 5, strokeWidth: 0 }} />
            <Area yAxisId="right" type="monotone" dataKey="calls" stroke="#10b981" strokeWidth={2.5} fill="url(#gCallsGMB)" name="Llamadas" dot={false} activeDot={{ r: 5, strokeWidth: 0 }} />
            <Area yAxisId="right" type="monotone" dataKey="webClicks" stroke="#3b82f6" strokeWidth={2.5} fill="url(#gClicksGMB)" name="Clics web" dot={false} activeDot={{ r: 5, strokeWidth: 0 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function KpiCard({ label, value, delta, positiveIsGood, sub }: {
  label: string; value: string; delta: number; positiveIsGood: boolean; sub: string
}) {
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

function ConnectCTA() {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-center px-8">
      <div className="w-14 h-14 rounded-3xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center mb-5">
        <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </div>
      <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 dark:text-slate-100 mb-2">Conecta Google My Business</h3>
      <p className="text-slate-500 mb-6 max-w-sm">Vincula tu perfil de Google Maps para analizar tu presencia local.</p>
      <a href="/configuración/integraciones" className="bg-gradient-to-r from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 text-white text-sm font-semibold px-6 py-3 rounded-xl transition-all shadow-md">
        Ir a Integraciones →
      </a>
    </div>
  )
}

function NoData({ lastSync }: { lastSync: string | null }) {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-center px-8">
      <p className="text-slate-500 font-medium">Google Maps conectado  sync pendiente</p>
      {lastSync && <p className="text-slate-400 text-sm mt-2">Último sync: {new Date(lastSync).toLocaleString('es-MX')}</p>}
    </div>
  )
}
