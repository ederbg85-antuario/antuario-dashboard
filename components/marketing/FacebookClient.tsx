'use client'

import { useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { CARD_S, PAGE_WRAP, PageHeader } from '@/components/ui/dashboard'
import type { DateFilter } from '@/lib/date-filter'
import { formatDateRange } from '@/lib/date-filter'

type MetricRow = { metric_key: string; value: number }
type TrendRow  = { date: string; metric_key: string; daily_total: number }
type Connection = {
  id: string
  status: string
  external_name: string | null
  last_sync_at: string | null
} | null

type Props = {
  connection:    Connection
  globalMetrics: MetricRow[]
  prevMetrics:   MetricRow[]
  trendData:     TrendRow[]
  dateFilter?:   DateFilter
}

function sumM(rows: MetricRow[], key: string) {
  return rows.filter(r => r.metric_key === key).reduce((s, r) => s + r.value, 0)
}
function calcDelta(cur: number, prev: number) {
  if (!prev) return 0
  return ((cur - prev) / prev) * 100
}
function fmtN(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000)      return `${(n / 1000).toFixed(1)}k`
  return n.toFixed(0)
}
function fmtPct(n: number) { return `${n.toFixed(2)}%` }

const FbIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
    <rect width="24" height="24" rx="6" fill="#1877F2"/>
    <path d="M13.5 8h-1c-.55 0-1 .45-1 1v1.5H13l-.5 2H11.5V18H9.5v-5.5H8V10h1.5V9c0-1.66 1.34-3 3-3H13.5V8z" fill="white"/>
  </svg>
)

