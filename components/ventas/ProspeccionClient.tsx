'use client'

import { useMemo, useState, useCallback, type ReactNode } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { PAGE_WRAP, PageHeader, CARD_S } from '@/components/ui/dashboard'

// ─── Tipos ──────────────────────────────────────────────────────────────────
type Prospect = {
  id: string
  full_name: string | null
  first_name: string | null
  last_name: string | null
  title: string | null
  seniority: string | null
  email: string | null
  email_status: string | null
  phone: string | null
  linkedin_url: string | null
  company: string | null
  company_domain: string | null
  company_website: string | null
  industry: string | null
  employees_range: string | null
  company_city: string | null
  company_phone: string | null
  company_generic_email: string | null
  icp_segment: string | null
  fit_score: number | null
  stage: string
  deal_path: string | null
  assigned_to: string | null
  assigned_seller: string | null
  channel: string | null
  touches: number | null
  last_contacted_at: string | null
  next_action_at: string | null
  next_action: string | null
  need_note: string | null
  disqualified_reason: string | null
  recycle_at: string | null
  notes: string | null
  contact_id: string | null
  source: string | null
  created_at: string | null
  updated_at: string | null
}
type Profile = { id: string; full_name: string | null; email: string | null }
type Activity = {
  id: string
  prospect_id: string
  type: string
  channel: string | null
  direction: string | null
  outcome: string | null
  body: string | null
  created_by: string | null
  created_at: string
}
type Template = {
  id: string
  name: string
  channel: string
  segment: string | null
  step: number | null
  subject: string | null
  body: string
  is_active: boolean
  sort_order: number
}
type Props = {
  orgId: number
  currentUserId: string
  currentUserRole: string
  initialProspects: Prospect[]
  profiles: Profile[]
  initialActivities: Activity[]
  templates: Template[]
}

// ─── Constantes ─────────────────────────────────────────────────────────────
// Base de la landing "Plan de Crecimiento" (se construye en la web de Antuario).
const LANDING_BASE = 'https://www.antuario.mx/plan-de-crecimiento'

