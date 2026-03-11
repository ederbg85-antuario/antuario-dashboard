'use client'

import { useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Area, AreaChart, Legend,
} from 'recharts'

// ─── Types ────────────────────────────────────────────────────────────────────

type Contact  = { id: string; contact_type: string | null; status: string | null; source: string | null; created_at: string }
type Proposal = { id: string; status: string; total: number; contact_id: string | null; created_at: string }
type Order    = { id: string; status: string; total: number; amount_paid: number; contact_id: string | null; created_at: string }
type Client   = { id: string; name: string | null; total_revenue: number | null; created_at: string }
type Payment  = { id: string; amount: number; payment_date: string; created_at: string }

type Props = {
  contacts:  Contact[]
  proposals: Proposal[]
  orders:    Order[]
  clients:   Client[]
  payments:  Payment[]
}

// ─── Colors ───────────────────────────────────────────────────────────────────

const COLORS = {
  emerald: '#10b981',
  blue:    '#3b82f6',
  amber:   '#f59e0b',
  violet:  '#8b5cf6',
  rose:    '#f43f5e',
  slate:   '#94a3b8',
  cyan:    '#06b6d4',
}

const PROPOSAL_COLORS: Record<string, string> = {
  draft:    COLORS.slate,
  sent:     COLORS.blue,
  accepted: COLORS.emerald,
  rejected: COLORS.rose,
}

const ORDER_COLORS: Record<string, string> = {
  pending:   COLORS.amber,
  partial:   COLORS.blue,
  paid:      COLORS.emerald,
  cancelled: COLORS.rose,
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatMXN(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}k`
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, color = 'text-slate-900', badge, badgeColor,
}: {
  label: string; value: string | number; sub?: string
  color?: string; badge?: string; badgeColor?: string
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
        {badge && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badgeColor ?? 'bg-slate-100 text-slate-500'}`}>
            {badge}
          </span>
        )}
      </div>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  )
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-6 h-0.5 bg-emerald-400 rounded-full" />
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{label}</p>
    </div>
  )
}

