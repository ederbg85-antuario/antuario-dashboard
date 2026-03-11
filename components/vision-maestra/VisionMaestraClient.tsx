'use client'

import { useMemo, useState } from 'react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'
import type { DateFilter } from '@/lib/date-filter'
import { formatDateRange } from '@/lib/date-filter'

// ─── Types ────────────────────────────────────────────────────

type Goal = {
  id: string; title: string; category: string
  progress_pct: number | null; status: string; priority: string
  due_date: string | null
  goal_targets: { id: string; title: string; weight: number; current_value: number; target_value: number; unit: string }[]
}
type MktMetric  = { source: string; metric_key: string; value: number }
type CRMContact = { id: string; status: string; created_at: string }
type Proposal   = { id: string; status: string; total: number; created_at: string }
type Order      = { id: string; total: number; status: string; created_at: string }
type Budget     = { id: string; name: string; amount: number; type: string; category: string; recurrence: string | null }
type TrendRow   = { source: string; date: string; metric_key: string; daily_total: number }

type Props = {
  dateFilter:       DateFilter
  goals:            Goal[]
  mktMetrics:       MktMetric[]
  mktMetricsPrev:   MktMetric[]
  contacts:         CRMContact[]
  leadsRelevantes:  CRMContact[]
  proposals:        Proposal[]
  orders:           Order[]
  budgets:          Budget[]
  trendData:        TrendRow[]
  crmTrend:         CRMContact[]
}

// ─── Helpers ──────────────────────────────────────────────────

