'use client'

import { useMemo, useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { CARD_S, PAGE_WRAP, PageHeader } from '@/components/ui/dashboard'
import type { DateFilter } from '@/lib/date-filter'
import { formatDateRange } from '@/lib/date-filter'

type MetricRow = { metric_key: string; value: number }
type DimRow = { dimension_value: string | null; metric_key: string; value: number }
type TrendRow = { date: string; metric_key: string; daily_total: number }
type Connection = { id: string; status: string; external_name: string | null; last_sync_at: string | null } | null

type Props = {
  connection: Connection
  globalMetrics: MetricRow[]
  prevMetrics: MetricRow[]
  trendData: TrendRow[]
  campaignData: DimRow[]
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
function fmtCurrency(n: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)
}

export default function AdsClient({
  connection, globalMetrics, prevMetrics, trendData, campaignData, dateFilter,
}: Props) {
  const [cpaThreshold, setCpaThreshold] = useState(500)
  const hasData = globalMetrics.length > 0

  const m = useMemo(() => {
    const cost = sumM(globalMetrics, 'cost')
    const conv = sumM(globalMetrics, 'conversions')
    const clicks = sumM(globalMetrics, 'clicks')
    const impr = sumM(globalMetrics, 'impressions')
    const cpa = conv > 0 ? cost / conv : 0
    const ctr = impr > 0 ? (clicks / impr) * 100 : 0
    const convRate = clicks > 0 ? (conv / clicks) * 100 : 0

    const pCost = sumM(prevMetrics, 'cost')
    const pConv = sumM(prevMetrics, 'conversions')
    const pCpa = pConv > 0 ? pCost / pConv : 0

    return {
      cost, conv, cpa, ctr, convRate,
      deltaCost: calcDelta(cost, pCost),
      deltaConv: calcDelta(conv, pConv),
      deltaCpa: calcDelta(cpa, pCpa),
    }
  }, [globalMetrics, prevMetrics])

  const campaigns = useMemo(() => {
    const map: Record<string, Record<string, number>> = {}
    campaignData.forEach(r => {
      const name = r.dimension_value ?? ''
      if (!map[name]) map[name] = {}
      map[name][r.metric_key] = (map[name][r.metric_key] ?? 0) + r.value
    })
    return Object.entries(map).map(([name, vals]) => {
      const cost = vals.cost ?? 0
      const conv = vals.conversions ?? 0
      const clicks = vals.clicks ?? 0
      const impr = vals.impressions ?? 0
      return {
        name, cost, conv,
        cpa: conv > 0 ? cost / conv : 0,
        ctr: impr > 0 ? (clicks / impr) * 100 : 0,
        status: conv > 0 && (cost / conv) <= cpaThreshold ? 'ok'
          : conv > 0 && (cost / conv) <= cpaThreshold * 1.5 ? 'warn'
            : 'bad',
      }
    }).sort((a, b) => b.cost - a.cost)
  }, [campaignData, cpaThreshold])

  const trend = useMemo(() => {
    const map: Record<string, { date: string; cost: number; conversions: number }> = {}
    trendData.forEach(r => {
      const month = r.date.slice(0, 7)
      if (!map[month]) map[month] = { date: month, cost: 0, conversions: 0 }
      if (r.metric_key === 'cost') map[month].cost += r.daily_total
      if (r.metric_key === 'conversions') map[month].conversions += r.daily_total
    })
    return Object.values(map).sort((a, b) => a.date < b.date ? -1 : 1)
  }, [trendData])

  if (!connection) return <ConnectCTA label="Google Ads" />
  if (!hasData) return <NoData label="Google Ads" lastSync={connection.last_sync_at} />

  return (
    <div className={PAGE_WRAP}>

      {/* Header + CPA control */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <PageHeader
          eyebrow="Marketing"
          title="Google Ads"
          sub={`${connection.external_name ?? 'Cuenta conectada'} � ${dateFilter ? formatDateRange(dateFilter) : '�ltimos 30 d�as'}`}
        />
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-1 md:shrink-0">
          <label className="text-xs text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap">Umbral CPA objetivo:</label>
          <div className="flex items-center gap-1 border border-slate-200 dark:border-white/[0.08] rounded-xl px-3 py-2 bg-white dark:bg-[#1e2535]" style={CARD_S}>
            <span className="text-xs text-slate-400 dark:text-slate-500 font-semibold">$</span>
            <input
              type="number"
              value={cpaThreshold}
              onChange={e => setCpaThreshold(Number(e.target.value))}
              className="w-20 text-sm text-slate-700 dark:text-slate-200 dark:text-slate-200 outline-none font-semibold"
            />
            <span className="text-xs text-slate-400">MXN</span>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <KpiCard label="Inversi�n total" value={fmtCurrency(m.cost)} delta={m.deltaCost} positiveIsGood={false} sub="vs per�odo anterior" highlight={m.deltaCost > 30} />
        <KpiCard label="Conversiones Ads" value={fmtN(m.conv)} delta={m.deltaConv} positiveIsGood sub="leads generados" />
        <KpiCard label="CPA" value={m.cpa > 0 ? fmtCurrency(m.cpa) : ''} delta={m.deltaCpa} positiveIsGood={false} sub="costo por conversi�n" highlight={m.cpa > cpaThreshold} />
        <KpiCard label="CTR" value={`${m.ctr.toFixed(2)}%`} delta={0} positiveIsGood sub="clics / impresiones" />
      </div>

      {/* Alerta CPA */}
      {m.cpa > cpaThreshold && m.cpa > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-3xl p-5 flex items-start gap-3">
          <span className="text-red-500 text-xl shrink-0 mt-0.5">�</span>
          <div>
            <p className="text-sm font-bold text-red-800">CPA por encima del umbral</p>
            <p className="text-sm text-red-700 dark:text-red-400 mt-0.5">
              Tu CPA actual ({fmtCurrency(m.cpa)}) supera el objetivo de {fmtCurrency(cpaThreshold)}.
              Revisa las campa�as en rojo en la tabla de abajo.
            </p>
          </div>
        </div>
      )}

      {/* Tendencia + Campa�as */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-2 bg-white dark:bg-[#1e2535] rounded-3xl p-6" style={CARD_S}>
          <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-slate-400 dark:text-slate-500 mb-6">
            Inversi�n vs Conversiones (6 meses)
          </p>
          <ResponsiveContainer width="100%" height={190}>
            <AreaChart data={trend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="gCostAds" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="gConvAds" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 500 }} />
              <YAxis yAxisId="left" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 500 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
              <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 500 }} />
              <Tooltip contentStyle={{ background: 'rgba(15,20,35,0.92)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', fontSize: 12, color: '#e2e8f0' }} itemStyle={{ color: '#e2e8f0', fontWeight: 600 }} labelStyle={{ color: '#94a3b8', fontWeight: 500 }} cursor={{ stroke: 'rgba(148,163,184,0.2)', strokeWidth: 1.5 }} />
              <Area yAxisId="left" type="monotone" dataKey="cost" stroke="#f59e0b" strokeWidth={3} fill="url(#gCostAds)" name="Inversi�n" dot={false} activeDot={{ r: 5, strokeWidth: 0 }} />
              <Area yAxisId="right" type="monotone" dataKey="conversions" stroke="#10b981" strokeWidth={2.5} fill="url(#gConvAds)" name="Conversiones" dot={false} activeDot={{ r: 5, strokeWidth: 0 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Tabla de campa�as */}
        <div className="lg:col-span-3 bg-white dark:bg-[#1e2535] rounded-3xl p-6" style={CARD_S}>
          <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-slate-400 dark:text-slate-500 mb-4">
            Rendimiento por campa�a
          </p>
          <div className="overflow-x-auto max-h-64">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-white/[0.05]">
                  <th className="text-left pb-2 font-semibold">Campa�a</th>
                  <th className="text-right pb-2 font-semibold">Inversi�n</th>
                  <th className="text-right pb-2 font-semibold">Conv.</th>
                  <th className="text-right pb-2 font-semibold">CPA</th>
                  <th className="text-right pb-2 font-semibold">CTR</th>
                  <th className="text-right pb-2 font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {campaigns.length === 0 ? (
                  <tr><td colSpan={6} className="py-8 text-center text-slate-400 dark:text-slate-500 text-xs">Sin datos de campa�a</td></tr>
                ) : campaigns.map((c, i) => (
                  <tr key={i} className="hover:bg-slate-50 dark:bg-[#1a2030] transition-colors">
                    <td className="py-2.5 pr-4 text-slate-700 dark:text-slate-200 dark:text-slate-200 max-w-[200px] truncate">{c.name}</td>
                    <td className="py-2.5 text-right text-slate-600 dark:text-slate-300">{fmtCurrency(c.cost)}</td>
                    <td className="py-2.5 text-right font-semibold text-slate-800 dark:text-slate-100">{c.conv.toFixed(0)}</td>
                    <td className={`py-2.5 text-right font-semibold ${c.status === 'bad' ? 'text-red-600' : c.status === 'warn' ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {c.cpa > 0 ? fmtCurrency(c.cpa) : ''}
                    </td>
                    <td className="py-2.5 text-right text-slate-500">{c.ctr.toFixed(1)}%</td>
                    <td className="py-2.5 text-right">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${c.status === 'ok' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' :
                          c.status === 'warn' ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400' :
                            'bg-red-50 dark:bg-red-900/20 text-red-600'
                        }`}>
                        {c.status === 'ok' ? ' Rentable' : c.status === 'warn' ? '� Revisar' : ' Pausar'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

function KpiCard({ label, value, delta, positiveIsGood, sub, highlight }: {
  label: string; value: string; delta: number; positiveIsGood: boolean; sub: string; highlight?: boolean
}) {
  const dc = delta === 0 ? 'text-slate-400' : (positiveIsGood ? delta > 0 : delta < 0) ? 'text-emerald-600' : 'text-red-500'
  return (
    <div className={`rounded-3xl p-4 md:p-5 ${highlight ? 'bg-red-50 dark:bg-red-900/20 border border-red-200' : 'bg-white dark:bg-[#1e2535]'}`} style={highlight ? {} : CARD_S}>
      <p className="text-[9px] md:text-[10px] font-bold tracking-[0.14em] uppercase text-slate-400 dark:text-slate-500 mb-2 md:mb-3">{label}</p>
      <p className={`text-2xl md:text-3xl font-extrabold tabular-nums mb-1 ${highlight ? 'text-red-700 dark:text-red-400' : 'text-slate-900 dark:text-slate-50'}`}>{value}</p>
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
      <div className="w-14 h-14 rounded-3xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mb-5">
        <svg className="w-7 h-7 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      </div>
      <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 dark:text-slate-100 mb-2">Conecta {label}</h3>
      <p className="text-slate-500 mb-6 max-w-sm">Vincula tu cuenta de Google Ads para analizar la eficiencia de tus campa�as.</p>
      <a href="/configuracion/integraciones" className="bg-gradient-to-r from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 text-white text-sm font-semibold px-6 py-3 rounded-xl transition-all shadow-md">
        Ir a Integraciones �
      </a>
    </div>
  )
}

function NoData({ label, lastSync }: { label: string; lastSync: string | null }) {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-center px-8">
      <p className="text-slate-500 font-medium">{label} conectado  sync pendiente</p>
      {lastSync && <p className="text-slate-400 text-sm mt-2">�ltimo sync: {new Date(lastSync).toLocaleString('es-MX')}</p>}
    </div>
  )
}
