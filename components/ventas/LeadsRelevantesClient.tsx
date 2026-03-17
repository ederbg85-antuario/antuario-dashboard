'use client'

import { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { CARD_S, PAGE_WRAP, PageHeader, SectionHeader, ChartCard } from '@/components/ui/dashboard'

// ─── Types ────────────────────────────────────────────────────────────────────

type Lead = {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
  company: string | null
  status: string | null
  source: string | null
  source_campaign: string | null
  assigned_to: string | null
  whatsapp: string | null
  created_at: string
  updated_at: string
}

type Proposal = {
  id: string; contact_id: string; status: string
  total: number; title: string; created_at: string
}

type Note = { id: string; contact_id: string; content: string; created_at: string }
type Profile = { id: string; full_name: string | null; email: string | null }

type Props = {
  orgId: number
  initialLeads: Lead[]
  initialProposals: Proposal[]
  initialNotes: Note[]
  profiles: Profile[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Activos' },
  { value: 'dormant', label: 'En reposo' },
]

const SOURCE_LABELS: Record<string, string> = {
  google_ads: 'Google Ads', seo: 'SEO', instagram: 'Instagram',
  direct: 'Directo', referral: 'Referido', other: 'Otro',
}

const PROPOSAL_STATUS_STYLES: Record<string, string> = {
  draft: 'bg-slate-100 dark:bg-[#1a2030] text-slate-600 dark:text-slate-300',
  sent: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400',
  accepted: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400',
  rejected: 'bg-red-50 dark:bg-red-900/20 text-red-500',
}

const PROPOSAL_STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador', sent: 'Enviada', accepted: 'Aceptada', rejected: 'Rechazada',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

function daysSince(dateStr: string) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000)
}

function getInitials(name: string | null) {
  if (!name) return '?'
  return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
}

