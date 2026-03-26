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
type DimRow    = { dimension_value: string | null; metric_key: string; value: number }
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
  campaignData:  DimRow[]
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
function fmtCurrency(n: number) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency', currency: 'MXN', maximumFractionDigits: 0,
  }).format(n)
}
function fmtPct(n: number) { return `${n.toFixed(2)}%` }

const MetaIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="#1877F2"/>
    <path d="M13 8h-1.5C10.67 8 10 8.67 10 9.5V11H8v2.5h2V19h2.5v-5.5H15l.5-2.5h-2.5V9.5c0-.28.22-.5.5-.5H15V8h-2z" fill="white"/>
  </svg>
)

export default function MetaAdsClient({
  connection, globalMetrics, prevMetrics, trendData, campaignData, dateFilter,
}: Props) {
  const hasData = globalMetrics.length > 0

  const m = useMemo(() => {
    const spend  = sumM(globalMetrics, 'spend')
    const conv   = sumM(globalMetrics, 'conversions')
    const clicks = sumM(globalMetrics, 'clicks')
    const impr   = sumM(globalMetrics, 'impressions')
    const reach  = sumM(globalMetrics, 'reach')
    const cpa    = conv > 0 ? spend / conv : 0
    const ctr    = impr > 0 ? (clicks / impr) * 100 : 0
    const roas   = sumM(globalMetrics, 'roas')
    const freq   = reach > 0 ? impr / reach : 0

    const pSpend = sumM(prevMetrics, 'spend')
    const pConv  = sumM(prevMetrics, 'conversions')
    const pCpa   = pConv > 0 ? pSpend / pConv : 0

    return {
      spend, conv, clicks, impr, reach, cpa, ctr, roas, freq,
      dSpend: calcDelta(spend, pSpend),
      dConv:  calcDelta(conv, pConv),
      dCpa:   calcDelta(cpa, pCpa),
    }
  }, [globalMetrics, prevMetrics])

  // Agrupar trend por fecha
  const trendByDate = useMemo(() => {
    const map: Record<string, { date: string; spend: number; conversions: number }> = {}
    for (const r of trendData) {
      if (!map[r.date]) map[r.date] = { date: r.date, spend: 0, conversions: 0 }
      if (r.metric_key === 'spend')       map[r.date].spend       += r.daily_total
      if (r.metric_key === 'conversions') map[r.date].conversions += r.daily_total
    }
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date))
  }, [trendData])

  // Agrupación de campañas
  const campaigns = useMemo(() => {
    const map: Record<string, { name: string; spend: number; conv: number; clicks: number; impr: number }> = {}
    for (const r of campaignData) {
      const k = r.dimension_value ?? 'Sin campaña'
      if (!map[k]) map[k] = { name: k, spend: 0, conv: 0, clicks: 0, impr: 0 }
      if (r.metric_key === 'spend')       map[k].spend  += r.value
      if (r.metric_key === 'conversions') map[k].conv   += r.value
      if (r.metric_key === 'clicks')      map[k].clicks += r.value
      if (r.metric_key === 'impressions') map[k].impr   += r.value
    }
    return Object.values(map).sort((a, b) => b.spend - a.spend).slice(0, 10)
  }, [campaignData])

  const isConnected = !!connection && connection.status === 'active'
  const hasSynced   = !!connection?.last_sync_at

  // ── Sin conexión ──────────────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <div className={PAGE_WRAP}>
        <PageHeader
          eyebrow="Marketing"
          title="Meta Ads"
          sub="Conecta tu cuenta publicitaria de Meta para ver el rendimiento de tus campañas"
        />
        <div className="rounded-3xl bg-white dark:bg-[#161b27] p-10 text-center max-w-md mx-auto mt-4" style={CARD_S}>
          <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center mx-auto mb-4">
            <MetaIcon />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">
            Meta Ads no conectado
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
            Conecta tu cuenta publicitaria para ver métricas de gasto, conversiones, CPA y rendimiento por campaña.
          </p>
          <a
            href="/configuracion/integraciones"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1877F2] text-white text-sm font-semibold hover:bg-[#1565c0] transition-colors">
            <MetaIcon />
            Conectar Meta Ads
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
          title="Meta Ads"
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
              ? 'No hay datos de Meta Ads para el rango de fechas seleccionado.'
              : 'El primer sync puede tardar unos minutos. Recarga la página pronto.'}
          </p>
        </div>
      ) : (
        <>
          {/* KPIs principales */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            <div className="rounded-3xl p-4 md:p-5 bg-white dark:bg-[#1e2535]" style={CARD_S}>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Inversión</p>
              <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">{fmtCurrency(m.spend)}</p>
              <p className={`text-[10px] mt-1.5 font-semibold ${m.dSpend >= 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                {m.dSpend >= 0 ? '+' : ''}{m.dSpend.toFixed(1)}% vs período ant.
              </p>
            </div>
            <div className="rounded-3xl p-4 md:p-5 bg-white dark:bg-[#1e2535]" style={CARD_S}>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Conversiones</p>
              <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">{fmtN(m.conv)}</p>
              <p className={`text-[10px] mt-1.5 font-semibold ${m.dConv >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                {m.dConv >= 0 ? '+' : ''}{m.dConv.toFixed(1)}% vs período ant.
              </p>
            </div>
            <div className="rounded-3xl p-4 md:p-5 bg-white dark:bg-[#1e2535]" style={CARD_S}>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">CPA</p>
              <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">{fmtCurrency(m.cpa)}</p>
              <p className={`text-[10px] mt-1.5 font-semibold ${m.dCpa <= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                {m.dCpa >= 0 ? '+' : ''}{m.dCpa.toFixed(1)}% vs período ant.
              </p>
            </div>
            <div className="rounded-3xl p-4 md:p-5 bg-white dark:bg-[#1e2535]" style={CARD_S}>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">ROAS</p>
              <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">
                {m.roas > 0 ? `${m.roas.toFixed(2)}x` : '—'}
              </p>
              <p className="text-[10px] mt-1.5 text-slate-400 dark:text-slate-500">Retorno sobre inversión</p>
            </div>
          </div>

          {/* KPIs secundarios */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            <div className="rounded-3xl p-4 md:p-5 bg-white dark:bg-[#1e2535]" style={CARD_S}>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Impresiones</p>
              <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">{fmtN(m.impr)}</p>
            </div>
            <div className="rounded-3xl p-4 md:p-5 bg-white dark:bg-[#1e2535]" style={CARD_S}>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Clics</p>
              <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">{fmtN(m.clicks)}</p>
            </div>
            <div className="rounded-3xl p-4 md:p-5 bg-white dark:bg-[#1e2535]" style={CARD_S}>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">CTR</p>
              <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">{fmtPct(m.ctr)}</p>
            </div>
            <div className="rounded-3xl p-4 md:p-5 bg-white dark:bg-[#1e2535]" style={CARD_S}>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Frecuencia</p>
              <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">
                {m.freq > 0 ? m.freq.toFixed(2) : '—'}
              </p>
            </div>
          </div>

          {/* Gráfica de inversión diaria */}
          {trendByDate.length > 0 && (
            <div className="bg-white dark:bg-[#161b27] rounded-3xl p-5 md:p-6" style={CARD_S}>
              <h3 className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 mb-1">Inversión diaria</h3>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-4">Gasto diario en MXN</p>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={trendByDate}>
                  <defs>
                    <linearGradient id="metaSpendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#1877F2" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="#1877F2" stopOpacity={0}/>
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
                    tickFormatter={(v: number) => `$${fmtN(v)}`}
                  />
                  <Tooltip
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(v: any) => [fmtCurrency(v as number), 'Inversión']}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    labelFormatter={(l: any) => `Fecha: ${l}`}
                  />
                  <Area
                    type="monotone"
                    dataKey="spend"
                    stroke="#1877F2"
                    strokeWidth={2}
                    fill="url(#metaSpendGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Tabla de campañas */}
          {campaigns.length > 0 && (
            <div className="bg-white dark:bg-[#161b27] rounded-3xl p-5 md:p-6" style={CARD_S}>
              <h3 className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 mb-4">
                Rendimiento por campaña
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-white/[0.06]">
                      <th className="text-left pb-3">Campaña</th>
                      <th className="text-right pb-3">Inversión</th>
                      <th className="text-right pb-3">Conv.</th>
                      <th className="text-right pb-3">CPA</th>
                      <th className="text-right pb-3">CTR</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-white/[0.04]">
                    {campaigns.map(c => (
                      <tr key={c.name} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                        <td className="py-3 text-slate-800 dark:text-slate-200 font-medium max-w-48 truncate">{c.name}</td>
                        <td className="py-3 text-right text-slate-700 dark:text-slate-300 tabular-nums">{fmtCurrency(c.spend)}</td>
                        <td className="py-3 text-right text-slate-700 dark:text-slate-300 tabular-nums">{fmtN(c.conv)}</td>
                        <td className="py-3 text-right text-slate-700 dark:text-slate-300 tabular-nums">
                          {c.conv > 0 ? fmtCurrency(c.spend / c.conv) : '—'}
                        </td>
                        <td className="py-3 text-right text-slate-700 dark:text-slate-300 tabular-nums">
                          {c.impr > 0 ? fmtPct((c.clicks / c.impr) * 100) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
