'use client'

import { useMemo, useState, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { PAGE_WRAP, PageHeader, CARD_S } from '@/components/ui/dashboard'

// ─── Tipos ──────────────────────────────────────────────────────────────────
type Prospect = {
  id: string
  full_name: string | null
  title: string | null
  seniority: string | null
  email: string | null
  email_status: string | null
  phone: string | null
  linkedin_url: string | null
  company: string | null
  company_domain: string | null
  industry: string | null
  employees_range: string | null
  company_city: string | null
  icp_segment: string | null
  fit_score: number | null
  stage: string
  assigned_seller: string | null
  channel: string | null
  touches: number | null
  last_contacted_at: string | null
  next_action_at: string | null
  next_action: string | null
  notes: string | null
  contact_id: string | null
  source: string | null
  created_at: string | null
  updated_at: string | null
}
type Profile = { id: string; full_name: string | null; email: string | null }
type Props = {
  orgId: number
  currentUserId: string
  currentUserRole: string
  initialProspects: Prospect[]
  profiles: Profile[]
}

// ─── Constantes ─────────────────────────────────────────────────────────────
const STAGES = [
  { value: 'por_contactar',    label: 'Por contactar',    dot: '#94a3b8', chip: 'bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-slate-300' },
  { value: 'contactado',       label: 'Contactado',       dot: '#38bdf8', chip: 'bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-300' },
  { value: 'siguiendo',        label: 'En seguimiento',   dot: '#f59e0b', chip: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-300' },
  { value: 'interesado',       label: 'Interesado',       dot: '#34d399', chip: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300' },
  { value: 'reunion_agendada', label: 'Reunión agendada', dot: '#8b5cf6', chip: 'bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-300' },
  { value: 'convertido',       label: 'Convertido',       dot: '#14b8a6', chip: 'bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300' },
  { value: 'descartado',       label: 'Descartado',       dot: '#f87171', chip: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300' },
]
const stageMeta = (v: string) => STAGES.find(s => s.value === v) ?? STAGES[0]

const SEGMENTS: Record<string, { label: string; accent: string }> = {
  despacho_legal:         { label: 'Despacho legal',   accent: '#6366f1' },
  promotora_inmobiliaria: { label: 'Inmobiliaria',     accent: '#0ea5e9' },
  agencia_marketing:      { label: 'Agencia / BTL',    accent: '#ec4899' },
}
const segLabel = (v: string | null) => (v && SEGMENTS[v]?.label) || v || '—'
const segAccent = (v: string | null) => (v && SEGMENTS[v]?.accent) || '#94a3b8'

// ─── Helpers ────────────────────────────────────────────────────────────────
function getInitials(name: string | null): string {
  if (!name) return '?'
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?'
}
function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', day: '2-digit', month: 'short', year: 'numeric' })
}
function sellerName(p: Profile): string {
  return p.full_name || p.email || 'Miembro'
}
function getSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// ─── Componente ─────────────────────────────────────────────────────────────
export default function ProspeccionClient({ orgId, currentUserId, initialProspects, profiles }: Props) {
  const [prospects, setProspects] = useState<Prospect[]>(initialProspects)
  const [stageFilter, setStageFilter] = useState<string>('todos')
  const [segFilter, setSegFilter] = useState<string>('todos')
  const [sellerFilter, setSellerFilter] = useState<string>('todos')
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const me = profiles.find(p => p.id === currentUserId)
  const myName = me ? sellerName(me) : 'Yo'

  // ── Mutación optimista ──
  const patch = useCallback(async (id: string, changes: Partial<Prospect>) => {
    setSavingId(id)
    setProspects(prev => prev.map(p => (p.id === id ? { ...p, ...changes } : p)))
    const { error } = await getSupabase()
      .from('prospects')
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) alert('No se pudo guardar: ' + error.message)
    setSavingId(null)
  }, [])

  const registrarToque = useCallback((p: Prospect) => {
    const next: Partial<Prospect> = {
      touches: (p.touches ?? 0) + 1,
      last_contacted_at: new Date().toISOString(),
    }
    if (p.stage === 'por_contactar') next.stage = 'contactado'
    patch(p.id, next)
  }, [patch])

  const convertir = useCallback(async (p: Prospect) => {
    if (!confirm(`Convertir a "${p.full_name}" (${p.company}) en contacto del CRM?`)) return
    setSavingId(p.id)
    const supabase = getSupabase()
    const { data: contact, error } = await supabase.from('contacts').insert({
      organization_id: orgId,
      full_name: p.full_name,
      email: p.email,
      phone: p.phone,
      company: p.company,
      position: p.title,
      source: 'prospeccion-fria',
      contact_type: 'lead_potential',
      primary_channel: p.channel || 'email',
      linkedin: p.linkedin_url,
      notes: `Prospecto en frío (${segLabel(p.icp_segment)}).${p.notes ? ' ' + p.notes : ''}`,
      created_by: currentUserId,
    }).select('id').single()
    if (error || !contact) { alert('No se pudo convertir: ' + (error?.message ?? '')); setSavingId(null); return }
    await supabase.from('prospects').update({ contact_id: contact.id, stage: 'convertido', updated_at: new Date().toISOString() }).eq('id', p.id)
    setProspects(prev => prev.map(x => (x.id === p.id ? { ...x, contact_id: contact.id, stage: 'convertido' } : x)))
    setSavingId(null)
  }, [orgId, currentUserId])

  const copyEmail = useCallback((p: Prospect) => {
    if (!p.email) return
    navigator.clipboard?.writeText(p.email)
    setCopiedId(p.id)
    setTimeout(() => setCopiedId(c => (c === p.id ? null : c)), 1500)
  }, [])

  // ── Derivados ──
  const sellers = useMemo(() => {
    const set = new Set<string>()
    prospects.forEach(p => { if (p.assigned_seller) set.add(p.assigned_seller) })
    return Array.from(set)
  }, [prospects])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return prospects.filter(p => {
      if (stageFilter !== 'todos' && p.stage !== stageFilter) return false
      if (segFilter !== 'todos' && p.icp_segment !== segFilter) return false
      if (sellerFilter !== 'todos') {
        if (sellerFilter === '__none__' ? p.assigned_seller : p.assigned_seller !== sellerFilter) return false
      }
      if (q && ![p.full_name, p.title, p.company, p.email, p.industry].some(v => (v ?? '').toLowerCase().includes(q))) return false
      return true
    })
  }, [prospects, stageFilter, segFilter, sellerFilter, query])

  const stageCounts = useMemo(() => {
    const base = prospects.filter(p =>
      (segFilter === 'todos' || p.icp_segment === segFilter) &&
      (sellerFilter === 'todos' || (sellerFilter === '__none__' ? !p.assigned_seller : p.assigned_seller === sellerFilter))
    )
    const c: Record<string, number> = { todos: base.length }
    STAGES.forEach(s => { c[s.value] = base.filter(p => p.stage === s.value).length })
    return c
  }, [prospects, segFilter, sellerFilter])

  const kpis = useMemo(() => {
    const withEmail = prospects.filter(p => p.email).length
    const activos = prospects.filter(p => ['contactado', 'siguiendo', 'interesado'].includes(p.stage)).length
    const reuniones = prospects.filter(p => p.stage === 'reunion_agendada').length
    const convertidos = prospects.filter(p => p.stage === 'convertido').length
    const porContactar = prospects.filter(p => p.stage === 'por_contactar').length
    return { total: prospects.length, withEmail, activos, reuniones, convertidos, porContactar }
  }, [prospects])

  const exportCsv = useCallback(() => {
    const cols = ['full_name', 'title', 'company', 'email', 'phone', 'industry', 'icp_segment', 'fit_score', 'stage', 'assigned_seller', 'touches', 'next_action_at', 'company_city']
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const rows = [cols.join(','), ...filtered.map(p => cols.map(c => esc((p as Record<string, unknown>)[c])).join(','))]
    const blob = new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `prospeccion-antuario-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [filtered])

  return (
    <div className={PAGE_WRAP}>
      <div className="max-w-5xl mx-auto w-full space-y-4">
        <PageHeader
          eyebrow="Ventas · Venta en frío"
          title="Prospección"
          sub="Cartera de prospectos abordados en frío. Cada uno tiene una etapa, un dueño y un próximo paso — hasta agendar reunión o descartar."
        />

        {/* ── KPIs ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          <Kpi label="Total" value={kpis.total} tint="#64748b" />
          <Kpi label="Con correo" value={kpis.withEmail} tint="#0ea5e9" />
          <Kpi label="Por contactar" value={kpis.porContactar} tint="#94a3b8" />
          <Kpi label="En seguimiento" value={kpis.activos} tint="#f59e0b" />
          <Kpi label="Reuniones" value={kpis.reuniones} tint="#8b5cf6" />
          <Kpi label="Convertidos" value={kpis.convertidos} tint="#14b8a6" />
        </div>

        {/* ── Filtros de segmento + vendedor + export ── */}
        <div className="flex flex-wrap items-center gap-2">
          <FilterPills
            value={segFilter}
            onChange={setSegFilter}
            options={[{ value: 'todos', label: 'Todos los giros' }, ...Object.entries(SEGMENTS).map(([value, m]) => ({ value, label: m.label }))]}
          />
          <div className="flex-1" />
          <select
            value={sellerFilter}
            onChange={e => setSellerFilter(e.target.value)}
            className="text-xs rounded-lg border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-[#1a2030] text-slate-600 dark:text-slate-300 px-2.5 py-1.5 outline-none"
          >
            <option value="todos">Todos los vendedores</option>
            <option value="__none__">Sin asignar</option>
            {sellers.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button
            onClick={exportCsv}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/[0.12] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.05] transition-colors"
          >
            Exportar CSV
          </button>
        </div>

        {/* ── Tabs de etapa (pipeline) ── */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          <StageTab label="Todos" count={stageCounts.todos} active={stageFilter === 'todos'} onClick={() => setStageFilter('todos')} dot="#475569" />
          {STAGES.map(s => (
            <StageTab key={s.value} label={s.label} count={stageCounts[s.value]} active={stageFilter === s.value} onClick={() => setStageFilter(s.value)} dot={s.dot} />
          ))}
        </div>

        {/* ── Buscador ── */}
        <div className="relative">
          <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar por nombre, puesto, empresa, correo…"
            className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1a2030] text-slate-800 dark:text-slate-100 placeholder:text-slate-400 outline-none focus:border-slate-400 dark:focus:border-white/20"
          />
        </div>

        {/* ── Lista ── */}
        {filtered.length === 0 ? (
          <div className="py-14 text-center text-sm text-slate-400 dark:text-slate-500">
            No hay prospectos con estos filtros.
          </div>
        ) : (
          <div className="space-y-2.5">
            {filtered.map(p => {
              const isOpen = openId === p.id
              const sm = stageMeta(p.stage)
              return (
                <div key={p.id} className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e2535] overflow-hidden" style={CARD_S}>
                  {/* Fila */}
                  <button
                    onClick={() => setOpenId(isOpen ? null : p.id)}
                    className="w-full text-left px-3.5 md:px-5 py-3.5 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors"
                  >
                    <div className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-white text-xs font-bold" style={{ background: segAccent(p.icp_segment) }}>
                      {getInitials(p.full_name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{p.full_name ?? '—'}</p>
                        {typeof p.fit_score === 'number' && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                            fit {p.fit_score}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] md:text-xs text-slate-400 dark:text-slate-500 truncate">
                        {p.title}{p.title && p.company ? ' · ' : ''}<span className="text-slate-500 dark:text-slate-400 font-medium">{p.company}</span>
                      </p>
                    </div>
                    <div className="hidden sm:flex items-center shrink-0">
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: segAccent(p.icp_segment) + '1a', color: segAccent(p.icp_segment) }}>
                        {segLabel(p.icp_segment)}
                      </span>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 whitespace-nowrap ${sm.chip}`}>
                      {sm.label}
                    </span>
                  </button>

                  {/* Detalle */}
                  {isOpen && (
                    <div className="px-3.5 md:px-5 pb-4 pt-1 border-t border-slate-100 dark:border-white/[0.06] space-y-4">
                      {/* Datos + contacto */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 pt-3">
                        <Field label="Puesto" value={p.title} />
                        <Field label="Empresa" value={p.company} />
                        <Field label="Giro" value={p.industry} />
                        <Field label="Ubicación" value={p.company_city} />
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Correo</p>
                          {p.email ? (
                            <div className="flex items-center gap-2">
                              <a href={`mailto:${p.email}`} className="text-sm text-blue-600 dark:text-blue-400 hover:underline break-all">{p.email}</a>
                              <button onClick={() => copyEmail(p)} className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 dark:border-white/[0.12] text-slate-500 hover:bg-slate-50 dark:hover:bg-white/[0.05]">
                                {copiedId === p.id ? 'Copiado' : 'Copiar'}
                              </button>
                            </div>
                          ) : (
                            <p className="text-sm text-slate-400 dark:text-slate-600 italic">Sin correo verificado</p>
                          )}
                        </div>
                        <Field label="Toques" value={String(p.touches ?? 0)} />
                      </div>

                      {/* Etapa */}
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">Etapa</p>
                        <div className="flex flex-wrap gap-1.5">
                          {STAGES.map(s => (
                            <button
                              key={s.value}
                              onClick={() => patch(p.id, { stage: s.value })}
                              className={`text-[11px] font-medium px-2.5 py-1 rounded-lg border transition-colors ${
                                p.stage === s.value
                                  ? 'border-transparent text-white'
                                  : 'border-slate-200 dark:border-white/[0.12] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.05]'
                              }`}
                              style={p.stage === s.value ? { background: s.dot } : undefined}
                            >
                              {s.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Asignación */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">Vendedor asignado</p>
                          <div className="flex flex-wrap gap-1.5">
                            <AssignBtn active={p.assigned_seller === myName} label={`${myName} (yo)`} onClick={() => patch(p.id, { assigned_seller: myName })} />
                            {profiles.filter(pr => pr.id !== currentUserId).map(pr => (
                              <AssignBtn key={pr.id} active={p.assigned_seller === sellerName(pr)} label={sellerName(pr)} onClick={() => patch(p.id, { assigned_seller: sellerName(pr) })} />
                            ))}
                            <AssignBtn active={!p.assigned_seller} label="Sin asignar" onClick={() => patch(p.id, { assigned_seller: null })} />
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">Próxima acción</p>
                          <div className="flex items-center gap-2">
                            <input
                              type="date"
                              value={p.next_action_at ?? ''}
                              onChange={e => patch(p.id, { next_action_at: e.target.value || null })}
                              className="text-xs rounded-lg border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-[#1a2030] text-slate-600 dark:text-slate-300 px-2 py-1.5 outline-none"
                            />
                            <input
                              type="text"
                              defaultValue={p.next_action ?? ''}
                              onBlur={e => { if (e.target.value !== (p.next_action ?? '')) patch(p.id, { next_action: e.target.value || null }) }}
                              placeholder="¿Qué sigue? (ej. 2º correo)"
                              className="flex-1 min-w-0 text-xs rounded-lg border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-[#1a2030] text-slate-600 dark:text-slate-300 px-2 py-1.5 outline-none"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Notas */}
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">Notas</p>
                        <textarea
                          defaultValue={p.notes ?? ''}
                          onBlur={e => { if (e.target.value !== (p.notes ?? '')) patch(p.id, { notes: e.target.value || null }) }}
                          rows={2}
                          placeholder="Notas del contacto, respuesta, objeciones…"
                          className="w-full text-sm rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.04] text-slate-700 dark:text-slate-200 px-3 py-2 outline-none resize-y"
                        />
                      </div>

                      {/* Acciones */}
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => registrarToque(p)}
                          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-800 dark:bg-white/10 text-white hover:opacity-90 transition-opacity"
                        >
                          Registrar toque{p.touches ? ` (${p.touches})` : ''}
                        </button>
                        {p.email && (
                          <a href={`mailto:${p.email}`} className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/[0.12] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.05] transition-colors">
                            Escribir correo
                          </a>
                        )}
                        {p.linkedin_url && (
                          <a href={p.linkedin_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/[0.12] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.05] transition-colors">
                            LinkedIn
                          </a>
                        )}
                        {p.contact_id ? (
                          <a href="/ventas/contactos" className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-teal-600 text-white hover:opacity-90 transition-opacity">
                            Ver en Contactos
                          </a>
                        ) : (
                          <button
                            onClick={() => convertir(p)}
                            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:opacity-90 transition-opacity"
                          >
                            Convertir a contacto
                          </button>
                        )}
                        <span className="text-[10px] text-slate-400 dark:text-slate-600 ml-auto">
                          {savingId === p.id ? 'Guardando…' : p.last_contacted_at ? `Último toque ${fmtDate(p.last_contacted_at)}` : `Agregado ${fmtDate(p.created_at)}`}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Subcomponentes ─────────────────────────────────────────────────────────
function Kpi({ label, value, tint }: { label: string; value: number; tint: string }) {
  return (
    <div className="rounded-2xl bg-white dark:bg-[#1e2535] border border-slate-200 dark:border-white/[0.08] px-3.5 py-3" style={CARD_S}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: tint }} />
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</p>
      </div>
      <p className="text-xl font-bold text-slate-800 dark:text-slate-100 tabular-nums">{value}</p>
    </div>
  )
}

function StageTab({ label, count, active, onClick, dot }: { label: string; count: number; active: boolean; onClick: () => void; dot: string }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl border transition-colors ${
        active ? 'bg-slate-800 dark:bg-white/10 text-white border-transparent' : 'bg-white dark:bg-[#1a2030] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/[0.1] hover:bg-slate-50 dark:hover:bg-white/[0.05]'
      }`}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: dot }} />
      {label}
      <span className={`tabular-nums ${active ? 'text-white/70' : 'text-slate-400 dark:text-slate-500'}`}>{count}</span>
    </button>
  )
}

function FilterPills({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors ${
            value === o.value ? 'bg-slate-800 dark:bg-white/10 text-white border-transparent' : 'bg-white dark:bg-[#1a2030] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/[0.1] hover:bg-slate-50 dark:hover:bg-white/[0.05]'
        }`}
      >
        {o.label}
      </button>
      ))}
    </div>
  )
}

function AssignBtn({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-[11px] font-medium px-2.5 py-1 rounded-lg border transition-colors ${
        active ? 'bg-indigo-600 text-white border-transparent' : 'border-slate-200 dark:border-white/[0.12] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.05]'
      }`}
    >
      {label}
    </button>
  )
}

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</p>
      <p className="text-sm text-slate-700 dark:text-slate-200 break-words">{value}</p>
    </div>
  )
}
