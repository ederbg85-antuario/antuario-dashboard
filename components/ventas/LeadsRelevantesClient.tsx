'use client'

import { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area,
} from 'recharts'

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

type Note   = { id: string; contact_id: string; content: string; created_at: string }
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
  { value: 'all',     label: 'Todos' },
  { value: 'active',  label: 'Activos' },
  { value: 'dormant', label: 'En reposo' },
]

const SOURCE_LABELS: Record<string, string> = {
  google_ads: 'Google Ads', seo: 'SEO', instagram: 'Instagram',
  direct: 'Directo', referral: 'Referido', other: 'Otro',
}

const PROPOSAL_STATUS_STYLES: Record<string, string> = {
  draft:    'bg-slate-100 text-slate-600',
  sent:     'bg-blue-50 text-blue-700',
  accepted: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-red-50 text-red-500',
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
  const [leads]     = useState<Lead[]>(initialLeads)
  const [proposals] = useState<Proposal[]>(initialProposals)

  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch]             = useState('')
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
    const total         = leads.length
    const withProposal  = leads.filter(l => proposals.some(p => p.contact_id === l.id)).length
    const converted     = leads.filter(l => proposals.some(p => p.contact_id === l.id && p.status === 'accepted')).length
    const conversionRate = total > 0 ? Math.round((withProposal / total) * 100) : 0
    const acceptedRate  = withProposal > 0 ? Math.round((converted / withProposal) * 100) : 0

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

    const activeLeads  = leads.filter(l => l.status === 'active').length
    const dormantLeads = leads.filter(l => l.status === 'dormant').length

    return { total, withProposal, converted, conversionRate, acceptedRate, avgDays, activeLeads, dormantLeads }
  }, [leads, proposals])

  // ── Monthly trend ──────────────────────────────────────────────────────────

  const trendData = useMemo(() => {
    const months = getLast6Months()
    return months.map(month => ({
      month: getMonthLabel(month),
      Leads:     leads.filter(l => getMonthKey(l.created_at) === month).length,
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

  const leadProposals  = useMemo(() =>
    selectedLead ? proposals.filter(p => p.contact_id === selectedLead.id) : [],
    [selectedLead, proposals]
  )
  const leadNotes      = useMemo(() =>
    selectedLead ? initialNotes.filter(n => n.contact_id === selectedLead.id) : [],
    [selectedLead, initialNotes]
  )
  const assignedProfile = useMemo(() =>
    selectedLead ? profiles.find(p => p.id === selectedLead.assigned_to) : null,
    [selectedLead, profiles]
  )

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full min-h-screen bg-slate-50">

      {/* ── Main area ─────────────────────────────────────────────────────── */}
      <div className={`flex flex-col flex-1 min-w-0 transition-all ${selectedLead ? 'mr-96' : ''}`}>
        <div className="p-6 space-y-6">

          {/* Header */}
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Leads Relevantes</h1>
            <p className="text-sm text-slate-400 mt-0.5">
              Contactos calificados con potencial de conversión
            </p>
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Total leads</p>
              <p className="text-3xl font-bold text-slate-900">{kpis.total}</p>
              <p className="text-xs text-slate-400 mt-1">{kpis.activeLeads} activos · {kpis.dormantLeads} en reposo</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Con propuesta</p>
              <p className="text-3xl font-bold text-blue-700">{kpis.withProposal}</p>
              <div className="mt-2">
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${kpis.conversionRate}%` }} />
                </div>
                <p className="text-xs text-slate-400 mt-1">{kpis.conversionRate}% de conversión</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Cerrados</p>
              <p className="text-3xl font-bold text-emerald-700">{kpis.converted}</p>
              <p className="text-xs text-slate-400 mt-1">
                {kpis.acceptedRate}% de propuestas aceptadas
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Días a propuesta</p>
              <p className="text-3xl font-bold text-amber-700">
                {kpis.avgDays !== null ? kpis.avgDays : '—'}
              </p>
              <p className="text-xs text-slate-400 mt-1">promedio de conversión</p>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Trend */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-semibold text-slate-800">Evolución mensual</h3>
                <span className="text-xs bg-blue-50 text-blue-700 rounded-full px-2.5 py-1 font-medium">TENDENCIA</span>
              </div>
              <p className="text-xs text-slate-400 mb-4">Leads vs propuestas generadas</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={trendData} barGap={4} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="Leads"     fill="#3b82f6" radius={[4,4,0,0]} />
                  <Bar dataKey="Propuestas" fill="#10b981" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-2">
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-blue-500"/><span className="text-xs text-slate-500">Leads</span></div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-emerald-500"/><span className="text-xs text-slate-500">Propuestas</span></div>
              </div>
            </div>

            {/* Source */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-800">Fuente de leads</h3>
                <span className="text-xs bg-violet-50 text-violet-700 rounded-full px-2.5 py-1 font-medium">ATRIBUCIÓN</span>
              </div>
              {sourceBreakdown.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-12">Sin datos de fuente</p>
              ) : (
                <div className="space-y-3">
                  {sourceBreakdown.map((s, i) => {
                    const colors = ['#3b82f6','#10b981','#8b5cf6','#f59e0b','#06b6d4','#f43f5e']
                    return (
                      <div key={i}>
                        <div className="flex justify-between mb-1.5">
                          <span className="text-sm font-medium text-slate-700">{s.name}</span>
                          <span className="text-xs text-slate-400">{s.value} leads ({s.pct}%)</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
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
            </div>
          </div>

          {/* Filters + list */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">

            {/* Toolbar */}
            <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3">
              <input
                type="text"
                placeholder="Buscar lead..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
              />
              <div className="flex gap-1">
                {STATUS_FILTERS.map(f => (
                  <button
                    key={f.value}
                    onClick={() => setStatusFilter(f.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      statusFilter === f.value ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <span className="text-xs text-slate-400">{filtered.length} leads</span>
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
                  const leadProps   = proposals.filter(p => p.contact_id === lead.id)
                  const hasProposal = leadProps.length > 0
                  const isConverted = leadProps.some(p => p.status === 'accepted')
                  const isSelected  = selectedLead?.id === lead.id
                  const age         = daysSince(lead.created_at)

                  return (
                    <button
                      key={lead.id}
                      onClick={() => setSelectedLead(isSelected ? null : lead)}
                      className={`w-full text-left px-5 py-4 hover:bg-slate-50 transition-colors ${
                        isSelected ? 'bg-slate-50 border-l-2 border-slate-800' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-white text-xs font-bold ${avatarColor(lead.full_name)}`}>
                          {getInitials(lead.full_name)}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <p className="text-sm font-semibold text-slate-800 truncate">
                              {lead.full_name ?? lead.email ?? '—'}
                            </p>
                            <div className="flex items-center gap-2 shrink-0">
                              {isConverted && (
                                <span className="text-xs bg-emerald-50 text-emerald-700 rounded-full px-2 py-0.5 font-medium">Cerrado</span>
                              )}
                              {hasProposal && !isConverted && (
                                <span className="text-xs bg-blue-50 text-blue-700 rounded-full px-2 py-0.5 font-medium">Con propuesta</span>
                              )}
                              {lead.status === 'dormant' && (
                                <span className="text-xs text-slate-400">En reposo</span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center justify-between">
                            <p className="text-xs text-slate-400 truncate">
                              {lead.company ? `${lead.company} · ` : ''}{SOURCE_LABELS[lead.source ?? ''] ?? lead.source ?? '—'}
                            </p>
                            <p className="text-xs text-slate-400 shrink-0 ml-2">Hace {age} días</p>
                          </div>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Detail panel ─────────────────────────────────────────────────── */}
      {selectedLead && (
        <div className="fixed top-14 right-0 bottom-0 w-96 bg-white border-l border-slate-200 overflow-y-auto z-30">
          <div className="px-6 py-5 border-b border-slate-100">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ${avatarColor(selectedLead.full_name)}`}>
                  {getInitials(selectedLead.full_name)}
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">{selectedLead.full_name ?? '—'}</h3>
                  <p className="text-xs text-slate-400">{selectedLead.company ?? selectedLead.email ?? '—'}</p>
                </div>
              </div>
              <button onClick={() => setSelectedLead(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex gap-2 mt-3 flex-wrap">
              <span className="text-xs bg-blue-50 text-blue-700 rounded-full px-2.5 py-1 font-medium">Lead Relevante</span>
              {selectedLead.status === 'active'
                ? <span className="text-xs bg-emerald-50 text-emerald-700 rounded-full px-2.5 py-1 font-medium">Activo</span>
                : <span className="text-xs bg-slate-100 text-slate-500 rounded-full px-2.5 py-1 font-medium">En reposo</span>
              }
            </div>
          </div>

          <div className="px-6 py-5 space-y-5">

            {/* Info */}
            <Section title="Información">
              <Row label="Email"       value={selectedLead.email} />
              <Row label="Teléfono"    value={selectedLead.phone} />
              <Row label="WhatsApp"    value={selectedLead.whatsapp} />
              <Row label="Fuente"      value={SOURCE_LABELS[selectedLead.source ?? ''] ?? selectedLead.source} />
              <Row label="Campaña"     value={selectedLead.source_campaign} />
              <Row label="Responsable" value={assignedProfile?.full_name ?? assignedProfile?.email} />
              <Row label="Creado"      value={formatDate(selectedLead.created_at)} />
              <Row label="Días activo" value={`${daysSince(selectedLead.created_at)} días`} />
            </Section>

            {/* Proposals */}
            <Section title={`Propuestas (${leadProposals.length})`}>
              {leadProposals.length === 0 ? (
                <p className="text-xs text-slate-400 py-2">Sin propuestas generadas</p>
              ) : (
                <div className="space-y-2">
                  {leadProposals.map(p => (
                    <div key={p.id} className="border border-slate-200 rounded-xl p-3">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="text-sm font-medium text-slate-700 truncate">{p.title}</p>
                        <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${PROPOSAL_STATUS_STYLES[p.status]}`}>
                          {PROPOSAL_STATUS_LABELS[p.status] ?? p.status}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs text-slate-400">
                        <span>{formatDate(p.created_at)}</span>
                        <span className="font-semibold text-slate-600">
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
                    <div key={n.id} className="bg-slate-50 rounded-xl p-3">
                      <p className="text-sm text-slate-700">{n.content}</p>
                      <p className="text-xs text-slate-400 mt-1">{formatDate(n.created_at)}</p>
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
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">{title}</p>
      {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start justify-between py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-xs text-slate-400 shrink-0 w-24">{label}</span>
      <span className="text-sm text-slate-700 text-right">{value ?? '—'}</span>
    </div>
  )
}
