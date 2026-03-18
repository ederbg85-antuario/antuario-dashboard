'use client'

import { useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Area, AreaChart,
} from 'recharts'
import {
  CARD_S, PAGE_WRAP,
  PageHeader, SectionHeader, KpiBox, ChartCard, FunnelCard, FunnelRow, EmptyState,
} from '@/components/ui/dashboard'
import type { DateFilter } from '@/lib/date-filter'
import { formatDateRange } from '@/lib/date-filter'

// ─── Types ────────────────────────────────────────────────────────────────────

type Contact = { id: string; contact_type: string | null; status: string | null; source: string | null; created_at: string }
type Proposal = { id: string; status: string; total: number; contact_id: string | null; created_at: string }
type Order = { id: string; status: string; total: number; amount_paid: number; contact_id: string | null; created_at: string }
type Client = { id: string; name: string | null; total_revenue: number | null; created_at: string }
type Payment = { id: string; amount: number; payment_date: string; created_at: string }

type Props = {
  contacts: Contact[]
  proposals: Proposal[]
  orders: Order[]
  clients: Client[]
  payments: Payment[]
  dateFilter?: DateFilter
}

// ─── Colors ───────────────────────────────────────────────────────────────────

const COLORS = {
  emerald: '#10b981', blue: '#3b82f6', amber: '#f59e0b',
  violet: '#8b5cf6', rose: '#f43f5e', slate: '#94a3b8', cyan: '#06b6d4',
}

