'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { CARD_S, PAGE_WRAP, PageHeader, EmptyState } from '@/components/ui/dashboard'

// ─── Types ──────────────────────────────────────────────────────────────────

type Proposal = {
  id: string
  contact_id: string | null
  client_id: string | null
  assigned_to: string | null
  title: string
  stage: string
  status: string | null
  client_need: string | null
  proposed_solution: string | null
  objective: string | null
  scope: string | null
  amount: number
  currency: string
  notes: string | null
  terms_and_conditions: string | null
  pdf_url: string | null
  presented_at: string | null
  decided_at: string | null
  source_channel: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

type ProposalChange = {
  id: string
  proposal_id: string
  description: string
  resolved: boolean
  created_by: string | null
  created_at: string
}

type Contact = { id: string; full_name: string | null; email: string | null; phone: string | null; company: string | null }
type Profile = { id: string; full_name: string | null; email: string | null }
type OrgBranding = { name?: string | null; logo_url?: string | null } | null

type Props = {
  orgId: number
  currentUserId: string
  currentUserRole: string
  initialProposals: Proposal[]
  initialChanges: ProposalChange[]
  contacts: Contact[]
  profiles: Profile[]
  orgBranding: OrgBranding
}

// ─── Etapas del pipeline de propuestas ────────────────────────────────────────

type Stage = {
  value: string
  label: string
  short: string
  pill: string      // estilos del badge
  dot: string       // color del punto
  desc: string
}

const STAGES: Stage[] = [
  { value: 'documentando', label: 'Documentando',        short: 'Documentando', pill: 'bg-slate-100 dark:bg-white/[0.07] text-slate-600 dark:text-slate-300', dot: '#94a3b8', desc: 'Capturando necesidades y solución' },
  { value: 'lista',        label: 'Lista para presentar', short: 'Lista',        pill: 'bg-indigo-50 dark:bg-indigo-900/25 text-indigo-600 dark:text-indigo-300', dot: '#6366f1', desc: 'Brief completo, documento armado' },
  { value: 'presentada',   label: 'Presentada · esperando', short: 'Presentada', pill: 'bg-blue-50 dark:bg-blue-900/25 text-blue-600 dark:text-blue-300', dot: '#3b82f6', desc: 'Presentada al cliente, esperando respuesta' },
  { value: 'cambios',      label: 'Cambios solicitados',  short: 'Cambios',      pill: 'bg-amber-50 dark:bg-amber-900/25 text-amber-700 dark:text-amber-300', dot: '#f59e0b', desc: 'El cliente pidió ajustes' },
  { value: 'aceptada',     label: 'Aceptada',             short: 'Aceptada',     pill: 'bg-emerald-50 dark:bg-emerald-900/25 text-emerald-700 dark:text-emerald-300', dot: '#10b981', desc: 'Propuesta cerrada y ganada' },
  { value: 'rechazada',    label: 'No aceptada',          short: 'No aceptada',  pill: 'bg-red-50 dark:bg-red-900/25 text-red-500 dark:text-red-300', dot: '#ef4444', desc: 'El cliente no avanzó' },
]

const STAGE_MAP: Record<string, Stage> = Object.fromEntries(STAGES.map(s => [s.value, s]))

// Mantiene sincronizado el `status` legacy (lo lee la vista de Contactos)
const STAGE_TO_STATUS: Record<string, string> = {
  documentando: 'draft', lista: 'draft', presentada: 'sent',
  cambios: 'sent', aceptada: 'accepted', rechazada: 'rejected',
}

const CURRENCIES = ['MXN', 'USD']
const BUCKET = 'proposal-files'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMoney(n: number, currency = 'MXN') {
  return `${currency === 'USD' ? 'US$' : '$'}${(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function formatDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

function getSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

function Spinner({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

type Draft = {
  contact_id: string
  title: string
  client_need: string
  proposed_solution: string
  objective: string
  scope: string
  amount: string
  currency: string
  notes: string
  source_channel: string
  stage: string
}

const EMPTY_DRAFT: Draft = {
  contact_id: '', title: '', client_need: '', proposed_solution: '',
  objective: '', scope: '', amount: '', currency: 'MXN', notes: '',
  source_channel: '', stage: 'documentando',
}

function draftFromProposal(p: Proposal): Draft {
  return {
    contact_id: p.contact_id ?? '',
    title: p.title ?? '',
    client_need: p.client_need ?? '',
    proposed_solution: p.proposed_solution ?? '',
    objective: p.objective ?? '',
    scope: p.scope ?? '',
    amount: p.amount ? String(p.amount) : '',
    currency: p.currency ?? 'MXN',
    notes: p.notes ?? '',
    source_channel: p.source_channel ?? '',
    stage: p.stage ?? 'documentando',
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PropuestasClient({
  orgId, currentUserId,
  initialProposals, initialChanges,
  contacts, orgBranding,
}: Props) {
  const [proposals, setProposals] = useState<Proposal[]>(initialProposals)
  const [changes, setChanges] = useState<ProposalChange[]>(initialChanges)

  const [stageFilter, setStageFilter] = useState('all')
  const [search, setSearch] = useState('')

  const [selectedId, setSelectedId] = useState<string | null>(null)   // null + drawerOpen => crear
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const contactsById = useMemo(() => Object.fromEntries(contacts.map(c => [c.id, c])), [contacts])
  const selected = useMemo(() => proposals.find(p => p.id === selectedId) ?? null, [proposals, selectedId])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: proposals.length }
    for (const s of STAGES) c[s.value] = proposals.filter(p => p.stage === s.value).length
    return c
  }, [proposals])

  const pipelineAmount = useMemo(
    () => proposals.filter(p => !['rechazada'].includes(p.stage)).reduce((s, p) => s + (p.amount || 0), 0),
    [proposals]
  )
  const wonAmount = useMemo(
    () => proposals.filter(p => p.stage === 'aceptada').reduce((s, p) => s + (p.amount || 0), 0),
    [proposals]
  )
  const waitingCount = useMemo(
    () => proposals.filter(p => p.stage === 'presentada' || p.stage === 'cambios').length,
    [proposals]
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return proposals.filter(p => {
      if (stageFilter !== 'all' && p.stage !== stageFilter) return false
      if (!q) return true
      const ct = p.contact_id ? contactsById[p.contact_id] : null
      return [p.title, ct?.full_name, ct?.company].some(v => (v ?? '').toLowerCase().includes(q))
    })
  }, [proposals, stageFilter, search, contactsById])

  // ── Abrir / cerrar drawer ───────────────────────────────────────────────────
  const openCreate = useCallback(() => {
    setSelectedId(null)
    setDraft(EMPTY_DRAFT)
    setError('')
    setDrawerOpen(true)
  }, [])

  const openProposal = useCallback((p: Proposal) => {
    setSelectedId(p.id)
    setDraft(draftFromProposal(p))
    setError('')
    setDrawerOpen(true)
  }, [])

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false)
    setTimeout(() => setSelectedId(null), 200)
  }, [])

  // ── Guardar (insert / update) ─────────────────────────────────────────────────
  const save = useCallback(async () => {
    if (!draft.title.trim()) { setError('Ponle un título a la propuesta.'); return }
    setSaving(true); setError('')
    const supabase = getSupabase()
    const now = new Date().toISOString()
    const amount = parseFloat(draft.amount) || 0

    // fechas automáticas según la etapa
    const prev = selected
    const presented_at = (draft.stage === 'presentada' || draft.stage === 'cambios' || draft.stage === 'aceptada' || draft.stage === 'rechazada')
      ? (prev?.presented_at ?? now) : prev?.presented_at ?? null
    const decided_at = (draft.stage === 'aceptada' || draft.stage === 'rechazada')
      ? (prev?.decided_at ?? now) : null

    const payload = {
      organization_id: orgId,
      contact_id: draft.contact_id || null,
      title: draft.title.trim(),
      client_need: draft.client_need.trim() || null,
      proposed_solution: draft.proposed_solution.trim() || null,
      objective: draft.objective.trim() || null,
      scope: draft.scope.trim() || null,
      amount,
      currency: draft.currency,
      notes: draft.notes.trim() || null,
      source_channel: draft.source_channel.trim() || null,
      stage: draft.stage,
      status: STAGE_TO_STATUS[draft.stage] ?? 'draft',
      total: amount,
      presented_at,
      decided_at,
      updated_at: now,
    }

    if (selectedId) {
      const { data, error: e } = await supabase
        .from('proposals').update(payload).eq('id', selectedId).select().single()
      if (e) { setError(e.message); setSaving(false); return }
      setProposals(prev => prev.map(p => p.id === selectedId ? data as Proposal : p))
    } else {
      const { data, error: e } = await supabase
        .from('proposals')
        .insert({ ...payload, assigned_to: currentUserId, created_by: currentUserId })
        .select().single()
      if (e) { setError(e.message); setSaving(false); return }
      setProposals(prev => [data as Proposal, ...prev])
      setSelectedId((data as Proposal).id)
    }
    setSaving(false)
  }, [draft, selected, selectedId, orgId, currentUserId])

  // Cambio rápido de etapa desde el drawer (guarda al instante si ya existe)
  const setStage = useCallback((stage: string) => {
    setDraft(d => ({ ...d, stage }))
  }, [])

  const removeProposal = useCallback(async (p: Proposal) => {
    if (!confirm(`¿Eliminar la propuesta "${p.title}"? Esta acción no se puede deshacer.`)) return
    const supabase = getSupabase()
    if (p.pdf_url) await supabase.storage.from(BUCKET).remove([p.pdf_url])
    await supabase.from('proposals').delete().eq('id', p.id)
    setProposals(prev => prev.filter(x => x.id !== p.id))
    setChanges(prev => prev.filter(x => x.proposal_id !== p.id))
    closeDrawer()
  }, [closeDrawer])

  return (
    <div className={PAGE_WRAP}>
      <PageHeader
        eyebrow="Ventas"
        title="Propuestas"
        sub="Ficha de cada propuesta: necesidades, solución, monto, etapa y documento PDF."
      />

      {/* ── KPIs ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Propuestas activas" value={String(counts.all - (counts.rechazada ?? 0))} hint={`${counts.all} en total`} />
        <StatCard label="Monto en pipeline" value={formatMoney(pipelineAmount)} hint="Sin contar rechazadas" />
        <StatCard label="Esperando respuesta" value={String(waitingCount)} hint="Presentadas o con cambios" accent="blue" />
        <StatCard label="Monto ganado" value={formatMoney(wonAmount)} hint={`${counts.aceptada ?? 0} aceptadas`} accent="emerald" />
      </div>

      {/* ── Toolbar ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 flex items-center gap-2 overflow-x-auto pb-1 -mb-1">
          <FilterChip label="Todas" count={counts.all} active={stageFilter === 'all'} onClick={() => setStageFilter('all')} />
          {STAGES.map(s => (
            <FilterChip key={s.value} label={s.short} count={counts[s.value] ?? 0} dot={s.dot}
              active={stageFilter === s.value} onClick={() => setStageFilter(s.value)} />
          ))}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="relative">
            <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar cliente o título…"
              className="w-full sm:w-56 pl-9 pr-3 py-2 text-sm rounded-xl bg-white dark:bg-[#161b27] border border-slate-200 dark:border-white/[0.08] text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-white/10"
            />
          </div>
          <button
            onClick={openCreate}
            className="shrink-0 flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-xl text-white transition-all active:scale-95"
            style={{ background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)' }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 4v16m8-8H4" /></svg>
            <span className="hidden sm:inline">Nueva propuesta</span>
            <span className="sm:hidden">Nueva</span>
          </button>
        </div>
      </div>

      {/* ── Grid de fichas ───────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="rounded-3xl bg-white dark:bg-[#161b27] py-10" style={CARD_S}>
          <EmptyState message={proposals.length === 0 ? 'Aún no hay propuestas. Crea la primera ficha.' : 'No hay propuestas en esta etapa.'} />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map(p => {
            const ct = p.contact_id ? contactsById[p.contact_id] : null
            const st = STAGE_MAP[p.stage] ?? STAGES[0]
            const pendingChanges = changes.filter(c => c.proposal_id === p.id && !c.resolved).length
            return (
              <button
                key={p.id}
                onClick={() => openProposal(p)}
                className="text-left rounded-3xl bg-white dark:bg-[#161b27] p-4 md:p-5 transition-all hover:-translate-y-0.5 active:scale-[0.99]"
                style={CARD_S}
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full ${st.pill}`}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.dot }} />
                    {st.label}
                  </span>
                  {p.pdf_url && (
                    <span title="Tiene PDF guardado" className="text-slate-400 dark:text-slate-500">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    </span>
                  )}
                </div>

                <p className="text-[15px] font-bold text-slate-900 dark:text-white leading-snug line-clamp-2">{p.title}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 truncate">
                  {ct ? (ct.company ? `${ct.full_name} · ${ct.company}` : ct.full_name) : 'Sin contacto vinculado'}
                </p>

                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-semibold">Monto</p>
                    <p className="text-lg font-extrabold text-slate-900 dark:text-white tabular-nums">
                      {p.amount ? formatMoney(p.amount, p.currency) : <span className="text-slate-300 dark:text-slate-600">Por definir</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {pendingChanges > 0 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                        {pendingChanges} cambio{pendingChanges > 1 ? 's' : ''}
                      </span>
                    )}
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">{formatDate(p.updated_at)}</span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* ── Drawer de detalle ────────────────────────────────────────────────── */}
      {drawerOpen && (
        <ProposalDrawer
          orgId={orgId}
          currentUserId={currentUserId}
          isNew={!selectedId}
          proposal={selected}
          draft={draft}
          setDraft={setDraft}
          setStage={setStage}
          contacts={contacts}
          contactsById={contactsById}
          orgBranding={orgBranding}
          changes={changes.filter(c => selectedId && c.proposal_id === selectedId)}
          saving={saving}
          error={error}
          onSave={save}
          onClose={closeDrawer}
          onDelete={selected ? () => removeProposal(selected) : undefined}
          onProposalPatch={(patch) => {
            if (!selectedId) return
            setProposals(prev => prev.map(p => p.id === selectedId ? { ...p, ...patch } : p))
          }}
          onChangesPatch={setChanges}
        />
      )}
    </div>
  )
}

