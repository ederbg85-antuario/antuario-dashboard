'use client'

import { useMemo, useState, useCallback, type ReactNode } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { PAGE_WRAP, PageHeader, CARD_S } from '@/components/ui/dashboard'
import EmbudoMetricas from './EmbudoMetricas'

// ═══════════════════════════════════════════════════════════════════════════
// CRM unificado — venta en frío + contactos + propuestas + clientes.
// Un solo workspace: tablero (drag & drop), lista, métricas y ficha editable.
// Cada cambio de etapa y toque queda en prospect_activities (fuente de eventos
// para el futuro agente de n8n que automatizará mensajes y acciones).
// ═══════════════════════════════════════════════════════════════════════════

// ─── Tipos ──────────────────────────────────────────────────────────────────
type Prospect = {
  id: string
  full_name: string | null
  first_name: string | null
  title: string | null
  email: string | null
  phone: string | null
  linkedin_url: string | null
  company: string | null
  industry: string | null
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
  updated_at: string | null
  created_at: string | null
}
type Contact = {
  id: string
  full_name: string | null
  company: string | null
  position: string | null
  email: string | null
  phone: string | null
  whatsapp: string | null
  contact_type: string | null
  source: string | null
  assigned_to: string | null
  meeting_at: string | null
  meeting_link: string | null
  notes: string | null
  updated_at: string | null
  created_at: string | null
}
type Proposal = { id: string; title: string | null; stage: string | null; total: string | null; amount: string | null; contact_id: string | null }
type Activity = {
  id: string; prospect_id: string; type: string; channel: string | null
  direction: string | null; outcome: string | null; body: string | null
  created_by: string | null; created_at: string
}
type Template = {
  id: string; name: string; channel: string; segment: string | null
  step: number | null; subject: string | null; body: string; is_active: boolean; sort_order: number
}
type Profile = { id: string; full_name: string | null; email: string | null }
type Props = {
  orgId: number
  currentUserId: string
  currentUserRole: string
  prospects: Prospect[]
  contacts: Contact[]
  proposals: Proposal[]
  profiles: Profile[]
  initialActivities: Activity[]
  templates: Template[]
}

// ─── Pipeline unificado ──────────────────────────────────────────────────────
const COLS = [
  { key: 'por_contactar', label: 'Por contactar', color: '#94a3b8' },
  { key: 'contactado',    label: 'Contactado',    color: '#38bdf8' },
  { key: 'interesado',    label: 'Interesado',    color: '#34d399' },
  { key: 'reunion',       label: 'Reunión',       color: '#8b5cf6' },
  { key: 'propuesta',     label: 'Propuesta',     color: '#f59e0b' },
  { key: 'cliente',       label: 'Cliente',       color: '#14b8a6' },
] as const
type ColKey = typeof COLS[number]['key'] | 'descartado'
const colMeta = (k: string) => COLS.find(c => c.key === k)

// prospect.stage → columna (convertido no se pinta: ya vive como contacto)
function prospectCol(stage: string): ColKey | null {
  switch (stage) {
    case 'por_investigar':
    case 'por_contactar': return 'por_contactar'
    case 'contactado':
    case 'siguiendo': return 'contactado'
    case 'interesado': return 'interesado'
    case 'reunion_agendada': return 'reunion'
    case 'descartado': return 'descartado'
    default: return null
  }
}
// columna → prospect.stage (drag & drop). Propuesta/cliente exigen convertir.
const COL_TO_PROSPECT_STAGE: Record<string, string | null> = {
  por_contactar: 'por_contactar', contactado: 'contactado', interesado: 'interesado',
  reunion: 'reunion_agendada', propuesta: null, cliente: null,
}
function contactCol(type: string | null, hasProposal: boolean): ColKey {
  if (type === 'client') return 'cliente'
  if (type === 'active_proposal' || hasProposal) return 'propuesta'
  if (type === 'proposal') return 'reunion'
  if (type === 'lead_potential' || type === 'lead_relevant') return 'interesado'
  if (type === 'lead_irrelevant') return 'descartado'
  return 'por_contactar'
}
// columna → contact_type (drag & drop)
const COL_TO_CONTACT_TYPE: Record<string, string> = {
  por_contactar: 'lead_nuevo', contactado: 'lead_nuevo', interesado: 'lead_potential',
  reunion: 'proposal', propuesta: 'active_proposal', cliente: 'client',
}
const PROSPECT_STAGES = [
  { value: 'por_investigar',   label: 'Por investigar',   dot: '#c084fc' },
  { value: 'por_contactar',    label: 'Por contactar',    dot: '#94a3b8' },
  { value: 'contactado',       label: 'Contactado',       dot: '#38bdf8' },
  { value: 'siguiendo',        label: 'En seguimiento',   dot: '#f59e0b' },
  { value: 'interesado',       label: 'Interesado',       dot: '#34d399' },
  { value: 'reunion_agendada', label: 'Reunión agendada', dot: '#8b5cf6' },
  { value: 'convertido',       label: 'Convertido',       dot: '#14b8a6' },
  { value: 'descartado',       label: 'Descartado',       dot: '#f87171' },
]
const CONTACT_TYPES = [
  { value: 'lead_nuevo',      label: 'Lead nuevo',      dot: '#94a3b8' },
  { value: 'lead_potential',  label: 'Lead potencial',  dot: '#34d399' },
  { value: 'lead_relevant',   label: 'Lead relevante',  dot: '#22d3ee' },
  { value: 'proposal',        label: 'Reunión',         dot: '#8b5cf6' },
  { value: 'active_proposal', label: 'Propuesta activa',dot: '#f59e0b' },
  { value: 'client',          label: 'Cliente',         dot: '#14b8a6' },
  { value: 'lead_irrelevant', label: 'Descartado',      dot: '#f87171' },
]

const ORIGINS: Record<string, { label: string; cls: string }> = {
  frio:     { label: 'Frío',     cls: 'bg-slate-100 dark:bg-white/[0.07] text-slate-600 dark:text-slate-300' },
  web:      { label: 'Web',      cls: 'bg-sky-50 dark:bg-sky-900/25 text-sky-600 dark:text-sky-300' },
  whatsapp: { label: 'WhatsApp', cls: 'bg-emerald-50 dark:bg-emerald-900/25 text-emerald-700 dark:text-emerald-300' },
  referido: { label: 'Referido', cls: 'bg-violet-50 dark:bg-violet-900/25 text-violet-600 dark:text-violet-300' },
  otro:     { label: 'Otro',     cls: 'bg-slate-100 dark:bg-white/[0.07] text-slate-500 dark:text-slate-400' },
}
function sourceOrigin(source: string | null): string {
  if (!source) return 'otro'
  if (source.includes('formulario') || source.includes('landing')) return 'web'
  if (source.includes('mensajeria') || source.includes('whatsapp')) return 'whatsapp'
  if (source.includes('prospeccion') || source.includes('frio') || source.includes('tarjeta')) return 'frio'
  if (source.includes('referido')) return 'referido'
  return 'otro'
}

const SEGMENTS: Record<string, { label: string; accent: string; campaign: string }> = {
  despacho_legal:         { label: 'Legal',        accent: '#6366f1', campaign: 'legal' },
  promotora_inmobiliaria: { label: 'Inmobiliaria', accent: '#0ea5e9', campaign: 'inmo' },
  agencia_marketing:      { label: 'Agencia',      accent: '#ec4899', campaign: 'agencias' },
}
const PATHS: Record<string, { label: string; help: string; color: string }> = {
  disena_solucion: { label: 'Diseñar solución', help: 'Le armamos un Plan de Crecimiento antes de cotizar', color: '#6366f1' },
  cotiza_directo:  { label: 'Cotizar directo',  help: 'Necesidad clara — va directo a propuesta', color: '#0d9488' },
}
const CHANNELS: Record<string, string> = {
  email: 'Correo', whatsapp: 'WhatsApp', llamada: 'Llamada', visita: 'Visita', linkedin: 'LinkedIn', meet: 'Meet',
}

