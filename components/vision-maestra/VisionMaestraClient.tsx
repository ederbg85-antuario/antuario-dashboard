'use client'

import { useMemo, useState, useEffect } from 'react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'
import { TOOLTIP_STYLE, GRID_LIGHT, AXIS_PROPS } from '@/lib/chart-theme'
import type { DateFilter } from '@/lib/date-filter'
import { formatDateRange } from '@/lib/date-filter'

// ─── Types ────────────────────────────────────────────────────

type Goal = {
  id: string; title: string; category: string
  progress_pct: number | null; status: string; priority: string
  due_date: string | null
  goal_targets: { id: string; title: string; weight: number; current_value: number; target_value: number; metric_unit: string }[]
}
type MktMetric = { source: string; metric_key: string; value: number }
type CRMContact = { id: string; status?: string; contact_type?: string; created_at: string }
type Proposal = { id: string; status: string; total: number; created_at: string }
type Order = { id: string; total: number; status: string; created_at: string }
type Budget = { id: string; name: string; amount: number; type: string; category: string; recurrence: string | null }
type TrendRow = { source: string; date: string; metric_key: string; daily_total: number }
type ClientRecord = { id: string; created_at: string }
type Connection = { id: string; source: string; status: string; external_name: string | null; last_sync_at: string | null }