// ─── StatCard ──────────────────────────────────────────────────────────────────

function StatCard({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: 'blue' | 'emerald' }) {
  const valCl = accent === 'emerald' ? 'text-emerald-600 dark:text-emerald-400'
    : accent === 'blue' ? 'text-blue-600 dark:text-blue-400'
    : 'text-slate-900 dark:text-white'
  return (
    <div className="rounded-3xl bg-white dark:bg-[#161b27] p-4" style={CARD_S}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</p>
      <p className={`text-2xl font-extrabold mt-1 tabular-nums ${valCl}`}>{value}</p>
      {hint && <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{hint}</p>}
    </div>
  )
}

function FilterChip({ label, count, active, onClick, dot }: { label: string; count: number; active: boolean; onClick: () => void; dot?: string }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
        active ? 'bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-900' : 'bg-white dark:bg-[#161b27] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.04]'
      }`}
      style={active ? undefined : CARD_S}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full" style={{ background: dot }} />}
      {label}
      <span className={`text-[10px] ${active ? 'opacity-70' : 'text-slate-400'}`}>{count}</span>
    </button>
  )
}

// ─── Drawer ─────────────────────────────────────────────────────────────────────

function ProposalDrawer({
  orgId, currentUserId, isNew, proposal, draft, setDraft, setStage,
  contacts, contactsById, orgBranding, changes,
  saving, error, onSave, onClose, onDelete, onProposalPatch, onChangesPatch,
}: {
  orgId: number
  currentUserId: string
  isNew: boolean
  proposal: Proposal | null
  draft: Draft
  setDraft: React.Dispatch<React.SetStateAction<Draft>>
  setStage: (s: string) => void
  contacts: Contact[]
  contactsById: Record<string, Contact>
  orgBranding: OrgBranding
  changes: ProposalChange[]
  saving: boolean
  error: string
  onSave: () => void
  onClose: () => void
  onDelete?: () => void
  onProposalPatch: (patch: Partial<Proposal>) => void
  onChangesPatch: React.Dispatch<React.SetStateAction<ProposalChange[]>>
}) {
  const contact = draft.contact_id ? contactsById[draft.contact_id] : null
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft(d => ({ ...d, [k]: v }))

  // ── Brief para IA ──────────────────────────────────────────────────────────
  const [copied, setCopied] = useState(false)
  const aiBrief = useMemo(() => buildAIBrief(draft, contact, orgBranding), [draft, contact, orgBranding])
  const copyBrief = async () => {
    try { await navigator.clipboard.writeText(aiBrief); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch {}
  }

  // ── PDF ──────────────────────────────────────────────────────────────────────
  const fileRef = useRef<HTMLInputElement>(null)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [pdfErr, setPdfErr] = useState('')

  const uploadPdf = async (file: File | undefined) => {
    if (!file || !proposal) return
    if (file.size > 25 * 1024 * 1024) { setPdfErr('El archivo supera los 25 MB'); return }
    setPdfBusy(true); setPdfErr('')
    const supabase = getSupabase()
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${orgId}/${proposal.id}/${Date.now()}_${safe}`
    // Reemplaza el PDF anterior si existía
    if (proposal.pdf_url) await supabase.storage.from(BUCKET).remove([proposal.pdf_url])
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false })
    if (upErr) { setPdfErr(upErr.message); setPdfBusy(false); return }
    const { error: dbErr } = await supabase.from('proposals').update({ pdf_url: path, updated_at: new Date().toISOString() }).eq('id', proposal.id)
    if (dbErr) { setPdfErr(dbErr.message); setPdfBusy(false); return }
    onProposalPatch({ pdf_url: path })
    setPdfBusy(false)
  }

  const downloadPdf = async () => {
    if (!proposal?.pdf_url) return
    setPdfBusy(true)
    const { data, error: e } = await getSupabase().storage.from(BUCKET).createSignedUrl(proposal.pdf_url, 3600)
    setPdfBusy(false)
    if (e || !data?.signedUrl) { setPdfErr('No se pudo generar el link'); return }
    window.open(data.signedUrl, '_blank')
  }

  const deletePdf = async () => {
    if (!proposal?.pdf_url) return
    if (!confirm('¿Quitar el PDF guardado?')) return
    setPdfBusy(true)
    const supabase = getSupabase()
    await supabase.storage.from(BUCKET).remove([proposal.pdf_url])
    await supabase.from('proposals').update({ pdf_url: null, updated_at: new Date().toISOString() }).eq('id', proposal.id)
    onProposalPatch({ pdf_url: null })
    setPdfBusy(false)
  }

  // ── Cambios solicitados ──────────────────────────────────────────────────────
  const [newChange, setNewChange] = useState('')
  const [changeBusy, setChangeBusy] = useState(false)

  const addChange = async () => {
    if (!newChange.trim() || !proposal) return
    setChangeBusy(true)
    const { data, error: e } = await getSupabase()
      .from('proposal_changes')
      .insert({ organization_id: orgId, proposal_id: proposal.id, description: newChange.trim(), created_by: currentUserId })
      .select().single()
    setChangeBusy(false)
    if (e) { setPdfErr(e.message); return }
    onChangesPatch(prev => [data as ProposalChange, ...prev])
    setNewChange('')
  }

  const toggleChange = async (c: ProposalChange) => {
    const next = !c.resolved
    onChangesPatch(prev => prev.map(x => x.id === c.id ? { ...x, resolved: next } : x))
    await getSupabase().from('proposal_changes').update({ resolved: next }).eq('id', c.id)
  }

  const removeChange = async (c: ProposalChange) => {
    onChangesPatch(prev => prev.filter(x => x.id !== c.id))
    await getSupabase().from('proposal_changes').delete().eq('id', c.id)
  }

  // Cierra con ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const stageObj = STAGE_MAP[draft.stage] ?? STAGES[0]

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      {/* backdrop */}
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

      {/* panel */}
      <div className="relative w-full max-w-2xl h-full bg-slate-50 dark:bg-[#0f1420] shadow-2xl flex flex-col animate-[slideIn_.2s_ease-out]">
        <style>{`@keyframes slideIn{from{transform:translateX(24px);opacity:.6}to{transform:translateX(0);opacity:1}}`}</style>

        {/* Header */}
        <div className="shrink-0 px-5 py-4 bg-white dark:bg-[#161b27] border-b border-slate-100 dark:border-white/[0.06]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                {isNew ? 'Nueva propuesta' : 'Ficha de propuesta'}
              </p>
              <p className="text-lg font-bold text-slate-900 dark:text-white truncate mt-0.5">
                {draft.title || 'Sin título'}
              </p>
              {contact && <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{contact.company ? `${contact.full_name} · ${contact.company}` : contact.full_name}</p>}
            </div>
            <button onClick={onClose} className="shrink-0 w-8 h-8 rounded-xl bg-slate-100 dark:bg-white/[0.06] flex items-center justify-center text-slate-500 hover:bg-slate-200 dark:hover:bg-white/[0.1] transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          {/* Etapas */}
          <div className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-1 -mb-1">
            {STAGES.map(s => (
              <button key={s.value} onClick={() => setStage(s.value)} title={s.desc}
                className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all ${
                  draft.stage === s.value ? s.pill + ' ring-2 ring-offset-1 ring-offset-white dark:ring-offset-[#161b27]' : 'bg-slate-100 dark:bg-white/[0.05] text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-white/[0.08]'
                }`}
                style={draft.stage === s.value ? { boxShadow: `0 0 0 2px ${s.dot}` } : undefined}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot }} />
                {s.short}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">{stageObj.desc}</p>
        </div>

        {/* Body scroll */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

          {/* Datos base */}
          <Section title="Datos">
            <Field label="Título de la propuesta *">
              <input value={draft.title} onChange={e => set('title', e.target.value)}
                placeholder="Ej. Producción de contenido y redes — Verdant Comfort"
                className={inputCls} />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Contacto / cliente">
                <select value={draft.contact_id} onChange={e => set('contact_id', e.target.value)} className={inputCls}>
                  <option value="">— Sin vincular —</option>
                  {contacts.map(c => (
                    <option key={c.id} value={c.id}>{c.full_name}{c.company ? ` · ${c.company}` : ''}</option>
                  ))}
                </select>
              </Field>
              <Field label="Origen / canal">
                <input value={draft.source_channel} onChange={e => set('source_channel', e.target.value)}
                  placeholder="Ej. Google Ads, Métrica BTL (intermediario)…" className={inputCls} />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Field label="Monto">
                  <input type="number" inputMode="decimal" value={draft.amount} onChange={e => set('amount', e.target.value)}
                    placeholder="0" className={inputCls} />
                </Field>
              </div>
              <Field label="Moneda">
                <select value={draft.currency} onChange={e => set('currency', e.target.value)} className={inputCls}>
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
            </div>
          </Section>

          {/* Brief */}
          <Section title="Brief — qué necesita y qué le proponemos">
            <Field label="Necesidades del cliente" hint="Qué nos pidió / qué problema tiene (de la videollamada)">
              <textarea value={draft.client_need} onChange={e => set('client_need', e.target.value)} rows={4}
                placeholder="Lo que el cliente expresó que necesita…" className={textareaCls} />
            </Field>
            <Field label="Solución que proponemos" hint="Cómo lo resuelve Antuario">
              <textarea value={draft.proposed_solution} onChange={e => set('proposed_solution', e.target.value)} rows={4}
                placeholder="Servicios, enfoque y entregables que proponemos…" className={textareaCls} />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Objetivo / resultado esperado">
                <textarea value={draft.objective} onChange={e => set('objective', e.target.value)} rows={3}
                  placeholder="Qué resultado busca el cliente…" className={textareaCls} />
              </Field>
              <Field label="Alcance / entregables">
                <textarea value={draft.scope} onChange={e => set('scope', e.target.value)} rows={3}
                  placeholder="Qué incluye, alcance, periodicidad…" className={textareaCls} />
              </Field>
            </div>
            <Field label="Notas internas" hint="Solo para el equipo, no va en el PDF">
              <textarea value={draft.notes} onChange={e => set('notes', e.target.value)} rows={2}
                placeholder="Contexto interno, señales de compra, riesgos…" className={textareaCls} />
            </Field>
          </Section>

          {/* Guardar */}
          {error && <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>}
          <div className="flex items-center gap-2">
            <button onClick={onSave} disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 text-sm font-bold py-2.5 rounded-xl text-white transition-all active:scale-[0.99] disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)' }}>
              {saving ? <Spinner /> : null}
              {isNew ? 'Crear propuesta' : 'Guardar cambios'}
            </button>
          </div>

          {/* Lo siguiente solo aplica a propuestas ya guardadas */}
          {isNew ? (
            <p className="text-xs text-center text-slate-400 dark:text-slate-500">
              Guarda la propuesta para generar el brief, adjuntar el PDF y registrar cambios.
            </p>
          ) : (
            <>
              {/* Documento IA */}
              <Section title="Documento — brief para IA + PDF">
                <div className="rounded-2xl bg-white dark:bg-[#161b27] p-3.5" style={CARD_S}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Brief listo para el agente IA</p>
                    <button onClick={copyBrief}
                      className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 active:scale-95 transition-all">
                      {copied ? '¡Copiado!' : 'Copiar brief'}
                    </button>
                  </div>
                  <pre className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400 whitespace-pre-wrap max-h-40 overflow-y-auto bg-slate-50 dark:bg-[#0f1420] rounded-xl p-2.5 border border-slate-100 dark:border-white/[0.05]">{aiBrief}</pre>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2">
                    Pega esto en tu agente IA (Claude / n8n) para que genere el PDF de la propuesta y súbelo aquí abajo.
                  </p>
                </div>

                {/* PDF slot */}
                <input ref={fileRef} type="file" accept="application/pdf" className="hidden"
                  onChange={e => uploadPdf(e.target.files?.[0])} />
                {proposal?.pdf_url ? (
                  <div className="flex items-center gap-3 rounded-2xl bg-white dark:bg-[#161b27] p-3" style={CARD_S}>
                    <span className="text-2xl">📄</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">Propuesta en PDF</p>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500">Guardada en el dashboard</p>
                    </div>
                    <button onClick={downloadPdf} disabled={pdfBusy} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/[0.1] transition-colors disabled:opacity-50">
                      {pdfBusy ? '…' : 'Ver / descargar'}
                    </button>
                    <button onClick={() => fileRef.current?.click()} disabled={pdfBusy} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/[0.1] transition-colors disabled:opacity-50">
                      Reemplazar
                    </button>
                    <button onClick={deletePdf} disabled={pdfBusy} className="text-xs font-semibold p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                ) : (
                  <button onClick={() => fileRef.current?.click()} disabled={pdfBusy}
                    className="w-full border-2 border-dashed border-slate-200 dark:border-white/[0.1] rounded-2xl p-4 text-center hover:border-slate-300 dark:hover:border-white/[0.2] hover:bg-white dark:hover:bg-[#161b27] transition-all disabled:opacity-60">
                    {pdfBusy ? (
                      <span className="flex items-center justify-center gap-2 text-sm text-slate-500"><Spinner /> Subiendo PDF…</span>
                    ) : (
                      <>
                        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Subir PDF de la propuesta</p>
                        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">El documento que presentarás al cliente · máx. 25 MB</p>
                      </>
                    )}
                  </button>
                )}
                {pdfErr && <p className="text-xs text-red-500">{pdfErr}</p>}
              </Section>

              {/* Cambios solicitados */}
              <Section title="Cambios solicitados por el cliente">
                <div className="flex items-start gap-2">
                  <textarea value={newChange} onChange={e => setNewChange(e.target.value)} rows={2}
                    placeholder="Ej. Pidió bajar el alcance del mes 1 y ajustar el precio…" className={textareaCls} />
                  <button onClick={addChange} disabled={changeBusy || !newChange.trim()}
                    className="shrink-0 text-sm font-bold px-3.5 py-2 rounded-xl text-white transition-all active:scale-95 disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)' }}>
                    {changeBusy ? <Spinner /> : 'Agregar'}
                  </button>
                </div>
                {changes.length === 0 ? (
                  <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-2">Sin cambios registrados.</p>
                ) : (
                  <div className="space-y-2">
                    {changes.map(c => (
                      <div key={c.id} className={`flex items-start gap-2.5 rounded-2xl p-3 ${c.resolved ? 'bg-slate-100/60 dark:bg-white/[0.03]' : 'bg-white dark:bg-[#161b27]'}`} style={c.resolved ? undefined : CARD_S}>
                        <button onClick={() => toggleChange(c)} title={c.resolved ? 'Marcar pendiente' : 'Marcar resuelto'}
                          className={`shrink-0 w-5 h-5 mt-0.5 rounded-md flex items-center justify-center transition-colors ${c.resolved ? 'bg-emerald-500 text-white' : 'border-2 border-slate-300 dark:border-white/[0.2] text-transparent hover:border-emerald-400'}`}>
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm ${c.resolved ? 'text-slate-400 dark:text-slate-500 line-through' : 'text-slate-700 dark:text-slate-200'}`}>{c.description}</p>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{formatDate(c.created_at)}</p>
                        </div>
                        <button onClick={() => removeChange(c)} className="shrink-0 p-1 rounded-lg text-slate-300 dark:text-slate-600 hover:text-red-500 transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* Meta + eliminar */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-white/[0.06]">
                <div className="text-[11px] text-slate-400 dark:text-slate-500 space-y-0.5">
                  <p>Presentada: {formatDate(proposal?.presented_at ?? null)}</p>
                  <p>Respuesta del cliente: {formatDate(proposal?.decided_at ?? null)}</p>
                </div>
                {onDelete && (
                  <button onClick={onDelete} className="text-xs font-semibold text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 px-3 py-1.5 rounded-lg transition-colors">
                    Eliminar propuesta
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Subcomponentes de formulario ───────────────────────────────────────────────

const inputCls = 'w-full px-3 py-2 text-sm rounded-xl bg-white dark:bg-[#161b27] border border-slate-200 dark:border-white/[0.08] text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-white/10'
const textareaCls = inputCls + ' resize-y leading-relaxed'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">{title}</h3>
      {children}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-slate-400 dark:text-slate-500">{hint}</p>}
    </div>
  )
}

// ─── Brief para IA ───────────────────────────────────────────────────────────────

function buildAIBrief(draft: Draft, contact: Contact | null, org: OrgBranding): string {
  const orgName = org?.name || 'Antuario'
  const money = draft.amount ? `${draft.currency} ${parseFloat(draft.amount).toLocaleString('es-MX')}` : 'Por definir'
  const lines = [
    `# Brief de propuesta comercial — ${orgName}`,
    ``,
    `Título: ${draft.title || '(sin título)'}`,
    `Cliente: ${contact?.full_name ?? '(sin contacto)'}${contact?.company ? ` — ${contact.company}` : ''}`,
    contact?.email ? `Correo: ${contact.email}` : null,
    contact?.phone ? `Teléfono: ${contact.phone}` : null,
    draft.source_channel ? `Origen: ${draft.source_channel}` : null,
    `Monto propuesto: ${money}`,
    ``,
    `## Necesidades del cliente`,
    draft.client_need || '(pendiente)',
    ``,
    `## Solución que propone ${orgName}`,
    draft.proposed_solution || '(pendiente)',
    ``,
    `## Objetivo / resultado esperado`,
    draft.objective || '(pendiente)',
    ``,
    `## Alcance / entregables`,
    draft.scope || '(pendiente)',
    ``,
    `---`,
    `Instrucción: Redacta una propuesta comercial profesional en PDF para ${contact?.company ?? 'el cliente'}, `,
    `con el tono y branding de ${orgName}. Estructura sugerida: portada, entendimiento de la necesidad, `,
    `solución propuesta, alcance y entregables, inversión (${money}), siguientes pasos y datos de contacto.`,
  ].filter(Boolean)
  return lines.join('\n')
}