function avatarColor(name: string | null) {
  const colors = ['bg-violet-500', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-cyan-500']
  if (!name) return colors[0]
  return colors[name.charCodeAt(0) % colors.length]
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

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LeadsRelevantesClient({
  orgId, initialLeads, initialProposals, initialNotes, profiles,
}: Props) {
  const [leads] = useState<Lead[]>(initialLeads)
  const [proposals] = useState<Proposal[]>(initialProposals)

  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)

  // ── Filtered list ──────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return leads.filter(l => {
      if (statusFilter !== 'all' && l.status !== statusFilter) return false
      if (search) {
        const q = search.toLowerCase()
        if (
          !l.full_name?.toLowerCase().includes(q) &&
          !l.email?.toLowerCase().includes(q) &&
          !l.company?.toLowerCase().includes(q)
        ) return false
      }
      return true
    })
  }, [leads, statusFilter, search])

  // ── KPIs ───────────────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const total = leads.length
    const withProposal = leads.filter(l => proposals.some(p => p.contact_id === l.id)).length
    const converted = leads.filter(l => proposals.some(p => p.contact_id === l.id && p.status === 'accepted')).length
    const conversionRate = total > 0 ? Math.round((withProposal / total) * 100) : 0
    const acceptedRate = withProposal > 0 ? Math.round((converted / withProposal) * 100) : 0

    // Avg days from lead creation to first proposal
    const daysToProposal = leads
      .map(l => {
        const firstProp = proposals
          .filter(p => p.contact_id === l.id)
          .sort((a, b) => a.created_at.localeCompare(b.created_at))[0]
        if (!firstProp) return null
        return Math.floor(
          (new Date(firstProp.created_at).getTime() - new Date(l.created_at).getTime()) / 86_400_000
        )
      })
      .filter((d): d is number => d !== null)

    const avgDays = daysToProposal.length
      ? Math.round(daysToProposal.reduce((s, d) => s + d, 0) / daysToProposal.length)
      : null

    const activeLeads = leads.filter(l => l.status === 'active').length
    const dormantLeads = leads.filter(l => l.status === 'dormant').length

    return { total, withProposal, converted, conversionRate, acceptedRate, avgDays, activeLeads, dormantLeads }
  }, [leads, proposals])

  // ── Monthly trend ──────────────────────────────────────────────────────────

  const trendData = useMemo(() => {
    const months = getLast6Months()
    return months.map(month => ({
      month: getMonthLabel(month),
      Leads: leads.filter(l => getMonthKey(l.created_at) === month).length,
      Propuestas: proposals.filter(p => getMonthKey(p.created_at) === month).length,
    }))
  }, [leads, proposals])

  // ── Source breakdown ───────────────────────────────────────────────────────

  const sourceBreakdown = useMemo(() => {
    const map: Record<string, number> = {}
    leads.forEach(l => {
      const src = l.source ?? 'other'
      map[src] = (map[src] ?? 0) + 1
    })
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([key, val]) => ({
        name: SOURCE_LABELS[key] ?? key,
        value: val,
        pct: Math.round((val / leads.length) * 100),
      }))
  }, [leads])

  // ── Selected lead data ─────────────────────────────────────────────────────

  const leadProposals = useMemo(() =>
    selectedLead ? proposals.filter(p => p.contact_id === selectedLead.id) : [],
    [selectedLead, proposals]
  )
  const leadNotes = useMemo(() =>
    selectedLead ? initialNotes.filter(n => n.contact_id === selectedLead.id) : [],
    [selectedLead, initialNotes]
  )
  const assignedProfile = useMemo(() =>
    selectedLead ? profiles.find(p => p.id === selectedLead.assigned_to) : null,
    [selectedLead, profiles]
  )

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={`${PAGE_WRAP} ${selectedLead ? 'mr-96' : ''}`} style={{ transition: 'margin-right 0.3s' }}>

      {/* Header */}
      <PageHeader
        eyebrow="Ventas"
        title="Leads Relevantes"
        sub="Contactos calificados con potencial de conversión"
      />

      {/* KPI cards */}
      <section>
        <SectionHeader title="Indicadores clave" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mt-4">

          {/* Total leads — dark gradient hero card */}
          <div className="rounded-3xl p-5 col-span-2 lg:col-span-1" style={{ background: 'linear-gradient(135deg, #161928 0%, #1e2235 100%)', boxShadow: '0 4px 20px rgba(15,23,42,0.25)' }}>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-2" style={{ color: 'rgba(148,163,184,0.7)' }}>Total leads</p>
            <p className="text-4xl font-extrabold text-white tabular-nums">{kpis.total}</p>
            <div className="flex gap-3 mt-3">
              <span className="flex items-center gap-1 text-xs" style={{ color: 'rgba(52,211,153,0.9)' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                {kpis.activeLeads} activos
              </span>
              <span className="flex items-center gap-1 text-xs" style={{ color: 'rgba(148,163,184,0.6)' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-slate-500 inline-block" />
                {kpis.dormantLeads} en reposo
              </span>
            </div>
          </div>

          {/* Con propuesta */}
          <div className="rounded-3xl p-5 bg-blue-50 dark:bg-blue-900/20 border border-blue-100" style={CARD_S}>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue-500 mb-2">Con propuesta</p>
            <p className="text-3xl font-extrabold text-blue-700 dark:text-blue-400 tabular-nums">{kpis.withProposal}</p>
            <div className="mt-3">
              <div className="h-1.5 bg-blue-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${kpis.conversionRate}%`, background: 'linear-gradient(90deg, #3b82f6, #60a5fa)' }} />
              </div>
              <p className="text-xs text-blue-400 mt-1.5 font-medium">{kpis.conversionRate}% de conversión</p>
            </div>
          </div>

          {/* Cerrados */}
          <div className="rounded-3xl p-5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100" style={CARD_S}>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-500 mb-2">Cerrados</p>
            <p className="text-3xl font-extrabold text-emerald-700 dark:text-emerald-400 tabular-nums">{kpis.converted}</p>
            <p className="text-xs text-emerald-400 mt-3 font-medium">
              {kpis.acceptedRate}% de propuestas aceptadas
            </p>
          </div>

          {/* Días a propuesta */}
          <div className="rounded-3xl p-5 bg-amber-50 dark:bg-amber-900/20 border border-amber-100" style={CARD_S}>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-500 mb-2">Días a propuesta</p>
            <p className="text-3xl font-extrabold text-amber-700 dark:text-amber-400 tabular-nums">
              {kpis.avgDays !== null ? kpis.avgDays : '—'}
            </p>
            <p className="text-xs text-amber-400 mt-3 font-medium">promedio de conversión</p>
          </div>

        </div>
      </section>

      {/* Charts */}
      <section>
        <SectionHeader title="Tendencias" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
          <ChartCard
            title="Evolución mensual"
            sub="Leads vs propuestas generadas"
            badge="TENDENCIA"
            badgeColor="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400"
          >
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={trendData} barGap={4} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="Leads" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Propuestas" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex gap-4 mt-2">
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-blue-500" /><span className="text-xs text-slate-500">Leads</span></div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-emerald-500" /><span className="text-xs text-slate-500">Propuestas</span></div>
            </div>
          </ChartCard>

          <ChartCard
            title="Fuente de leads"
            badge="ATRIBUCIÓN"
            badgeColor="bg-violet-50 text-violet-700"
          >
            {sourceBreakdown.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-12">Sin datos de fuente</p>
            ) : (
              <div className="space-y-3 mt-2">
                {sourceBreakdown.map((s, i) => {
                  const colors = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#06b6d4', '#f43f5e']
                  return (
                    <div key={i}>
                      <div className="flex justify-between mb-1.5">
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{s.name}</span>
                        <span className="text-xs text-slate-400">{s.value} leads ({s.pct}%)</span>
                      </div>
                      <div className="h-2 bg-slate-100 dark:bg-[#1a2030] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${s.pct}%`, backgroundColor: colors[i % colors.length] }}
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

      {/* Filters + list */}
      <section>
        <SectionHeader title={`Lista de leads (${filtered.length})`} />
        <div className="bg-white dark:bg-[#1e2535] rounded-3xl mt-4 overflow-hidden" style={CARD_S}>

          {/* Toolbar */}
          <div className="px-5 py-3 border-b border-slate-100 dark:border-white/[0.05] flex items-center gap-3">
            <input
              type="text"
              placeholder="Buscar lead..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 bg-slate-50 dark:bg-[#1a2030] dark:bg-[#0d1117] border border-slate-200 dark:border-white/[0.08] rounded-xl px-3 py-2 text-sm text-slate-700 dark:text-slate-200 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-700"
            />
            <div className="flex gap-1">
              {STATUS_FILTERS.map(f => (
                <button
                  key={f.value}
                  onClick={() => setStatusFilter(f.value)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${statusFilter === f.value ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 dark:bg-[#1a2030]'
                    }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">{filtered.length} leads</span>
          </div>

          {/* List */}
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <svg className="w-10 h-10 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              <p className="text-sm font-medium">Sin leads relevantes</p>
              <p className="text-xs mt-1">Califica contactos como Lead Relevante en el módulo de Contactos</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filtered.map(lead => {
                const leadProps = proposals.filter(p => p.contact_id === lead.id)
                const hasProposal = leadProps.length > 0
                const isConverted = leadProps.some(p => p.status === 'accepted')
                const isSelected = selectedLead?.id === lead.id
                const age = daysSince(lead.created_at)

                return (
                  <button
                    key={lead.id}
                    onClick={() => setSelectedLead(isSelected ? null : lead)}
                    className={`w-full text-left px-5 py-4 transition-colors ${isSelected
                        ? 'bg-slate-50 dark:bg-[#1a2030] border-l-[3px] border-slate-800'
                        : 'border-l-[3px] border-transparent hover:bg-slate-50 dark:bg-[#1a2030] hover:border-slate-200 dark:border-white/[0.08]'
                      }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-white text-xs font-bold ${avatarColor(lead.full_name)}`}>
                        {getInitials(lead.full_name)}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 dark:text-slate-100 truncate">
                            {lead.full_name ?? lead.email ?? '—'}
                          </p>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {isConverted && (
                              <span className="text-[10px] bg-emerald-100 text-emerald-700 dark:text-emerald-400 rounded-full px-2 py-0.5 font-bold tracking-wide">CERRADO</span>
                            )}
                            {hasProposal && !isConverted && (
                              <span className="text-[10px] bg-blue-100 text-blue-700 dark:text-blue-400 rounded-full px-2 py-0.5 font-bold tracking-wide">PROPUESTA</span>
                            )}
                            {lead.status === 'dormant' && !hasProposal && (
                              <span className="text-[10px] bg-slate-100 dark:bg-[#1a2030] text-slate-400 dark:text-slate-500 rounded-full px-2 py-0.5 font-bold tracking-wide">REPOSO</span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <p className="text-xs text-slate-400 dark:text-slate-500 truncate">
                            {lead.company ? `${lead.company} · ` : ''}{SOURCE_LABELS[lead.source ?? ''] ?? lead.source ?? '—'}
                          </p>
                          <p className="text-xs text-slate-400 dark:text-slate-500 shrink-0 ml-2 tabular-nums">{age}d</p>
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {/* ── Detail panel (fixed) ────────────────────────────────────────── */}
      {selectedLead && (
        <div className="fixed top-14 right-0 bottom-0 w-96 bg-white dark:bg-[#1e2535] border-l border-slate-200 dark:border-white/[0.08] overflow-y-auto z-30">
          {/* Dark gradient header matching dashboard style */}
          <div className="px-6 py-5" style={{ background: 'linear-gradient(135deg, #161928 0%, #1e2235 100%)' }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ${avatarColor(selectedLead.full_name)}`}>
                  {getInitials(selectedLead.full_name)}
                </div>
                <div>
                  <h3 className="font-bold text-white">{selectedLead.full_name ?? '—'}</h3>
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(148,163,184,0.7)' }}>{selectedLead.company ?? selectedLead.email ?? '—'}</p>
                </div>
              </div>
              <button onClick={() => setSelectedLead(null)} className="p-1 rounded-lg transition-colors" style={{ color: 'rgba(148,163,184,0.7)' }}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex gap-2 mt-4 flex-wrap">
              <span className="text-xs rounded-full px-2.5 py-1 font-medium" style={{ background: 'rgba(59,130,246,0.2)', color: '#93c5fd' }}>Lead Relevante</span>
              {selectedLead.status === 'active'
                ? <span className="text-xs rounded-full px-2.5 py-1 font-medium" style={{ background: 'rgba(16,185,129,0.2)', color: '#6ee7b7' }}>Activo</span>
                : <span className="text-xs rounded-full px-2.5 py-1 font-medium" style={{ background: 'rgba(148,163,184,0.15)', color: 'rgba(148,163,184,0.8)' }}>En reposo</span>
              }
            </div>
          </div>

          <div className="px-6 py-5 space-y-5">

            {/* Info */}
            <Section title="Información">
              <Row label="Email" value={selectedLead.email} />
              <Row label="Teléfono" value={selectedLead.phone} />
              <Row label="WhatsApp" value={selectedLead.whatsapp} />
              <Row label="Fuente" value={SOURCE_LABELS[selectedLead.source ?? ''] ?? selectedLead.source} />
              <Row label="Campaña" value={selectedLead.source_campaign} />
              <Row label="Responsable" value={assignedProfile?.full_name ?? assignedProfile?.email} />
              <Row label="Creado" value={formatDate(selectedLead.created_at)} />
              <Row label="Días activo" value={`${daysSince(selectedLead.created_at)} días`} />
            </Section>

            {/* Proposals */}
            <Section title={`Propuestas (${leadProposals.length})`}>
              {leadProposals.length === 0 ? (
                <p className="text-xs text-slate-400 dark:text-slate-500 py-2">Sin propuestas generadas</p>
              ) : (
                <div className="space-y-2">
                  {leadProposals.map(p => (
                    <div key={p.id} className="border border-slate-200 dark:border-white/[0.08] rounded-xl p-3">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-200 dark:text-slate-200 truncate">{p.title}</p>
                        <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${PROPOSAL_STATUS_STYLES[p.status]}`}>
                          {PROPOSAL_STATUS_LABELS[p.status] ?? p.status}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs text-slate-400">
                        <span>{formatDate(p.created_at)}</span>
                        <span className="font-semibold text-slate-600 dark:text-slate-300">
                          ${p.total.toLocaleString('es-MX', { minimumFractionDigits: 0 })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Notes */}
            {leadNotes.length > 0 && (
              <Section title={`Notas (${leadNotes.length})`}>
                <div className="space-y-2">
                  {leadNotes.slice(0, 5).map(n => (
                    <div key={n.id} className="bg-slate-50 dark:bg-[#1a2030] rounded-xl p-3">
                      <p className="text-sm text-slate-700 dark:text-slate-200">{n.content}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{formatDate(n.created_at)}</p>
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Micro components ─────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">{title}</p>
      {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start justify-between py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0 w-24">{label}</span>
      <span className="text-sm text-slate-700 dark:text-slate-200 dark:text-slate-200 text-right">{value ?? '—'}</span>
    </div>
  )
}