type Props = {
  dateFilter: DateFilter
  goals: Goal[]
  mktMetrics: MktMetric[]
  mktMetricsPrev: MktMetric[]
  contacts: CRMContact[]
  leadsRelevantes: CRMContact[]
  proposals: Proposal[]
  orders: Order[]
  budgets: Budget[]
  trendData: TrendRow[]
  crmTrend: CRMContact[]
  clientRecords: ClientRecord[]
  connections: Connection[]
  chatwootInboxId: number | null
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
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
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

const CARD_S: React.CSSProperties = {
  boxShadow: '0 4px 24px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04), 0 0 0 1px rgba(148,163,184,0.09)',
}

// ─── Main Component ───────────────────────────────────────────

export default function VisionMaestraClient({
  dateFilter, goals, mktMetrics, mktMetricsPrev,
  contacts, leadsRelevantes, proposals, orders, budgets, trendData, crmTrend, clientRecords,
  connections, chatwootInboxId,
}: Props) {
  const [generatingInsights, setGeneratingInsights] = useState(false)
  const [insights, setInsights] = useState<string | null>(null)

  // ── Chatwoot conversation counts (client-side fetch) ──────────
  const [chatwootStats, setChatwootStats] = useState<{
    open: number; pending: number; resolved: number; avgFirstResponse: string
  } | null>(null)

  useEffect(() => {
    if (!chatwootInboxId) return
    const fetchStats = async () => {
      try {
        const [openRes, pendingRes, resolvedRes] = await Promise.all([
          fetch('/api/chatwoot/conversations?status=open&page=1'),
          fetch('/api/chatwoot/conversations?status=pending&page=1'),
          fetch('/api/chatwoot/conversations?status=resolved&page=1'),
        ])
        const [openData, pendingData, resolvedData] = await Promise.all([
          openRes.json(), pendingRes.json(), resolvedRes.json(),
        ])
        setChatwootStats({
          open: openData?.data?.meta?.all_count ?? openData?.data?.payload?.length ?? 0,
          pending: pendingData?.data?.meta?.all_count ?? pendingData?.data?.payload?.length ?? 0,
          resolved: resolvedData?.data?.meta?.all_count ?? resolvedData?.data?.payload?.length ?? 0,
          avgFirstResponse: '—',
        })
      } catch {
        setChatwootStats(null)
      }
    }
    fetchStats()
  }, [chatwootInboxId])

  // ── Calcular todos los indicadores ────────────────────────────
  const kpis = useMemo(() => {
    // ── Google ──
    const adsImpr = sumM(mktMetrics, 'google_ads', 'impressions')
    const seoImpr = sumM(mktMetrics, 'search_console', 'impressions')
    const gmbViews = sumM(mktMetrics, 'google_business_profile', 'profile_views')

    // ── Social Media ──
    const igReach = sumM(mktMetrics, 'instagram', 'reach')
    const igImpressions = sumM(mktMetrics, 'instagram', 'impressions')
    const igFollowers = sumM(mktMetrics, 'instagram', 'followers')
    const fbReach = sumM(mktMetrics, 'facebook', 'reach')
    const fbImpressions = sumM(mktMetrics, 'facebook', 'impressions')
    const fbFollowers = sumM(mktMetrics, 'facebook', 'followers')
    const metaAdsReach = sumM(mktMetrics, 'meta_ads', 'reach')
    const metaAdsImpressions = sumM(mktMetrics, 'meta_ads', 'impressions')
    const metaAdsSpend = sumM(mktMetrics, 'meta_ads', 'spend')
    const metaAdsConv = sumM(mktMetrics, 'meta_ads', 'conversions')

    const socialReach = igReach + fbReach + metaAdsReach
    const socialImpressions = igImpressions + fbImpressions + metaAdsImpressions

    // ── Demanda (TODO incluye social) ──
    const demanda = adsImpr + seoImpr + gmbViews + socialImpressions

    // Interés
    const sessions = sumM(mktMetrics, 'ga4', 'sessions')
    const gmbClicks = sumM(mktMetrics, 'google_business_profile', 'website_clicks')
    const interes = sessions + gmbClicks + socialReach

    // Engagement
    const engRate = avgM(mktMetrics, 'ga4', 'engagement_rate')
    const engagement = Math.round(sessions * engRate) + sumM(mktMetrics, 'facebook', 'engaged_users')

    // Conversión web + GMB + Meta Ads
    const webConv = sumM(mktMetrics, 'ga4', 'conversions')
    const gmbCalls = sumM(mktMetrics, 'google_business_profile', 'phone_calls')
    const gmbDir = sumM(mktMetrics, 'google_business_profile', 'direction_requests')
    const conversion = webConv + gmbCalls + gmbDir + metaAdsConv

    // CRM
    const leads = contacts.length
    const lrCount = leadsRelevantes.length
    const propCount = proposals.length
    const clients = clientRecords.length
    const revenue = orders.reduce((s, o) => s + o.total, 0)
    const avgDealSize = orders.length > 0 ? revenue / orders.length : 0

    // Propuestas por estado
    const propAccepted = proposals.filter(p => p.status === 'accepted').length
    const propSent = proposals.filter(p => p.status === 'sent').length
    const propDraft = proposals.filter(p => p.status === 'draft').length
    const propRejected = proposals.filter(p => p.status === 'rejected').length
    const propTotal = proposals.reduce((s, p) => s + p.total, 0)

    // Inversión
    const adsCost = sumM(mktMetrics, 'google_ads', 'cost')
    const totalAdsSpend = adsCost + metaAdsSpend

    // Presupuestos del período
    const totalBudget = budgets.reduce((s, b) => s + b.amount, 0)
    const totalInvestment = totalAdsSpend + totalBudget

    // Indicadores críticos
    const CPLR = lrCount > 0 ? totalAdsSpend / lrCount : 0
    const CAC = clients > 0 ? totalInvestment / clients : 0
    const ROAS = totalAdsSpend > 0 ? revenue / totalAdsSpend : 0

    // Tasas del embudo
    const rate12 = demanda > 0 ? (interes / demanda) * 100 : 0
    const rate23 = interes > 0 ? (engagement / interes) * 100 : 0
    const rate34 = engagement > 0 ? (conversion / engagement) * 100 : 0
    const rate45 = conversion > 0 ? (leads / conversion) * 100 : 0
    const rate56 = leads > 0 ? (lrCount / leads) * 100 : 0
    const rate67 = lrCount > 0 ? (propCount / lrCount) * 100 : 0
    const rate78 = propCount > 0 ? (clients / propCount) * 100 : 0

    // Comparación vs período anterior
    const prevAdsCost = sumM(mktMetricsPrev, 'google_ads', 'cost')
    const prevMetaSpend = sumM(mktMetricsPrev, 'meta_ads', 'spend')
    const prevSessions = sumM(mktMetricsPrev, 'ga4', 'sessions')
    const prevWebConv = sumM(mktMetricsPrev, 'ga4', 'conversions')
    const prevIgReach = sumM(mktMetricsPrev, 'instagram', 'reach')
    const prevFbReach = sumM(mktMetricsPrev, 'facebook', 'reach')
    const prevMetaReach = sumM(mktMetricsPrev, 'meta_ads', 'reach')
    const prevSocialReach = prevIgReach + prevFbReach + prevMetaReach

    return {
      // Embudo
      demanda, interes, engagement, conversion,
      leads, lrCount, propCount, clients,
      rate12, rate23, rate34, rate45, rate56, rate67, rate78,
      // Social
      igReach, igFollowers, fbReach, fbFollowers,
      metaAdsReach, metaAdsSpend, metaAdsConv,
      socialReach, socialImpressions,
      deltaSocialReach: delta(socialReach, prevSocialReach),
      // Financiero
      adsCost, totalAdsSpend,
      totalBudget, totalInvestment, revenue, avgDealSize,
      // Propuestas
      propAccepted, propSent, propDraft, propRejected, propTotal,
      // Indicadores críticos
      CPLR, CAC, ROAS,
      // Marketing Google
      sessions, adsImpr, seoImpr, gmbViews, gmbClicks, gmbCalls, gmbDir,
      engRate: engRate * 100,
      ctr: adsImpr > 0 ? (sumM(mktMetrics, 'google_ads', 'clicks') / adsImpr) * 100 : 0,
      // Deltas
      deltaCost: delta(adsCost + metaAdsSpend, prevAdsCost + prevMetaSpend),
      deltaSess: delta(sessions, prevSessions),
      deltaConv: delta(webConv + metaAdsConv, prevWebConv),
      deltaRevenue: delta(revenue, 0), // no prev revenue data yet
    }
  }, [mktMetrics, mktMetricsPrev, contacts, leadsRelevantes, proposals, orders, budgets, clientRecords])

  // ── Conexiones activas ──────────────────────────────────────
  const activeConnections = useMemo(() => {
    return connections.filter(c => c.status === 'active').map(c => c.source)
  }, [connections])

  // ── Semáforo de salud ─────────────────────────────────────────
  const semaforo = useMemo(() => {
    const items = [
      { label: 'CTR Ads', value: fmtPct(kpis.ctr), status: kpis.ctr > 3 ? 'ok' : kpis.ctr > 1 ? 'warn' : 'bad', hint: 'Bueno > 3%' },
      { label: 'Engagement Web', value: fmtPct(kpis.engRate), status: kpis.engRate > 40 ? 'ok' : kpis.engRate > 20 ? 'warn' : 'bad', hint: 'Bueno > 40%' },
      { label: 'Conv. Web', value: kpis.sessions > 0 ? fmtPct((kpis.conversion / kpis.sessions) * 100) : 'N/D', status: kpis.sessions > 0 && (kpis.conversion / kpis.sessions) > 0.03 ? 'ok' : kpis.sessions > 0 && (kpis.conversion / kpis.sessions) > 0.01 ? 'warn' : 'bad', hint: 'Bueno > 3%' },
      { label: 'CPLR', value: kpis.CPLR > 0 ? fmtCurrency(kpis.CPLR) : 'N/D', status: kpis.CPLR === 0 ? 'neutral' : kpis.CPLR < 500 ? 'ok' : kpis.CPLR < 1000 ? 'warn' : 'bad', hint: 'Depende del ticket' },
      { label: 'ROAS', value: kpis.ROAS > 0 ? `${kpis.ROAS.toFixed(1)}x` : 'N/D', status: kpis.ROAS === 0 ? 'neutral' : kpis.ROAS > 3 ? 'ok' : kpis.ROAS > 1 ? 'warn' : 'bad', hint: 'Bueno > 3x' },
      { label: 'Lead→Cliente', value: kpis.lrCount > 0 ? fmtPct((kpis.clients / kpis.lrCount) * 100) : 'N/D', status: kpis.lrCount > 0 ? (kpis.clients / kpis.lrCount) > 0.15 ? 'ok' : (kpis.clients / kpis.lrCount) > 0.05 ? 'warn' : 'bad' : 'neutral', hint: 'Bueno > 15%' },
    ]
    return items
  }, [kpis])

  // ── Tendencia para gráfica ─────────────────────────────────────
  const trend = useMemo(() => {
    const map: Record<string, { date: string; conversiones: number; sesiones: number; inversion: number; gmbAcciones: number; socialReach: number; metaConv: number }> = {}
    trendData.forEach(r => {
      if (!map[r.date]) map[r.date] = { date: r.date, conversiones: 0, sesiones: 0, inversion: 0, gmbAcciones: 0, socialReach: 0, metaConv: 0 }
      if (r.source === 'ga4' && r.metric_key === 'conversions') map[r.date].conversiones += r.daily_total
      if (r.source === 'ga4' && r.metric_key === 'sessions') map[r.date].sesiones += r.daily_total
      if (r.source === 'google_ads' && r.metric_key === 'cost') map[r.date].inversion += r.daily_total
      if (r.source === 'meta_ads' && r.metric_key === 'spend') map[r.date].inversion += r.daily_total
      if (r.source === 'meta_ads' && r.metric_key === 'conversions') map[r.date].metaConv += r.daily_total
      if (['instagram', 'facebook', 'meta_ads'].includes(r.source) && r.metric_key === 'reach') map[r.date].socialReach += r.daily_total
      if (r.source === 'google_business_profile' && ['phone_calls', 'direction_requests', 'website_clicks'].includes(r.metric_key))
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
        periodo: formatDateRange(dateFilter),
        embudo: {
          demanda: kpis.demanda, interes: kpis.interes,
          engagement: kpis.engagement, conversion: kpis.conversion,
          leads: kpis.leads, leadsRelevantes: kpis.lrCount,
          propuestas: kpis.propCount, clientes: kpis.clients,
        },
        indicadores: {
          CPLR: kpis.CPLR, CAC: kpis.CAC, ROAS: kpis.ROAS,
          CTR: kpis.ctr, engagementRate: kpis.engRate,
          inversionTotal: kpis.totalAdsSpend, ingresos: kpis.revenue,
        },
        social: {
          igReach: kpis.igReach, igFollowers: kpis.igFollowers,
          fbReach: kpis.fbReach, fbFollowers: kpis.fbFollowers,
          metaAdsReach: kpis.metaAdsReach, metaAdsSpend: kpis.metaAdsSpend, metaAdsConv: kpis.metaAdsConv,
        },
        gmb: { vistas: kpis.gmbViews, webClicks: kpis.gmbClicks, llamadas: kpis.gmbCalls, rutas: kpis.gmbDir },
        ventas: {
          propuestas: kpis.propCount, propAceptadas: kpis.propAccepted,
          valorPropuestas: kpis.propTotal, ticketPromedio: kpis.avgDealSize,
        },
        bandeja: chatwootStats ? {
          conversacionesAbiertas: chatwootStats.open,
          pendientes: chatwootStats.pending,
          resueltas: chatwootStats.resolved,
        } : null,
      }

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1200,
          messages: [{
            role: 'user',
            content: `Eres un consultor de marketing digital y ventas B2B experto en métricas de embudo comercial.

Analiza estos datos del período ${context.periodo} y genera 5-6 insights estratégicos concisos y accionables. Incluye análisis de redes sociales, bandeja de entrada/ventas y el embudo completo.

DATOS:
${JSON.stringify(context, null, 2)}

Formato: bullet points cortos. Prioriza: qué está funcionando, qué necesita atención urgente, una recomendación concreta de acción inmediata. Si hay datos de la bandeja (Chatwoot), analiza la carga de trabajo del equipo de ventas. Responde en español. Sé directo, no uses relleno.`,
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
    <div className="px-4 py-4 space-y-4">

      {/* ── HEADER ────────────────────────────────────────────── */}
      <div className="pb-2 border-b border-slate-100 dark:border-white/[0.05]">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
          <div>
            <p className="text-xs font-bold tracking-widest uppercase text-slate-400 dark:text-slate-400 mb-1">
              Dashboard estratégico
            </p>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50 leading-tight">
              Visión Maestra
            </h1>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{formatDateRange(dateFilter)}</p>
          </div>
          {/* Connection status pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {['ga4', 'google_ads', 'search_console', 'google_business_profile', 'meta_ads', 'instagram', 'facebook'].map(src => {
              const labels: Record<string, string> = { ga4: 'GA4', google_ads: 'Ads', search_console: 'SEO', google_business_profile: 'GMB', meta_ads: 'Meta', instagram: 'IG', facebook: 'FB' }
              const active = activeConnections.includes(src)
              return (
                <span key={src} className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${active ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/30' : 'bg-slate-50 dark:bg-white/[0.03] text-slate-400 border border-slate-100 dark:border-white/[0.06]'}`}>
                  {labels[src] ?? src}
                </span>
              )
            })}
            {chatwootInboxId && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/30">
                Chatwoot
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── SECCIÓN 1: KPI RESUMEN RÁPIDO ──────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
        <MiniKpi label="Ingresos" value={kpis.revenue > 0 ? fmtCurrency(kpis.revenue) : 'N/D'} color="#10b981" />
        <MiniKpi label="Clientes nuevos" value={String(kpis.clients)} color="#d97706" />
        <MiniKpi label="Propuestas" value={String(kpis.propCount)} color="#059669" />
        <MiniKpi label="Leads" value={String(kpis.leads)} color="#f97316" />
        <MiniKpi label="Inversión Ads" value={fmtCurrency(kpis.totalAdsSpend)} color="#ef4444" />
        <MiniKpi label="ROAS" value={kpis.ROAS > 0 ? `${kpis.ROAS.toFixed(1)}x` : 'N/D'} color={kpis.ROAS > 3 ? '#10b981' : kpis.ROAS > 1 ? '#f59e0b' : '#ef4444'} />
      </div>

      {/* ── SECCIÓN 2: EMBUDO COMERCIAL COMPACTO ───────────────── */}
      <section>
        <SectionHeader title="Embudo comercial completo" />
        <div className="mt-3 rounded-3xl bg-white dark:bg-[#1e2535] p-3 md:p-4" style={CARD_S}>

          {/* Header oscuro */}
          <div
            className="rounded-2xl px-4 py-3 mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
            style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)' }}
          >
            <div>
              <p className="text-xs font-bold tracking-widest uppercase text-slate-500">
                Adquisición → Cierre · 8 etapas
              </p>
              <p className="text-white font-bold text-sm mt-0.5">
                {fmtN(kpis.demanda)} impresiones → {fmtN(kpis.clients)} clientes
              </p>
            </div>
            <div className="sm:text-right shrink-0">
              <p className="text-xs font-bold tracking-widest uppercase text-slate-500">Conversión global</p>
              <p className="text-xl font-extrabold tabular-nums mt-0.5 text-emerald-400">
                {kpis.demanda > 0 ? ((kpis.clients / kpis.demanda) * 100).toFixed(3) : '0.000'}%
              </p>
            </div>
          </div>

          {/* Embudo compacto: dos columnas en desktop */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-3 gap-y-0.5">
            {[
              { n: 1, label: 'Demanda', sub: 'Ads + SEO + Social + GMB', value: kpis.demanda, color: '#3b82f6', rate: null, rateLabel: null, icon: 'MKT' },
              { n: 2, label: 'Interés', sub: 'Sesiones + Alcance social', value: kpis.interes, color: '#06b6d4', rate: kpis.rate12, rateLabel: 'Demanda→Interés', icon: 'MKT' },
              { n: 3, label: 'Engagement', sub: 'Usuarios activos', value: kpis.engagement, color: '#8b5cf6', rate: kpis.rate23, rateLabel: 'Interés→Eng.', icon: 'MKT' },
              { n: 4, label: 'Conversión', sub: 'Contactos + llamadas + Meta', value: kpis.conversion, color: '#f59e0b', rate: kpis.rate34, rateLabel: 'Eng.→Conv.', icon: 'MKT' },
              { n: 5, label: 'Leads CRM', sub: 'Contactos nuevos', value: kpis.leads, color: '#f97316', rate: kpis.rate45, rateLabel: 'Conv.→Lead', icon: 'CRM' },
              { n: 6, label: 'Leads Relevantes', sub: 'Leads calificados', value: kpis.lrCount, color: '#10b981', rate: kpis.rate56, rateLabel: 'Lead→LR', icon: 'CRM' },
              { n: 7, label: 'Propuestas', sub: 'Propuestas enviadas', value: kpis.propCount, color: '#059669', rate: kpis.rate67, rateLabel: 'LR→Prop.', icon: 'CRM' },
              { n: 8, label: 'Clientes', sub: 'Clientes registrados', value: kpis.clients, color: '#d97706', rate: kpis.rate78, rateLabel: 'Prop.→Cliente', icon: 'CRM' },
            ].map((stage) => {
              const maxVal = kpis.demanda || 1
              const barW = Math.max(1, (stage.value / maxVal) * 100)
              return (
                <div key={stage.n}>
                  {/* Tasa conector - más compacto */}
                  {stage.rate !== null && (
                    <div className="flex items-center gap-1.5 pl-10 py-0.5">
                      <div className="w-px h-2 rounded-full opacity-25" style={{ backgroundColor: stage.color }} />
                      <span className="text-[9px] text-slate-400">
                        <span className="font-bold" style={{ color: stage.color }}>{fmtPct(stage.rate ?? 0)}</span>
                        {' '}{stage.rateLabel}
                      </span>
                    </div>
                  )}
                  {/* Fila compacta */}
                  <div className="flex items-center gap-2 px-2 py-2 rounded-xl" style={{ background: `${stage.color}0d` }}>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-[11px] font-bold shrink-0" style={{ backgroundColor: stage.color, boxShadow: `0 2px 8px ${stage.color}50` }}>
                      {stage.n}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <span className="text-[12px] font-semibold text-slate-800 dark:text-slate-100 leading-none">{stage.label}</span>
                          <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-slate-100 dark:bg-[#1a2030] text-slate-400 dark:text-slate-500 uppercase tracking-wider shrink-0">{stage.icon}</span>
                        </div>
                        <span className="text-xl font-extrabold tabular-nums ml-2 shrink-0 text-slate-800 dark:text-white">
                          {fmtN(stage.value)}
                        </span>
                      </div>
                      <div className="w-full h-1 rounded-full overflow-hidden mt-1 dark:bg-white/[0.05]" style={{ backgroundColor: `${stage.color}18` }}>
                        <div className="h-1 rounded-full transition-all duration-700" style={{ width: `${barW}%`, backgroundColor: stage.color, opacity: 0.85 }} />
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── SECCIÓN 3: REDES SOCIALES + BANDEJA ──────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">

        {/* Redes Sociales */}
        <section className="space-y-3">
          <SectionHeader title="Redes sociales" href="/marketing/instagram" />
          <div className="bg-white dark:bg-[#1e2535] rounded-3xl p-4 md:p-5" style={CARD_S}>
            <div className="grid grid-cols-3 gap-3">
              {/* Instagram */}
              <div className="text-center">
                <div className="w-10 h-10 rounded-2xl mx-auto mb-2 flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #f09433, #dc2743, #bc1888, #833ab4)' }}>
                  <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                </div>
                <p className="text-2xl font-extrabold text-slate-900 dark:text-white tabular-nums">{fmtN(kpis.igReach)}</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">Alcance</p>
                {kpis.igFollowers > 0 && <p className="text-[10px] text-slate-400 mt-0.5">{fmtN(kpis.igFollowers)} seg.</p>}
              </div>

              {/* Facebook */}
              <div className="text-center">
                <div className="w-10 h-10 rounded-2xl mx-auto mb-2 flex items-center justify-center bg-[#1877F2]">
                  <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                </div>
                <p className="text-2xl font-extrabold text-slate-900 dark:text-white tabular-nums">{fmtN(kpis.fbReach)}</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">Alcance</p>
                {kpis.fbFollowers > 0 && <p className="text-[10px] text-slate-400 mt-0.5">{fmtN(kpis.fbFollowers)} seg.</p>}
              </div>

              {/* Meta Ads */}
              <div className="text-center">
                <div className="w-10 h-10 rounded-2xl mx-auto mb-2 flex items-center justify-center bg-[#8b5cf6]">
                  <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm3.7 14.3c-.4.4-1 .4-1.4 0L12 14l-2.3 2.3c-.4.4-1 .4-1.4 0-.4-.4-.4-1 0-1.4L10.6 12 8.3 9.7c-.4-.4-.4-1 0-1.4.4-.4 1-.4 1.4 0L12 10.6l2.3-2.3c.4-.4 1-.4 1.4 0 .4.4.4 1 0 1.4L13.4 12l2.3 2.3c.4.4.4 1 0 1.4z"/></svg>
                </div>
                <p className="text-2xl font-extrabold text-slate-900 dark:text-white tabular-nums">{kpis.metaAdsConv > 0 ? fmtN(kpis.metaAdsConv) : fmtN(kpis.metaAdsReach)}</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">{kpis.metaAdsConv > 0 ? 'Conversiones' : 'Alcance'}</p>
                {kpis.metaAdsSpend > 0 && <p className="text-[10px] text-slate-400 mt-0.5">{fmtCurrency(kpis.metaAdsSpend)} inv.</p>}
              </div>
            </div>
            {/* Social reach total */}
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-white/[0.06] flex items-center justify-between">
              <span className="text-xs text-slate-400 dark:text-slate-500">Alcance social total</span>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-extrabold text-slate-900 dark:text-white tabular-nums">{fmtN(kpis.socialReach)}</span>
                {kpis.deltaSocialReach !== 0 && (
                  <span className={`text-xs font-semibold ${kpis.deltaSocialReach > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {kpis.deltaSocialReach > 0 ? '+' : ''}{kpis.deltaSocialReach.toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Bandeja de Entrada / Ventas */}
        <section className="space-y-3">
          <SectionHeader title="Bandeja de entrada" href="/ventas/bandeja" />
          <div className="bg-white dark:bg-[#1e2535] rounded-3xl p-4 md:p-5" style={CARD_S}>
            {chatwootStats ? (
              <>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="text-center">
                    <div className="w-10 h-10 rounded-2xl mx-auto mb-2 flex items-center justify-center bg-amber-50 dark:bg-amber-900/20">
                      <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
                    </div>
                    <p className="text-2xl md:text-3xl font-extrabold text-amber-600 tabular-nums">{chatwootStats.open}</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">Abiertas</p>
                  </div>
                  <div className="text-center">
                    <div className="w-10 h-10 rounded-2xl mx-auto mb-2 flex items-center justify-center bg-blue-50 dark:bg-blue-900/20">
                      <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <p className="text-2xl md:text-3xl font-extrabold text-blue-600 tabular-nums">{chatwootStats.pending}</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">Pendientes</p>
                  </div>
                  <div className="text-center">
                    <div className="w-10 h-10 rounded-2xl mx-auto mb-2 flex items-center justify-center bg-emerald-50 dark:bg-emerald-900/20">
                      <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <p className="text-2xl md:text-3xl font-extrabold text-emerald-600 tabular-nums">{chatwootStats.resolved}</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">Resueltas</p>
                  </div>
                </div>
                <div className="pt-3 border-t border-slate-100 dark:border-white/[0.06]">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400 dark:text-slate-500">Total conversaciones</span>
                    <span className="text-2xl font-extrabold text-slate-900 dark:text-white tabular-nums">
                      {chatwootStats.open + chatwootStats.pending + chatwootStats.resolved}
                    </span>
                  </div>
                  {chatwootStats.open > 10 && (
                    <div className="mt-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 p-2.5 text-xs text-amber-800 dark:text-amber-300">
                      <span className="font-bold">Atención:</span> {chatwootStats.open} conversaciones abiertas sin resolver. Revisa la carga de trabajo del equipo.
                    </div>
                  )}
                </div>
              </>
            ) : chatwootInboxId ? (
              <div className="flex items-center justify-center h-32 text-sm text-slate-400">
                <div className="text-center">
                  <svg className="w-8 h-8 mx-auto mb-2 text-slate-300 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                  <p>Cargando datos de bandeja...</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-32 text-sm text-slate-400">
                <div className="text-center">
                  <svg className="w-8 h-8 mx-auto mb-2 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                  <p>Bandeja no configurada</p>
                  <a href="/configuracion/integraciones" className="text-xs text-blue-500 hover:underline mt-1 block">Conectar Chatwoot →</a>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* ── SECCIÓN 4: VENTAS PIPELINE ──────────────────────── */}
      <section className="space-y-3">
        <SectionHeader title="Resumen de ventas" href="/ventas/vision" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
          <KpiBox label="Ingresos" value={kpis.revenue > 0 ? fmtCurrency(kpis.revenue) : 'N/D'} sub="Pedidos pagados" good={kpis.revenue > 0} />
          <KpiBox label="Ticket promedio" value={kpis.avgDealSize > 0 ? fmtCurrency(kpis.avgDealSize) : 'N/D'} sub="Por pedido pagado" />
          <KpiBox label="Prop. aceptadas" value={String(kpis.propAccepted)} sub={`de ${kpis.propCount} totales`} good={kpis.propAccepted > 0} />
          <KpiBox label="Valor en propuestas" value={kpis.propTotal > 0 ? fmtCurrency(kpis.propTotal) : 'N/D'} sub="Pipeline total" />
          <KpiBox label="Leads relevantes" value={String(kpis.lrCount)} sub={`de ${kpis.leads} contactos`} good={kpis.lrCount > 0} />
          <KpiBox label="Tasa cierre" value={kpis.propCount > 0 ? fmtPct((kpis.clients / kpis.propCount) * 100) : 'N/D'} sub="Prop. → Cliente" good={kpis.propCount > 0 && (kpis.clients / kpis.propCount) > 0.15} />
        </div>
      </section>

      {/* ── SECCIÓN 5: OBJETIVOS ACTIVOS ──────────────────────── */}
      {goals.length > 0 && (
        <section className="space-y-3">
          <SectionHeader title="Objetivos activos" href="/objetivos" />
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {goals.map(goal => {
              const progress = goal.progress_pct ?? 0
              const color = CATEGORY_COLORS[goal.category] ?? '#6b7280'
              return (
                <div key={goal.id} className="bg-white dark:bg-[#1e2535] rounded-3xl p-4 transition-shadow" style={CARD_S}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full text-white uppercase tracking-wider inline-block" style={{ backgroundColor: color }}>
                        {goal.category}
                      </span>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mt-1.5 line-clamp-2 leading-snug">{goal.title}</p>
                    </div>
                    <span className="text-xl font-bold ml-3 tabular-nums" style={{ color }}>{Math.round(progress)}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 dark:bg-[#2a3448] rounded-full overflow-hidden">
                    <div className="h-1.5 rounded-full transition-all duration-500" style={{ width: `${progress}%`, backgroundColor: color }} />
                  </div>
                  {goal.due_date && (
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2">
                      Vence: {new Date(goal.due_date).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ── SECCIÓN 6: INDICADORES ESTRATÉGICOS ──────────────── */}
      <section className="space-y-3">
        <SectionHeader title="Indicadores estratégicos" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
          <KpiBox label="CPLR" value={kpis.CPLR > 0 ? fmtCurrency(kpis.CPLR) : 'N/D'} sub="Costo por Lead Relevante" alert={kpis.CPLR > 1000} />
          <KpiBox label="CAC" value={kpis.CAC > 0 ? fmtCurrency(kpis.CAC) : 'N/D'} sub="Costo adquisición cliente" alert={kpis.CAC > 5000} />
          <KpiBox label="ROAS" value={kpis.ROAS > 0 ? `${kpis.ROAS.toFixed(1)}x` : 'N/D'} sub="Retorno sobre inversión Ads" good={kpis.ROAS > 3} />
          <KpiBox label="Inversión total" value={fmtCurrency(kpis.totalInvestment)} sub={`Ads ${fmtCurrency(kpis.totalAdsSpend)} + Gastos ${fmtCurrency(kpis.totalBudget)}`} />
          <KpiBox label="CTR Ads" value={fmtPct(kpis.ctr)} sub="Clics / Impresiones" good={kpis.ctr > 3} />
          <KpiBox label="Alcance social" value={fmtN(kpis.socialReach)} sub="IG + FB + Meta Ads" good={kpis.socialReach > 10000} />
        </div>
      </section>

      {/* ── SECCIÓN 7: GRÁFICAS ───────────────────────────────── */}
      <section className="space-y-3">
        <SectionHeader title="Tendencias" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

          {/* Conversiones + Meta */}
          <div className="bg-white dark:bg-[#1e2535] rounded-3xl p-3 md:p-5" style={CARD_S}>
            <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">
              Conversiones (Web + Meta Ads)
            </p>
            <ResponsiveContainer width="100%" height={170}>
              <AreaChart data={trend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="gConvVM2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="gMetaConvVM" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 500 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 500 }} />
                <Tooltip contentStyle={TOOLTIP_STYLE.contentStyle} itemStyle={TOOLTIP_STYLE.itemStyle} labelStyle={TOOLTIP_STYLE.labelStyle} cursor={TOOLTIP_STYLE.cursor} />
                <Area type="monotone" dataKey="conversiones" stroke="#f59e0b" strokeWidth={2.5} fill="url(#gConvVM2)" name="Web Conv." dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                <Area type="monotone" dataKey="metaConv" stroke="#8b5cf6" strokeWidth={2} fill="url(#gMetaConvVM)" name="Meta Ads Conv." dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Inversión diaria */}
          <div className="bg-white dark:bg-[#1e2535] rounded-3xl p-3 md:p-5" style={CARD_S}>
            <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">
              Inversión diaria (Google + Meta)
            </p>
            <ResponsiveContainer width="100%" height={170}>
              <AreaChart data={trend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="gInvVM2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 500 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 500 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <Tooltip contentStyle={TOOLTIP_STYLE.contentStyle} itemStyle={TOOLTIP_STYLE.itemStyle} labelStyle={TOOLTIP_STYLE.labelStyle} cursor={TOOLTIP_STYLE.cursor} formatter={(v: any) => fmtCurrency(v)} />
                <Area type="monotone" dataKey="inversion" stroke="#10b981" strokeWidth={2.5} fill="url(#gInvVM2)" name="Inversión" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Alcance social diario */}
          <div className="bg-white dark:bg-[#1e2535] rounded-3xl p-3 md:p-5" style={CARD_S}>
            <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">
              Alcance social diario
            </p>
            <ResponsiveContainer width="100%" height={170}>
              <AreaChart data={trend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="gSocialVM" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#E4405F" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#E4405F" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 500 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 500 }} />
                <Tooltip contentStyle={TOOLTIP_STYLE.contentStyle} itemStyle={TOOLTIP_STYLE.itemStyle} labelStyle={TOOLTIP_STYLE.labelStyle} cursor={TOOLTIP_STYLE.cursor} />
                <Area type="monotone" dataKey="socialReach" stroke="#E4405F" strokeWidth={2.5} fill="url(#gSocialVM)" name="Alcance Social" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Conversión por tramo */}
          <div className="bg-white dark:bg-[#1e2535] rounded-3xl p-3 md:p-5" style={CARD_S}>
            <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">
              Conversión por tramo
            </p>
            <ResponsiveContainer width="100%" height={170}>
              <BarChart layout="vertical" data={[
                { name: 'Demanda→Interés', value: kpis.rate12 },
                { name: 'Interés→Eng.', value: kpis.rate23 },
                { name: 'Eng.→Conv.', value: kpis.rate34 },
                { name: 'Conv.→Lead', value: kpis.rate45 },
                { name: 'Lead→LR', value: kpis.rate56 },
                { name: 'LR→Prop.', value: kpis.rate67 },
                { name: 'Prop.→Cliente', value: kpis.rate78 },
              ]} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gBarTramoVM2" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.9} />
                  </linearGradient>
                </defs>
                <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 500 }} tickFormatter={v => `${v.toFixed(0)}%`} />
                <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 9, fill: '#94a3b8', fontWeight: 500 }} width={100} />
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <Tooltip contentStyle={TOOLTIP_STYLE.contentStyle} itemStyle={TOOLTIP_STYLE.itemStyle} labelStyle={TOOLTIP_STYLE.labelStyle} cursor={TOOLTIP_STYLE.cursor} formatter={(v: any) => [`${(v as number).toFixed(1)}%`, 'Tasa']} />
                <Bar dataKey="value" fill="url(#gBarTramoVM2)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* ── SECCIÓN 8: SEMÁFORO DE SALUD ─────────────────────── */}
      <section className="space-y-3">
        <SectionHeader title="Semáforo de salud" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
          {semaforo.map(item => {
            const cfg = {
              ok: { bg: 'bg-emerald-50 dark:bg-emerald-900/20', dot: 'bg-emerald-500', label: 'Saludable', text: 'text-emerald-700 dark:text-emerald-400' },
              warn: { bg: 'bg-amber-50 dark:bg-amber-900/20', dot: 'bg-amber-500', label: 'Monitorear', text: 'text-amber-700 dark:text-amber-400' },
              bad: { bg: 'bg-red-50 dark:bg-red-900/20', dot: 'bg-red-500', label: 'Atención', text: 'text-red-700 dark:text-red-400' },
              neutral: { bg: 'bg-slate-50 dark:bg-white/[0.03]', dot: 'bg-slate-300', label: 'Sin datos', text: 'text-slate-500 dark:text-slate-400' },
            }[item.status as 'ok' | 'warn' | 'bad' | 'neutral']
            if (!cfg) return null
            return (
              <div key={item.label} className="relative rounded-2xl p-4 bg-white dark:bg-[#1e2535] overflow-hidden" style={CARD_S}>
                <div className="flex items-center gap-1.5 mb-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${cfg.dot} shrink-0`} />
                  <span className={`text-xs font-bold uppercase tracking-widest ${cfg.text}`}>{cfg.label}</span>
                </div>
                <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mb-2">{item.label}</p>
                <p className="text-2xl font-extrabold tabular-nums leading-none text-slate-900 dark:text-white">{item.value}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">{item.hint}</p>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── SECCIÓN 9: INSIGHTS IA ───────────────────────────── */}
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-0.5">
              Análisis automatizado
            </p>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Insights y propuestas</h2>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">IA analiza todo: marketing, social, ventas y bandeja</p>
          </div>
          <button
            onClick={handleGenerateInsights}
            disabled={generatingInsights}
            className="flex items-center gap-2 bg-slate-900 dark:bg-white/10 hover:bg-slate-800 dark:hover:bg-white/20 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-all duration-200 disabled:opacity-50 shadow-sm hover:shadow-md self-start sm:self-auto"
          >
            {generatingInsights ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Analizando...
              </>
            ) : (
              <>{insights ? 'Regenerar insights' : 'Generar insights con IA'}</>
            )}
          </button>
        </div>

        {insights ? (
          <div className="bg-white dark:bg-[#1e2535] rounded-3xl p-4 md:p-6" style={CARD_S}>
            <div className="prose prose-sm max-w-none text-slate-700 dark:text-slate-200 whitespace-pre-line leading-relaxed">
              {insights}
            </div>
          </div>
        ) : (
          <div className="bg-slate-50 dark:bg-[#1a2030] rounded-2xl border border-dashed border-slate-200 dark:border-white/[0.08] p-8 text-center">
            <div className="w-9 h-9 rounded-2xl bg-white dark:bg-[#1e2535] border border-slate-200 dark:border-white/[0.1] shadow-sm flex items-center justify-center mx-auto mb-2">
              <span className="text-slate-400 text-base">*</span>
            </div>
            <p className="text-slate-400 text-sm">
              Haz clic en &quot;Generar insights&quot; para un análisis estratégico completo.
            </p>
          </div>
        )}
      </section>

    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────

function SectionHeader({ title, href }: { title: string; href?: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2.5 px-4 py-2 rounded-2xl w-fit" style={CARD_S}>
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
        <h2 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">{title}</h2>
      </div>
      {href && (
        <a href={href} className="text-[11px] text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors font-medium">
          Ver detalle →
        </a>
      )}
    </div>
  )
}

function KpiBox({ label, value, sub, alert, good }: {
  label: string; value: string; sub: string; alert?: boolean; good?: boolean
}) {
  const dot = alert ? 'bg-red-400' : good ? 'bg-emerald-400' : 'bg-slate-300 dark:bg-slate-600'
  return (
    <div className="relative rounded-2xl p-4 bg-white dark:bg-[#1e2535] transition-shadow overflow-hidden" style={CARD_S}>
      <div className="flex items-center gap-1.5 mb-3">
        <div className={`w-1.5 h-1.5 rounded-full ${dot} shrink-0`} />
        <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none">{label}</p>
      </div>
      <p className="text-2xl font-extrabold tabular-nums leading-none text-slate-900 dark:text-white">
        {value}
      </p>
      <p className="text-xs text-slate-400 dark:text-slate-500 mt-2 leading-snug">{sub}</p>
    </div>
  )
}

function MiniKpi({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="relative rounded-2xl p-4 bg-white dark:bg-[#1e2535] overflow-hidden" style={CARD_S}>
      {/* Thin top accent only */}
      <div className="absolute top-0 left-4 right-4 h-[2px] rounded-b-full" style={{ backgroundColor: color, opacity: 0.3 }} />
      <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">{label}</p>
      <p className="text-2xl font-extrabold tabular-nums leading-none text-slate-900 dark:text-white">{value}</p>
    </div>
  )
}