function sumM(rows: MktMetric[], source: string, key: string) {
  return rows.filter(r => r.source === source && r.metric_key === key)
    .reduce((s, r) => s + r.value, 0)
}
function sumAll(rows: MktMetric[], key: string) {
  return rows.filter(r => r.metric_key === key).reduce((s, r) => s + r.value, 0)
}
function avgM(rows: MktMetric[], source: string, key: string) {
  const f = rows.filter(r => r.source === source && r.metric_key === key)
  return f.length ? f.reduce((s, r) => s + r.value, 0) / f.length : 0
}
function delta(cur: number, prev: number) {
  if (!prev) return 0
  return ((cur - prev) / prev) * 100
}
function fmtN(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`
  return n.toFixed(0)
}
function fmtCurrency(n: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)
}
function fmtPct(n: number) { return `${n.toFixed(1)}%` }

const CATEGORY_COLORS: Record<string, string> = {
  Ventas: '#10b981', Marketing: '#3b82f6', Operaciones: '#8b5cf6',
  Financiero: '#f59e0b', Equipo: '#ef4444', Producto: '#06b6d4',
  Clientes: '#f97316', Otro: '#6b7280',
}

// ─── Main Component ───────────────────────────────────────────

export default function VisionMaestraClient({
  dateFilter, goals, mktMetrics, mktMetricsPrev,
  contacts, leadsRelevantes, proposals, orders, budgets, trendData, crmTrend,
}: Props) {
  const [generatingInsights, setGeneratingInsights] = useState(false)
  const [insights, setInsights]                     = useState<string | null>(null)

  // ── Calcular todos los indicadores ────────────────────────────
  const kpis = useMemo(() => {
    // Demanda
    const adsImpr    = sumM(mktMetrics, 'google_ads', 'impressions')
    const seoImpr    = sumM(mktMetrics, 'search_console', 'impressions')
    const gmbViews   = sumM(mktMetrics, 'gmb', 'profile_views')
    const demanda    = adsImpr + seoImpr + gmbViews

    // Interés
    const sessions   = sumM(mktMetrics, 'ga4', 'sessions')
    const gmbClicks  = sumM(mktMetrics, 'gmb', 'website_clicks')
    const interes    = sessions + gmbClicks

    // Engagement
    const engRate    = avgM(mktMetrics, 'ga4', 'engagement_rate')
    const engagement = Math.round(sessions * engRate)

    // Conversión web + GMB
    const webConv    = sumM(mktMetrics, 'ga4', 'conversions')
    const gmbCalls   = sumM(mktMetrics, 'gmb', 'phone_calls')
    const gmbDir     = sumM(mktMetrics, 'gmb', 'direction_requests')
    const conversion = webConv + gmbCalls + gmbDir

    // CRM
    const leads      = contacts.length
    const lrCount    = leadsRelevantes.length
    const propCount  = proposals.length
    const clients    = orders.length
    const revenue    = orders.reduce((s, o) => s + o.total, 0)

    // Inversión
    const adsCost    = sumM(mktMetrics, 'google_ads', 'cost')

    // Presupuestos del período
    const totalBudget    = budgets.reduce((s, b) => s + b.amount, 0)
    const mktBudget      = budgets.filter(b => b.category === 'marketing').reduce((s, b) => s + b.amount, 0)
    const salesBudget    = budgets.filter(b => b.category === 'ventas').reduce((s, b) => s + b.amount, 0)
    const totalInvestment = adsCost + totalBudget

    // Indicadores críticos
    const CPLR = lrCount > 0 ? adsCost / lrCount : 0
    const CAC  = clients > 0 ? totalInvestment / clients : 0
    const ROAS = adsCost > 0 ? revenue / adsCost : 0

    // Tasas del embudo
    const rate12 = demanda    > 0 ? (interes    / demanda)    * 100 : 0
    const rate23 = interes    > 0 ? (engagement / interes)    * 100 : 0
    const rate34 = engagement > 0 ? (conversion / engagement) * 100 : 0
    const rate45 = conversion > 0 ? (leads      / conversion) * 100 : 0
    const rate56 = leads      > 0 ? (lrCount    / leads)      * 100 : 0
    const rate67 = lrCount    > 0 ? (propCount  / lrCount)    * 100 : 0
    const rate78 = propCount  > 0 ? (clients    / propCount)  * 100 : 0

    // Comparación vs período anterior
    const prevAdsCost = sumM(mktMetricsPrev, 'google_ads', 'cost')
    const prevSessions = sumM(mktMetricsPrev, 'ga4', 'sessions')
    const prevWebConv  = sumM(mktMetricsPrev, 'ga4', 'conversions')

    return {
      // Embudo
      demanda, interes, engagement, conversion,
      leads, lrCount, propCount, clients,
      rate12, rate23, rate34, rate45, rate56, rate67, rate78,
      // Financiero
      adsCost, totalBudget, totalInvestment, revenue,
      mktBudget, salesBudget,
      // Indicadores críticos
      CPLR, CAC, ROAS,
      // Marketing
      sessions, adsImpr, seoImpr, gmbViews, gmbCalls, gmbDir,
      engRate: engRate * 100,
      ctr:     adsImpr > 0 ? (sumM(mktMetrics, 'google_ads', 'clicks') / adsImpr) * 100 : 0,
      // Deltas
      deltaCost:    delta(adsCost, prevAdsCost),
      deltaSess:    delta(sessions, prevSessions),
      deltaConv:    delta(webConv, prevWebConv),
    }
  }, [mktMetrics, mktMetricsPrev, contacts, leadsRelevantes, proposals, orders, budgets])

  // ── Semáforo de salud ─────────────────────────────────────────
  const semaforo = useMemo(() => {
    const items = [
      {
        label: 'CTR Ads',
        value: fmtPct(kpis.ctr),
        status: kpis.ctr > 3 ? 'ok' : kpis.ctr > 1 ? 'warn' : 'bad',
        hint: 'Bueno > 3%',
      },
      {
        label: 'Tasa Engagement',
        value: fmtPct(kpis.engRate),
        status: kpis.engRate > 40 ? 'ok' : kpis.engRate > 20 ? 'warn' : 'bad',
        hint: 'Bueno > 40%',
      },
      {
        label: 'Tasa de conversión web',
        value: kpis.sessions > 0 ? fmtPct((kpis.conversion / kpis.sessions) * 100) : 'N/D',
        status: kpis.sessions > 0 && (kpis.conversion / kpis.sessions) > 0.03 ? 'ok'
          : kpis.sessions > 0 && (kpis.conversion / kpis.sessions) > 0.01 ? 'warn' : 'bad',
        hint: 'Bueno > 3%',
      },
      {
        label: 'CPLR',
        value: kpis.CPLR > 0 ? fmtCurrency(kpis.CPLR) : 'N/D',
        status: kpis.CPLR === 0 ? 'neutral' : kpis.CPLR < 500 ? 'ok' : kpis.CPLR < 1000 ? 'warn' : 'bad',
        hint: 'Depende del ticket',
      },
      {
        label: 'ROAS',
        value: kpis.ROAS > 0 ? `${kpis.ROAS.toFixed(1)}x` : 'N/D',
        status: kpis.ROAS === 0 ? 'neutral' : kpis.ROAS > 3 ? 'ok' : kpis.ROAS > 1 ? 'warn' : 'bad',
        hint: 'Bueno > 3x',
      },
      {
        label: 'Conversión Lead→Cliente',
        value: kpis.lrCount > 0 ? fmtPct((kpis.clients / kpis.lrCount) * 100) : 'N/D',
        status: kpis.lrCount > 0
          ? (kpis.clients / kpis.lrCount) > 0.15 ? 'ok'
          : (kpis.clients / kpis.lrCount) > 0.05 ? 'warn' : 'bad'
          : 'neutral',
        hint: 'Bueno > 15%',
      },
    ]
    return items
  }, [kpis])

  // ── Tendencia para gráfica ─────────────────────────────────────
  const trend = useMemo(() => {
    const map: Record<string, { date: string; conversiones: number; sesiones: number; inversion: number; gmbAcciones: number }> = {}
    trendData.forEach(r => {
      if (!map[r.date]) map[r.date] = { date: r.date, conversiones: 0, sesiones: 0, inversion: 0, gmbAcciones: 0 }
      if (r.source === 'ga4'        && r.metric_key === 'conversions') map[r.date].conversiones += r.daily_total
      if (r.source === 'ga4'        && r.metric_key === 'sessions')    map[r.date].sesiones     += r.daily_total
      if (r.source === 'google_ads' && r.metric_key === 'cost')        map[r.date].inversion    += r.daily_total
      if (r.source === 'gmb'        && (r.metric_key === 'phone_calls' || r.metric_key === 'direction_requests'))
        map[r.date].gmbAcciones += r.daily_total
    })
    return Object.values(map).sort((a, b) => a.date < b.date ? -1 : 1)
  }, [trendData])

  // ── Generador de insights IA ──────────────────────────────────
  const handleGenerateInsights = async () => {
    setGeneratingInsights(true)
    setInsights(null)
    try {
      const context = {
        periodo:    formatDateRange(dateFilter),
        embudo: {
          demanda: kpis.demanda, interes: kpis.interes,
          engagement: kpis.engagement, conversion: kpis.conversion,
          leads: kpis.leads, leadsRelevantes: kpis.lrCount,
          propuestas: kpis.propCount, clientes: kpis.clients,
        },
        indicadores: {
          CPLR: kpis.CPLR, CAC: kpis.CAC, ROAS: kpis.ROAS,
          CTR: kpis.ctr, engagementRate: kpis.engRate,
          inversion: kpis.adsCost, ingresos: kpis.revenue,
        },
        gmb: { vistas: kpis.gmbViews, llamadas: kpis.gmbCalls, rutas: kpis.gmbDir },
      }

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model:      'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: `Eres un consultor de marketing B2B experto en métricas de embudo comercial.
            
Analiza estos datos del período ${context.periodo} y genera 4-5 insights estratégicos concisos y accionables.

DATOS:
${JSON.stringify(context, null, 2)}

Formato: bullet points cortos. Prioriza: qué está funcionando, qué necesita atención urgente, una recomendación concreta de acción inmediata. Responde en español. Sé directo, no uses relleno.`,
          }],
        }),
      })

      const data = await res.json()
      const text = data.content?.find((b: { type: string }) => b.type === 'text')?.text ?? 'Sin respuesta'
      setInsights(text)
    } catch {
      setInsights('Error al generar insights. Verifica la conexión.')
    }
    setGeneratingInsights(false)
  }

  // ─── RENDER ───────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Visión Maestra</h1>
        <p className="text-sm text-slate-500 mt-0.5">{formatDateRange(dateFilter)}</p>
      </div>

      {/* ── SECCIÓN 1: OBJETIVOS ACTIVOS ──────────────────────── */}
      {goals.length > 0 && (
        <section>
          <SectionHeader title="Objetivos activos" href="/objetivos" />
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {goals.map(goal => {
              const progress = goal.progress_pct ?? 0
              const color = CATEGORY_COLORS[goal.category] ?? '#6b7280'
              return (
                <div key={goal.id} className="bg-white rounded-2xl border border-slate-200 p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full text-white mb-2 inline-block"
                        style={{ backgroundColor: color }}>
                        {goal.category}
                      </span>
                      <p className="text-sm font-semibold text-slate-800 mt-1 line-clamp-2">{goal.title}</p>
                    </div>
                    <span className="text-2xl font-bold ml-3" style={{ color }}>
                      {Math.round(progress)}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-2 rounded-full transition-all" style={{ width: `${progress}%`, backgroundColor: color }} />
                  </div>
                  {goal.due_date && (
                    <p className="text-xs text-slate-400 mt-2">
                      Vence: {new Date(goal.due_date).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ── SECCIÓN 2: EMBUDO COMERCIAL ───────────────────────── */}
      <section>
        <SectionHeader title="Embudo comercial completo" />
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="space-y-2">
            {[
              { n: 1, label: 'Demanda',         sub: 'Ads impr. + SEO impr. + GMB vistas',  value: kpis.demanda,    color: '#3b82f6', rate: null,        rateLabel: null },
              { n: 2, label: 'Interés',          sub: 'Sesiones web + GMB clics web',        value: kpis.interes,    color: '#06b6d4', rate: kpis.rate12, rateLabel: 'Demanda → Interés' },
              { n: 3, label: 'Engagement',       sub: 'Usuarios con interacción relevante',  value: kpis.engagement, color: '#8b5cf6', rate: kpis.rate23, rateLabel: 'Interés → Engagement' },
              { n: 4, label: 'Conversión',       sub: 'Contactos web + llamadas + rutas GMB',value: kpis.conversion, color: '#f59e0b', rate: kpis.rate34, rateLabel: 'Engagement → Conversión' },
              { n: 5, label: 'Leads',            sub: 'Contactos nuevos en CRM',            value: kpis.leads,      color: '#f97316', rate: kpis.rate45, rateLabel: 'Conversión → Lead', needsCRM: true },
              { n: 6, label: 'Leads Relevantes', sub: 'Leads calificados',                  value: kpis.lrCount,    color: '#ef4444', rate: kpis.rate56, rateLabel: 'Lead → LR', needsCRM: true },
              { n: 7, label: 'Propuestas',       sub: 'Propuestas enviadas',                value: kpis.propCount,  color: '#dc2626', rate: kpis.rate67, rateLabel: 'LR → Propuesta', needsCRM: true },
              { n: 8, label: 'Clientes',         sub: 'Pedidos pagados',                    value: kpis.clients,    color: '#991b1b', rate: kpis.rate78, rateLabel: 'Propuesta → Cliente', needsCRM: true },
            ].map((stage, i) => {
              const maxVal = kpis.demanda || 1
              const barW = Math.max(2, (stage.value / maxVal) * 100)
              return (
                <div key={stage.n}>
                  {stage.rate !== null && (
                    <div className="flex items-center gap-2 py-0.5 ml-14">
                      <div className="w-px h-3 bg-slate-200 mx-2" />
                      <span className="text-xs text-slate-400">{stage.rateLabel}: <span className="font-medium text-slate-500">{fmtPct(stage.rate ?? 0)}</span></span>
                    </div>
                  )}
                  <div className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold shrink-0"
                      style={{ backgroundColor: stage.color }}>
                      {stage.n}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <div>
                          <span className="text-sm font-semibold text-slate-800">{stage.label}</span>
                          <span className="text-xs text-slate-400 ml-2">{stage.sub}</span>
                        </div>
                        <span className="text-lg font-bold ml-4" style={{ color: stage.color }}>
                          {fmtN(stage.value)}
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-2 rounded-full transition-all"
                          style={{ width: `${barW}%`, backgroundColor: stage.color }} />
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── SECCIÓN 3: INDICADORES ESTRATÉGICOS ──────────────── */}
      <section>
        <SectionHeader title="Indicadores estratégicos" />
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <KpiBox label="CPLR"           value={kpis.CPLR > 0 ? fmtCurrency(kpis.CPLR) : 'N/D'} sub="Costo por Lead Relevante" alert={kpis.CPLR > 1000} />
          <KpiBox label="CAC"            value={kpis.CAC  > 0 ? fmtCurrency(kpis.CAC)  : 'N/D'} sub="Costo adquisición cliente" alert={kpis.CAC > 5000} />
          <KpiBox label="ROAS"           value={kpis.ROAS > 0 ? `${kpis.ROAS.toFixed(1)}x` : 'N/D'} sub="Retorno sobre inversión Ads" good={kpis.ROAS > 3} />
          <KpiBox label="Inversión total" value={fmtCurrency(kpis.totalInvestment)} sub={`Ads + ${fmtCurrency(kpis.totalBudget)} gastos`} />
          <KpiBox label="Ingresos"        value={kpis.revenue > 0 ? fmtCurrency(kpis.revenue) : 'N/D'} sub="Pedidos pagados" good={kpis.revenue > 0} />
          <KpiBox label="CTR Ads"         value={fmtPct(kpis.ctr)} sub="Clics / Impresiones" good={kpis.ctr > 3} />
        </div>
      </section>

      {/* ── SECCIÓN 4: GRÁFICAS ───────────────────────────────── */}
      <section>
        <SectionHeader title="Gráficas estratégicas" />
        <div className="grid grid-cols-2 gap-4">
          {/* Tendencia de conversiones */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Tendencia de conversiones</p>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id="gConv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: 11 }} />
                <Area type="monotone" dataKey="conversiones" stroke="#f59e0b" fill="url(#gConv)" name="Conversiones" strokeWidth={2} />
                <Area type="monotone" dataKey="gmbAcciones" stroke="#ef4444" fill="none" name="GMB Acciones" strokeWidth={1.5} strokeDasharray="3 2" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Inversión diaria Ads */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Inversión diaria Ads</p>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id="gInv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: 11 }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(v: any) => fmtCurrency(v)} />
                <Area type="monotone" dataKey="inversion" stroke="#10b981" fill="url(#gInv)" name="Inversión" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Conversión por tramo */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Conversión por tramo</p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart layout="vertical" data={[
                { name: 'Demanda→Interés',     value: kpis.rate12 },
                { name: 'Interés→Engagement',  value: kpis.rate23 },
                { name: 'Engagement→Conv.',     value: kpis.rate34 },
                { name: 'Conv.→Lead',           value: kpis.rate45 },
                { name: 'Lead→LR',              value: kpis.rate56 },
                { name: 'LR→Propuesta',         value: kpis.rate67 },
                { name: 'Propuesta→Cliente',    value: kpis.rate78 },
              ]}>
                <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={v => `${v.toFixed(0)}%`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={110} />
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: 11 }} formatter={(v: any) => [`${(v as number).toFixed(1)}%`, 'Tasa']} />
                <Bar dataKey="value" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Distribución GMB */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Acciones en Google Maps</p>
            {kpis.gmbViews > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={140}>
                  <PieChart>
                    <Pie data={[
                      { name: 'Llamadas',    value: kpis.gmbCalls,  fill: '#10b981' },
                      { name: 'Web Clicks',  value: kpis.gmbDir,    fill: '#3b82f6' },
                      { name: 'Solo Vistas', value: Math.max(0, kpis.gmbViews - kpis.gmbCalls - kpis.gmbDir), fill: '#e2e8f0' },
                    ]} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" paddingAngle={2}>
                      {['#10b981', '#3b82f6', '#e2e8f0'].map((c, i) => <Cell key={i} fill={c} />)}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-3 gap-2 mt-2 text-center">
                  <div>
                    <p className="text-lg font-bold text-emerald-600">{fmtN(kpis.gmbCalls)}</p>
                    <p className="text-xs text-slate-400">Llamadas</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-blue-600">{fmtN(kpis.gmbDir)}</p>
                    <p className="text-xs text-slate-400">Rutas</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-slate-500">{fmtN(kpis.gmbViews)}</p>
                    <p className="text-xs text-slate-400">Vistas</p>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-40 text-sm text-slate-400 text-center">
                <div>
                  <p>Sin datos de Google Maps</p>
                  <a href="/configuracion/integraciones" className="text-xs text-blue-600 hover:underline mt-1 block">Conectar GMB →</a>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── SECCIÓN 5: SEMÁFORO DE SALUD ─────────────────────── */}
      <section>
        <SectionHeader title="Semáforo de salud" />
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          {semaforo.map(item => {
            const cfg = {
              ok:      { bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500', label: 'Saludable',  text: 'text-emerald-700' },
              warn:    { bg: 'bg-amber-50',   border: 'border-amber-200',   dot: 'bg-amber-500',   label: 'Monitorear', text: 'text-amber-700' },
              bad:     { bg: 'bg-red-50',     border: 'border-red-200',     dot: 'bg-red-500',     label: 'Atención',   text: 'text-red-700' },
              neutral: { bg: 'bg-slate-50',   border: 'border-slate-200',   dot: 'bg-slate-400',   label: 'Sin datos',  text: 'text-slate-500' },
            }[item.status as 'ok' | 'warn' | 'bad' | 'neutral']
            if (!cfg) return null
            return (
              <div key={item.label} className={`rounded-2xl border p-4 ${cfg.bg} ${cfg.border}`}>
                <div className="flex items-center gap-1.5 mb-2">
                  <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                  <span className={`text-xs font-semibold ${cfg.text}`}>{cfg.label}</span>
                </div>
                <p className="text-xs text-slate-500 font-medium mb-1">{item.label}</p>
                <p className={`text-xl font-bold ${cfg.text}`}>{item.value}</p>
                <p className="text-xs text-slate-400 mt-1">{item.hint}</p>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── SECCIÓN 6: INSIGHTS IA ───────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">Insights y propuestas</h2>
            <p className="text-sm text-slate-500">Generados por IA con base en tus datos del período</p>
          </div>
          <button
            onClick={handleGenerateInsights}
            disabled={generatingInsights}
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors disabled:opacity-50">
            {generatingInsights ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Analizando...
              </>
            ) : (
              <>✦ {insights ? 'Regenerar insights' : 'Generar insights con IA'}</>
            )}
          </button>
        </div>

        {insights ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="prose prose-sm max-w-none text-slate-700 whitespace-pre-line">
              {insights}
            </div>
          </div>
        ) : (
          <div className="bg-slate-50 rounded-2xl border border-dashed border-slate-300 p-10 text-center">
            <p className="text-slate-400 text-sm">Haz clic en "Generar insights" para recibir un análisis estratégico de este período.</p>
          </div>
        )}
      </section>

    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────

function SectionHeader({ title, href }: { title: string; href?: string }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-3">
        <div className="w-1 h-5 bg-slate-900 rounded-full" />
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
      </div>
      {href && (
        <a href={href} className="text-xs text-slate-500 hover:text-slate-700 transition-colors">
          Ver detalle →
        </a>
      )}
    </div>
  )
}

function KpiBox({ label, value, sub, alert, good }: {
  label: string; value: string; sub: string; alert?: boolean; good?: boolean
}) {
  return (
    <div className={`rounded-2xl border p-4 ${alert ? 'bg-red-50 border-red-200' : good ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'}`}>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{label}</p>
      <p className={`text-2xl font-bold ${alert ? 'text-red-700' : good ? 'text-emerald-700' : 'text-slate-900'}`}>{value}</p>
      <p className="text-xs text-slate-400 mt-1">{sub}</p>
    </div>
  )
}