const PROPOSAL_COLORS: Record<string, string> = {
  draft: COLORS.slate, sent: COLORS.blue, accepted: COLORS.emerald, rejected: COLORS.rose,
}
const ORDER_COLORS: Record<string, string> = {
  pending: COLORS.amber, partial: COLORS.blue, paid: COLORS.emerald, cancelled: COLORS.rose,
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatMXN(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`
  return `$${n.toLocaleString('es-MX', { minimumFractionDigits: 0 })}`
}

function pct(num: number, den: number) {
  if (!den) return 0
  return Math.round((num / den) * 100)
}

function getMonthKey(dateStr: string) {
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function getMonthLabel(key: string) {
  const [year, month] = key.split('-')
  const d = new Date(Number(year), Number(month) - 1, 1)
  return d.toLocaleDateString('es-MX', { month: 'short', year: '2-digit' })
}

function getLast6Months() {
  const months: string[] = []
  const now = new Date()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

function fmtN(v: number) { return v.toLocaleString('es-MX') }
function fmtPct(v: number) { return `${v.toFixed(1)}%` }

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-[#1e2535] rounded-2xl px-3 py-2 text-sm" style={CARD_S}>
      <p className="font-medium text-slate-700 dark:text-slate-200 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }} className="text-xs">
          {p.name}: {p.value >= 1000 ? formatMXN(p.value) : p.value}
        </p>
      ))}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function VisionVentasClient({ contacts, proposals, orders, clients, payments, dateFilter }: Props) {

  // ── Core KPIs ──────────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const totalContacts = contacts.length
    const leadsRelevantes = contacts.filter(c => c.contact_type === 'lead_relevant').length
    const totalProposals = proposals.length
    const acceptedProposals = proposals.filter(p => p.status === 'accepted').length
    const totalOrders = orders.length
    const paidOrders = orders.filter(o => o.status === 'paid').length
    const pendingOrders = orders.filter(o => o.status === 'pending' || o.status === 'partial').length
    const totalRevenue = orders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + o.total, 0)
    const collectedRevenue = orders.reduce((s, o) => s + (o.amount_paid ?? 0), 0)
    const closingRate = pct(acceptedProposals, totalProposals)
    const leadConversion = pct(totalProposals, leadsRelevantes)

    return {
      totalContacts, leadsRelevantes, totalProposals, acceptedProposals,
      totalOrders, paidOrders, pendingOrders,
      totalRevenue, collectedRevenue,
      pendingRevenue: totalRevenue - collectedRevenue,
      closingRate, leadConversion,
      totalClients: clients.length,
    }
  }, [contacts, proposals, orders, clients])

  // ── Charts data ────────────────────────────────────────────────────────────

  const revenueByMonth = useMemo(() => {
    const months = getLast6Months()
    return months.map(month => {
      const mo = orders.filter(o => getMonthKey(o.created_at) === month)
      return {
        month: getMonthLabel(month),
        Revenue: mo.filter(o => o.status !== 'cancelled').reduce((s, o) => s + o.total, 0),
        Cobrado: mo.reduce((s, o) => s + (o.amount_paid ?? 0), 0),
        Propuestas: proposals.filter(p => getMonthKey(p.created_at) === month).length,
      }
    })
  }, [orders, proposals])

  const proposalPie = useMemo(() => {
    const map: Record<string, number> = {}
    proposals.forEach(p => { map[p.status] = (map[p.status] ?? 0) + 1 })
    return Object.entries(map).map(([name, value]) => ({
      name: { draft: 'Borrador', sent: 'Enviada', accepted: 'Aceptada', rejected: 'Rechazada' }[name] ?? name,
      value,
      color: PROPOSAL_COLORS[name] ?? COLORS.slate,
    }))
  }, [proposals])

  const orderPie = useMemo(() => {
    const map: Record<string, number> = {}
    orders.forEach(o => { map[o.status] = (map[o.status] ?? 0) + 1 })
    return Object.entries(map).map(([name, value]) => ({
      name: { pending: 'Pendiente', partial: 'Parcial', paid: 'Pagado', cancelled: 'Cancelado' }[name] ?? name,
      value,
      color: ORDER_COLORS[name] ?? COLORS.slate,
    }))
  }, [orders])

  const sourceData = useMemo(() => {
    const map: Record<string, number> = {}
    contacts.forEach(c => { const src = c.source ?? 'other'; map[src] = (map[src] ?? 0) + 1 })
    const labels: Record<string, string> = {
      google_ads: 'Google Ads', seo: 'SEO', instagram: 'Instagram',
      direct: 'Directo', referral: 'Referido', other: 'Otro',
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1])
      .map(([key, val]) => ({ name: labels[key] ?? key, value: val }))
  }, [contacts])

  const funnelMax = Math.max(kpis.totalContacts, kpis.leadsRelevantes, kpis.totalProposals, kpis.totalOrders, kpis.totalClients, 1)

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={PAGE_WRAP}>

      {/* Header */}
      <PageHeader
        eyebrow="Ventas"
        title="Visión de Ventas"
        sub={dateFilter ? formatDateRange(dateFilter) : 'Resumen estratégico del área comercial'}
      />

      {/* ── KPIs principales ─────────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeader title="Indicadores clave" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-3 lg:gap-4">
          <KpiBox
            label="Revenue total"
            value={formatMXN(kpis.totalRevenue)}
            sub={`${formatMXN(kpis.collectedRevenue)} cobrado`}
            good
            badge="Facturado"
            badgeColor="bg-emerald-100 text-emerald-700"
          />
          <KpiBox
            label="Por cobrar"
            value={formatMXN(kpis.pendingRevenue)}
            sub={`${kpis.pendingOrders} pedidos activos`}
            badge="Pendiente"
            badgeColor="bg-amber-100 text-amber-700"
          />
          <KpiBox
            label="Tasa de cierre"
            value={`${kpis.closingRate}%`}
            sub={`${kpis.acceptedProposals} de ${kpis.totalProposals} propuestas`}
            good={kpis.closingRate >= 30}
            alert={kpis.closingRate < 15}
          />
          <KpiBox
            label="Lead → Propuesta"
            value={`${kpis.leadConversion}%`}
            sub={`${kpis.totalProposals} props de ${kpis.leadsRelevantes} leads`}
          />
        </div>

        {/* KPIs secundarios */}
        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 md:gap-3">
          {[
            { label: 'Contactos', value: kpis.totalContacts },
            { label: 'Leads relevantes', value: kpis.leadsRelevantes },
            { label: 'Propuestas', value: kpis.totalProposals },
            { label: 'Pedidos', value: kpis.totalOrders },
            { label: 'Clientes', value: kpis.totalClients },
            { label: 'Pedidos pagados', value: kpis.paidOrders },
          ].map(k => (
            <div key={k.label} className="bg-white dark:bg-[#1e2535] rounded-2xl md:rounded-3xl px-2.5 md:px-4 py-2.5 md:py-3" style={CARD_S}>
              <p className="text-[8px] md:text-[10px] text-slate-400 dark:text-slate-500 mb-1 uppercase tracking-widest font-bold">{k.label}</p>
              <p className="text-base md:text-xl font-bold text-slate-800 dark:text-slate-100 tabular-nums">{k.value}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Embudo comercial ───────────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeader title="Embudo comercial" />
        <FunnelCard
          headerLeft={
            <>
              <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-slate-500">
                Contacto → Cliente · 5 etapas
              </p>
              <p className="text-white font-bold text-sm mt-1">
                {fmtN(kpis.totalContacts)} contactos → {fmtN(kpis.totalClients)} clientes
              </p>
            </>
          }
          headerRight={
            <>
              <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-slate-500">Conversión global</p>
              <p className="text-2xl font-extrabold tabular-nums mt-0.5 text-emerald-400">
                {kpis.totalContacts > 0
                  ? ((kpis.totalClients / kpis.totalContacts) * 100).toFixed(2)
                  : '0.00'}%
              </p>
            </>
          }
        >
          {[
            { n: 1, label: 'Contactos', sub: 'Total en el sistema', value: kpis.totalContacts, color: '#3b82f6', rate: null, rateLabel: null, needsCRM: false },
            { n: 2, label: 'Leads Relevantes', sub: 'Calificados', value: kpis.leadsRelevantes, color: '#06b6d4', rate: pct(kpis.leadsRelevantes, kpis.totalContacts), rateLabel: 'Contacto → LR', needsCRM: true },
            { n: 3, label: 'Propuestas', sub: 'Generadas', value: kpis.totalProposals, color: '#8b5cf6', rate: pct(kpis.totalProposals, kpis.leadsRelevantes), rateLabel: 'LR → Propuesta', needsCRM: true },
            { n: 4, label: 'Pedidos', sub: 'Aceptados', value: kpis.totalOrders, color: '#f59e0b', rate: pct(kpis.totalOrders, kpis.totalProposals), rateLabel: 'Propuesta → Pedido', needsCRM: true },
            { n: 5, label: 'Clientes', sub: 'Cerrados', value: kpis.totalClients, color: '#10b981', rate: pct(kpis.totalClients, kpis.totalOrders), rateLabel: 'Pedido → Cliente', needsCRM: true },
          ].map(stage => (
            <FunnelRow key={stage.n} {...stage} maxVal={funnelMax} formatN={fmtN} formatPct={fmtPct} />
          ))}
        </FunnelCard>
      </section>

      {/* ── Gráficas ─────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeader title="Gráficas estratégicas" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">

          <ChartCard
            title="Revenue por mes"
            sub="Pedidos facturados vs cobrado"
            badge="INGRESOS"
            badgeColor="bg-emerald-50 text-emerald-700"
          >
            <ResponsiveContainer width="100%" height={160} className="md:h-[220px]">
              <BarChart data={revenueByMonth} barGap={2} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                  tickFormatter={(v: number) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="Revenue" fill={COLORS.emerald} radius={[4, 4, 0, 0]} name="Revenue" />
                <Bar dataKey="Cobrado" fill={COLORS.blue} radius={[4, 4, 0, 0]} name="Cobrado" />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex gap-2 md:gap-4 mt-2">
              <div className="flex items-center gap-1"><div className="w-2 h-2 md:w-3 md:h-3 rounded-sm bg-emerald-500" /><span className="text-[10px] md:text-xs text-slate-400 dark:text-slate-500">Revenue</span></div>
              <div className="flex items-center gap-1"><div className="w-2 h-2 md:w-3 md:h-3 rounded-sm bg-blue-500" /><span className="text-[10px] md:text-xs text-slate-400 dark:text-slate-500">Cobrado</span></div>
            </div>
          </ChartCard>

          <ChartCard
            title="Propuestas por mes"
            sub="Actividad comercial en el tiempo"
            badge="PROPUESTAS"
            badgeColor="bg-violet-50 text-violet-700"
          >
            <ResponsiveContainer width="100%" height={160} className="md:h-[220px]">
              <AreaChart data={revenueByMonth}>
                <defs>
                  <linearGradient id="propGradientVV" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.violet} stopOpacity={0.15} />
                    <stop offset="95%" stopColor={COLORS.violet} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="Propuestas" stroke={COLORS.violet} strokeWidth={2}
                  fill="url(#propGradientVV)" dot={{ fill: COLORS.violet, r: 3 }} activeDot={{ r: 5 }} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4">

          <ChartCard title="Estado de propuestas" badge="PROPUESTAS" badgeColor="bg-violet-50 text-violet-700">
            {proposalPie.length === 0 ? (
              <EmptyState message="Sin propuestas aún" />
            ) : (
              <>
                <ResponsiveContainer width="100%" height={140} className="md:h-[180px]">
                  <PieChart>
                    <Pie data={proposalPie} dataKey="value" cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={2}>
                      {proposalPie.map((entry, i) => (<Cell key={i} fill={entry.color} />))}
                    </Pie>
                    <Tooltip formatter={(value, name) => [value, name]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-1 md:gap-2 justify-center mt-1">
                  {proposalPie.map((p, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <div className="w-2 h-2 md:w-2.5 md:h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                      <span className="text-[10px] md:text-xs text-slate-400">{p.name} ({p.value})</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </ChartCard>

          <ChartCard title="Estado de pedidos" badge="PEDIDOS" badgeColor="bg-amber-50 text-amber-700">
            {orderPie.length === 0 ? (
              <EmptyState message="Sin pedidos aún" />
            ) : (
              <>
                <ResponsiveContainer width="100%" height={140} className="md:h-[180px]">
                  <PieChart>
                    <Pie data={orderPie} dataKey="value" cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={2}>
                      {orderPie.map((entry, i) => (<Cell key={i} fill={entry.color} />))}
                    </Pie>
                    <Tooltip formatter={(value, name) => [value, name]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-1 md:gap-2 justify-center mt-1">
                  {orderPie.map((p, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <div className="w-2 h-2 md:w-2.5 md:h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                      <span className="text-[10px] md:text-xs text-slate-400">{p.name} ({p.value})</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </ChartCard>

          <ChartCard title="Fuentes de contactos" badge="MARKETING" badgeColor="bg-blue-50 text-blue-700">
            {sourceData.length === 0 ? (
              <EmptyState message="Sin datos de fuente aún" />
            ) : (
              <div className="space-y-1.5 md:space-y-2 mt-2">
                {sourceData.map((s, i) => {
                  const total = sourceData.reduce((sum, x) => sum + x.value, 0)
                  const p = Math.round((s.value / total) * 100)
                  const clr = [COLORS.blue, COLORS.emerald, COLORS.violet, COLORS.amber, COLORS.cyan, COLORS.rose][i % 6]
                  return (
                    <div key={i}>
                      <div className="flex justify-between text-[10px] md:text-xs mb-0.5 md:mb-1">
                        <span className="text-slate-600 dark:text-slate-300 font-medium">{s.name}</span>
                        <span className="text-slate-400 dark:text-slate-500">{s.value} ({p}%)</span>
                      </div>
                      <div className="h-1 md:h-1.5 bg-slate-100 dark:bg-white/[0.08] rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${p}%`, backgroundColor: clr }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </ChartCard>

        </div>
      </section>

    </div>
  )
}