const LANDING_BASE = 'https://www.antuario.mx/plan-de-crecimiento'

// ─── Registro unificado ──────────────────────────────────────────────────────
type CrmRecord = {
  id: string           // 'p_<uuid>' | 'c_<uuid>'
  rawId: string
  kind: 'prospecto' | 'contacto'
  name: string
  company: string | null
  title: string | null
  email: string | null
  phone: string | null
  col: ColKey
  stageLabel: string
  origin: string
  segment: string | null
  ownerId: string | null
  value: number | null
  touches: number | null
  nextActionAt: string | null
  nextAction: string | null
  meetingAt: string | null
  updatedAt: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const num = (s: string | null) => { const n = Number(s); return Number.isFinite(n) ? n : 0 }
const money = (v: number) => v >= 1000 ? `$${Math.round(v / 1000).toLocaleString('es-MX')}k` : `$${Math.round(v)}`
function initials(name: string | null): string {
  if (!name) return '?'
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?'
}
function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', day: '2-digit', month: 'short' })
}
function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-MX', { timeZone: 'America/Mexico_City', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}
function todayISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' })
}
function addDaysISO(days: number): string {
  const d = new Date(); d.setDate(d.getDate() + days)
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' })
}
function slug(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'antuario'
}
function profileName(profiles: Profile[], id: string | null): string {
  if (!id) return 'Sin asignar'
  const p = profiles.find(x => x.id === id)
  return p?.full_name || p?.email || 'Miembro'
}
function getSupabase() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
}
function firstNameOf(name: string | null): string {
  return name?.trim().split(/\s+/)[0] || 'Hola'
}
function buildLink(rec: { kind: string; rawId: string; segment: string | null }, sellerName: string, channel: string, step: number | null): string {
  const params = new URLSearchParams({
    ref: slug(sellerName),
    utm_source: channel === 'whatsapp' ? 'whatsapp-frio' : 'email-frio',
    utm_medium: 'outbound',
    utm_campaign: `vfria-2026q3-${(rec.segment && SEGMENTS[rec.segment]?.campaign) || 'general'}`,
    utm_content: `d${step ?? 0}`,
  })
  if (rec.kind === 'prospecto') params.set('pid', rec.rawId)
  return `${LANDING_BASE}?${params.toString()}`
}
function substitute(text: string, rec: { name: string; company: string | null }, sellerName: string, link: string): string {
  return text
    .replaceAll('{{nombre}}', firstNameOf(rec.name))
    .replaceAll('{{empresa}}', rec.company || 'su empresa')
    .replaceAll('{{giro}}', rec.company || 'su giro')
    .replaceAll('{{practica}}', 'su área')
    .replaceAll('{{vendedor}}', sellerName)
    .replaceAll('{{link}}', link)
}

