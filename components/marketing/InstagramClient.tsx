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

const IgIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
    <defs>
      <linearGradient id="igGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%"   stopColor="#f09433"/>
        <stop offset="25%"  stopColor="#e6683c"/>
        <stop offset="50%"  stopColor="#dc2743"/>
        <stop offset="75%"  stopColor="#cc2366"/>
        <stop offset="100%" stopColor="#bc1888"/>
      </linearGradient>
    </defs>
    <rect width="24" height="24" rx="6" fill="url(#igGrad)"/>
    <circle cx="12" cy="12" r="4" stroke="white" strokeWidth="1.5" fill="none"/>
    <circle cx="17" cy="7" r="1" fill="white"/>
    <rect x="4" y="4" width="16" height="16" rx="5" stroke="white" strokeWidth="1.5" fill="none"/>
  </svg>
)

export default function InstagramClient({
  connection, globalMetrics, prevMetrics, trendData, dateFilter,
}: Props) {
  const hasData = globalMetrics.length > 0

  const m = useMemo(() => {
    const followers      = sumM(globalMetrics, 'followers')
    const reach          = sumM(globalMetrics, 'reach')
    const impressions    = sumM(globalMetrics, 'impressions')
    const profileViews   = sumM(globalMetrics, 'profile_views')
    const websiteClicks  = sumM(globalMetrics, 'website_clicks')
    const mediaCount     = sumM(globalMetrics, 'media_count')
    const likes          = sumM(globalMetrics, 'likes')
    const comments       = sumM(globalMetrics, 'comments')
    const saves          = sumM(globalMetrics, 'saves')
    const totalInteract  = likes + comments + saves
    const engRate        = reach > 0 ? (totalInteract / reach) * 100 : 0

    const pFollowers   = sumM(prevMetrics, 'followers')
    const pReach       = sumM(prevMetrics, 'reach')
    const pProfileViews= sumM(prevMetrics, 'profile_views')
    const pLikes       = sumM(prevMetrics, 'likes')
    const pComments    = sumM(prevMetrics, 'comments')
    const pSaves       = sumM(prevMetrics, 'saves')
    const pTotalInteract = pLikes + pComments + pSaves
    const pEngRate     = pReach > 0 ? (pTotalInteract / pReach) * 100 : 0

    return {
      followers, reach, impressions, profileViews, websiteClicks, mediaCount,
      likes, comments, saves, totalInteract, engRate,
      dFollowers:   calcDelta(followers, pFollowers),
      dReach:       calcDelta(reach, pReach),
      dProfileViews:calcDelta(profileViews, pProfileViews),
      dEngRate:     calcDelta(engRate, pEngRate),
    }
  }, [globalMetrics, prevMetrics])

  // Tendencia por fecha
  const trendByDate = useMemo(() => {
    const map: Record<string, { date: string; reach: number; impressions: number }> = {}
    for (const r of trendData) {
      if (!map[r.date]) map[r.date] = { date: r.date, reach: 0, impressions: 0 }
      if (r.metric_key === 'reach')       map[r.date].reach       += r.daily_total
      if (r.metric_key === 'impressions') map[r.date].impressions += r.daily_total
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
          title="Instagram"
          sub="Conecta tu cuenta de Instagram Business para ver el rendimiento orgánico"
        />
        <div className="rounded-3xl bg-white dark:bg-[#161b27] p-10 text-center max-w-md mx-auto mt-4" style={CARD_S}>
          <div className="w-14 h-14 rounded-2xl bg-pink-50 dark:bg-pink-900/20 flex items-center justify-center mx-auto mb-4">
            <IgIcon />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">
            Instagram no conectado
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
            Conecta tu cuenta Instagram Business para ver seguidores, alcance, impresiones y engagement.
          </p>
          <a
            href="/configuracion/integraciones"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold transition-colors"
            style={{ background: 'linear-gradient(135deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)' }}
          >
            <IgIcon />
            Conectar Instagram
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
          title="Instagram"
          sub={`${connection.external_name ?? 'Cuenta conectada'} · ${dateFilter ? formatDateRange(dateFilter) : 'Últimos 30 días'}`}
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
              ? 'No hay datos de Instagram para el rango de fechas seleccionado.'
              : 'El primer sync puede tardar unos minutos. Recarga la página pronto.'}
          </p>
        </div>
      ) : (
        <>
          {/* KPIs principales */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            <div className="rounded-3xl p-4 md:p-5 bg-white dark:bg-[#1e2535]" style={CARD_S}>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Seguidores</p>
              <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">{fmtN(m.followers)}</p>
              <p className={`text-[10px] mt-1.5 font-semibold ${m.dFollowers >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                {m.dFollowers >= 0 ? '+' : ''}{m.dFollowers.toFixed(1)}% vs período ant.
              </p>
            </div>
            <div className="rounded-3xl p-4 md:p-5 bg-white dark:bg-[#1e2535]" style={CARD_S}>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Alcance</p>
              <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">{fmtN(m.reach)}</p>
              <p className={`text-[10px] mt-1.5 font-semibold ${m.dReach >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                {m.dReach >= 0 ? '+' : ''}{m.dReach.toFixed(1)}% vs período ant.
              </p>
            </div>
            <div className="rounded-3xl p-4 md:p-5 bg-white dark:bg-[#1e2535]" style={CARD_S}>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Engagement</p>
              <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">{fmtPct(m.engRate)}</p>
              <p className={`text-[10px] mt-1.5 font-semibold ${m.dEngRate >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                {m.dEngRate >= 0 ? '+' : ''}{m.dEngRate.toFixed(1)}% vs período ant.
              </p>
            </div>
            <div className="rounded-3xl p-4 md:p-5 bg-white dark:bg-[#1e2535]" style={CARD_S}>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Visitas al perfil</p>
              <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">{fmtN(m.profileViews)}</p>
              <p className={`text-[10px] mt-1.5 font-semibold ${m.dProfileViews >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                {m.dProfileViews >= 0 ? '+' : ''}{m.dProfileViews.toFixed(1)}% vs período ant.
              </p>
            </div>
          </div>

          {/* KPIs secundarios */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            <div className="rounded-3xl p-4 md:p-5 bg-white dark:bg-[#1e2535]" style={CARD_S}>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Impresiones</p>
              <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">{fmtN(m.impressions)}</p>
            </div>
            <div className="rounded-3xl p-4 md:p-5 bg-white dark:bg-[#1e2535]" style={CARD_S}>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Clics web</p>
              <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">{fmtN(m.websiteClicks)}</p>
            </div>
            <div className="rounded-3xl p-4 md:p-5 bg-white dark:bg-[#1e2535]" style={CARD_S}>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Me gusta + comentarios + guardados</p>
              <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">{fmtN(m.totalInteract)}</p>
            </div>
            <div className="rounded-3xl p-4 md:p-5 bg-white dark:bg-[#1e2535]" style={CARD_S}>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Publicaciones</p>
              <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">{fmtN(m.mediaCount)}</p>
            </div>
          </div>

          {/* Gráfica de alcance diario */}
          {trendByDate.length > 0 && (
            <div className="bg-white dark:bg-[#161b27] rounded-3xl p-5 md:p-6" style={CARD_S}>
              <h3 className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 mb-1">Alcance e impresiones diarias</h3>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-4">Personas alcanzadas e impresiones por día</p>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={trendByDate}>
                  <defs>
                    <linearGradient id="igReachGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#dc2743" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="#dc2743" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="igImprGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#f09433" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#f09433" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" className="dark:stroke-white/[0.05]"/>
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    tickFormatter={(v: string) => v.slice(5)}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    tickFormatter={(v: number) => fmtN(v)}
                  />
                  <Tooltip
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(v: any, name: any) => [fmtN(v as number), name === 'reach' ? 'Alcance' : 'Impresiones']}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    labelFormatter={(l: any) => `Fecha: ${l}`}
                  />
                  <Area type="monotone" dataKey="impressions" stroke="#f09433" strokeWidth={1.5} fill="url(#igImprGrad)" />
                  <Area type="monotone" dataKey="reach"       stroke="#dc2743" strokeWidth={2}   fill="url(#igReachGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  )
}