function ChartCard({ title, subtitle, tag, tagColor, children }: {
  title: string; subtitle?: string; tag?: string; tagColor?: string; children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-start justify-between mb-1">
        <h3 className="font-semibold text-slate-800">{title}</h3>
        {tag && (
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${tagColor ?? 'bg-slate-100 text-slate-500'}`}>
            {tag}
          </span>
        )}
      </div>
      {subtitle && <p className="text-xs text-slate-400 mb-4">{subtitle}</p>}
      {children}
    </div>
  )
}

// ─── Funnel step ──────────────────────────────────────────────────────────────

function FunnelStep({
  n, label, sub, count, total, color, conversion,
}: {
  n: number; label: string; sub: string; count: number; total: number
  color: string; conversion?: string
}) {
  const pctVal = total ? Math.min(100, Math.round((count / total) * 100)) : 0
  return (
    <div>
      {conversion && (
        <p className="text-xs text-slate-400 text-center my-1">{conversion}</p>
      )}
      <div className="flex items-center gap-4 py-3">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0 ${color}`}>
          {n}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1.5">
            <div>
              <span className="text-sm font-semibold text-slate-800">{label}</span>
              <span className="text-xs text-slate-400 ml-2">{sub}</span>
            </div>
            <span className="text-lg font-bold text-slate-800 tabular-nums">{count.toLocaleString()}</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${color}`}
              style={{ width: `${pctVal}%`, minWidth: count > 0 ? '4px' : '0' }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-lg text-sm">
      <p className="font-medium text-slate-700 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }} className="text-xs">
          {p.name}: {typeof p.value === 'number' && p.value > 1000
            ? formatMXN(p.value)
            : p.value}
        </p>
      ))}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function VisionVentasClient({ contacts, proposals, orders, clients, payments }: Props) {

  // ── Core KPIs ──────────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const totalContacts       = contacts.length
    const leadsRelevantes     = contacts.filter(c => c.contact_type === 'lead_relevant').length
    const activeContacts      = contacts.filter(c => c.status === 'active').length

    const totalProposals      = proposals.length
    const acceptedProposals   = proposals.filter(p => p.status === 'accepted').length
    const sentProposals       = proposals.filter(p => p.status === 'sent').length
    const proposalValue       = proposals.filter(p => p.status !== 'rejected').reduce((s, p) => s + p.total, 0)

    const totalOrders         = orders.length
    const paidOrders          = orders.filter(o => o.status === 'paid').length
    const pendingOrders       = orders.filter(o => o.status === 'pending' || o.status === 'partial').length
    const totalRevenue        = orders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + o.total, 0)
    const collectedRevenue    = orders.reduce((s, o) => s + (o.amount_paid ?? 0), 0)
    const pendingRevenue      = totalRevenue - collectedRevenue

    const closingRate         = pct(acceptedProposals, totalProposals)
    const leadConversion      = pct(totalProposals, leadsRelevantes)

    return {
      totalContacts, leadsRelevantes, activeContacts,
      totalProposals, acceptedProposals, sentProposals, proposalValue,
      totalOrders, paidOrders, pendingOrders,
      totalRevenue, collectedRevenue, pendingRevenue,
      closingRate, leadConversion,
      totalClients: clients.length,
    }
  }, [contacts, proposals, orders, clients])

  // ── Revenue by month ───────────────────────────────────────────────────────

  const revenueByMonth = useMemo(() => {
    const months = getLast6Months()
    return months.map(month => {
      const monthOrders  = orders.filter(o => getMonthKey(o.created_at) === month)
      const monthRevenue = monthOrders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + o.total, 0)
      const monthPaid    = monthOrders.reduce((s, o) => s + (o.amount_paid ?? 0), 0)
      const monthProps   = proposals.filter(p => getMonthKey(p.created_at) === month).length
      return {
        month: getMonthLabel(month),
        Revenue: monthRevenue,
        Cobrado: monthPaid,
        Propuestas: monthProps,
      }
    })
  }, [orders, proposals])

  // ── Proposal status distribution ───────────────────────────────────────────

  const proposalPie = useMemo(() => {
    const map: Record<string, number> = {}
    proposals.forEach(p => { map[p.status] = (map[p.status] ?? 0) + 1 })
    return Object.entries(map).map(([name, value]) => ({
      name: { draft: 'Borrador', sent: 'Enviada', accepted: 'Aceptada', rejected: 'Rechazada' }[name] ?? name,
      value,
      color: PROPOSAL_COLORS[name] ?? COLORS.slate,
    }))
  }, [proposals])

  // ── Order status distribution ──────────────────────────────────────────────

  const orderPie = useMemo(() => {
    const map: Record<string, number> = {}
    orders.forEach(o => { map[o.status] = (map[o.status] ?? 0) + 1 })
    return Object.entries(map).map(([name, value]) => ({
      name: { pending: 'Pendiente', partial: 'Parcial', paid: 'Pagado', cancelled: 'Cancelado' }[name] ?? name,
      value,
      color: ORDER_COLORS[name] ?? COLORS.slate,
    }))
  }, [orders])

  // ── Source distribution ────────────────────────────────────────────────────

  const sourceData = useMemo(() => {
    const map: Record<string, number> = {}
    contacts.forEach(c => {
      const src = c.source ?? 'other'
      map[src] = (map[src] ?? 0) + 1
    })
    const labels: Record<string, string> = {
      google_ads: 'Google Ads', seo: 'SEO', instagram: 'Instagram',
      direct: 'Directo', referral: 'Referido', other: 'Otro',
    }
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([key, val]) => ({ name: labels[key] ?? key, value: val }))
  }, [contacts])

  // ── Funnel max ─────────────────────────────────────────────────────────────

  const funnelMax = Math.max(
    kpis.totalContacts, kpis.leadsRelevantes,
    kpis.totalProposals, kpis.totalOrders, kpis.totalClients, 1
  )

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Visión de Ventas</h1>
        <p className="text-sm text-slate-400 mt-0.5">Resumen estratégico del área comercial</p>
      </div>

      {/* ── KPIs principales ──────────────────────────────────────────────── */}
      <section>
        <SectionHeader label="Indicadores clave" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Revenue total"
            value={formatMXN(kpis.totalRevenue)}
            sub={`${formatMXN(kpis.collectedRevenue)} cobrado`}
            color="text-emerald-700"
            badge="Facturado"
            badgeColor="bg-emerald-50 text-emerald-700"
          />
          <KpiCard
            label="Por cobrar"
            value={formatMXN(kpis.pendingRevenue)}
            sub={`${kpis.pendingOrders} pedidos activos`}
            color="text-amber-700"
            badge="Pendiente"
            badgeColor="bg-amber-50 text-amber-700"
          />
          <KpiCard
            label="Tasa de cierre"
            value={`${kpis.closingRate}%`}
            sub={`${kpis.acceptedProposals} de ${kpis.totalProposals} propuestas`}
            color={kpis.closingRate >= 30 ? 'text-emerald-700' : kpis.closingRate >= 15 ? 'text-amber-700' : 'text-rose-600'}
          />
          <KpiCard
            label="Conversión Lead→Propuesta"
            value={`${kpis.leadConversion}%`}
            sub={`${kpis.totalProposals} propuestas de ${kpis.leadsRelevantes} leads`}
            color="text-blue-700"
          />
        </div>

        {/* Secondary KPIs */}
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-3 mt-3">
          {[
            { label: 'Contactos',         value: kpis.totalContacts,     color: 'text-slate-800' },
            { label: 'Leads relevantes',  value: kpis.leadsRelevantes,   color: 'text-blue-700' },
            { label: 'Propuestas',        value: kpis.totalProposals,    color: 'text-violet-700' },
            { label: 'Pedidos',           value: kpis.totalOrders,       color: 'text-slate-800' },
            { label: 'Clientes',          value: kpis.totalClients,      color: 'text-emerald-700' },
            { label: 'Pedidos pagados',   value: kpis.paidOrders,        color: 'text-emerald-700' },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-xl border border-slate-200 px-4 py-3">
              <p className="text-xs text-slate-400 mb-1">{k.label}</p>
              <p className={`text-xl font-bold ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Funnel comercial ──────────────────────────────────────────────── */}
      <section>
        <SectionHeader label="Embudo comercial" />
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h3 className="font-semibold text-slate-800">Embudo de conversión</h3>
              <p className="text-xs text-slate-400 mt-0.5">De contacto a cliente cerrado</p>
            </div>
            <span className="text-xs bg-slate-100 text-slate-500 rounded-full px-3 py-1 font-medium">
              Contacto → Cliente
            </span>
          </div>

          <div className="mt-4">
            <FunnelStep n={1} label="Contactos" sub="Total en el sistema"
              count={kpis.totalContacts} total={funnelMax} color="bg-blue-400" />
            <FunnelStep n={2} label="Leads Relevantes" sub="Calificados"
              count={kpis.leadsRelevantes} total={funnelMax} color="bg-cyan-500"
              conversion={kpis.totalContacts > 0 ? `${pct(kpis.leadsRelevantes, kpis.totalContacts)}% del total` : undefined} />
            <FunnelStep n={3} label="Propuestas" sub="Generadas"
              count={kpis.totalProposals} total={funnelMax} color="bg-violet-500"
              conversion={kpis.leadsRelevantes > 0 ? `${pct(kpis.totalProposals, kpis.leadsRelevantes)}% de leads` : undefined} />
            <FunnelStep n={4} label="Pedidos" sub="Aceptados"
              count={kpis.totalOrders} total={funnelMax} color="bg-amber-500"
              conversion={kpis.totalProposals > 0 ? `${pct(kpis.totalOrders, kpis.totalProposals)}% de propuestas` : undefined} />
            <FunnelStep n={5} label="Clientes" sub="Cerrados"
              count={kpis.totalClients} total={funnelMax} color="bg-emerald-500"
              conversion={kpis.totalOrders > 0 ? `${pct(kpis.totalClients, kpis.totalOrders)}% de pedidos` : undefined} />
          </div>
        </div>
      </section>

      {/* ── Charts row 1 ─────────────────────────────────────────────────── */}
      <section>
        <SectionHeader label="Gráficas estratégicas" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Revenue by month */}
          <ChartCard
            title="Revenue por mes"
            subtitle="Pedidos facturados vs cobrado"
            tag="INGRESOS"
            tagColor="bg-emerald-50 text-emerald-700"
          >
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={revenueByMonth} barGap={2} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                  tickFormatter={(v: number) => v >= 1000 ? `$${(v/1000).toFixed(0)}k` : `$${v}`} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="Revenue" fill={COLORS.emerald} radius={[4,4,0,0]} name="Revenue" />
                <Bar dataKey="Cobrado" fill={COLORS.blue} radius={[4,4,0,0]} name="Cobrado" />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex gap-4 mt-2">
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-emerald-500"/><span className="text-xs text-slate-500">Revenue</span></div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-blue-500"/><span className="text-xs text-slate-500">Cobrado</span></div>
            </div>
          </ChartCard>

          {/* Proposals by month */}
          <ChartCard
            title="Propuestas por mes"
            subtitle="Actividad comercial en el tiempo"
            tag="PROPUESTAS"
            tagColor="bg-violet-50 text-violet-700"
          >
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={revenueByMonth}>
                <defs>
                  <linearGradient id="propGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={COLORS.violet} stopOpacity={0.15} />
                    <stop offset="95%" stopColor={COLORS.violet} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone" dataKey="Propuestas"
                  stroke={COLORS.violet} strokeWidth={2}
                  fill="url(#propGradient)"
                  dot={{ fill: COLORS.violet, r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </section>

      {/* ── Charts row 2 ─────────────────────────────────────────────────── */}
      <section>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Proposal status donut */}
          <ChartCard title="Estado de propuestas" tag="PROPUESTAS" tagColor="bg-violet-50 text-violet-700">
            {proposalPie.length === 0 ? (
              <EmptyChart />
            ) : (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={proposalPie} dataKey="value" cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={2}>
                      {proposalPie.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip // eslint-disable-next-line @typescript-eslint/no-explicit-any
formatter={(value: any, name: any) => [value, name]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-2 justify-center mt-1">
                  {proposalPie.map((p, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                      <span className="text-xs text-slate-500">{p.name} ({p.value})</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </ChartCard>

          {/* Order status donut */}
          <ChartCard title="Estado de pedidos" tag="PEDIDOS" tagColor="bg-amber-50 text-amber-700">
            {orderPie.length === 0 ? (
              <EmptyChart />
            ) : (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={orderPie} dataKey="value" cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={2}>
                      {orderPie.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip // eslint-disable-next-line @typescript-eslint/no-explicit-any
formatter={(value: any, name: any) => [value, name]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-2 justify-center mt-1">
                  {orderPie.map((p, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                      <span className="text-xs text-slate-500">{p.name} ({p.value})</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </ChartCard>

          {/* Source distribution */}
          <ChartCard title="Fuentes de contactos" tag="MARKETING" tagColor="bg-blue-50 text-blue-700">
            {sourceData.length === 0 ? (
              <EmptyChart />
            ) : (
              <div className="space-y-2 mt-2">
                {sourceData.map((s, i) => {
                  const total = sourceData.reduce((sum, x) => sum + x.value, 0)
                  const p = Math.round((s.value / total) * 100)
                  const colors = [COLORS.blue, COLORS.emerald, COLORS.violet, COLORS.amber, COLORS.cyan, COLORS.rose]
                  return (
                    <div key={i}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-600 font-medium">{s.name}</span>
                        <span className="text-slate-400">{s.value} ({p}%)</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${p}%`, backgroundColor: colors[i % colors.length] }}
                        />
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

function EmptyChart() {
  return (
    <div className="flex flex-col items-center justify-center h-32 text-slate-300">
      <svg className="w-8 h-8 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
      <p className="text-xs">Sin datos aún</p>
    </div>
  )
}