// ═══════════════════════════════════════════════════════════════════════════
export default function CrmClient({
  orgId, currentUserId, currentUserRole, prospects: initialProspects, contacts: initialContacts,
  proposals, profiles, initialActivities, templates,
}: Props) {
  const isManager = currentUserRole === 'owner' || currentUserRole === 'admin'
  const myName = profileName(profiles, currentUserId)

  const [prospects, setProspects] = useState<Prospect[]>(initialProspects)
  const [contacts, setContacts] = useState<Contact[]>(initialContacts)
  const [acts, setActs] = useState<Activity[]>(initialActivities)

  const [tab, setTab] = useState<'tablero' | 'lista' | 'metricas'>('tablero')
  const [scope, setScope] = useState<'equipo' | 'mios'>(isManager ? 'equipo' : 'mios')
  const [origin, setOrigin] = useState('todos')
  const [owner, setOwner] = useState('todos')
  const [query, setQuery] = useState('')
  const [showDiscarded, setShowDiscarded] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [composerId, setComposerId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // ── Derivados base ──
  const propByContact = useMemo(() => {
    const m: Record<string, number> = {}
    for (const p of proposals) {
      if (!p.contact_id) continue
      const v = num(p.total) || num(p.amount)
      if (!(p.contact_id in m) || v > m[p.contact_id]) m[p.contact_id] = v
    }
    return m
  }, [proposals])

  const proposalsByContact = useMemo(() => {
    const m: Record<string, Proposal[]> = {}
    for (const p of proposals) { if (p.contact_id) (m[p.contact_id] ??= []).push(p) }
    return m
  }, [proposals])

  const records = useMemo<CrmRecord[]>(() => {
    const out: CrmRecord[] = []
    for (const p of prospects) {
      const col = prospectCol(p.stage)
      if (!col) continue
      out.push({
        id: 'p_' + p.id, rawId: p.id, kind: 'prospecto',
        name: p.full_name || p.company || 'Sin nombre', company: p.company, title: p.title,
        email: p.email, phone: p.phone, col,
        stageLabel: PROSPECT_STAGES.find(s => s.value === p.stage)?.label ?? p.stage,
        origin: 'frio', segment: p.icp_segment, ownerId: p.assigned_to, value: null,
        touches: p.touches ?? 0, nextActionAt: p.next_action_at, nextAction: p.next_action,
        meetingAt: null, updatedAt: p.updated_at,
      })
    }
    for (const c of contacts) {
      const hasProp = c.id in propByContact
      out.push({
        id: 'c_' + c.id, rawId: c.id, kind: 'contacto',
        name: c.full_name || c.company || 'Sin nombre', company: c.company, title: c.position,
        email: c.email, phone: c.phone || c.whatsapp, col: contactCol(c.contact_type, hasProp),
        stageLabel: CONTACT_TYPES.find(t => t.value === c.contact_type)?.label ?? (c.contact_type ?? '—'),
        origin: sourceOrigin(c.source), segment: null, ownerId: c.assigned_to,
        value: propByContact[c.id] ?? null, touches: null, nextActionAt: null, nextAction: null,
        meetingAt: c.meeting_at, updatedAt: c.updated_at,
      })
    }
    return out
  }, [prospects, contacts, propByContact])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return records.filter(r => {
      if (!showDiscarded && r.col === 'descartado') return false
      if (scope === 'mios' && r.ownerId !== currentUserId) return false
      if (origin !== 'todos' && r.origin !== origin) return false
      if (scope === 'equipo' && owner !== 'todos' && r.ownerId !== owner) return false
      if (q && ![r.name, r.company, r.email, r.title].some(v => (v ?? '').toLowerCase().includes(q))) return false
      return true
    })
  }, [records, showDiscarded, scope, origin, owner, query, currentUserId])

  const byCol = useMemo(() => {
    const m: Record<string, CrmRecord[]> = { descartado: [] }
    COLS.forEach(c => { m[c.key] = [] })
    for (const r of filtered) (m[r.col] ??= []).push(r)
    return m
  }, [filtered])

  const kpis = useMemo(() => {
    const pipelineValue = filtered.filter(r => r.col === 'propuesta').reduce((s, r) => s + (r.value ?? 0), 0)
    return {
      total: filtered.length,
      activos: filtered.filter(r => !['cliente', 'descartado'].includes(r.col)).length,
      interesados: byCol.interesado?.length ?? 0,
      reuniones: byCol.reunion?.length ?? 0,
      propuestas: byCol.propuesta?.length ?? 0,
      pipelineValue,
      clientes: byCol.cliente?.length ?? 0,
    }
  }, [filtered, byCol])

  const today = todayISO()
  const agenda = useMemo(() => (
    filtered.filter(r => r.kind === 'prospecto' && r.nextActionAt && r.nextActionAt <= today && !['cliente', 'descartado'].includes(r.col))
  ), [filtered, today])

  const scopedProspects = useMemo(() => (
    prospects.filter(p => {
      if (scope === 'mios' && p.assigned_to !== currentUserId) return false
      if (scope === 'equipo' && owner !== 'todos' && p.assigned_to !== owner) return false
      return true
    })
  ), [prospects, scope, owner, currentUserId])

  const owners = useMemo(() => {
    const ids = new Set<string>()
    records.forEach(r => { if (r.ownerId) ids.add(r.ownerId) })
    return Array.from(ids)
  }, [records])

  // ── Mutaciones ──
  const patchProspect = useCallback(async (id: string, changes: Partial<Prospect>) => {
    setSaving(true)
    setProspects(prev => prev.map(p => (p.id === id ? { ...p, ...changes } : p)))
    const { error } = await getSupabase().from('prospects').update({ ...changes, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) alert('No se pudo guardar: ' + error.message)
    setSaving(false)
  }, [])

  const patchContact = useCallback(async (id: string, changes: Partial<Contact>) => {
    setSaving(true)
    setContacts(prev => prev.map(c => (c.id === id ? { ...c, ...changes } : c)))
    const { error } = await getSupabase().from('contacts').update({ ...changes, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) alert('No se pudo guardar: ' + error.message)
    setSaving(false)
  }, [])

  const logActivity = useCallback(async (prospectId: string, a: { type: string; channel?: string | null; direction?: string | null; outcome?: string | null; body?: string | null }) => {
    const { data, error } = await getSupabase().from('prospect_activities').insert({
      organization_id: orgId, prospect_id: prospectId, type: a.type,
      channel: a.channel ?? null, direction: a.direction ?? null, outcome: a.outcome ?? null,
      body: a.body ?? null, created_by: currentUserId,
    }).select('id, prospect_id, type, channel, direction, outcome, body, created_by, created_at').single()
    if (error) { alert('No se pudo registrar: ' + error.message); return }
    if (data) setActs(prev => [data as Activity, ...prev])
  }, [orgId, currentUserId])

  const registrarToque = useCallback((p: Prospect, channel: string, body?: string) => {
    const next: Partial<Prospect> = { touches: (p.touches ?? 0) + 1, last_contacted_at: new Date().toISOString() }
    if (p.stage === 'por_contactar') next.stage = 'contactado'
    patchProspect(p.id, next)
    logActivity(p.id, { type: 'toque', channel, direction: 'saliente', outcome: 'enviado', body: body ?? null })
  }, [patchProspect, logActivity])

  const convertir = useCallback(async (p: Prospect) => {
    if (!confirm(`Convertir a "${p.full_name}" (${p.company}) en contacto del CRM?`)) return
    setSaving(true)
    const supabase = getSupabase()
    const { data: contact, error } = await supabase.from('contacts').insert({
      organization_id: orgId, full_name: p.full_name, email: p.email, phone: p.phone,
      company: p.company, position: p.title, source: 'prospeccion-fria', contact_type: 'lead_potential',
      primary_channel: p.channel || 'email', linkedin: p.linkedin_url,
      notes: `Prospecto en frío (${p.icp_segment ? SEGMENTS[p.icp_segment]?.label ?? p.icp_segment : 'sin segmento'}).${p.need_note ? ' Necesidad: ' + p.need_note : ''}${p.notes ? ' ' + p.notes : ''}`,
      assigned_to: p.assigned_to, created_by: currentUserId,
    }).select('id, full_name, company, position, email, phone, whatsapp, contact_type, source, assigned_to, meeting_at, meeting_link, notes, updated_at, created_at').single()
    if (error || !contact) { alert('No se pudo convertir: ' + (error?.message ?? '')); setSaving(false); return }
    await supabase.from('prospects').update({ contact_id: contact.id, stage: 'convertido', updated_at: new Date().toISOString() }).eq('id', p.id)
    setProspects(prev => prev.map(x => (x.id === p.id ? { ...x, contact_id: contact.id, stage: 'convertido' } : x)))
    setContacts(prev => [contact as Contact, ...prev])
    logActivity(p.id, { type: 'sistema', body: 'Convertido a contacto del CRM' })
    setSelectedId('c_' + contact.id)
    setSaving(false)
  }, [orgId, currentUserId, logActivity])

  const addProspect = useCallback(async (draft: Partial<Prospect>) => {
    const { data, error } = await getSupabase().from('prospects').insert({
      organization_id: orgId, assigned_to: currentUserId, assigned_seller: myName,
      source: 'manual', touches: 0, ...draft,
    }).select('*').single()
    if (error || !data) { alert('No se pudo agregar: ' + (error?.message ?? '')); return }
    setProspects(prev => [data as Prospect, ...prev])
    setAddOpen(false)
    setSelectedId('p_' + (data as Prospect).id)
  }, [orgId, currentUserId, myName])

  // ── Drag & drop ──
  const onDropCard = useCallback((recId: string, colKey: string) => {
    setDragOverCol(null)
    const rec = records.find(r => r.id === recId)
    if (!rec || rec.col === colKey) return
    if (rec.kind === 'prospecto') {
      const stage = COL_TO_PROSPECT_STAGE[colKey]
      if (!stage) { alert('Para llevarlo a Propuesta o Cliente, primero conviértelo a contacto (ábrelo y usa "Convertir a contacto").'); return }
      const label = PROSPECT_STAGES.find(s => s.value === stage)?.label ?? stage
      patchProspect(rec.rawId, { stage })
      logActivity(rec.rawId, { type: 'etapa', body: `Etapa → ${label}` })
    } else {
      const type = COL_TO_CONTACT_TYPE[colKey]
      if (!type) return
      patchContact(rec.rawId, { contact_type: type })
    }
  }, [records, patchProspect, patchContact, logActivity])

  const exportCsv = useCallback(() => {
    const cols = ['name', 'company', 'title', 'email', 'phone', 'col', 'stageLabel', 'origin', 'value']
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const rows = [cols.join(','), ...filtered.map(r => cols.map(c => esc((r as unknown as Record<string, unknown>)[c])).join(','))]
    const blob = new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `crm-antuario-${today}.csv`; a.click()
    URL.revokeObjectURL(url)
  }, [filtered, today])

  const selected = selectedId ? records.find(r => r.id === selectedId) ?? null : null
  const composerRec = composerId ? records.find(r => r.id === composerId) ?? null : null

  return (
    <div className={PAGE_WRAP}>
      <div className="max-w-[1400px] mx-auto w-full space-y-4">
        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <PageHeader
            eyebrow="Ventas"
            title="CRM"
            sub="Un solo pipeline: venta en frío, leads web y WhatsApp, propuestas y clientes."
          />
          <div className="flex items-center gap-2 mt-1">
            <button onClick={exportCsv} className="text-xs font-medium px-3 py-2 rounded-xl border border-slate-200 dark:border-white/[0.12] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.05] transition-colors">CSV</button>
            <button onClick={() => setAddOpen(true)} className="inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 transition-opacity">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 5v14M5 12h14" /></svg>
              Agregar
            </button>
          </div>
        </div>

        {/* ── Toolbar ── */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-xl border border-slate-200 dark:border-white/[0.1] p-0.5 bg-white dark:bg-[#1a2030]">
            <Tab active={tab === 'tablero'} onClick={() => setTab('tablero')} label="Tablero" />
            <Tab active={tab === 'lista'} onClick={() => setTab('lista')} label="Lista" />
            <Tab active={tab === 'metricas'} onClick={() => setTab('metricas')} label="Métricas" />
          </div>
          <div className="inline-flex rounded-xl border border-slate-200 dark:border-white/[0.1] p-0.5 bg-white dark:bg-[#1a2030]">
            <Tab active={scope === 'equipo'} onClick={() => setScope('equipo')} label={isManager ? 'Equipo' : 'Todos'} />
            <Tab active={scope === 'mios'} onClick={() => setScope('mios')} label="Míos" />
          </div>
          <div className="flex-1 min-w-[160px]">
            <div className="relative">
              <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar…" className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1a2030] text-slate-800 dark:text-slate-100 placeholder:text-slate-400 outline-none focus:border-slate-400 dark:focus:border-white/20" />
            </div>
          </div>
          {scope === 'equipo' && isManager && (
            <select value={owner} onChange={e => setOwner(e.target.value)} className="text-xs rounded-lg border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-[#1a2030] text-slate-600 dark:text-slate-300 px-2.5 py-2 outline-none">
              <option value="todos">Vendedor: todos</option>
              {owners.map(id => <option key={id} value={id}>{profileName(profiles, id)}</option>)}
            </select>
          )}
        </div>

        {/* ── Filtro de origen ── */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill active={origin === 'todos'} onClick={() => setOrigin('todos')} label={`Todos · ${records.filter(r => showDiscarded || r.col !== 'descartado').length}`} />
          {Object.entries(ORIGINS).map(([k, m]) => {
            const n = records.filter(r => r.origin === k && (showDiscarded || r.col !== 'descartado')).length
            if (n === 0) return null
            return <Pill key={k} active={origin === k} onClick={() => setOrigin(k)} label={`${m.label} · ${n}`} />
          })}
          <div className="flex-1" />
          <button onClick={() => setShowDiscarded(v => !v)} className={`text-[11px] font-medium px-2.5 py-1.5 rounded-lg border transition-colors ${showDiscarded ? 'bg-slate-800 dark:bg-white/10 text-white border-transparent' : 'border-slate-200 dark:border-white/[0.12] text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-white/[0.05]'}`}>
            Descartados {showDiscarded ? '✓' : ''}
          </button>
        </div>

        {/* ── KPIs ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          <Kpi label="En pipeline" value={String(kpis.activos)} tint="#38bdf8" />
          <Kpi label="Interesados" value={String(kpis.interesados)} tint="#34d399" />
          <Kpi label="Reuniones" value={String(kpis.reuniones)} tint="#8b5cf6" />
          <Kpi label="Propuestas" value={String(kpis.propuestas)} tint="#f59e0b" />
          <Kpi label="Valor propuestas" value={kpis.pipelineValue ? money(kpis.pipelineValue) : '$0'} tint="#f59e0b" />
          <Kpi label="Clientes" value={String(kpis.clientes)} tint="#14b8a6" />
        </div>

        {/* ── Agenda de hoy ── */}
        {agenda.length > 0 && tab !== 'metricas' && (
          <div className="rounded-2xl border border-amber-200 dark:border-amber-500/20 bg-amber-50/60 dark:bg-amber-900/10 px-4 py-3">
            <p className="text-xs font-bold text-amber-800 dark:text-amber-300 mb-2">⏰ Pendientes de hoy y vencidos · {agenda.length}</p>
            <div className="flex flex-wrap gap-1.5">
              {agenda.slice(0, 12).map(r => (
                <button key={r.id} onClick={() => setSelectedId(r.id)} title={r.nextAction ?? ''} className="text-[11px] px-2.5 py-1 rounded-lg bg-white dark:bg-white/[0.06] border border-amber-200/70 dark:border-amber-500/20 text-slate-700 dark:text-slate-200 hover:border-amber-400 transition-colors">
                  <span className="font-semibold">{r.name}</span>
                  {r.nextAction ? <span className="text-slate-400 dark:text-slate-500"> · {r.nextAction}</span> : null}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Contenido ── */}
        {tab === 'tablero' && (
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
            {COLS.map(c => {
              const items = byCol[c.key] ?? []
              const colValue = c.key === 'propuesta' || c.key === 'cliente' ? items.reduce((s, r) => s + (r.value ?? 0), 0) : 0
              return (
                <div
                  key={c.key}
                  onDragOver={e => { e.preventDefault(); setDragOverCol(c.key) }}
                  onDragLeave={() => setDragOverCol(k => (k === c.key ? null : k))}
                  onDrop={e => { e.preventDefault(); onDropCard(e.dataTransfer.getData('text/plain'), c.key) }}
                  className={`flex-shrink-0 w-[248px] rounded-2xl border p-2.5 transition-colors ${dragOverCol === c.key ? 'border-slate-400 dark:border-white/30 bg-slate-100/80 dark:bg-white/[0.05]' : 'border-slate-200 dark:border-white/[0.06] bg-slate-50/70 dark:bg-white/[0.02]'}`}
                >
                  <div className="flex items-center gap-2 px-1 pb-2" style={{ boxShadow: `inset 0 -2px 0 -0.5px ${c.color}55` }}>
                    <span className="w-2 h-2 rounded-full" style={{ background: c.color }} />
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{c.label}</span>
                    {colValue > 0 && <span className="text-[10px] font-mono font-bold text-amber-600 dark:text-amber-400">{money(colValue)}</span>}
                    <span className="ml-auto text-[11px] font-mono text-slate-400 dark:text-slate-500 tabular-nums bg-white dark:bg-white/[0.06] rounded-full px-2 py-0.5">{items.length}</span>
                  </div>
                  <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-0.5 pt-1.5">
                    {items.length === 0 ? (
                      <p className="text-[11px] text-slate-300 dark:text-slate-600 italic text-center py-5">Suelta aquí</p>
                    ) : items.map(r => (
                      <BoardCard key={r.id} r={r} today={today} profiles={profiles} onClick={() => setSelectedId(r.id)} />
                    ))}
                  </div>
                </div>
              )
            })}
            {showDiscarded && (
              <div className="flex-shrink-0 w-[248px] rounded-2xl border border-red-200/60 dark:border-red-500/15 bg-red-50/40 dark:bg-red-900/[0.06] p-2.5">
                <div className="flex items-center gap-2 px-1 pb-2">
                  <span className="w-2 h-2 rounded-full bg-red-400" />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200">Descartados</span>
                  <span className="ml-auto text-[11px] font-mono text-slate-400 tabular-nums bg-white dark:bg-white/[0.06] rounded-full px-2 py-0.5">{byCol.descartado?.length ?? 0}</span>
                </div>
                <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-0.5 pt-1.5">
                  {(byCol.descartado ?? []).map(r => <BoardCard key={r.id} r={r} today={today} profiles={profiles} onClick={() => setSelectedId(r.id)} />)}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'lista' && <ListView records={filtered} profiles={profiles} onSelect={r => setSelectedId(r.id)} />}

        {tab === 'metricas' && (
          <div className="space-y-4">
            {/* Pipeline general */}
            <div className="rounded-2xl bg-white dark:bg-[#1e2535] border border-slate-200 dark:border-white/[0.08] p-4" style={CARD_S}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">Pipeline general (todos los orígenes)</p>
              <div className="space-y-2">
                {COLS.map(c => {
                  const n = byCol[c.key]?.length ?? 0
                  const max = Math.max(...COLS.map(x => byCol[x.key]?.length ?? 0), 1)
                  return (
                    <div key={c.key} className="flex items-center gap-3">
                      <span className="w-24 text-[11px] font-medium text-slate-500 dark:text-slate-400 text-right shrink-0">{c.label}</span>
                      <div className="flex-1 h-5 rounded-lg bg-slate-100 dark:bg-white/[0.04] overflow-hidden">
                        <div className="h-full rounded-lg transition-all" style={{ width: `${Math.max((n / max) * 100, n > 0 ? 4 : 0)}%`, background: c.color }} />
                      </div>
                      <span className="w-8 text-xs font-bold tabular-nums text-slate-700 dark:text-slate-200">{n}</span>
                    </div>
                  )
                })}
              </div>
            </div>
            {/* Frío a detalle */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2 px-1">Venta en frío · detalle</p>
              <EmbudoMetricas prospects={scopedProspects} activities={acts} profiles={profiles} showSellers={scope === 'equipo'} />
            </div>
          </div>
        )}
      </div>

      {/* ── Ficha (drawer) ── */}
      {selected && (
        <Drawer
          rec={selected}
          prospect={selected.kind === 'prospecto' ? prospects.find(p => p.id === selected.rawId) ?? null : null}
          contact={selected.kind === 'contacto' ? contacts.find(c => c.id === selected.rawId) ?? null : null}
          contactProposals={selected.kind === 'contacto' ? proposalsByContact[selected.rawId] ?? [] : []}
          activities={selected.kind === 'prospecto' ? acts.filter(a => a.prospect_id === selected.rawId) : []}
          profiles={profiles}
          currentUserId={currentUserId}
          myName={myName}
          saving={saving}
          onClose={() => setSelectedId(null)}
          patchProspect={patchProspect}
          patchContact={patchContact}
          logActivity={logActivity}
          registrarToque={registrarToque}
          convertir={convertir}
          openComposer={() => setComposerId(selected.id)}
        />
      )}

      {addOpen && <AddModal onClose={() => setAddOpen(false)} onSave={addProspect} />}

      {composerRec && (
        <ComposerModal
          rec={composerRec}
          templates={templates}
          sellerName={composerRec.ownerId ? profileName(profiles, composerRec.ownerId) : myName}
          onClose={() => setComposerId(null)}
          onSent={(channel) => {
            if (composerRec.kind === 'prospecto') {
              const p = prospects.find(x => x.id === composerRec.rawId)
              if (p) registrarToque(p, channel)
            }
            setComposerId(null)
          }}
        />
      )}
    </div>
  )
}

// ─── Tarjeta del tablero ─────────────────────────────────────────────────────
function BoardCard({ r, today, profiles, onClick }: { r: CrmRecord; today: string; profiles: Profile[]; onClick: () => void }) {
  const seg = r.segment ? SEGMENTS[r.segment] : null
  const overdue = r.nextActionAt && r.nextActionAt <= today
  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.setData('text/plain', r.id); e.dataTransfer.effectAllowed = 'move' }}
      onClick={onClick}
      className="cursor-pointer active:cursor-grabbing rounded-xl bg-white dark:bg-[#1e2535] border border-slate-200 dark:border-white/[0.08] px-3 py-2.5 hover:border-slate-300 dark:hover:border-white/25 hover:-translate-y-px transition-all"
      style={CARD_S}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 truncate leading-snug">{r.name}</p>
          {r.company && <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-px">{r.company}</p>}
        </div>
        {overdue && <span title={`Pendiente: ${r.nextAction ?? ''}`} className="shrink-0 w-2 h-2 rounded-full bg-amber-400 mt-1" />}
      </div>
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${ORIGINS[r.origin]?.cls ?? ''}`}>{ORIGINS[r.origin]?.label ?? r.origin}</span>
        {seg && <span className="text-[9.5px] font-semibold" style={{ color: seg.accent }}>{seg.label}</span>}
        {typeof r.touches === 'number' && r.touches > 0 && <span className="text-[9.5px] text-slate-400 dark:text-slate-500">{r.touches}t</span>}
        <span className="ml-auto flex items-center gap-1">
          {r.value ? <span className="text-[10px] font-bold font-mono text-amber-600 dark:text-amber-400">{money(r.value)}</span> : null}
          <span title={profileName(profiles, r.ownerId)} className="w-[18px] h-[18px] rounded-full bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-slate-300 text-[8px] font-bold flex items-center justify-center">
            {r.ownerId ? initials(profileName(profiles, r.ownerId)) : '—'}
          </span>
        </span>
      </div>
    </div>
  )
}

// ─── Lista ───────────────────────────────────────────────────────────────────
function ListView({ records, profiles, onSelect }: { records: CrmRecord[]; profiles: Profile[]; onSelect: (r: CrmRecord) => void }) {
  if (records.length === 0) return <div className="py-14 text-center text-sm text-slate-400 dark:text-slate-500">No hay registros con estos filtros.</div>
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e2535] overflow-hidden" style={CARD_S}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 text-left border-b border-slate-100 dark:border-white/[0.06]">
              <th className="py-2.5 px-4 font-bold">Nombre</th>
              <th className="py-2.5 px-3 font-bold">Empresa</th>
              <th className="py-2.5 px-3 font-bold">Etapa</th>
              <th className="py-2.5 px-3 font-bold">Origen</th>
              <th className="py-2.5 px-3 font-bold">Valor</th>
              <th className="py-2.5 px-3 font-bold">Vendedor</th>
              <th className="py-2.5 px-3 font-bold">Últ.</th>
            </tr>
          </thead>
          <tbody>
            {records.map(r => {
              const cm = colMeta(r.col)
              return (
                <tr key={r.id} onClick={() => onSelect(r)} className="border-b border-slate-50 dark:border-white/[0.04] hover:bg-slate-50 dark:hover:bg-white/[0.03] cursor-pointer">
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-2.5">
                      <span className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-white text-[9px] font-bold" style={{ background: cm?.color ?? '#f87171' }}>{initials(r.name)}</span>
                      <span className="font-medium text-slate-800 dark:text-slate-100 truncate">{r.name}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400 truncate max-w-[170px]">{r.company ?? '—'}</td>
                  <td className="py-2.5 px-3"><span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 whitespace-nowrap"><span className="w-1.5 h-1.5 rounded-full" style={{ background: cm?.color ?? '#f87171' }} />{cm?.label ?? 'Descartado'}</span></td>
                  <td className="py-2.5 px-3"><span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${ORIGINS[r.origin]?.cls ?? ''}`}>{ORIGINS[r.origin]?.label ?? r.origin}</span></td>
                  <td className="py-2.5 px-3 font-mono text-[12px] text-amber-600 dark:text-amber-400">{r.value ? money(r.value) : '—'}</td>
                  <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400 truncate">{profileName(profiles, r.ownerId)}</td>
                  <td className="py-2.5 px-3 text-slate-400 dark:text-slate-500 text-[11px] whitespace-nowrap">{fmtDate(r.updatedAt)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Ficha editable (drawer) ─────────────────────────────────────────────────
function Drawer({
  rec, prospect, contact, contactProposals, activities, profiles, currentUserId, myName, saving,
  onClose, patchProspect, patchContact, logActivity, registrarToque, convertir, openComposer,
}: {
  rec: CrmRecord
  prospect: Prospect | null
  contact: Contact | null
  contactProposals: Proposal[]
  activities: Activity[]
  profiles: Profile[]
  currentUserId: string
  myName: string
  saving: boolean
  onClose: () => void
  patchProspect: (id: string, c: Partial<Prospect>) => void
  patchContact: (id: string, c: Partial<Contact>) => void
  logActivity: (id: string, a: { type: string; channel?: string | null; direction?: string | null; outcome?: string | null; body?: string | null }) => void
  registrarToque: (p: Prospect, channel: string) => void
  convertir: (p: Prospect) => void
  openComposer: () => void
}) {
  const cm = colMeta(rec.col)
  const [showDiscard, setShowDiscard] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30 dark:bg-black/50 backdrop-blur-[2px]" onClick={onClose}>
      <div className="w-full max-w-lg h-full bg-white dark:bg-[#1a2030] border-l border-slate-200 dark:border-white/[0.08] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 z-10 bg-white/90 dark:bg-[#1a2030]/90 backdrop-blur border-b border-slate-100 dark:border-white/[0.06] px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="w-11 h-11 rounded-full shrink-0 flex items-center justify-center text-white text-sm font-bold" style={{ background: cm?.color ?? '#f87171' }}>{initials(rec.name)}</span>
            <div className="flex-1 min-w-0">
              <p className="text-base font-bold text-slate-900 dark:text-white truncate">{rec.name}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{rec.title}{rec.title && rec.company ? ' · ' : ''}{rec.company}</p>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${ORIGINS[rec.origin]?.cls ?? ''}`}>{ORIGINS[rec.origin]?.label}</span>
                <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-slate-400">{rec.kind === 'prospecto' ? 'Frío' : 'CRM'}</span>
                {saving && <span className="text-[9px] text-slate-400">Guardando…</span>}
              </div>
            </div>
            <button onClick={onClose} className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Contacto */}
          <div className="grid grid-cols-1 gap-1.5">
            <DrawerField label="Correo" value={rec.email} href={rec.email ? `mailto:${rec.email}` : undefined} />
            <DrawerField label="Teléfono / WhatsApp" value={rec.phone} href={rec.phone ? `https://wa.me/${rec.phone.replace(/[^0-9]/g, '')}` : undefined} />
            {rec.meetingAt && <DrawerField label="Reunión" value={fmtDateTime(rec.meetingAt)} />}
          </div>

          {/* ═══ PROSPECTO (frío) ═══ */}
          {prospect && (
            <>
              {prospect.stage === 'por_investigar' && (
                <DecisorCapture onSave={d => {
                  if (!d.full_name.trim()) { alert('Falta el nombre del decisor.'); return }
                  patchProspect(prospect.id, {
                    full_name: d.full_name.trim(), title: d.title.trim() || prospect.title,
                    email: d.email.trim() || prospect.email, phone: d.phone.trim() || prospect.phone,
                    stage: 'por_contactar',
                  })
                  logActivity(prospect.id, { type: 'sistema', body: `Decisor identificado: ${d.full_name.trim()}` })
                }} />
              )}

              <Section label="Etapa">
                <div className="flex flex-wrap gap-1.5">
                  {PROSPECT_STAGES.map(s => (
                    <StagePill key={s.value} active={prospect.stage === s.value} label={s.label} color={s.dot}
                      onClick={() => { patchProspect(prospect.id, { stage: s.value }); logActivity(prospect.id, { type: 'etapa', body: `Etapa → ${s.label}` }) }} />
                  ))}
                </div>
              </Section>

              <Section label="Camino">
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(PATHS).map(([value, m]) => (
                    <StagePill key={value} active={prospect.deal_path === value} label={m.label} color={m.color}
                      onClick={() => patchProspect(prospect.id, { deal_path: prospect.deal_path === value ? null : value })} />
                  ))}
                </div>
                {prospect.deal_path && <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">{PATHS[prospect.deal_path].help}</p>}
              </Section>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Section label="Vendedor">
                  <div className="flex flex-wrap gap-1.5">
                    <StagePill active={prospect.assigned_to === currentUserId} label={`${myName} (yo)`} color="#6366f1" onClick={() => patchProspect(prospect.id, { assigned_to: currentUserId, assigned_seller: myName })} />
                    {profiles.filter(pr => pr.id !== currentUserId).map(pr => (
                      <StagePill key={pr.id} active={prospect.assigned_to === pr.id} label={profileName(profiles, pr.id)} color="#6366f1" onClick={() => patchProspect(prospect.id, { assigned_to: pr.id, assigned_seller: profileName(profiles, pr.id) })} />
                    ))}
                  </div>
                </Section>
                <Section label="Próxima acción">
                  <div className="flex items-center gap-2">
                    <input type="date" value={prospect.next_action_at ?? ''} onChange={e => patchProspect(prospect.id, { next_action_at: e.target.value || null })} className="text-xs rounded-lg border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-[#1e2535] text-slate-600 dark:text-slate-300 px-2 py-1.5 outline-none" />
                  </div>
                  <input type="text" defaultValue={prospect.next_action ?? ''} onBlur={e => { if (e.target.value !== (prospect.next_action ?? '')) patchProspect(prospect.id, { next_action: e.target.value || null }) }} placeholder="¿Qué sigue?" className="mt-1.5 w-full text-xs rounded-lg border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-[#1e2535] text-slate-600 dark:text-slate-300 px-2 py-1.5 outline-none" />
                </Section>
              </div>

              <Section label="Necesidad detectada">
                <textarea defaultValue={prospect.need_note ?? ''} onBlur={e => { if (e.target.value !== (prospect.need_note ?? '')) patchProspect(prospect.id, { need_note: e.target.value || null }) }} rows={2} placeholder="¿Qué necesita? ¿Qué dijo que busca?" className="w-full text-sm rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.04] text-slate-700 dark:text-slate-200 px-3 py-2 outline-none resize-y" />
              </Section>
              <Section label="Notas">
                <textarea defaultValue={prospect.notes ?? ''} onBlur={e => { if (e.target.value !== (prospect.notes ?? '')) patchProspect(prospect.id, { notes: e.target.value || null }) }} rows={2} placeholder="Objeciones, contexto…" className="w-full text-sm rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.04] text-slate-700 dark:text-slate-200 px-3 py-2 outline-none resize-y" />
              </Section>

              {/* Bitácora */}
              <ActivityLog prospect={prospect} activities={activities} profiles={profiles} onAdd={logActivity} />

              {/* Acciones */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button onClick={openComposer} className="text-xs font-semibold px-3.5 py-2 rounded-xl bg-indigo-600 text-white hover:opacity-90 transition-opacity">Redactar mensaje</button>
                <button onClick={() => registrarToque(prospect, prospect.channel || 'email')} className="text-xs font-medium px-3 py-2 rounded-xl bg-slate-800 dark:bg-white/10 text-white hover:opacity-90 transition-opacity">Registrar toque{prospect.touches ? ` (${prospect.touches})` : ''}</button>
                {!prospect.contact_id && <button onClick={() => convertir(prospect)} className="text-xs font-medium px-3 py-2 rounded-xl bg-emerald-600 text-white hover:opacity-90 transition-opacity">Convertir a contacto</button>}
                {prospect.linkedin_url && <a href={prospect.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium px-3 py-2 rounded-xl border border-slate-200 dark:border-white/[0.12] text-slate-600 dark:text-slate-300">LinkedIn</a>}
                {prospect.stage !== 'descartado' && (
                  <button onClick={() => setShowDiscard(v => !v)} className="text-xs font-medium px-3 py-2 rounded-xl border border-red-200 dark:border-red-500/20 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors">Descartar</button>
                )}
              </div>
              {showDiscard && (
                <DiscardPanel onCancel={() => setShowDiscard(false)} onConfirm={(reason, recycle) => {
                  patchProspect(prospect.id, { stage: 'descartado', disqualified_reason: reason || null, recycle_at: recycle || null })
                  logActivity(prospect.id, { type: 'etapa', outcome: 'descartado', body: reason || null })
                  setShowDiscard(false)
                }} />
              )}
            </>
          )}

          {/* ═══ CONTACTO (warm) ═══ */}
          {contact && (
            <>
              <Section label="Etapa del contacto">
                <div className="flex flex-wrap gap-1.5">
                  {CONTACT_TYPES.map(t => (
                    <StagePill key={t.value} active={contact.contact_type === t.value} label={t.label} color={t.dot}
                      onClick={() => patchContact(contact.id, { contact_type: t.value })} />
                  ))}
                </div>
              </Section>

              <Section label="Vendedor">
                <div className="flex flex-wrap gap-1.5">
                  <StagePill active={contact.assigned_to === currentUserId} label={`${myName} (yo)`} color="#6366f1" onClick={() => patchContact(contact.id, { assigned_to: currentUserId })} />
                  {profiles.filter(pr => pr.id !== currentUserId).map(pr => (
                    <StagePill key={pr.id} active={contact.assigned_to === pr.id} label={profileName(profiles, pr.id)} color="#6366f1" onClick={() => patchContact(contact.id, { assigned_to: pr.id })} />
                  ))}
                </div>
              </Section>

              {contactProposals.length > 0 && (
                <Section label={`Propuestas · ${contactProposals.length}`}>
                  <div className="space-y-1.5">
                    {contactProposals.map(p => (
                      <a key={p.id} href="/ventas/propuestas" className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.03] px-3 py-2 hover:border-slate-300 dark:hover:border-white/20 transition-colors">
                        <span className="text-xs text-slate-700 dark:text-slate-200 truncate">{p.title ?? 'Propuesta'}</span>
                        <span className="shrink-0 flex items-center gap-2">
                          <span className="text-[10px] text-slate-400">{p.stage}</span>
                          <span className="text-[11px] font-bold font-mono text-amber-600 dark:text-amber-400">{money(num(p.total) || num(p.amount))}</span>
                        </span>
                      </a>
                    ))}
                  </div>
                </Section>
              )}

              {contact.notes && (
                <Section label="Notas / historial">
                  <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.03] px-3 py-2">
                    <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{contact.notes}</p>
                  </div>
                </Section>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button onClick={openComposer} className="text-xs font-semibold px-3.5 py-2 rounded-xl bg-indigo-600 text-white hover:opacity-90 transition-opacity">Redactar mensaje</button>
                {contact.meeting_link && <a href={contact.meeting_link} target="_blank" rel="noopener noreferrer" className="text-xs font-medium px-3 py-2 rounded-xl border border-slate-200 dark:border-white/[0.12] text-slate-600 dark:text-slate-300">Abrir Meet</a>}
                <a href="/ventas/contactos" className="text-xs font-medium px-3 py-2 rounded-xl border border-slate-200 dark:border-white/[0.12] text-slate-600 dark:text-slate-300">Ficha completa →</a>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Bitácora ────────────────────────────────────────────────────────────────
function ActivityLog({ prospect, activities, profiles, onAdd }: {
  prospect: Prospect
  activities: Activity[]
  profiles: Profile[]
  onAdd: (id: string, a: { type: string; channel?: string | null; direction?: string | null; outcome?: string | null; body?: string | null }) => void
}) {
  const [type, setType] = useState('respuesta')
  const [channel, setChannel] = useState('email')
  const [body, setBody] = useState('')
  const submit = () => {
    const direction = type === 'respuesta' ? 'entrante' : type === 'toque' ? 'saliente' : null
    onAdd(prospect.id, { type, channel: type === 'nota' ? null : channel, direction, body: body.trim() || null })
    setBody('')
  }
  return (
    <Section label="Bitácora">
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        <select value={type} onChange={e => setType(e.target.value)} className="text-[11px] rounded-lg border border-slate-200 dark:border-white/[0.12] bg-white dark:bg-[#1e2535] text-slate-600 dark:text-slate-300 px-2 py-1.5 outline-none">
          <option value="respuesta">Respuesta</option>
          <option value="toque">Toque</option>
          <option value="reunion">Reunión</option>
          <option value="nota">Nota</option>
        </select>
        {type !== 'nota' && (
          <select value={channel} onChange={e => setChannel(e.target.value)} className="text-[11px] rounded-lg border border-slate-200 dark:border-white/[0.12] bg-white dark:bg-[#1e2535] text-slate-600 dark:text-slate-300 px-2 py-1.5 outline-none">
            {Object.entries(CHANNELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        )}
        <input value={body} onChange={e => setBody(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submit() }} placeholder="Detalle…" className="flex-1 min-w-[120px] text-[11px] rounded-lg border border-slate-200 dark:border-white/[0.12] bg-white dark:bg-[#1e2535] text-slate-600 dark:text-slate-300 px-2.5 py-1.5 outline-none" />
        <button onClick={submit} className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-slate-700 dark:bg-white/10 text-white hover:opacity-90 transition-opacity">Registrar</button>
      </div>
      {activities.length === 0 ? (
        <p className="text-[11px] text-slate-400 dark:text-slate-600 italic">Sin actividad registrada.</p>
      ) : (
        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
          {activities.map(a => (
            <div key={a.id} className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
              <span className="font-semibold capitalize">{a.type}</span>
              {a.channel ? <span className="text-slate-400"> · {CHANNELS[a.channel] ?? a.channel}</span> : null}
              {a.outcome ? <span className="text-slate-400"> · {a.outcome}</span> : null}
              {a.body ? <span className="text-slate-500 dark:text-slate-400"> — {a.body}</span> : null}
              <span className="text-slate-400 dark:text-slate-600"> · {fmtDateTime(a.created_at)}{a.created_by ? ` · ${profileName(profiles, a.created_by)}` : ''}</span>
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

// ─── Captura de decisor ──────────────────────────────────────────────────────
function DecisorCapture({ onSave }: { onSave: (d: { full_name: string; title: string; email: string; phone: string }) => void }) {
  const [full_name, setFn] = useState(''); const [title, setTitle] = useState('')
  const [email, setEmail] = useState(''); const [phone, setPhone] = useState('')
  return (
    <div className="rounded-xl border border-purple-200 dark:border-purple-500/20 bg-purple-50/60 dark:bg-purple-900/10 p-3.5">
      <p className="text-[11px] font-bold text-purple-700 dark:text-purple-300 mb-1">Conseguir al decisor</p>
      <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-2.5">Esta cuenta solo tiene datos generales. Identifica al decisor y captúralo para volverlo prospecto.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input value={full_name} onChange={e => setFn(e.target.value)} placeholder="Nombre completo *" className="text-xs rounded-lg border border-slate-200 dark:border-white/[0.12] bg-white dark:bg-[#1e2535] text-slate-700 dark:text-slate-200 px-2.5 py-2 outline-none" />
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Puesto" className="text-xs rounded-lg border border-slate-200 dark:border-white/[0.12] bg-white dark:bg-[#1e2535] text-slate-700 dark:text-slate-200 px-2.5 py-2 outline-none" />
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Correo directo" className="text-xs rounded-lg border border-slate-200 dark:border-white/[0.12] bg-white dark:bg-[#1e2535] text-slate-700 dark:text-slate-200 px-2.5 py-2 outline-none" />
        <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Teléfono directo" className="text-xs rounded-lg border border-slate-200 dark:border-white/[0.12] bg-white dark:bg-[#1e2535] text-slate-700 dark:text-slate-200 px-2.5 py-2 outline-none" />
      </div>
      <button onClick={() => onSave({ full_name, title, email, phone })} className="mt-2.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-purple-600 text-white hover:opacity-90 transition-opacity">Marcar como prospecto →</button>
    </div>
  )
}

function DiscardPanel({ onConfirm, onCancel }: { onConfirm: (reason: string, recycle: string) => void; onCancel: () => void }) {
  const [reason, setReason] = useState('')
  const [recycle, setRecycle] = useState(addDaysISO(90))
  return (
    <div className="rounded-xl border border-red-200 dark:border-red-500/20 bg-red-50/60 dark:bg-red-900/10 p-3.5 space-y-2">
      <p className="text-[11px] font-bold text-red-700 dark:text-red-300">Descartar prospecto</p>
      <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Motivo…" className="w-full text-xs rounded-lg border border-slate-200 dark:border-white/[0.12] bg-white dark:bg-[#1e2535] text-slate-700 dark:text-slate-200 px-2.5 py-2 outline-none" />
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-slate-500 dark:text-slate-400">Reintentar el:</label>
        <input type="date" value={recycle} onChange={e => setRecycle(e.target.value)} className="text-xs rounded-lg border border-slate-200 dark:border-white/[0.12] bg-white dark:bg-[#1e2535] text-slate-600 dark:text-slate-300 px-2 py-1.5 outline-none" />
        <div className="flex-1" />
        <button onClick={onCancel} className="text-[11px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/[0.12] text-slate-500">Cancelar</button>
        <button onClick={() => onConfirm(reason, recycle)} className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-red-600 text-white hover:opacity-90">Descartar</button>
      </div>
    </div>
  )
}

// ─── Alta manual ─────────────────────────────────────────────────────────────
function AddModal({ onClose, onSave }: { onClose: () => void; onSave: (d: Partial<Prospect>) => void }) {
  const [f, setF] = useState({
    full_name: '', title: '', company: '', email: '', phone: '',
    company_generic_email: '', company_phone: '', icp_segment: '', industry: '', company_city: '', channel: 'email', notes: '',
  })
  const set = (k: keyof typeof f, v: string) => setF(prev => ({ ...prev, [k]: v }))
  const save = () => {
    if (!f.company.trim() && !f.full_name.trim()) { alert('Pon al menos empresa o nombre.'); return }
    const hasDecisor = !!f.full_name.trim()
    onSave({
      full_name: f.full_name.trim() || null, title: f.title.trim() || null, company: f.company.trim() || null,
      email: f.email.trim() || null, phone: f.phone.trim() || null,
      company_generic_email: f.company_generic_email.trim() || null, company_phone: f.company_phone.trim() || null,
      icp_segment: f.icp_segment || null, industry: f.industry.trim() || null, company_city: f.company_city.trim() || null,
      channel: f.channel, stage: hasDecisor ? 'por_contactar' : 'por_investigar', notes: f.notes.trim() || null,
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
        <Input label="Correo general" value={f.company_generic_email} onChange={v => set('company_generic_email', v)} />
        <Input label="Tel/WhatsApp general" value={f.company_phone} onChange={v => set('company_phone', v)} />
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Segmento</p>
          <select value={f.icp_segment} onChange={e => set('icp_segment', e.target.value)} className="w-full text-xs rounded-lg border border-slate-200 dark:border-white/[0.12] bg-white dark:bg-[#1e2535] text-slate-700 dark:text-slate-200 px-2.5 py-2 outline-none">
            <option value="">Sin segmento</option>
            {Object.entries(SEGMENTS).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
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
        <button onClick={save} className="text-xs font-semibold px-4 py-2 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90">Guardar</button>
      </div>
    </Modal>
  )
}

// ─── Compositor ──────────────────────────────────────────────────────────────
function ComposerModal({ rec, templates, sellerName, onClose, onSent }: {
  rec: CrmRecord
  templates: Template[]
  sellerName: string
  onClose: () => void
  onSent: (channel: string) => void
}) {
  const [channel, setChannel] = useState<'email' | 'whatsapp'>('email')
  const [copied, setCopied] = useState<string | null>(null)
  const applicable = useMemo(() => (
    templates.filter(t => t.channel === channel && (!t.segment || t.segment === rec.segment))
  ), [templates, channel, rec.segment])
  const [tid, setTid] = useState('')
  const tpl = applicable.find(t => t.id === tid) ?? applicable[0]
  const link = buildLink(rec, sellerName, channel, tpl?.step ?? 0)
  const subject = tpl?.subject ? substitute(tpl.subject, rec, sellerName, link) : ''
  const bodyText = tpl ? substitute(tpl.body, rec, sellerName, link) : ''
  const copy = (key: string, text: string) => {
    navigator.clipboard?.writeText(text)
    setCopied(key); setTimeout(() => setCopied(c => (c === key ? null : c)), 1500)
  }

  return (
    <Modal onClose={onClose} title={`Redactar a ${rec.name}`} subtitle="Elige plantilla, revisa y copia. El link ya lleva las UTM para medir.">
      <div className="flex items-center gap-2 mb-3">
        <div className="inline-flex rounded-lg border border-slate-200 dark:border-white/[0.1] p-0.5 bg-white dark:bg-[#1e2535]">
          <Tab active={channel === 'email'} onClick={() => { setChannel('email'); setTid('') }} label="Correo" />
          <Tab active={channel === 'whatsapp'} onClick={() => { setChannel('whatsapp'); setTid('') }} label="WhatsApp" />
        </div>
        <select value={tpl?.id ?? ''} onChange={e => setTid(e.target.value)} className="flex-1 text-xs rounded-lg border border-slate-200 dark:border-white/[0.12] bg-white dark:bg-[#1e2535] text-slate-700 dark:text-slate-200 px-2.5 py-2 outline-none">
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
                <button onClick={() => copy('subj', subject)} className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 dark:border-white/[0.12] text-slate-500">{copied === 'subj' ? 'Copiado' : 'Copiar'}</button>
              </div>
              <p className="text-sm text-slate-800 dark:text-slate-100 rounded-lg bg-slate-50 dark:bg-white/[0.04] px-3 py-2">{subject}</p>
            </div>
          )}
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Mensaje</p>
              <button onClick={() => copy('body', bodyText)} className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 dark:border-white/[0.12] text-slate-500">{copied === 'body' ? 'Copiado' : 'Copiar mensaje'}</button>
            </div>
            <pre className="text-sm text-slate-700 dark:text-slate-200 rounded-lg bg-slate-50 dark:bg-white/[0.04] px-3 py-2.5 whitespace-pre-wrap font-sans max-h-60 overflow-y-auto">{bodyText}</pre>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500">
            <span className="font-mono truncate">{link}</span>
            <button onClick={() => copy('link', link)} className="shrink-0 px-1.5 py-0.5 rounded border border-slate-200 dark:border-white/[0.12] text-slate-500">{copied === 'link' ? 'Copiado' : 'Copiar link'}</button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-400 py-6 text-center">No hay plantillas para este canal todavía.</p>
      )}

      <div className="flex flex-wrap justify-end gap-2 mt-4">
        {channel === 'email' && rec.email && (
          <a href={`mailto:${rec.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`} className="text-xs font-medium px-3 py-2 rounded-lg border border-slate-200 dark:border-white/[0.12] text-slate-600 dark:text-slate-300">Abrir en correo</a>
        )}
        {channel === 'whatsapp' && rec.phone && (
          <a href={`https://wa.me/${rec.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(bodyText)}`} target="_blank" rel="noopener noreferrer" className="text-xs font-medium px-3 py-2 rounded-lg border border-slate-200 dark:border-white/[0.12] text-slate-600 dark:text-slate-300">Abrir en WhatsApp</a>
        )}
        <button onClick={() => onSent(channel)} className="text-xs font-semibold px-4 py-2 rounded-lg bg-indigo-600 text-white hover:opacity-90">Marcar como enviado →</button>
      </div>
    </Modal>
  )
}

// ─── Átomos ──────────────────────────────────────────────────────────────────
function Modal({ children, onClose, title, subtitle }: { children: ReactNode; onClose: () => void; title: string; subtitle?: string }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 sm:p-8 overflow-y-auto bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-[#1a2030] p-5 my-8" style={CARD_S} onClick={e => e.stopPropagation()}>
        <div className="mb-3">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">{title}</h3>
          {subtitle && <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  )
}
function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">{label}</p>
      {children}
    </div>
  )
}
function Input({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">{label}</p>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-full text-xs rounded-lg border border-slate-200 dark:border-white/[0.12] bg-white dark:bg-[#1e2535] text-slate-700 dark:text-slate-200 px-2.5 py-2 outline-none" />
    </div>
  )
}
function StagePill({ active, label, color, onClick }: { active: boolean; label: string; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`text-[11px] font-medium px-2.5 py-1 rounded-lg border transition-colors ${active ? 'border-transparent text-white' : 'border-slate-200 dark:border-white/[0.12] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.05]'}`} style={active ? { background: color } : undefined}>
      {label}
    </button>
  )
}
function Tab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return <button onClick={onClick} className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${active ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}>{label}</button>
}
function Pill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return <button onClick={onClick} className={`text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors ${active ? 'bg-slate-800 dark:bg-white/10 text-white border-transparent' : 'bg-white dark:bg-[#1a2030] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/[0.1] hover:bg-slate-50 dark:hover:bg-white/[0.05]'}`}>{label}</button>
}
function Kpi({ label, value, tint }: { label: string; value: string; tint: string }) {
  return (
    <div className="rounded-2xl bg-white dark:bg-[#1e2535] border border-slate-200 dark:border-white/[0.08] px-3.5 py-3" style={CARD_S}>
      <div className="flex items-center gap-1.5 mb-1"><span className="w-1.5 h-1.5 rounded-full" style={{ background: tint }} /><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 truncate">{label}</p></div>
      <p className="text-xl font-bold text-slate-800 dark:text-slate-100 tabular-nums">{value}</p>
    </div>
  )
}
function DrawerField({ label, value, href }: { label: string; value: string | null; href?: string }) {
  if (!value) return null
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 dark:border-white/[0.05] pb-1.5">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 shrink-0">{label}</span>
      {href ? <a href={href} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 dark:text-blue-400 hover:underline truncate">{value}</a> : <span className="text-sm text-slate-700 dark:text-slate-200 truncate">{value}</span>}
    </div>
  )
}