// Pipeline en orden. por_investigar = pre-embudo (dato genérico, falta el decisor).
const STAGES = [
  { value: 'por_investigar',   label: 'Por investigar',   short: 'Investigar', dot: '#c084fc', chip: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-300' },
  { value: 'por_contactar',    label: 'Por contactar',    short: 'Contactar',  dot: '#94a3b8', chip: 'bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-slate-300' },
  { value: 'contactado',       label: 'Contactado',       short: 'Contactado', dot: '#38bdf8', chip: 'bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-300' },
  { value: 'siguiendo',        label: 'En seguimiento',   short: 'Seguimiento',dot: '#f59e0b', chip: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-300' },
  { value: 'interesado',       label: 'Interesado',       short: 'Interesado', dot: '#34d399', chip: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300' },
  { value: 'reunion_agendada', label: 'Reunión agendada', short: 'Reunión',    dot: '#8b5cf6', chip: 'bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-300' },
  { value: 'convertido',       label: 'Convertido',       short: 'Convertido', dot: '#14b8a6', chip: 'bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300' },
  { value: 'descartado',       label: 'Descartado',       short: 'Descartado', dot: '#f87171', chip: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300' },
]
const stageMeta = (v: string) => STAGES.find(s => s.value === v) ?? STAGES[1]

// Los 2 caminos (definido en la reunión de alineación).
const PATHS: Record<string, { label: string; help: string; color: string }> = {
  disena_solucion: { label: 'Diseñar solución', help: 'Le armamos un Plan de Crecimiento antes de cotizar', color: '#6366f1' },
  cotiza_directo:  { label: 'Cotizar directo',  help: 'Ya tiene su necesidad clara — va directo a propuesta', color: '#0d9488' },
}

const SEGMENTS: Record<string, { label: string; accent: string; campaign: string }> = {
  despacho_legal:         { label: 'Despacho legal', accent: '#6366f1', campaign: 'legal' },
  promotora_inmobiliaria: { label: 'Inmobiliaria',   accent: '#0ea5e9', campaign: 'inmo' },
  agencia_marketing:      { label: 'Agencia / BTL',  accent: '#ec4899', campaign: 'agencias' },
}
const segLabel = (v: string | null) => (v && SEGMENTS[v]?.label) || v || 'Sin giro'
const segAccent = (v: string | null) => (v && SEGMENTS[v]?.accent) || '#94a3b8'
const segCampaign = (v: string | null) => (v && SEGMENTS[v]?.campaign) || 'general'

const CHANNELS: Record<string, { label: string; icon: string }> = {
  email:    { label: 'Correo',   icon: '✉' },
  whatsapp: { label: 'WhatsApp', icon: '◇' },
  llamada:  { label: 'Llamada',  icon: '☎' },
  visita:   { label: 'Visita',   icon: '⚑' },
  linkedin: { label: 'LinkedIn', icon: 'in' },
  meet:     { label: 'Meet',     icon: '▶' },
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function getInitials(name: string | null): string {
  if (!name) return '?'
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?'
}
function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', day: '2-digit', month: 'short', year: 'numeric' })
}
function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-MX', { timeZone: 'America/Mexico_City', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}
function todayISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' }) // YYYY-MM-DD
}
function addDaysISO(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' })
}
function slug(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'antuario'
}
function firstName(p: Prospect): string {
  return p.first_name || p.full_name?.trim().split(/\s+/)[0] || 'Hola'
}
function profileName(profiles: Profile[], id: string | null): string {
  if (!id) return 'Sin asignar'
  const p = profiles.find(x => x.id === id)
  return p?.full_name || p?.email || 'Miembro'
}
function getSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

function buildLink(p: Prospect, sellerName: string, channel: string, step: number | null): string {
  const params = new URLSearchParams({
    pid: p.id,
    ref: slug(sellerName),
    utm_source: channel === 'whatsapp' ? 'whatsapp-frio' : 'email-frio',
    utm_medium: 'outbound',
    utm_campaign: `vfria-2026q3-${segCampaign(p.icp_segment)}`,
    utm_content: `d${step ?? 0}`,
  })
  return `${LANDING_BASE}?${params.toString()}`
}
function substitute(text: string, p: Prospect, sellerName: string, link: string): string {
  return text
    .replaceAll('{{nombre}}', firstName(p))
    .replaceAll('{{empresa}}', p.company || 'su empresa')
    .replaceAll('{{giro}}', p.industry || 'su giro')
    .replaceAll('{{practica}}', p.industry || 'su área')
    .replaceAll('{{vendedor}}', sellerName)
    .replaceAll('{{link}}', link)
}

// ─── Componente ─────────────────────────────────────────────────────────────
export default function ProspeccionClient({
  orgId, currentUserId, currentUserRole, initialProspects, profiles, initialActivities, templates,
}: Props) {
  const [prospects, setProspects] = useState<Prospect[]>(initialProspects)
  const [acts, setActs] = useState<Activity[]>(initialActivities)
  const isManager = currentUserRole === 'owner' || currentUserRole === 'admin'

  const [view, setView] = useState<'mios' | 'todos'>(isManager ? 'todos' : 'mios')
  const [stageFilter, setStageFilter] = useState<string>('todos')
  const [segFilter, setSegFilter] = useState<string>('todos')
  const [sellerFilter, setSellerFilter] = useState<string>('todos')
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [composer, setComposer] = useState<{ prospect: Prospect } | null>(null)

  const myName = profileName(profiles, currentUserId)

  const actsByProspect = useMemo(() => {
    const m: Record<string, Activity[]> = {}
    for (const a of acts) (m[a.prospect_id] ??= []).push(a)
    return m
  }, [acts])

  // ── Mutación optimista de un prospecto ──
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

  // ── Registrar una actividad en la bitácora ──
  const logActivity = useCallback(async (
    prospectId: string,
    a: { type: string; channel?: string | null; direction?: string | null; outcome?: string | null; body?: string | null },
  ) => {
    const supabase = getSupabase()
    const { data, error } = await supabase.from('prospect_activities').insert({
      organization_id: orgId,
      prospect_id: prospectId,
      type: a.type,
      channel: a.channel ?? null,
      direction: a.direction ?? null,
      outcome: a.outcome ?? null,
      body: a.body ?? null,
      created_by: currentUserId,
    }).select('id, prospect_id, type, channel, direction, outcome, body, created_by, created_at').single()
    if (error) { alert('No se pudo registrar la actividad: ' + error.message); return }
    if (data) setActs(prev => [data as Activity, ...prev])
  }, [orgId, currentUserId])

  // ── Registrar toque (saliente) por canal ──
  const registrarToque = useCallback((p: Prospect, channel: string, body?: string) => {
    const next: Partial<Prospect> = {
      touches: (p.touches ?? 0) + 1,
      last_contacted_at: new Date().toISOString(),
    }
    if (p.stage === 'por_contactar') next.stage = 'contactado'
    patch(p.id, next)
    logActivity(p.id, { type: 'toque', channel, direction: 'saliente', outcome: 'enviado', body: body ?? null })
  }, [patch, logActivity])

  // ── Capturar decisor (sale de "por investigar" a "por contactar") ──
  const capturarDecisor = useCallback((p: Prospect, d: { full_name: string; title: string; email: string; phone: string }) => {
    if (!d.full_name.trim()) { alert('Falta el nombre del decisor.'); return }
    patch(p.id, {
      full_name: d.full_name.trim(),
      title: d.title.trim() || p.title,
      email: d.email.trim() || p.email,
      phone: d.phone.trim() || p.phone,
      stage: 'por_contactar',
    })
    logActivity(p.id, { type: 'sistema', body: `Decisor identificado: ${d.full_name.trim()}${d.title ? ' · ' + d.title : ''}` })
  }, [patch, logActivity])

  const descartar = useCallback((p: Prospect, reason: string, recycle: string) => {
    patch(p.id, { stage: 'descartado', disqualified_reason: reason || null, recycle_at: recycle || null })
    logActivity(p.id, { type: 'etapa', outcome: 'descartado', body: reason || null })
  }, [patch, logActivity])

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
      notes: `Prospecto en frío (${segLabel(p.icp_segment)}).${p.need_note ? ' Necesidad: ' + p.need_note : ''}${p.notes ? ' ' + p.notes : ''}`,
      assigned_to: p.assigned_to,
      created_by: currentUserId,
    }).select('id').single()
    if (error || !contact) { alert('No se pudo convertir: ' + (error?.message ?? '')); setSavingId(null); return }
    await supabase.from('prospects').update({ contact_id: contact.id, stage: 'convertido', updated_at: new Date().toISOString() }).eq('id', p.id)
    setProspects(prev => prev.map(x => (x.id === p.id ? { ...x, contact_id: contact.id, stage: 'convertido' } : x)))
    logActivity(p.id, { type: 'sistema', body: 'Convertido a contacto del CRM' })
    setSavingId(null)
  }, [orgId, currentUserId, logActivity])

  const addProspect = useCallback(async (draft: Partial<Prospect>) => {
    const supabase = getSupabase()
    const { data, error } = await supabase.from('prospects').insert({
      organization_id: orgId,
      assigned_to: currentUserId,
      assigned_seller: myName,
      source: 'manual',
      touches: 0,
      ...draft,
    }).select('*').single()
    if (error || !data) { alert('No se pudo agregar: ' + (error?.message ?? '')); return }
    setProspects(prev => [data as Prospect, ...prev])
    setAddOpen(false)
    setOpenId((data as Prospect).id)
  }, [orgId, currentUserId, myName])

  const flashCopy = useCallback((key: string, text: string) => {
    navigator.clipboard?.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(c => (c === key ? null : c)), 1500)
  }, [])

  // ── Derivados ──
  const scoped = useMemo(() => (
    view === 'mios' ? prospects.filter(p => p.assigned_to === currentUserId) : prospects
  ), [prospects, view, currentUserId])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return scoped.filter(p => {
      if (stageFilter !== 'todos' && p.stage !== stageFilter) return false
      if (segFilter !== 'todos' && p.icp_segment !== segFilter) return false
      if (view === 'todos' && sellerFilter !== 'todos') {
        if (sellerFilter === '__none__' ? p.assigned_to : p.assigned_to !== sellerFilter) return false
      }
      if (q && ![p.full_name, p.title, p.company, p.email, p.industry].some(v => (v ?? '').toLowerCase().includes(q))) return false
      return true
    })
  }, [scoped, stageFilter, segFilter, sellerFilter, query, view])

  const stageCounts = useMemo(() => {
    const base = scoped.filter(p =>
      (segFilter === 'todos' || p.icp_segment === segFilter) &&
      (view === 'mios' || sellerFilter === 'todos' || (sellerFilter === '__none__' ? !p.assigned_to : p.assigned_to === sellerFilter))
    )
    const c: Record<string, number> = { todos: base.length }
    STAGES.forEach(s => { c[s.value] = base.filter(p => p.stage === s.value).length })
    return c
  }, [scoped, segFilter, sellerFilter, view])

  const kpis = useMemo(() => {
    const s = scoped
    const contactados = s.filter(p => ['contactado', 'siguiendo', 'interesado', 'reunion_agendada', 'convertido'].includes(p.stage)).length
    const interesados = s.filter(p => ['interesado', 'reunion_agendada', 'convertido'].includes(p.stage)).length
    const reuniones = s.filter(p => ['reunion_agendada', 'convertido'].includes(p.stage)).length
    return {
      total: s.length,
      porInvestigar: s.filter(p => p.stage === 'por_investigar').length,
      porContactar: s.filter(p => p.stage === 'por_contactar').length,
      enSeguimiento: s.filter(p => ['contactado', 'siguiendo'].includes(p.stage)).length,
      interesados: s.filter(p => p.stage === 'interesado').length,
      reuniones: s.filter(p => p.stage === 'reunion_agendada').length,
      convertidos: s.filter(p => p.stage === 'convertido').length,
      contactados, interesadosAcum: interesados, reunionesAcum: reuniones,
      respRate: contactados ? Math.round((interesados / contactados) * 100) : 0,
      reunRate: contactados ? Math.round((reuniones / contactados) * 100) : 0,
    }
  }, [scoped])

  const today = todayISO()
  const agenda = useMemo(() => (
    scoped
      .filter(p => p.next_action_at && p.next_action_at <= today && !['convertido', 'descartado'].includes(p.stage))
      .sort((a, b) => (a.next_action_at ?? '').localeCompare(b.next_action_at ?? ''))
  ), [scoped, today])

  const exportCsv = useCallback(() => {
    const cols = ['full_name', 'title', 'company', 'email', 'phone', 'industry', 'icp_segment', 'fit_score', 'stage', 'deal_path', 'assigned_seller', 'touches', 'next_action_at', 'company_city']
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const rows = [cols.join(','), ...filtered.map(p => cols.map(c => esc((p as Record<string, unknown>)[c])).join(','))]
    const blob = new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `prospeccion-antuario-${today}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [filtered, today])

  return (
    <div className={PAGE_WRAP}>
      <div className="max-w-5xl mx-auto w-full space-y-4">
        <div className="flex items-start justify-between gap-3">
          <PageHeader
            eyebrow="Ventas · Venta en frío"
            title="Prospección"
            sub="Cada prospecto tiene etapa, dueño, camino y próximo paso — hasta agendar reunión o descartar."
          />
          <button
            onClick={() => setAddOpen(true)}
            className="shrink-0 mt-1 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 transition-opacity"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 5v14M5 12h14" /></svg>
            Agregar prospecto
          </button>
        </div>

        {/* ── Vista mios/todos ── */}
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-200 dark:border-white/[0.1] p-0.5 bg-white dark:bg-[#1a2030]">
            <ViewTab active={view === 'todos'} onClick={() => setView('todos')} label={isManager ? 'Todo el equipo' : 'Todos'} />
            <ViewTab active={view === 'mios'} onClick={() => setView('mios')} label="Mis prospectos" />
          </div>
          <div className="flex-1" />
          <button
            onClick={exportCsv}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/[0.12] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.05] transition-colors"
          >
            Exportar CSV
          </button>
        </div>

        {/* ── KPIs ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
          <Kpi label="Total" value={kpis.total} tint="#64748b" />
          <Kpi label="Investigar" value={kpis.porInvestigar} tint="#c084fc" />
          <Kpi label="Por contactar" value={kpis.porContactar} tint="#94a3b8" />
          <Kpi label="Seguimiento" value={kpis.enSeguimiento} tint="#f59e0b" />
          <Kpi label="Interesados" value={kpis.interesados} tint="#34d399" />
          <Kpi label="Reuniones" value={kpis.reuniones} tint="#8b5cf6" />
          <Kpi label="Convertidos" value={kpis.convertidos} tint="#14b8a6" />
        </div>

        {/* ── Embudo (tasas de conversión) ── */}
        <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e2535] px-4 py-3" style={CARD_S}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Embudo</p>
            <div className="flex items-center gap-4 text-xs">
              <FunnelStat label="Contactados" value={kpis.contactados} />
              <FunnelArrow />
              <FunnelStat label="Interesados" value={kpis.interesadosAcum} pct={kpis.respRate} />
              <FunnelArrow />
              <FunnelStat label="Reuniones" value={kpis.reunionesAcum} pct={kpis.reunRate} accent />
            </div>
          </div>
        </div>

        {/* ── Agenda de hoy ── */}
        {agenda.length > 0 && (
          <div className="rounded-2xl border border-amber-200 dark:border-amber-500/20 bg-amber-50/60 dark:bg-amber-900/10 px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm">⏰</span>
              <p className="text-xs font-bold text-amber-800 dark:text-amber-300">Pendientes de hoy y vencidos · {agenda.length}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {agenda.slice(0, 12).map(p => (
                <button
                  key={p.id}
                  onClick={() => { setOpenId(p.id); setStageFilter('todos') }}
                  className="text-[11px] px-2.5 py-1 rounded-lg bg-white dark:bg-white/[0.06] border border-amber-200/70 dark:border-amber-500/20 text-slate-700 dark:text-slate-200 hover:border-amber-400 transition-colors"
                  title={p.next_action ?? ''}
                >
                  <span className="font-semibold">{p.full_name || p.company}</span>
                  {p.next_action ? <span className="text-slate-400 dark:text-slate-500"> · {p.next_action}</span> : null}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Filtros de segmento + vendedor ── */}
        <div className="flex flex-wrap items-center gap-2">
          <FilterPills
            value={segFilter}
            onChange={setSegFilter}
            options={[{ value: 'todos', label: 'Todos los giros' }, ...Object.entries(SEGMENTS).map(([value, m]) => ({ value, label: m.label }))]}
          />
          <div className="flex-1" />
          {view === 'todos' && (
            <select
              value={sellerFilter}
              onChange={e => setSellerFilter(e.target.value)}
              className="text-xs rounded-lg border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-[#1a2030] text-slate-600 dark:text-slate-300 px-2.5 py-1.5 outline-none"
            >
              <option value="todos">Todos los vendedores</option>
              <option value="__none__">Sin asignar</option>
              {profiles.map(pr => <option key={pr.id} value={pr.id}>{profileName(profiles, pr.id)}</option>)}
            </select>
          )}
        </div>

        {/* ── Tabs de etapa (pipeline) ── */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          <StageTab label="Todos" count={stageCounts.todos} active={stageFilter === 'todos'} onClick={() => setStageFilter('todos')} dot="#475569" />
          {STAGES.map(s => (
            <StageTab key={s.value} label={s.short} count={stageCounts[s.value]} active={stageFilter === s.value} onClick={() => setStageFilter(s.value)} dot={s.dot} />
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
            {filtered.map(p => (
              <ProspectCard
                key={p.id}
                p={p}
                open={openId === p.id}
                onToggle={() => setOpenId(openId === p.id ? null : p.id)}
                saving={savingId === p.id}
                profiles={profiles}
                currentUserId={currentUserId}
                myName={myName}
                activities={actsByProspect[p.id] ?? []}
                copied={copied}
                onCopy={flashCopy}
                patch={patch}
                logActivity={logActivity}
                registrarToque={registrarToque}
                capturarDecisor={capturarDecisor}
                descartar={descartar}
                convertir={convertir}
                openComposer={() => setComposer({ prospect: p })}
              />
            ))}
          </div>
        )}
      </div>

      {addOpen && (
        <AddProspectModal onClose={() => setAddOpen(false)} onSave={addProspect} />
      )}
      {composer && (
        <ComposerModal
          prospect={composer.prospect}
          templates={templates}
          sellerName={profileName(profiles, composer.prospect.assigned_to) !== 'Sin asignar' ? profileName(profiles, composer.prospect.assigned_to) : myName}
          onClose={() => setComposer(null)}
          onCopy={flashCopy}
          copied={copied}
          onSent={(channel) => { registrarToque(composer.prospect, channel); setComposer(null) }}
        />
      )}
    </div>
  )
}

// ─── Tarjeta de prospecto ─────────────────────────────────────────────────────
function ProspectCard({
  p, open, onToggle, saving, profiles, currentUserId, myName, activities, copied, onCopy,
  patch, logActivity, registrarToque, capturarDecisor, descartar, convertir, openComposer,
}: {
  p: Prospect
  open: boolean
  onToggle: () => void
  saving: boolean
  profiles: Profile[]
  currentUserId: string
  myName: string
  activities: Activity[]
  copied: string | null
  onCopy: (key: string, text: string) => void
  patch: (id: string, changes: Partial<Prospect>) => void
  logActivity: (id: string, a: { type: string; channel?: string | null; direction?: string | null; outcome?: string | null; body?: string | null }) => void
  registrarToque: (p: Prospect, channel: string, body?: string) => void
  capturarDecisor: (p: Prospect, d: { full_name: string; title: string; email: string; phone: string }) => void
  descartar: (p: Prospect, reason: string, recycle: string) => void
  convertir: (p: Prospect) => void
  openComposer: () => void
}) {
  const sm = stageMeta(p.stage)
  const isInvestigar = p.stage === 'por_investigar'
  const [showDiscard, setShowDiscard] = useState(false)

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e2535] overflow-hidden" style={CARD_S}>
      <button
        onClick={onToggle}
        className="w-full text-left px-3.5 md:px-5 py-3.5 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors"
      >
        <div className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-white text-xs font-bold" style={{ background: segAccent(p.icp_segment) }}>
          {getInitials(p.full_name || p.company)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{p.full_name || <span className="italic text-slate-400">{p.company || 'Sin decisor'}</span>}</p>
            {typeof p.fit_score === 'number' && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-slate-400 tabular-nums shrink-0">fit {p.fit_score}</span>
            )}
            {p.deal_path && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md shrink-0" style={{ background: PATHS[p.deal_path].color + '1a', color: PATHS[p.deal_path].color }}>
                {PATHS[p.deal_path].label}
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
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 whitespace-nowrap ${sm.chip}`}>{sm.label}</span>
      </button>

      {open && (
        <div className="px-3.5 md:px-5 pb-4 pt-1 border-t border-slate-100 dark:border-white/[0.06] space-y-4">
          {/* Captura de decisor (solo "por investigar") */}
          {isInvestigar && <DecisorCapture onSave={d => capturarDecisor(p, d)} />}

          {/* Datos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 pt-3">
            <Field label="Puesto" value={p.title} />
            <Field label="Empresa" value={p.company} />
            <Field label="Giro" value={p.industry} />
            <Field label="Ubicación" value={p.company_city} />
            <ContactField label="Correo directo" value={p.email} copyKey={`e-${p.id}`} copied={copied} onCopy={onCopy} href={p.email ? `mailto:${p.email}` : undefined} />
            <ContactField label="Teléfono" value={p.phone} copyKey={`p-${p.id}`} copied={copied} onCopy={onCopy} />
            {p.company_generic_email && <ContactField label="Correo general" value={p.company_generic_email} copyKey={`ge-${p.id}`} copied={copied} onCopy={onCopy} />}
            {p.company_phone && <ContactField label="Tel. general" value={p.company_phone} copyKey={`gp-${p.id}`} copied={copied} onCopy={onCopy} />}
            <Field label="Toques" value={String(p.touches ?? 0)} />
          </div>

          {/* Etapa */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">Etapa</p>
            <div className="flex flex-wrap gap-1.5">
              {STAGES.map(s => (
                <button
                  key={s.value}
                  onClick={() => { patch(p.id, { stage: s.value }); logActivity(p.id, { type: 'etapa', body: `Etapa → ${s.label}` }) }}
                  className={`text-[11px] font-medium px-2.5 py-1 rounded-lg border transition-colors ${p.stage === s.value ? 'border-transparent text-white' : 'border-slate-200 dark:border-white/[0.12] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.05]'}`}
                  style={p.stage === s.value ? { background: s.dot } : undefined}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Camino (2 vías) */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">Camino</p>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(PATHS).map(([value, m]) => (
                <button
                  key={value}
                  onClick={() => patch(p.id, { deal_path: p.deal_path === value ? null : value })}
                  className={`text-[11px] font-medium px-2.5 py-1 rounded-lg border transition-colors ${p.deal_path === value ? 'border-transparent text-white' : 'border-slate-200 dark:border-white/[0.12] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.05]'}`}
                  style={p.deal_path === value ? { background: m.color } : undefined}
                  title={m.help}
                >
                  {m.label}
                </button>
              ))}
            </div>
            {p.deal_path && <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">{PATHS[p.deal_path].help}</p>}
          </div>

          {/* Asignación + próxima acción */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">Vendedor</p>
              <div className="flex flex-wrap gap-1.5">
                <AssignBtn active={p.assigned_to === currentUserId} label={`${myName} (yo)`} onClick={() => patch(p.id, { assigned_to: currentUserId, assigned_seller: myName })} />
                {profiles.filter(pr => pr.id !== currentUserId).map(pr => (
                  <AssignBtn key={pr.id} active={p.assigned_to === pr.id} label={profileName(profiles, pr.id)} onClick={() => patch(p.id, { assigned_to: pr.id, assigned_seller: profileName(profiles, pr.id) })} />
                ))}
                <AssignBtn active={!p.assigned_to} label="Sin asignar" onClick={() => patch(p.id, { assigned_to: null, assigned_seller: null })} />
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

          {/* Necesidad + notas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">Necesidad detectada</p>
              <textarea
                defaultValue={p.need_note ?? ''}
                onBlur={e => { if (e.target.value !== (p.need_note ?? '')) patch(p.id, { need_note: e.target.value || null }) }}
                rows={2}
                placeholder="¿Qué necesita? ¿Qué dijo que busca?"
                className="w-full text-sm rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.04] text-slate-700 dark:text-slate-200 px-3 py-2 outline-none resize-y"
              />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">Notas</p>
              <textarea
                defaultValue={p.notes ?? ''}
                onBlur={e => { if (e.target.value !== (p.notes ?? '')) patch(p.id, { notes: e.target.value || null }) }}
                rows={2}
                placeholder="Objeciones, contexto, respuesta…"
                className="w-full text-sm rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.04] text-slate-700 dark:text-slate-200 px-3 py-2 outline-none resize-y"
              />
            </div>
          </div>

          {/* Bitácora */}
          <ActivityLog p={p} activities={activities} profiles={profiles} onAdd={logActivity} />

          {/* Acciones */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button onClick={openComposer} className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:opacity-90 transition-opacity">
              Redactar mensaje
            </button>
            <button onClick={() => registrarToque(p, p.channel || 'email')} className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-800 dark:bg-white/10 text-white hover:opacity-90 transition-opacity">
              Registrar toque{p.touches ? ` (${p.touches})` : ''}
            </button>
            {p.email && <a href={`mailto:${p.email}`} className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/[0.12] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.05] transition-colors">Correo</a>}
            {(p.phone || p.company_phone) && <a href={`https://wa.me/${(p.phone || p.company_phone || '').replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/[0.12] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.05] transition-colors">WhatsApp</a>}
            {p.linkedin_url && <a href={p.linkedin_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/[0.12] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.05] transition-colors">LinkedIn</a>}
            {p.contact_id ? (
              <a href="/ventas/contactos" className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-teal-600 text-white hover:opacity-90 transition-opacity">Ver en Contactos</a>
            ) : (
              <button onClick={() => convertir(p)} className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:opacity-90 transition-opacity">Convertir a contacto</button>
            )}
            {p.stage !== 'descartado' && p.stage !== 'convertido' && (
              <button onClick={() => setShowDiscard(v => !v)} className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-500/20 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors">Descartar</button>
            )}
            <span className="text-[10px] text-slate-400 dark:text-slate-600 ml-auto">
              {saving ? 'Guardando…' : p.last_contacted_at ? `Último toque ${fmtDate(p.last_contacted_at)}` : `Agregado ${fmtDate(p.created_at)}`}
            </span>
          </div>

          {showDiscard && <DiscardPanel onConfirm={(reason, recycle) => { descartar(p, reason, recycle); setShowDiscard(false) }} onCancel={() => setShowDiscard(false)} />}
        </div>
      )}
    </div>
  )
}

// ─── Captura de decisor ────────────────────────────────────────────────────
function DecisorCapture({ onSave }: { onSave: (d: { full_name: string; title: string; email: string; phone: string }) => void }) {
  const [full_name, setFn] = useState('')
  const [title, setTitle] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  return (
    <div className="mt-3 rounded-xl border border-purple-200 dark:border-purple-500/20 bg-purple-50/60 dark:bg-purple-900/10 p-3.5">
      <p className="text-[11px] font-bold text-purple-700 dark:text-purple-300 mb-1">Conseguir al decisor</p>
      <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-2.5">Esta cuenta solo tiene datos generales. Identifica al decisor (LinkedIn de la empresa, la web, o llamando al conmutador) y captúralo para volverlo prospecto.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input value={full_name} onChange={e => setFn(e.target.value)} placeholder="Nombre completo *" className="text-xs rounded-lg border border-slate-200 dark:border-white/[0.12] bg-white dark:bg-[#1a2030] text-slate-700 dark:text-slate-200 px-2.5 py-2 outline-none" />
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Puesto (ej. Director General)" className="text-xs rounded-lg border border-slate-200 dark:border-white/[0.12] bg-white dark:bg-[#1a2030] text-slate-700 dark:text-slate-200 px-2.5 py-2 outline-none" />
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Correo directo de trabajo" className="text-xs rounded-lg border border-slate-200 dark:border-white/[0.12] bg-white dark:bg-[#1a2030] text-slate-700 dark:text-slate-200 px-2.5 py-2 outline-none" />
        <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Teléfono directo" className="text-xs rounded-lg border border-slate-200 dark:border-white/[0.12] bg-white dark:bg-[#1a2030] text-slate-700 dark:text-slate-200 px-2.5 py-2 outline-none" />
      </div>
      <button onClick={() => onSave({ full_name, title, email, phone })} className="mt-2.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-purple-600 text-white hover:opacity-90 transition-opacity">
        Marcar como prospecto →
      </button>
    </div>
  )
}

// ─── Bitácora de actividad ─────────────────────────────────────────────────
function ActivityLog({ p, activities, profiles, onAdd }: {
  p: Prospect
  activities: Activity[]
  profiles: Profile[]
  onAdd: (id: string, a: { type: string; channel?: string | null; direction?: string | null; outcome?: string | null; body?: string | null }) => void
}) {
  const [type, setType] = useState('respuesta')
  const [channel, setChannel] = useState('email')
  const [body, setBody] = useState('')
  const submit = () => {
    const direction = type === 'respuesta' ? 'entrante' : type === 'toque' ? 'saliente' : null
    onAdd(p.id, { type, channel: type === 'nota' ? null : channel, direction, body: body.trim() || null })
    setBody('')
  }
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">Bitácora</p>
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        <select value={type} onChange={e => setType(e.target.value)} className="text-[11px] rounded-lg border border-slate-200 dark:border-white/[0.12] bg-white dark:bg-[#1a2030] text-slate-600 dark:text-slate-300 px-2 py-1.5 outline-none">
          <option value="respuesta">Respuesta</option>
          <option value="toque">Toque</option>
          <option value="reunion">Reunión</option>
          <option value="nota">Nota</option>
        </select>
        {type !== 'nota' && (
          <select value={channel} onChange={e => setChannel(e.target.value)} className="text-[11px] rounded-lg border border-slate-200 dark:border-white/[0.12] bg-white dark:bg-[#1a2030] text-slate-600 dark:text-slate-300 px-2 py-1.5 outline-none">
            {Object.entries(CHANNELS).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
          </select>
        )}
        <input value={body} onChange={e => setBody(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submit() }} placeholder="Detalle…" className="flex-1 min-w-[140px] text-[11px] rounded-lg border border-slate-200 dark:border-white/[0.12] bg-white dark:bg-[#1a2030] text-slate-600 dark:text-slate-300 px-2.5 py-1.5 outline-none" />
        <button onClick={submit} className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-slate-700 dark:bg-white/10 text-white hover:opacity-90 transition-opacity">Registrar</button>
      </div>
      {activities.length === 0 ? (
        <p className="text-[11px] text-slate-400 dark:text-slate-600 italic">Sin actividad registrada.</p>
      ) : (
        <div className="space-y-1 max-h-44 overflow-y-auto pr-1">
          {activities.map(a => (
            <div key={a.id} className="flex items-start gap-2 text-[11px]">
              <span className="shrink-0 mt-0.5 text-slate-400">{a.channel ? CHANNELS[a.channel]?.icon ?? '•' : '•'}</span>
              <div className="flex-1 min-w-0">
                <span className="text-slate-600 dark:text-slate-300">
                  <span className="font-semibold capitalize">{a.type}</span>
                  {a.channel ? <span className="text-slate-400"> · {CHANNELS[a.channel]?.label ?? a.channel}</span> : null}
                  {a.outcome ? <span className="text-slate-400"> · {a.outcome}</span> : null}
                  {a.body ? <span className="text-slate-500 dark:text-slate-400"> — {a.body}</span> : null}
                </span>
                <span className="text-slate-400 dark:text-slate-600"> · {fmtDateTime(a.created_at)}{a.created_by ? ` · ${profileName(profiles, a.created_by)}` : ''}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DiscardPanel({ onConfirm, onCancel }: { onConfirm: (reason: string, recycle: string) => void; onCancel: () => void }) {
  const [reason, setReason] = useState('')
  const [recycle, setRecycle] = useState(addDaysISO(90))
  return (
    <div className="rounded-xl border border-red-200 dark:border-red-500/20 bg-red-50/60 dark:bg-red-900/10 p-3.5 space-y-2">
      <p className="text-[11px] font-bold text-red-700 dark:text-red-300">Descartar prospecto</p>
      <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Motivo (ej. sin presupuesto, no es decisor…)" className="w-full text-xs rounded-lg border border-slate-200 dark:border-white/[0.12] bg-white dark:bg-[#1a2030] text-slate-700 dark:text-slate-200 px-2.5 py-2 outline-none" />
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-slate-500 dark:text-slate-400">Reintentar el:</label>
        <input type="date" value={recycle} onChange={e => setRecycle(e.target.value)} className="text-xs rounded-lg border border-slate-200 dark:border-white/[0.12] bg-white dark:bg-[#1a2030] text-slate-600 dark:text-slate-300 px-2 py-1.5 outline-none" />
        <div className="flex-1" />
        <button onClick={onCancel} className="text-[11px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/[0.12] text-slate-500">Cancelar</button>
        <button onClick={() => onConfirm(reason, recycle)} className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-red-600 text-white hover:opacity-90">Descartar</button>
      </div>
    </div>
  )
}

// ─── Modal: agregar prospecto ────────────────────────────────────────────────
function AddProspectModal({ onClose, onSave }: { onClose: () => void; onSave: (d: Partial<Prospect>) => void }) {
  const [f, setF] = useState<{ full_name: string; title: string; company: string; email: string; phone: string; company_generic_email: string; company_phone: string; icp_segment: string; industry: string; company_city: string; channel: string; stage: string; notes: string }>({
    full_name: '', title: '', company: '', email: '', phone: '', company_generic_email: '', company_phone: '',
    icp_segment: '', industry: '', company_city: '', channel: 'email', stage: 'por_contactar', notes: '',
  })
  const set = (k: keyof typeof f, v: string) => setF(prev => ({ ...prev, [k]: v }))
  const save = () => {
    if (!f.company.trim() && !f.full_name.trim()) { alert('Pon al menos empresa o nombre.'); return }
    const hasDecisor = !!f.full_name.trim()
    onSave({
      full_name: f.full_name.trim() || null,
      title: f.title.trim() || null,
      company: f.company.trim() || null,
      email: f.email.trim() || null,
      phone: f.phone.trim() || null,
      company_generic_email: f.company_generic_email.trim() || null,
      company_phone: f.company_phone.trim() || null,
      icp_segment: f.icp_segment || null,
      industry: f.industry.trim() || null,
      company_city: f.company_city.trim() || null,
      channel: f.channel,
      stage: hasDecisor ? f.stage : 'por_investigar',
      notes: f.notes.trim() || null,
    })
  }
  return (
    <Modal onClose={onClose} title="Agregar prospecto" subtitle="Para visitas presenciales, Google Maps o captura manual. Sin decisor entra a “Por investigar”.">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <Input label="Nombre del decisor" value={f.full_name} onChange={v => set('full_name', v)} placeholder="(si ya lo tienes)" />
        <Input label="Puesto" value={f.title} onChange={v => set('title', v)} />
        <Input label="Empresa" value={f.company} onChange={v => set('company', v)} />
        <Input label="Giro / industria" value={f.industry} onChange={v => set('industry', v)} />
        <Input label="Correo directo" value={f.email} onChange={v => set('email', v)} />
        <Input label="Teléfono directo" value={f.phone} onChange={v => set('phone', v)} />
        <Input label="Correo general (contacto@)" value={f.company_generic_email} onChange={v => set('company_generic_email', v)} />
        <Input label="Tel/WhatsApp general" value={f.company_phone} onChange={v => set('company_phone', v)} />
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Segmento</p>
          <select value={f.icp_segment} onChange={e => set('icp_segment', e.target.value)} className="w-full text-xs rounded-lg border border-slate-200 dark:border-white/[0.12] bg-white dark:bg-[#1a2030] text-slate-700 dark:text-slate-200 px-2.5 py-2 outline-none">
            <option value="">Sin segmento</option>
            {Object.entries(SEGMENTS).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Canal principal</p>
          <select value={f.channel} onChange={e => set('channel', e.target.value)} className="w-full text-xs rounded-lg border border-slate-200 dark:border-white/[0.12] bg-white dark:bg-[#1a2030] text-slate-700 dark:text-slate-200 px-2.5 py-2 outline-none">
            {Object.entries(CHANNELS).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
          </select>
        </div>
        <Input label="Ciudad" value={f.company_city} onChange={v => set('company_city', v)} />
      </div>
      <div className="mt-2.5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Notas</p>
        <textarea value={f.notes} onChange={e => set('notes', e.target.value)} rows={2} placeholder="Contexto de la visita, quién atendió…" className="w-full text-sm rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.04] text-slate-700 dark:text-slate-200 px-3 py-2 outline-none resize-y" />
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="text-xs font-medium px-3 py-2 rounded-lg border border-slate-200 dark:border-white/[0.12] text-slate-500">Cancelar</button>
        <button onClick={save} className="text-xs font-semibold px-4 py-2 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90">Guardar prospecto</button>
      </div>
    </Modal>
  )
}

// ─── Modal: compositor de mensajes ───────────────────────────────────────────
function ComposerModal({ prospect, templates, sellerName, onClose, onCopy, copied, onSent }: {
  prospect: Prospect
  templates: Template[]
  sellerName: string
  onClose: () => void
  onCopy: (key: string, text: string) => void
  copied: string | null
  onSent: (channel: string) => void
}) {
  const [channel, setChannel] = useState<'email' | 'whatsapp'>('email')
  const applicable = useMemo(() => (
    templates.filter(t => t.channel === channel && (!t.segment || t.segment === prospect.icp_segment))
  ), [templates, channel, prospect.icp_segment])
  const [tid, setTid] = useState<string>('')
  const tpl = applicable.find(t => t.id === tid) ?? applicable[0]
  const link = buildLink(prospect, sellerName, channel, tpl?.step ?? 0)
  const subject = tpl?.subject ? substitute(tpl.subject, prospect, sellerName, link) : ''
  const bodyText = tpl ? substitute(tpl.body, prospect, sellerName, link) : ''

  return (
    <Modal onClose={onClose} title={`Redactar a ${prospect.full_name || prospect.company || 'prospecto'}`} subtitle="Elige plantilla, revisa el texto y cópialo. El link ya lleva las UTM para medir.">
      <div className="flex items-center gap-2 mb-3">
        <div className="inline-flex rounded-lg border border-slate-200 dark:border-white/[0.1] p-0.5 bg-white dark:bg-[#1a2030]">
          <ViewTab active={channel === 'email'} onClick={() => { setChannel('email'); setTid('') }} label="Correo" />
          <ViewTab active={channel === 'whatsapp'} onClick={() => { setChannel('whatsapp'); setTid('') }} label="WhatsApp" />
        </div>
        <select value={tpl?.id ?? ''} onChange={e => setTid(e.target.value)} className="flex-1 text-xs rounded-lg border border-slate-200 dark:border-white/[0.12] bg-white dark:bg-[#1a2030] text-slate-700 dark:text-slate-200 px-2.5 py-2 outline-none">
          {applicable.length === 0 && <option value="">Sin plantillas para este canal</option>}
          {applicable.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      {tpl ? (
        <div className="space-y-2.5">
          {channel === 'email' && subject && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Asunto</p>
                <button onClick={() => onCopy('subj', subject)} className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 dark:border-white/[0.12] text-slate-500 hover:bg-slate-50 dark:hover:bg-white/[0.05]">{copied === 'subj' ? 'Copiado' : 'Copiar'}</button>
              </div>
              <p className="text-sm text-slate-800 dark:text-slate-100 rounded-lg bg-slate-50 dark:bg-white/[0.04] px-3 py-2">{subject}</p>
            </div>
          )}
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Mensaje</p>
              <button onClick={() => onCopy('body', bodyText)} className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 dark:border-white/[0.12] text-slate-500 hover:bg-slate-50 dark:hover:bg-white/[0.05]">{copied === 'body' ? 'Copiado' : 'Copiar mensaje'}</button>
            </div>
            <pre className="text-sm text-slate-700 dark:text-slate-200 rounded-lg bg-slate-50 dark:bg-white/[0.04] px-3 py-2.5 whitespace-pre-wrap font-sans max-h-64 overflow-y-auto">{bodyText}</pre>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500">
            <span className="font-mono truncate">{link}</span>
            <button onClick={() => onCopy('link', link)} className="shrink-0 px-1.5 py-0.5 rounded border border-slate-200 dark:border-white/[0.12] text-slate-500 hover:bg-slate-50 dark:hover:bg-white/[0.05]">{copied === 'link' ? 'Copiado' : 'Copiar link'}</button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-400 py-6 text-center">No hay plantillas para este canal todavía.</p>
      )}

      <div className="flex flex-wrap justify-end gap-2 mt-4">
        {channel === 'email' && prospect.email && (
          <a href={`mailto:${prospect.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`} className="text-xs font-medium px-3 py-2 rounded-lg border border-slate-200 dark:border-white/[0.12] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.05]">Abrir en correo</a>
        )}
        {channel === 'whatsapp' && (prospect.phone || prospect.company_phone) && (
          <a href={`https://wa.me/${(prospect.phone || prospect.company_phone || '').replace(/[^0-9]/g, '')}?text=${encodeURIComponent(bodyText)}`} target="_blank" rel="noopener noreferrer" className="text-xs font-medium px-3 py-2 rounded-lg border border-slate-200 dark:border-white/[0.12] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.05]">Abrir en WhatsApp</a>
        )}
        <button onClick={() => onSent(channel)} className="text-xs font-semibold px-4 py-2 rounded-lg bg-indigo-600 text-white hover:opacity-90">Marcar como enviado →</button>
      </div>
    </Modal>
  )
}

// ─── UI atoms ────────────────────────────────────────────────────────────────
function Modal({ children, onClose, title, subtitle }: { children: ReactNode; onClose: () => void; title: string; subtitle?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-8 overflow-y-auto bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-[#1e2535] p-5 my-8" style={CARD_S} onClick={e => e.stopPropagation()}>
        <div className="mb-3">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">{title}</h3>
          {subtitle && <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  )
}

function Input({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">{label}</p>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-full text-xs rounded-lg border border-slate-200 dark:border-white/[0.12] bg-white dark:bg-[#1a2030] text-slate-700 dark:text-slate-200 px-2.5 py-2 outline-none" />
    </div>
  )
}

function Kpi({ label, value, tint }: { label: string; value: number; tint: string }) {
  return (
    <div className="rounded-2xl bg-white dark:bg-[#1e2535] border border-slate-200 dark:border-white/[0.08] px-3.5 py-3" style={CARD_S}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: tint }} />
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 truncate">{label}</p>
      </div>
      <p className="text-xl font-bold text-slate-800 dark:text-slate-100 tabular-nums">{value}</p>
    </div>
  )
}

function FunnelStat({ label, value, pct, accent }: { label: string; value: number; pct?: number; accent?: boolean }) {
  return (
    <div className="text-center">
      <p className={`text-lg font-bold tabular-nums ${accent ? 'text-violet-600 dark:text-violet-400' : 'text-slate-800 dark:text-slate-100'}`}>{value}</p>
      <p className="text-[10px] text-slate-400 dark:text-slate-500">{label}{typeof pct === 'number' ? ` · ${pct}%` : ''}</p>
    </div>
  )
}
function FunnelArrow() {
  return <span className="text-slate-300 dark:text-slate-600">→</span>
}

function ViewTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${active ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}>{label}</button>
  )
}

function StageTab({ label, count, active, onClick, dot }: { label: string; count: number; active: boolean; onClick: () => void; dot: string }) {
  return (
    <button onClick={onClick} className={`shrink-0 flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl border transition-colors ${active ? 'bg-slate-800 dark:bg-white/10 text-white border-transparent' : 'bg-white dark:bg-[#1a2030] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/[0.1] hover:bg-slate-50 dark:hover:bg-white/[0.05]'}`}>
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
        <button key={o.value} onClick={() => onChange(o.value)} className={`text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors ${value === o.value ? 'bg-slate-800 dark:bg-white/10 text-white border-transparent' : 'bg-white dark:bg-[#1a2030] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/[0.1] hover:bg-slate-50 dark:hover:bg-white/[0.05]'}`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

function AssignBtn({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`text-[11px] font-medium px-2.5 py-1 rounded-lg border transition-colors ${active ? 'bg-indigo-600 text-white border-transparent' : 'border-slate-200 dark:border-white/[0.12] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.05]'}`}>
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

function ContactField({ label, value, copyKey, copied, onCopy, href }: { label: string; value: string | null; copyKey: string; copied: string | null; onCopy: (key: string, text: string) => void; href?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</p>
      {value ? (
        <div className="flex items-center gap-2">
          {href ? <a href={href} className="text-sm text-blue-600 dark:text-blue-400 hover:underline break-all">{value}</a> : <span className="text-sm text-slate-700 dark:text-slate-200 break-all">{value}</span>}
          <button onClick={() => onCopy(copyKey, value)} className="shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-slate-200 dark:border-white/[0.12] text-slate-500 hover:bg-slate-50 dark:hover:bg-white/[0.05]">{copied === copyKey ? 'Copiado' : 'Copiar'}</button>
        </div>
      ) : (
        <p className="text-sm text-slate-400 dark:text-slate-600 italic">—</p>
      )}
    </div>
  )
}