export default function FacebookClient({
  connection, globalMetrics, prevMetrics, trendData, dateFilter,
}: Props) {
  const hasData = globalMetrics.length > 0

  const m = useMemo(() => {
    const followers   = sumM(globalMetrics, 'followers')
    const likes       = sumM(globalMetrics, 'page_likes')
    const reach       = sumM(globalMetrics, 'reach')
    const impressions = sumM(globalMetrics, 'impressions')
    const engaged     = sumM(globalMetrics, 'engaged_users')
    const posts       = sumM(globalMetrics, 'posts')
    const engRate     = impressions > 0 ? (engaged / impressions) * 100 : 0

    const pFollowers   = sumM(prevMetrics, 'followers')
    const pReach       = sumM(prevMetrics, 'reach')
    const pImpressions = sumM(prevMetrics, 'impressions')
    const pEngaged     = sumM(prevMetrics, 'engaged_users')
    const pEngRate     = pImpressions > 0 ? (pEngaged / pImpressions) * 100 : 0

    return {
      followers, likes, reach, impressions, engaged, posts, engRate,
      dFollowers: calcDelta(followers, pFollowers),
      dReach:     calcDelta(reach, pReach),
      dEngRate:   calcDelta(engRate, pEngRate),
    }
  }, [globalMetrics, prevMetrics])

  // Tendencia por fecha
  const trendByDate = useMemo(() => {
    const map: Record<string, { date: string; reach: number; engaged_users: number }> = {}
    for (const r of trendData) {
      if (!map[r.date]) map[r.date] = { date: r.date, reach: 0, engaged_users: 0 }
      if (r.metric_key === 'reach')          map[r.date].reach         += r.daily_total
      if (r.metric_key === 'engaged_users')  map[r.date].engaged_users += r.daily_total
    }
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date))
  }, [trendData])

  const isConnected = !!connection && connection.status === 'active'
  const hasSynced   = !!connection?.last_sync_at

  // ── Sin conexión ──────────────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <div className={PAGE_WRAP}>
        <PageHeader
          eyebrow="Marketing"
          title="Facebook"
          sub="Conecta tu página de Facebook para ver el rendimiento orgánico"
        />
        <div className="rounded-3xl bg-white dark:bg-[#161b27] p-10 text-center max-w-md mx-auto mt-4" style={CARD_S}>
          <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center mx-auto mb-4">
            <FbIcon />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">
            Facebook no conectado
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
            Conecta tu página para ver seguidores, alcance, impresiones y tasa de engagement.
          </p>
          <a
            href="/configuracion/integraciones"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1877F2] text-white text-sm font-semibold hover:bg-[#1565c0] transition-colors">
            <FbIcon />
            Conectar Facebook
          </a>
        </div>
      </div>
    )
  }

  // ── Con conexión ──────────────────────────────────────────────────────────
  return (
    <div className={PAGE_WRAP}>
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <PageHeader
          eyebrow="Marketing"
          title="Facebook"
          sub={`${connection.external_name ?? 'Página conectada'} · ${dateFilter ? formatDateRange(dateFilter) : 'Últimos 30 días'}`}
        />
        <div className="flex items-center gap-2 mt-1 shrink-0">
          <span className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-3 py-1.5 rounded-full font-medium">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
            Conectado
          </span>
        </div>
      </div>

      {!hasData ? (
        <div className="rounded-3xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-6 text-center">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-1">
            {hasSynced ? 'Sin datos para este período' : 'Primer sync pendiente'}
          </p>
          <p className="text-xs text-amber-600 dark:text-amber-400">
            {hasSynced
              ? 'No hay datos de Facebook para el rango de fechas seleccionado.'
              : 'El primer sync puede tardar unos minutos. Recarga la página pronto.'}
          </p>
        </div>
      ) : (
        <>
          {/* KPIs principales */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <div className="rounded-3xl p-4 md:p-5 bg-white dark:bg-[#1e2535]" style={CARD_S}>
              <p className="text-[9px] md:text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.14em] mb-2 md:mb-3">Seguidores</p>
              <p className="text-2xl md:text-3xl font-extrabold tabular-nums text-slate-900 dark:text-white mb-1">{fmtN(m.followers)}</p>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold ${m.dFollowers >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {m.dFollowers >= 0 ? '+' : ''}{m.dFollowers.toFixed(1)}%
                </span>
                <span className="text-xs text-slate-400">vs período ant.</span>
              </div>
            </div>
            <div className="rounded-3xl p-4 md:p-5 bg-white dark:bg-[#1e2535]" style={CARD_S}>
              <p className="text-[9px] md:text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.14em] mb-2 md:mb-3">Alcance</p>
              <p className="text-2xl md:text-3xl font-extrabold tabular-nums text-slate-900 dark:text-white mb-1">{fmtN(m.reach)}</p>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold ${m.dReach >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {m.dReach >= 0 ? '+' : ''}{m.dReach.toFixed(1)}%
                </span>
                <span className="text-xs text-slate-400">vs período ant.</span>
              </div>
            </div>
            <div className="rounded-3xl p-4 md:p-5 bg-white dark:bg-[#1e2535]" style={CARD_S}>
              <p className="text-[9px] md:text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.14em] mb-2 md:mb-3">Engagement</p>
              <p className="text-2xl md:text-3xl font-extrabold tabular-nums text-slate-900 dark:text-white mb-1">{fmtPct(m.engRate)}</p>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold ${m.dEngRate >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {m.dEngRate >= 0 ? '+' : ''}{m.dEngRate.toFixed(1)}%
                </span>
                <span className="text-xs text-slate-400">vs período ant.</span>
              </div>
            </div>
            <div className="rounded-3xl p-4 md:p-5 bg-white dark:bg-[#1e2535]" style={CARD_S}>
              <p className="text-[9px] md:text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.14em] mb-2 md:mb-3">Impresiones</p>
              <p className="text-2xl md:text-3xl font-extrabold tabular-nums text-slate-900 dark:text-white mb-1">{fmtN(m.impressions)}</p>
              <span className="text-xs text-slate-400">total del período</span>
            </div>
          </div>

          {/* KPIs secundarios */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <div className="rounded-3xl p-4 md:p-5 bg-white dark:bg-[#1e2535]" style={CARD_S}>
              <p className="text-[9px] md:text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.14em] mb-2 md:mb-3">Me gusta (página)</p>
              <p className="text-2xl md:text-3xl font-extrabold tabular-nums text-slate-900 dark:text-white">{fmtN(m.likes)}</p>
              <p className="text-xs text-slate-400 mt-2">total de la página</p>
            </div>
            <div className="rounded-3xl p-4 md:p-5 bg-white dark:bg-[#1e2535]" style={CARD_S}>
              <p className="text-[9px] md:text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.14em] mb-2 md:mb-3">Usuarios comprometidos</p>
              <p className="text-2xl md:text-3xl font-extrabold tabular-nums text-slate-900 dark:text-white">{fmtN(m.engaged)}</p>
              <p className="text-xs text-slate-400 mt-2">interactuaron con contenido</p>
            </div>
            <div className="rounded-3xl p-4 md:p-5 bg-white dark:bg-[#1e2535]" style={CARD_S}>
              <p className="text-[9px] md:text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.14em] mb-2 md:mb-3">Publicaciones</p>
              <p className="text-2xl md:text-3xl font-extrabold tabular-nums text-slate-900 dark:text-white">{fmtN(m.posts)}</p>
              <p className="text-xs text-slate-400 mt-2">contenido publicado</p>
            </div>
          </div>

          {/* Gráfica de alcance diario */}
          {trendByDate.length > 0 && (
            <div className="bg-white dark:bg-[#1e2535] rounded-3xl p-6" style={CARD_S}>
              <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-slate-400 dark:text-slate-500 mb-6">Alcance diario — personas alcanzadas</p>
              <ResponsiveContainer width="100%" height={190}>
                <AreaChart data={trendByDate} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="fbReachGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#1877F2" stopOpacity={0.45}/>
                      <stop offset="100%" stopColor="#1877F2" stopOpacity={0.02}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" vertical={false}/>
                  <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 500 }} tickFormatter={(v: string) => v.slice(5)} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 500 }} tickFormatter={(v: number) => fmtN(v)} />
                  <Tooltip contentStyle={{ background: 'rgba(15,20,35,0.92)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', fontSize: 12, color: '#e2e8f0' }} itemStyle={{ color: '#e2e8f0', fontWeight: 600 }} labelStyle={{ color: '#94a3b8', fontWeight: 500 }} cursor={{ stroke: 'rgba(148,163,184,0.2)', strokeWidth: 1.5 }} />
                  <Area type="monotone" dataKey="reach" stroke="#1877F2" strokeWidth={3} fill="url(#fbReachGrad)" name="Alcance" dot={false} activeDot={{ r: 5, strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  )
}
