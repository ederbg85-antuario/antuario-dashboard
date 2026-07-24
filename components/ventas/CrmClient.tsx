'use client'

import { useMemo, useState, useCallback, type ReactNode } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { CARD_S } from '@/components/ui/dashboard'
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
// Fases: 'inbound' (leads que nos contactan) · 'prospeccion' (venta en frío,
// conseguir al decisor y abrir conversación) · 'oportunidad' (hay interés real).
const COLS = [
  { key: 'nuevos',        label: 'Nuevos',         color: '#f472b6', phase: 'inbound'     },
  { key: 'por_investigar',label: 'Por investigar', color: '#c084fc', phase: 'prospeccion' },
  { key: 'por_contactar', label: 'Por contactar',  color: '#94a3b8', phase: 'prospeccion' },
  { key: 'contactado',    label: 'Contactado',     color: '#38bdf8', phase: 'prospeccion' },
  { key: 'seguimiento',   label: 'En seguimiento', color: '#22d3ee', phase: 'prospeccion' },
  { key: 'interesado',    label: 'Interesado',     color: '#34d399', phase: 'oportunidad' },
  { key: 'reunion',       label: 'Reunión',        color: '#8b5cf6', phase: 'oportunidad' },
  { key: 'propuesta',     label: 'Propuesta',      color: '#f59e0b', phase: 'oportunidad' },
  { key: 'cliente',       label: 'Cliente',        color: '#14b8a6', phase: 'oportunidad' },
] as const
type ColKey = typeof COLS[number]['key'] | 'descartado'
const colMeta = (k: string) => COLS.find(c => c.key === k)

const PHASES: { key: string; label: string; sub: string; color: string }[] = [
  { key: 'inbound',     label: 'Inbound',            sub: 'Te contactan a ti (web, WhatsApp, campañas)', color: '#f472b6' },
  { key: 'prospeccion', label: 'Prospección · frío', sub: 'Conseguir al decisor y abrir conversación',  color: '#c084fc' },
  { key: 'oportunidad', label: 'Oportunidad',        sub: 'Hay interés real → propuesta → cierre',       color: '#34d399' },
]

// prospect.stage → columna (frío). convertido no se pinta (ya vive como contacto).
// Un prospecto frío NUNCA cae en 'nuevos' (esa columna es solo inbound).
function prospectCol(stage: string): ColKey | null {
  switch (stage) {
    case 'por_investigar':   return 'por_investigar'
    case 'por_contactar':    return 'por_contactar'
    case 'contactado':       return 'contactado'
    case 'siguiendo':        return 'seguimiento'
    case 'interesado':       return 'interesado'
    case 'reunion_agendada': return 'reunion'
    case 'descartado':       return 'descartado'
    default: return null
  }
}
// columna → prospect.stage (drag). null = no permitido para un prospecto frío
// (nuevos = solo inbound; propuesta/cliente exigen convertir a contacto primero).
const COL_TO_PROSPECT_STAGE: Record<string, string | null> = {
  nuevos: null, por_investigar: 'por_investigar', por_contactar: 'por_contactar',
  contactado: 'contactado', seguimiento: 'siguiendo', interesado: 'interesado',
  reunion: 'reunion_agendada', propuesta: null, cliente: null,
}
// contact.contact_type → columna (inbound/warm). lead_nuevo = "Nuevos".
function contactCol(type: string | null, hasProposal: boolean): ColKey {
  if (type === 'client') return 'cliente'
  if (type === 'active_proposal' || hasProposal) return 'propuesta'
  if (type === 'proposal') return 'reunion'
  if (type === 'lead_potential' || type === 'lead_relevant') return 'interesado'
  if (type === 'lead_irrelevant') return 'descartado'
  return 'nuevos'
}
// columna → contact_type (drag). Solo columnas válidas para un contacto: las
// de frío (por_investigar/contactar/contactado/seguimiento) NO aplican a inbound.
const COL_TO_CONTACT_TYPE: Record<string, string> = {
  nuevos: 'lead_nuevo', interesado: 'lead_potential',
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
type PipelineKind = 'general' | 'frio' | 'marketing'
type ManagementKind = 'ai' | 'mine' | 'team'

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
function managementKind(ownerId: string | null, currentUserId: string): ManagementKind {
  if (!ownerId) return 'ai'
  return ownerId === currentUserId ? 'mine' : 'team'
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
  const [pipeline, setPipeline] = useState<PipelineKind>('general')
  const [scope, setScope] = useState<'equipo' | 'mios'>(isManager ? 'equipo' : 'mios')
  const [origin, setOrigin] = useState('todos')
  const [owner, setOwner] = useState('todos')
  const [query, setQuery] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
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

  const pipelineRecords = useMemo(() => records.filter(r => (
    pipeline === 'general' ||
    (pipeline === 'frio' && r.origin === 'frio') ||
    (pipeline === 'marketing' && r.origin !== 'frio')
  )), [records, pipeline])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return pipelineRecords.filter(r => {
      if (!showDiscarded && r.col === 'descartado') return false
      if (scope === 'mios' && r.ownerId !== currentUserId) return false
      if (origin !== 'todos' && r.origin !== origin) return false
      if (scope === 'equipo' && owner !== 'todos' && r.ownerId !== owner) return false
      if (q && ![r.name, r.company, r.email, r.title].some(v => (v ?? '').toLowerCase().includes(q))) return false
      return true
    })
  }, [pipelineRecords, showDiscarded, scope, origin, owner, query, currentUserId])

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

  const pipelineCounts = useMemo(() => {
    const visible = records.filter(r => showDiscarded || r.col !== 'descartado')
    return {
      general: visible.length,
      frio: visible.filter(r => r.origin === 'frio').length,
      marketing: visible.filter(r => r.origin !== 'frio').length,
    }
  }, [records, showDiscarded])

  const captureReport = useMemo(() => {
    const visible = records.filter(r => showDiscarded || r.col !== 'descartado')
    return {
      cold: visible.filter(r => r.origin === 'frio').length,
      campaigns: visible.filter(r => r.origin === 'web').length,
      whatsapp: visible.filter(r => r.origin === 'whatsapp').length,
      other: visible.filter(r => r.origin === 'referido' || r.origin === 'otro').length,
      relevant: contacts.filter(c => c.contact_type === 'lead_relevant' || c.contact_type === 'lead_potential').length,
      irrelevant: contacts.filter(c => c.contact_type === 'lead_irrelevant').length,
    }
  }, [records, contacts, showDiscarded])

  const managementReport = useMemo(() => ({
    ai: filtered.filter(r => !r.ownerId).length,
    mine: filtered.filter(r => r.ownerId === currentUserId).length,
    team: filtered.filter(r => r.ownerId && r.ownerId !== currentUserId).length,
  }), [filtered, currentUserId])

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
      if (!stage) {
        if (colKey === 'nuevos') alert('“Nuevos” es solo para leads inbound (los que te contactan a ti). Un prospecto en frío no va aquí.')
        else alert('Para llevarlo a Propuesta o Cliente, primero conviértelo a contacto (ábrelo y usa “Convertir a contacto”).')
        return
      }
      const label = PROSPECT_STAGES.find(s => s.value === stage)?.label ?? stage
      patchProspect(rec.rawId, { stage })
      logActivity(rec.rawId, { type: 'etapa', body: `Etapa → ${label}` })
    } else {
      const type = COL_TO_CONTACT_TYPE[colKey]
      if (!type) { alert('Esa etapa es solo para prospección en frío. Los contactos avanzan a Interesado → Reunión → Propuesta → Cliente.'); return }
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
  const activeFilterCount =
    Number(origin !== 'todos') +
    Number(isManager && scope === 'mios') +
    Number(owner !== 'todos') +
    Number(showDiscarded)
  const pipelineLabel =
    pipeline === 'frio' ? 'Venta en frío' :
      pipeline === 'marketing' ? 'Marketing e inbound' :
        'General unificado'
  const selectPipeline = (next: PipelineKind) => {
    setPipeline(next)
    setOrigin('todos')
  }

  return (
    <div className="min-h-full px-4 pb-10 pt-2 sm:px-5 lg:px-7">
      <div className="mx-auto w-full max-w-[1760px] space-y-5">
        {/* ── Encabezado ── */}
        <header className="relative overflow-hidden rounded-[24px] border border-slate-200/80 bg-gradient-to-br from-white via-white to-indigo-50/80 px-5 py-5 shadow-[0_12px_34px_rgba(15,23,42,0.08)] dark:border-white/[0.08] dark:from-[#171d2b] dark:via-[#171d2b] dark:to-indigo-950/50 sm:px-6">
          <div className="pointer-events-none absolute -right-20 -top-28 h-64 w-64 rounded-full bg-indigo-500/15 blur-3xl" />
          <div className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-fuchsia-500 via-indigo-500 to-cyan-400" />
          <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-indigo-500 dark:text-indigo-300">Ventas / CRM</p>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-[32px] font-bold leading-none tracking-[-0.035em] text-slate-950 dark:text-white">Pipeline comercial</h1>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.65)]" />
                  {kpis.activos} activos
                </span>
              </div>
              <p className="mt-2.5 text-sm text-slate-500 dark:text-slate-400">Prospectos, oportunidades y clientes en un solo lugar.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={exportCsv}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-[13px] font-semibold text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-200 dark:hover:bg-white/[0.09]"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0 4-4m-4 4-4-4M5 19h14" />
                </svg>
                Exportar
              </button>
              <button
                onClick={() => setAddOpen(true)}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-[13px] font-semibold text-white shadow-[0_8px_22px_rgba(15,23,42,0.2)] transition-colors hover:bg-indigo-950 dark:bg-white dark:text-slate-950 dark:hover:bg-indigo-50"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
                </svg>
                Nuevo prospecto
              </button>
            </div>
          </div>
        </header>

        {/* ── Indicadores + agente IA ── */}
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.12fr)_minmax(370px,0.88fr)]">
          <div aria-label="Informe de captación" className="rounded-[22px] border border-slate-200/80 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.07)] dark:border-white/[0.07] dark:bg-[#171d2b]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-950 dark:text-white">Informe de captación</h2>
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">Volumen por origen y calidad del contacto</p>
              </div>
              <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-indigo-600 dark:bg-indigo-400/10 dark:text-indigo-300">En vivo</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3">
              <Kpi label="Contactos en frío" value={String(captureReport.cold)} sub="Prospección saliente" tint="#8b5cf6" />
              <Kpi label="Web / campañas" value={String(captureReport.campaigns)} sub="Formularios y landings" tint="#0ea5e9" />
              <Kpi label="WhatsApp" value={String(captureReport.whatsapp)} sub="Conversaciones inbound" tint="#10b981" />
              <Kpi label="Otros canales" value={String(captureReport.other)} sub="Referidos y directos" tint="#f59e0b" />
              <Kpi label="Leads relevantes" value={String(captureReport.relevant)} sub="Calificados para venta" tint="#14b8a6" />
              <Kpi label="Irrelevantes" value={String(captureReport.irrelevant)} sub="Fuera del perfil ideal" tint="#f43f5e" />
            </div>
          </div>
          <AiAgentNotice
            record={agenda[0] ?? null}
            pendingCount={agenda.length}
            onReview={agenda[0] ? () => setSelectedId(agenda[0].id) : undefined}
          />
        </section>

        {/* ── Controles de vista y filtros ── */}
        <section className="rounded-[22px] border border-slate-200/80 bg-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.055)] dark:border-white/[0.07] dark:bg-[#171d2b]">
          <div className="mb-3 flex flex-col gap-3 border-b border-slate-100 pb-3 dark:border-white/[0.06] lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-[180px]">
              <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-400 dark:text-slate-500">Pipeline activo</p>
              <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{pipelineLabel}</p>
            </div>
            <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3 lg:max-w-[800px]">
              <PipelineChoice
                active={pipeline === 'general'}
                label="General"
                sub="Todo unificado"
                count={pipelineCounts.general}
                color="#6366f1"
                onClick={() => selectPipeline('general')}
              />
              <PipelineChoice
                active={pipeline === 'frio'}
                label="Venta en frío"
                sub="Prospección saliente"
                count={pipelineCounts.frio}
                color="#8b5cf6"
                onClick={() => selectPipeline('frio')}
              />
              <PipelineChoice
                active={pipeline === 'marketing'}
                label="Marketing"
                sub="Inbound y campañas"
                count={pipelineCounts.marketing}
                color="#0ea5e9"
                onClick={() => selectPipeline('marketing')}
              />
            </div>
          </div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="inline-flex w-full rounded-xl bg-slate-100/80 p-1 dark:bg-black/20 sm:w-auto">
              <Tab active={tab === 'tablero'} onClick={() => setTab('tablero')} label="Tablero" />
              <Tab active={tab === 'lista'} onClick={() => setTab('lista')} label="Lista" />
              <Tab active={tab === 'metricas'} onClick={() => setTab('metricas')} label="Métricas" />
            </div>
            <div className="relative min-w-0 flex-1">
              <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m2.1-5.4a7.5 7.5 0 11-15 0 7.5 7.5 0 0115 0z" />
              </svg>
              <input
                aria-label="Buscar en el CRM"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Buscar por nombre, empresa, puesto o correo"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-slate-400 dark:border-white/[0.08] dark:bg-white/[0.035] dark:text-slate-100 dark:focus:border-white/20"
              />
            </div>
            <button
              type="button"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen(v => !v)}
              className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-3.5 text-[13px] font-semibold transition-colors ${filtersOpen || activeFilterCount > 0 ? 'border-slate-300 bg-slate-50 text-slate-800 dark:border-white/15 dark:bg-white/[0.06] dark:text-white' : 'border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-white/[0.08] dark:text-slate-400 dark:hover:bg-white/[0.04]'}`}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M7 12h10m-7 6h4" />
              </svg>
              Filtros
              {activeFilterCount > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-900 px-1.5 text-[10px] font-bold text-white dark:bg-white dark:text-slate-900">{activeFilterCount}</span>}
            </button>
          </div>
          {filtersOpen && (
            <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3 dark:border-white/[0.06] xl:grid-cols-[auto_auto_1fr_auto] xl:items-center">
              <div className="inline-flex w-full rounded-xl border border-slate-200 p-1 dark:border-white/[0.08] sm:w-auto">
                <Tab active={scope === 'equipo'} onClick={() => setScope('equipo')} label={isManager ? 'Mi equipo' : 'Todos'} />
                <Tab active={scope === 'mios'} onClick={() => setScope('mios')} label="Solo míos" />
              </div>
              {scope === 'equipo' && isManager && (
                <select
                  aria-label="Filtrar por vendedor"
                  value={owner}
                  onChange={e => setOwner(e.target.value)}
                  className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-700 outline-none focus:border-slate-400 dark:border-white/[0.1] dark:bg-[#1d2434] dark:text-slate-200"
                >
                  <option value="todos">Todos los vendedores</option>
                  {owners.map(id => <option key={id} value={id}>{profileName(profiles, id)}</option>)}
                </select>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">Origen</span>
                <Pill active={origin === 'todos'} onClick={() => setOrigin('todos')} label={`Todos · ${pipelineRecords.filter(r => showDiscarded || r.col !== 'descartado').length}`} />
                {Object.entries(ORIGINS).map(([k, m]) => {
                  const n = pipelineRecords.filter(r => r.origin === k && (showDiscarded || r.col !== 'descartado')).length
                  if (n === 0) return null
                  return <Pill key={k} active={origin === k} onClick={() => setOrigin(k)} label={`${m.label} · ${n}`} />
                })}
              </div>
              <button
                onClick={() => setShowDiscarded(v => !v)}
                className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors ${showDiscarded ? 'border-slate-900 bg-slate-900 text-white dark:border-white/20 dark:bg-white/10' : 'border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-white/[0.1] dark:text-slate-400 dark:hover:bg-white/[0.05]'}`}
              >
                <span className={`h-2 w-2 rounded-full ${showDiscarded ? 'bg-rose-400' : 'bg-slate-300 dark:bg-slate-600'}`} />
                Descartados
              </button>
            </div>
          )}
        </section>

        {/* ── Contenido ── */}
        {tab === 'tablero' && (
          <section className="rounded-[22px] border border-slate-200/80 bg-gradient-to-br from-white via-white to-slate-50/90 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.07)] dark:border-white/[0.07] dark:from-[#151b28] dark:via-[#151b28] dark:to-indigo-950/20">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3 px-0.5">
              <div>
                <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Etapas</h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{pipelineLabel} · arrastra una tarjeta para actualizar su estado</p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <ManagementLegend />
                <span className="ml-1 text-xs font-semibold tabular-nums text-slate-500 dark:text-slate-400">{filtered.length} registros</span>
              </div>
            </div>
            <div className="-mx-1 overflow-x-auto px-1 pb-2">
              <div className="min-w-max space-y-2.5">
              {/* Bandas de fase */}
              <div className="flex gap-3">
                {PHASES.map(ph => {
                  const span = COLS.filter(c => c.phase === ph.key).length
                  if (span === 0) return null
                  return <PhaseBand key={ph.key} label={ph.label} sub={ph.sub} color={ph.color} span={span} />
                })}
              </div>
              {/* Columnas */}
              <div className="flex gap-3">
                {COLS.map(c => {
                  const items = byCol[c.key] ?? []
                  const colValue = c.key === 'propuesta' || c.key === 'cliente' ? items.reduce((s, r) => s + (r.value ?? 0), 0) : 0
                  const emptyText = c.key === 'nuevos' ? 'Sin leads nuevos' : c.key === 'por_investigar' ? 'Sin cuentas por investigar' : 'Suelta aquí'
                  return (
                    <div
                      key={c.key}
                      onDragOver={e => { e.preventDefault(); setDragOverCol(c.key) }}
                      onDragLeave={() => setDragOverCol(k => (k === c.key ? null : k))}
                      onDrop={e => { e.preventDefault(); onDropCard(e.dataTransfer.getData('text/plain'), c.key) }}
                      className={`w-[292px] flex-shrink-0 rounded-2xl border p-2.5 shadow-[0_5px_18px_rgba(15,23,42,0.045)] transition-colors ${dragOverCol === c.key ? 'border-indigo-300 bg-indigo-50/80 dark:border-indigo-400/30 dark:bg-indigo-400/[0.07]' : 'border-slate-200/80 bg-slate-100/70 dark:border-white/[0.06] dark:bg-white/[0.04]'}`}
                    >
                      <div className="flex min-h-9 items-center gap-2 px-1 pb-2">
                        <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
                        <span className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">{c.label}</span>
                        <span className="ml-auto text-[11px] font-semibold tabular-nums text-slate-400 dark:text-slate-500">{items.length}</span>
                      </div>
                      {colValue > 0 && <p className="mb-2 px-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">{money(colValue)}</p>}
                      <div className="max-h-[66vh] space-y-2 overflow-y-auto pr-0.5">
                        {items.length === 0 ? (
                          <div className="flex min-h-20 items-center justify-center rounded-xl border border-dashed border-slate-200/80 px-4 text-center dark:border-white/[0.07]">
                            <p className="text-[11px] text-slate-400 dark:text-slate-500">{emptyText}</p>
                          </div>
                        ) : items.map(r => (
                          <BoardCard key={r.id} r={r} today={today} profiles={profiles} currentUserId={currentUserId} onClick={() => setSelectedId(r.id)} />
                        ))}
                      </div>
                    </div>
                  )
                })}
                {showDiscarded && (
                  <div className="w-[292px] flex-shrink-0 rounded-2xl border border-red-100 bg-red-50/50 p-2.5 shadow-[0_4px_14px_rgba(15,23,42,0.03)] dark:border-red-500/10 dark:bg-red-500/[0.035]">
                    <div className="flex min-h-9 items-center gap-2 px-1 pb-2">
                      <span className="h-2 w-2 rounded-full bg-red-400" />
                      <span className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">Descartados</span>
                      <span className="ml-auto text-[11px] font-semibold tabular-nums text-slate-400">{byCol.descartado?.length ?? 0}</span>
                    </div>
                    <div className="max-h-[66vh] space-y-2 overflow-y-auto pr-0.5">
                      {(byCol.descartado ?? []).map(r => <BoardCard key={r.id} r={r} today={today} profiles={profiles} currentUserId={currentUserId} onClick={() => setSelectedId(r.id)} />)}
                    </div>
                  </div>
                )}
              </div>
            </div>
            </div>
          </section>
        )}

        {tab === 'lista' && <ListView records={filtered} profiles={profiles} currentUserId={currentUserId} pipelineLabel={pipelineLabel} onSelect={r => setSelectedId(r.id)} />}

        {tab === 'metricas' && (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <ManagementMetric kind="ai" label="Gestionados por IA" value={managementReport.ai} sub="Automatización activa" />
              <ManagementMetric kind="mine" label="Gestionados por ti" value={managementReport.mine} sub="Atención personal" />
              <ManagementMetric kind="team" label="Otros vendedores" value={managementReport.team} sub="Gestión del equipo" />
            </div>
            {/* Pipeline general */}
            <div className="relative overflow-hidden rounded-[22px] border border-slate-200/80 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.07)] dark:border-white/[0.08] dark:bg-[#1e2535]">
              <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-indigo-400/10 blur-3xl" />
              <div className="relative mb-5 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-950 dark:text-white">Distribución del pipeline</h2>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{pipelineLabel} · oportunidades por etapa</p>
                </div>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-bold text-slate-600 dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-300">{filtered.length} registros</span>
              </div>
              <div className="relative grid gap-x-8 gap-y-3 xl:grid-cols-2">
                {COLS.map(c => {
                  const n = byCol[c.key]?.length ?? 0
                  const max = Math.max(...COLS.map(x => byCol[x.key]?.length ?? 0), 1)
                  return (
                    <div key={c.key} className="flex items-center gap-3">
                      <span className="flex w-32 shrink-0 items-center gap-2 whitespace-nowrap text-xs font-medium text-slate-600 dark:text-slate-300"><span className="h-2 w-2 shrink-0 rounded-full shadow-sm" style={{ background: c.color }} />{c.label}</span>
                      <div className="h-6 flex-1 overflow-hidden rounded-lg border border-slate-200/70 bg-slate-100 shadow-inner dark:border-white/[0.04] dark:bg-black/20">
                        <div className="h-full rounded-lg opacity-90 shadow-[0_0_14px_currentColor] transition-all" style={{ width: `${Math.max((n / max) * 100, n > 0 ? 5 : 0)}%`, background: `linear-gradient(90deg, ${c.color}bb, ${c.color})`, color: c.color }} />
                      </div>
                      <span className="w-8 text-sm font-bold tabular-nums text-slate-800 dark:text-slate-100">{n}</span>
                    </div>
                  )
                })}
              </div>
            </div>
            {/* Frío a detalle */}
            {pipeline !== 'marketing' ? (
              <div className="rounded-[22px] border border-slate-200/80 bg-gradient-to-br from-white to-violet-50/35 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)] dark:border-white/[0.07] dark:from-[#171d2b] dark:to-violet-950/20">
                <p className="mb-3 px-1 text-xs font-bold uppercase tracking-[0.12em] text-violet-500 dark:text-violet-300">Venta en frío · detalle</p>
                <EmbudoMetricas prospects={scopedProspects} activities={acts} profiles={profiles} showSellers={scope === 'equipo'} />
              </div>
            ) : (
              <div className="rounded-[22px] border border-sky-200/80 bg-gradient-to-br from-white via-white to-sky-50 p-5 shadow-[0_10px_30px_rgba(14,165,233,0.08)] dark:border-sky-400/15 dark:from-[#171d2b] dark:via-[#171d2b] dark:to-sky-950/30">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-sky-600 dark:text-sky-300">Calidad de marketing</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <Kpi label="Leads relevantes" value={String(captureReport.relevant)} sub="Listos para seguimiento" tint="#14b8a6" />
                  <Kpi label="No relevantes" value={String(captureReport.irrelevant)} sub="Fuera del perfil" tint="#f43f5e" />
                  <Kpi label="Canales activos" value={String([captureReport.campaigns, captureReport.whatsapp, captureReport.other].filter(Boolean).length)} sub="Fuentes con contactos" tint="#0ea5e9" />
                </div>
              </div>
            )}
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
function BoardCard({ r, today, profiles, currentUserId, onClick }: { r: CrmRecord; today: string; profiles: Profile[]; currentUserId: string; onClick: () => void }) {
  const seg = r.segment ? SEGMENTS[r.segment] : null
  const overdue = r.nextActionAt && r.nextActionAt <= today
  const accent = colMeta(r.col)?.color ?? '#f87171'
  const management = managementKind(r.ownerId, currentUserId)
  const aura = management === 'ai'
    ? 'linear-gradient(135deg, #8b5cf6 0%, #22d3ee 33%, #f472b6 67%, #f59e0b 100%)'
    : management === 'mine'
      ? 'linear-gradient(135deg, #10b981, #34d399)'
      : 'linear-gradient(135deg, #8b5cf6, #c084fc)'
  return (
    <div className="group relative isolate w-full rounded-[15px] p-px transition-transform duration-200 hover:-translate-y-0.5" style={{ background: aura }}>
      <span
        className={`pointer-events-none absolute -inset-0.5 z-0 rounded-[17px] opacity-30 blur-[7px] transition-opacity duration-200 group-hover:opacity-70 ${management === 'ai' ? 'animate-pulse' : ''}`}
        style={{ background: aura }}
      />
      <button
        type="button"
        draggable
        onDragStart={e => { e.dataTransfer.setData('text/plain', r.id); e.dataTransfer.effectAllowed = 'move' }}
        onClick={onClick}
        className="relative z-10 w-full cursor-pointer rounded-[14px] bg-white p-3.5 text-left shadow-[0_5px_15px_rgba(15,23,42,0.10)] transition-colors active:cursor-grabbing dark:bg-[#1e2535]"
      >
        <div className="flex items-start gap-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[10px] font-bold text-white shadow-sm"
            style={{ background: `linear-gradient(145deg, ${accent}, ${accent}bb)` }}
          >
            {initials(r.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold leading-snug text-slate-950 dark:text-slate-50">{r.name}</p>
            {(r.company || r.title) && (
              <p className="mt-1 truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">
                {r.company}{r.company && r.title ? ' · ' : ''}{r.title}
              </p>
            )}
          </div>
          <span className="mt-1 h-2 w-2 shrink-0 rounded-full shadow-[0_0_9px_currentColor]" style={{ background: accent, color: accent }} />
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <ManagementBadge ownerId={r.ownerId} profiles={profiles} currentUserId={currentUserId} />
          {r.value ? <span className="text-[11px] font-bold tabular-nums text-amber-600 dark:text-amber-400">{money(r.value)}</span> : null}
        </div>
        <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-2.5 text-[10px] font-medium text-slate-500 dark:border-white/[0.06] dark:text-slate-400">
          <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${ORIGINS[r.origin]?.cls ?? ''}`}>{ORIGINS[r.origin]?.label ?? r.origin}</span>
          {seg && <><span className="text-slate-300 dark:text-slate-600">·</span><span style={{ color: seg.accent }}>{seg.label}</span></>}
          {typeof r.touches === 'number' && r.touches > 0 && <span className="ml-auto">{r.touches} toques</span>}
        </div>
        {r.nextAction && (
          <div className={`mt-2.5 flex items-center gap-2 rounded-lg px-2.5 py-2 text-[10px] font-semibold ${overdue ? 'bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300' : 'bg-slate-50 text-slate-500 dark:bg-white/[0.04] dark:text-slate-400'}`}>
            <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3M5 11h14M5 5h14a2 2 0 012 2v12H3V7a2 2 0 012-2z" />
            </svg>
            <span className="truncate">{r.nextAction}</span>
            {overdue && <span className="ml-auto shrink-0 font-bold uppercase tracking-wide">Vencido</span>}
          </div>
        )}
      </button>
    </div>
  )
}

// ─── Lista ───────────────────────────────────────────────────────────────────
function ListView({ records, profiles, currentUserId, pipelineLabel, onSelect }: { records: CrmRecord[]; profiles: Profile[]; currentUserId: string; pipelineLabel: string; onSelect: (r: CrmRecord) => void }) {
  if (records.length === 0) return <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-14 text-center text-sm text-slate-400 dark:border-white/[0.08] dark:bg-white/[0.02] dark:text-slate-500">No hay registros con estos filtros.</div>
  return (
    <div className="overflow-hidden rounded-[22px] border border-slate-200/80 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.07)] dark:border-white/[0.08] dark:bg-[#1e2535]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 bg-gradient-to-r from-slate-50 via-white to-indigo-50/60 px-5 py-4 dark:border-white/[0.06] dark:from-white/[0.04] dark:via-transparent dark:to-indigo-400/[0.05]">
        <div>
          <h2 className="text-sm font-bold text-slate-950 dark:text-white">{pipelineLabel}</h2>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{records.length} registros · abre una fila para ver el detalle</p>
        </div>
        <ManagementLegend />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1020px] text-[13px]">
          <thead>
            <tr className="border-b border-slate-200/80 bg-slate-100/80 text-left text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:border-white/[0.06] dark:bg-black/15 dark:text-slate-400">
              <th className="px-4 py-2.5 font-bold">Contacto</th>
              <th className="px-3 py-2.5 font-bold">Empresa</th>
              <th className="px-3 py-2.5 font-bold">Etapa</th>
              <th className="px-3 py-2.5 font-bold">Origen</th>
              <th className="px-3 py-2.5 font-bold">Valor</th>
              <th className="px-3 py-2.5 font-bold">Gestión</th>
              <th className="px-3 py-2.5 font-bold">Actualizado</th>
            </tr>
          </thead>
          <tbody>
            {records.map(r => {
              const cm = colMeta(r.col)
              const management = managementKind(r.ownerId, currentUserId)
              const rowTone = management === 'ai'
                ? 'bg-gradient-to-r from-fuchsia-50/70 via-cyan-50/35 to-transparent hover:from-fuchsia-100/70 dark:from-fuchsia-500/[0.08] dark:via-cyan-400/[0.035] dark:to-transparent'
                : management === 'mine'
                  ? 'bg-gradient-to-r from-emerald-50/70 to-transparent hover:from-emerald-100/70 dark:from-emerald-400/[0.07] dark:to-transparent'
                  : 'bg-gradient-to-r from-violet-50/70 to-transparent hover:from-violet-100/70 dark:from-violet-400/[0.07] dark:to-transparent'
              const edge = management === 'ai' ? 'border-l-fuchsia-400' : management === 'mine' ? 'border-l-emerald-400' : 'border-l-violet-400'
              return (
                <tr
                  key={r.id}
                  tabIndex={0}
                  aria-label={`Abrir ${r.name}`}
                  onClick={() => onSelect(r)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(r) } }}
                  className={`cursor-pointer border-b border-slate-100/90 transition-colors last:border-0 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-400 dark:border-white/[0.04] ${rowTone}`}
                >
                  <td className={`border-l-[3px] px-4 py-3.5 ${edge}`}>
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[10px] font-bold text-white shadow-sm" style={{ background: `linear-gradient(145deg, ${cm?.color ?? '#f87171'}, ${cm?.color ?? '#f87171'}bb)` }}>{initials(r.name)}</span>
                      <div className="min-w-0">
                        <span className="block truncate font-bold text-slate-950 dark:text-slate-100">{r.name}</span>
                        {r.title && <span className="mt-0.5 block truncate text-xs text-slate-400">{r.title}</span>}
                      </div>
                    </div>
                  </td>
                  <td className="max-w-[200px] truncate px-3 py-3 text-slate-500 dark:text-slate-400">{r.company ?? '—'}</td>
                  <td className="px-3 py-3"><span className="inline-flex items-center gap-2 whitespace-nowrap text-slate-700 dark:text-slate-300"><span className="h-1.5 w-1.5 rounded-full" style={{ background: cm?.color ?? '#f87171' }} />{cm?.label ?? 'Descartado'}</span></td>
                  <td className="px-3 py-3"><span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${ORIGINS[r.origin]?.cls ?? ''}`}>{ORIGINS[r.origin]?.label ?? r.origin}</span></td>
                  <td className="px-3 py-3 text-xs font-semibold tabular-nums text-amber-600 dark:text-amber-400">{r.value ? money(r.value) : '—'}</td>
                  <td className="px-3 py-3"><ManagementBadge ownerId={r.ownerId} profiles={profiles} currentUserId={currentUserId} /></td>
                  <td className="whitespace-nowrap px-3 py-3 text-[11px] text-slate-400 dark:text-slate-500">{fmtDate(r.updatedAt)}</td>
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
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35 backdrop-blur-[3px] dark:bg-black/60" onClick={onClose}>
      <div className="h-full w-full max-w-[600px] overflow-y-auto border-l border-slate-200 bg-white shadow-[-20px_0_70px_rgba(15,23,42,0.14)] dark:border-white/[0.08] dark:bg-[#151b28]" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/90 px-6 py-5 backdrop-blur-xl dark:border-white/[0.07] dark:bg-[#171d2b]/90">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[13px] font-bold text-white shadow-lg" style={{ background: cm?.color ?? '#f87171' }}>{initials(rec.name)}</span>
            <div className="flex-1 min-w-0">
              <p className="truncate text-lg font-bold tracking-tight text-slate-950 dark:text-white">{rec.name}</p>
              <p className="mt-1 truncate text-[13px] text-slate-500 dark:text-slate-400">{rec.title}{rec.title && rec.company ? ' · ' : ''}{rec.company}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className={`rounded px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide ${ORIGINS[rec.origin]?.cls ?? ''}`}>{ORIGINS[rec.origin]?.label}</span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-slate-500 dark:bg-white/[0.06] dark:text-slate-400">{rec.kind === 'prospecto' ? 'Prospección' : 'Contacto CRM'}</span>
                {saving && <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-400"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-500" />Guardando</span>}
              </div>
            </div>
            <button aria-label="Cerrar ficha" onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/[0.05] dark:hover:text-white"><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
          </div>
        </div>

        <div className="space-y-5 p-6">
          {/* Contacto */}
          <div className="grid grid-cols-1 gap-1 rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-white/[0.03]">
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
                  <input type="date" value={prospect.next_action_at ?? ''} onChange={e => patchProspect(prospect.id, { next_action_at: e.target.value || null })} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 dark:border-white/[0.1] dark:bg-[#1e2535] dark:text-slate-200" />
                  </div>
                  <input type="text" defaultValue={prospect.next_action ?? ''} onBlur={e => { if (e.target.value !== (prospect.next_action ?? '')) patchProspect(prospect.id, { next_action: e.target.value || null }) }} placeholder="¿Qué sigue?" className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 dark:border-white/[0.1] dark:bg-[#1e2535] dark:text-slate-200" />
                </Section>
              </div>

              <Section label="Necesidad detectada">
                <textarea defaultValue={prospect.need_note ?? ''} onBlur={e => { if (e.target.value !== (prospect.need_note ?? '')) patchProspect(prospect.id, { need_note: e.target.value || null }) }} rows={3} placeholder="¿Qué necesita? ¿Qué dijo que busca?" className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm leading-6 text-slate-700 outline-none placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-200" />
              </Section>
              <Section label="Notas">
                <textarea defaultValue={prospect.notes ?? ''} onBlur={e => { if (e.target.value !== (prospect.notes ?? '')) patchProspect(prospect.id, { notes: e.target.value || null }) }} rows={3} placeholder="Objeciones, contexto…" className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm leading-6 text-slate-700 outline-none placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-200" />
              </Section>

              {/* Bitácora */}
              <ActivityLog prospect={prospect} activities={activities} profiles={profiles} onAdd={logActivity} />

              {/* Acciones */}
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm dark:border-white/[0.07] dark:bg-white/[0.035]">
                <button onClick={openComposer} className="h-10 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white transition-all hover:bg-indigo-500">Redactar mensaje</button>
                <button onClick={() => registrarToque(prospect, prospect.channel || 'email')} className="h-10 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition-all hover:bg-slate-700 dark:bg-white/10 dark:hover:bg-white/15">Registrar toque{prospect.touches ? ` (${prospect.touches})` : ''}</button>
                {!prospect.contact_id && <button onClick={() => convertir(prospect)} className="h-10 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition-all hover:bg-emerald-500">Convertir a contacto</button>}
                {prospect.linkedin_url && <a href={prospect.linkedin_url} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600 dark:border-white/[0.12] dark:text-slate-300">LinkedIn</a>}
                {prospect.stage !== 'descartado' && (
                  <button onClick={() => setShowDiscard(v => !v)} className="h-10 rounded-xl border border-red-200 px-4 text-sm font-semibold text-red-500 transition-colors hover:bg-red-50 dark:border-red-500/20 dark:hover:bg-red-900/10">Descartar</button>
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

              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm dark:border-white/[0.07] dark:bg-white/[0.035]">
                <button onClick={openComposer} className="h-10 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white transition-all hover:bg-indigo-500">Redactar mensaje</button>
                {contact.meeting_link && <a href={contact.meeting_link} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600 dark:border-white/[0.12] dark:text-slate-300">Abrir Meet</a>}
                <a href="/ventas/contactos" className="inline-flex h-10 items-center rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600 dark:border-white/[0.12] dark:text-slate-300">Ficha completa →</a>
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
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select value={type} onChange={e => setType(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-indigo-400 dark:border-white/[0.12] dark:bg-[#1e2535] dark:text-slate-200">
          <option value="respuesta">Respuesta</option>
          <option value="toque">Toque</option>
          <option value="reunion">Reunión</option>
          <option value="nota">Nota</option>
        </select>
        {type !== 'nota' && (
          <select value={channel} onChange={e => setChannel(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-indigo-400 dark:border-white/[0.12] dark:bg-[#1e2535] dark:text-slate-200">
            {Object.entries(CHANNELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        )}
        <input value={body} onChange={e => setBody(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submit() }} placeholder="Añade un detalle…" className="h-10 min-w-[160px] flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-indigo-400 dark:border-white/[0.12] dark:bg-[#1e2535] dark:text-slate-200" />
        <button onClick={submit} className="h-10 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-700 dark:bg-indigo-600 dark:hover:bg-indigo-500">Registrar</button>
      </div>
      {activities.length === 0 ? (
        <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-sm text-slate-400 dark:bg-white/[0.03] dark:text-slate-500">Sin actividad registrada.</p>
      ) : (
        <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
          {activities.map(a => (
            <div key={a.id} className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5 text-[13px] leading-relaxed text-slate-600 dark:border-white/[0.05] dark:bg-white/[0.025] dark:text-slate-300">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-semibold capitalize text-slate-800 dark:text-slate-100">{a.type}</span>
                {a.channel ? <span className="text-slate-400">· {CHANNELS[a.channel] ?? a.channel}</span> : null}
                {a.outcome ? <span className="text-slate-400">· {a.outcome}</span> : null}
              </div>
              {a.body ? <p className="mt-1 text-slate-600 dark:text-slate-400">{a.body}</p> : null}
              <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">{fmtDateTime(a.created_at)}{a.created_by ? ` · ${profileName(profiles, a.created_by)}` : ''}</p>
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
    <div className="rounded-2xl border border-purple-200 bg-purple-50/70 p-4 dark:border-purple-500/20 dark:bg-purple-900/10">
      <p className="mb-1 text-sm font-bold text-purple-800 dark:text-purple-300">Conseguir al decisor</p>
      <p className="mb-3 text-[13px] leading-5 text-slate-600 dark:text-slate-400">Esta cuenta solo tiene datos generales. Identifica al decisor para convertirla en una oportunidad real.</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input value={full_name} onChange={e => setFn(e.target.value)} placeholder="Nombre completo *" className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-purple-400 dark:border-white/[0.12] dark:bg-[#1e2535] dark:text-slate-200" />
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Puesto" className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-purple-400 dark:border-white/[0.12] dark:bg-[#1e2535] dark:text-slate-200" />
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Correo directo" className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-purple-400 dark:border-white/[0.12] dark:bg-[#1e2535] dark:text-slate-200" />
        <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Teléfono directo" className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-purple-400 dark:border-white/[0.12] dark:bg-[#1e2535] dark:text-slate-200" />
      </div>
      <button onClick={() => onSave({ full_name, title, email, phone })} className="mt-3 h-10 rounded-xl bg-purple-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-purple-500">Marcar como prospecto →</button>
    </div>
  )
}

function DiscardPanel({ onConfirm, onCancel }: { onConfirm: (reason: string, recycle: string) => void; onCancel: () => void }) {
  const [reason, setReason] = useState('')
  const [recycle, setRecycle] = useState(addDaysISO(90))
  return (
    <div className="space-y-3 rounded-2xl border border-red-200 bg-red-50/70 p-4 dark:border-red-500/20 dark:bg-red-900/10">
      <p className="text-sm font-bold text-red-700 dark:text-red-300">Descartar prospecto</p>
      <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Motivo del descarte…" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-red-400 dark:border-white/[0.12] dark:bg-[#1e2535] dark:text-slate-200" />
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Reintentar el</label>
        <input type="date" value={recycle} onChange={e => setRecycle(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none dark:border-white/[0.12] dark:bg-[#1e2535] dark:text-slate-200" />
        <div className="flex-1" />
        <button onClick={onCancel} className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 dark:border-white/[0.12] dark:bg-white/[0.04] dark:text-slate-300">Cancelar</button>
        <button onClick={() => onConfirm(reason, recycle)} className="h-10 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-500">Descartar</button>
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
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500">Segmento</p>
          <select value={f.icp_segment} onChange={e => set('icp_segment', e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-700 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 dark:border-white/[0.12] dark:bg-[#1e2535] dark:text-slate-200">
            <option value="">Sin segmento</option>
            {Object.entries(SEGMENTS).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
          </select>
        </div>
        <Input label="Ciudad" value={f.company_city} onChange={v => set('company_city', v)} />
      </div>
      <div className="mt-3">
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500">Notas</p>
        <textarea value={f.notes} onChange={e => set('notes', e.target.value)} rows={3} placeholder="Contexto de la visita, quién atendió…" className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm leading-6 text-slate-700 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-200" />
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600 dark:border-white/[0.12] dark:text-slate-300">Cancelar</button>
        <button onClick={save} className="h-11 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500">Guardar prospecto</button>
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
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-black/20">
          <Tab active={channel === 'email'} onClick={() => { setChannel('email'); setTid('') }} label="Correo" />
          <Tab active={channel === 'whatsapp'} onClick={() => { setChannel('whatsapp'); setTid('') }} label="WhatsApp" />
        </div>
        <select value={tpl?.id ?? ''} onChange={e => setTid(e.target.value)} className="h-11 flex-1 rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-700 outline-none focus:border-indigo-400 dark:border-white/[0.12] dark:bg-[#1e2535] dark:text-slate-200">
          {applicable.length === 0 && <option value="">Sin plantillas para este canal</option>}
          {applicable.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      {tpl ? (
        <div className="space-y-4">
          {channel === 'email' && subject && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500">Asunto</p>
                <button onClick={() => copy('subj', subject)} className="h-8 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-500 dark:border-white/[0.12]">{copied === 'subj' ? 'Copiado' : 'Copiar'}</button>
              </div>
              <p className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-800 dark:border-white/[0.05] dark:bg-white/[0.04] dark:text-slate-100">{subject}</p>
            </div>
          )}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500">Mensaje</p>
              <button onClick={() => copy('body', bodyText)} className="h-8 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-500 dark:border-white/[0.12]">{copied === 'body' ? 'Copiado' : 'Copiar mensaje'}</button>
            </div>
            <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 font-sans text-sm leading-6 text-slate-700 dark:border-white/[0.05] dark:bg-white/[0.04] dark:text-slate-200">{bodyText}</pre>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[11px] text-slate-400 dark:bg-white/[0.03] dark:text-slate-500">
            <span className="truncate font-mono">{link}</span>
            <button onClick={() => copy('link', link)} className="h-7 shrink-0 rounded-lg border border-slate-200 px-2.5 text-[11px] font-semibold text-slate-500 dark:border-white/[0.12]">{copied === 'link' ? 'Copiado' : 'Copiar link'}</button>
          </div>
        </div>
      ) : (
        <p className="py-10 text-center text-sm text-slate-400">No hay plantillas para este canal todavía.</p>
      )}

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        {channel === 'email' && rec.email && (
          <a href={`mailto:${rec.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`} className="inline-flex h-11 items-center rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600 dark:border-white/[0.12] dark:text-slate-300">Abrir en correo</a>
        )}
        {channel === 'whatsapp' && rec.phone && (
          <a href={`https://wa.me/${rec.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(bodyText)}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600 dark:border-white/[0.12] dark:text-slate-300">Abrir en WhatsApp</a>
        )}
        <button onClick={() => onSent(channel)} className="h-11 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500">Marcar como enviado →</button>
      </div>
    </Modal>
  )
}

// ─── Átomos ──────────────────────────────────────────────────────────────────
function Modal({ children, onClose, title, subtitle }: { children: ReactNode; onClose: () => void; title: string; subtitle?: string }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-950/45 p-4 backdrop-blur-sm dark:bg-black/65 sm:p-8" onClick={onClose}>
      <div className="my-8 w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/[0.1] dark:bg-[#1a2030]" style={CARD_S} onClick={e => e.stopPropagation()}>
        <div className="mb-4">
          <h3 className="text-lg font-bold tracking-tight text-slate-950 dark:text-white">{title}</h3>
          {subtitle && <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  )
}
function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-t border-slate-200/80 pt-5 dark:border-white/[0.07]">
      <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">{label}</p>
      {children}
    </div>
  )
}
function Input({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500">{label}</p>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 dark:border-white/[0.12] dark:bg-[#1e2535] dark:text-slate-200" />
    </div>
  )
}
function StagePill({ active, label, color, onClick }: { active: boolean; label: string; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`min-h-8 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-all ${active ? 'border-transparent text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-white/[0.12] dark:bg-white/[0.025] dark:text-slate-300 dark:hover:bg-white/[0.06]'}`} style={active ? { background: color } : undefined}>
      {label}
    </button>
  )
}
function Tab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return <button aria-pressed={active} onClick={onClick} className={`h-8 flex-1 rounded-lg px-3.5 text-[13px] font-semibold transition-all sm:flex-none ${active ? 'bg-white text-slate-950 shadow-sm ring-1 ring-slate-200/70 dark:bg-white/10 dark:text-white dark:ring-white/[0.06]' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'}`}>{label}</button>
}
function PhaseBand({ label, sub, color, span }: { label: string; sub: string; color: string; span: number }) {
  const w = span * 292 + (span - 1) * 12
  return (
    <div style={{ width: w, background: `color-mix(in oklab, ${color} 6%, transparent)` }} className="flex min-h-10 items-center gap-2.5 rounded-xl border border-slate-200/60 px-3 py-2 dark:border-white/[0.06]">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] leading-tight text-slate-600 dark:text-slate-300">{label}</p>
        <p className="mt-0.5 truncate text-[10px] leading-tight text-slate-400 dark:text-slate-500">{sub}</p>
      </div>
    </div>
  )
}
function Pill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return <button aria-pressed={active} onClick={onClick} className={`h-9 rounded-xl border px-3 text-xs font-semibold transition-all ${active ? 'border-slate-900 bg-slate-900 text-white dark:border-white/15 dark:bg-white/10' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/[0.1] dark:bg-white/[0.025] dark:text-slate-300 dark:hover:bg-white/[0.06]'}`}>{label}</button>
}
function PipelineChoice({ active, label, sub, count, color, onClick }: {
  active: boolean
  label: string
  sub: string
  count: number
  color: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`relative flex min-h-[58px] items-center gap-3 overflow-hidden rounded-xl border px-3 text-left transition-all ${active ? 'border-slate-300 bg-slate-50 shadow-[0_5px_16px_rgba(15,23,42,0.08)] dark:border-white/15 dark:bg-white/[0.07]' : 'border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/80 dark:border-white/[0.07] dark:bg-white/[0.025] dark:hover:bg-white/[0.05]'}`}
    >
      {active && <span className="absolute inset-y-0 left-0 w-1" style={{ background: color }} />}
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white shadow-sm" style={{ background: color }}>{count}</span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-bold text-slate-900 dark:text-white">{label}</span>
        <span className="mt-0.5 block truncate text-[10px] text-slate-500 dark:text-slate-400">{sub}</span>
      </span>
    </button>
  )
}
function ManagementBadge({ ownerId, profiles, currentUserId }: { ownerId: string | null; profiles: Profile[]; currentUserId: string }) {
  const kind = managementKind(ownerId, currentUserId)
  if (kind === 'ai') {
    return (
      <span
        title="Gestionado por el Agente IA"
        className="inline-flex rounded-full p-px shadow-[0_0_12px_rgba(168,85,247,0.24)]"
        style={{ background: 'linear-gradient(110deg, #8b5cf6, #22d3ee, #f472b6, #f59e0b)' }}
      >
        <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-white px-2 text-[9px] font-bold uppercase tracking-[0.08em] text-violet-700 dark:bg-[#1e2535] dark:text-violet-200">
          <span className="text-[11px]">✦</span>
          Agente IA
        </span>
      </span>
    )
  }
  const name = kind === 'mine' ? 'Tú' : firstNameOf(profileName(profiles, ownerId))
  const styles = kind === 'mine'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 shadow-[0_0_12px_rgba(16,185,129,0.16)] dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300'
    : 'border-violet-200 bg-violet-50 text-violet-700 shadow-[0_0_12px_rgba(139,92,246,0.16)] dark:border-violet-400/20 dark:bg-violet-400/10 dark:text-violet-300'
  return (
    <span title={profileName(profiles, ownerId)} className={`inline-flex h-6 items-center gap-1.5 rounded-full border px-2 text-[9px] font-bold uppercase tracking-[0.08em] ${styles}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${kind === 'mine' ? 'bg-emerald-500 shadow-[0_0_7px_rgba(16,185,129,0.8)]' : 'bg-violet-500 shadow-[0_0_7px_rgba(139,92,246,0.8)]'}`} />
      {name}
    </span>
  )
}
function ManagementLegend() {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-fuchsia-200 bg-white px-2 text-[9px] font-bold uppercase tracking-[0.08em] text-violet-700 shadow-[0_0_12px_rgba(168,85,247,0.13)] dark:border-fuchsia-400/20 dark:bg-white/[0.04] dark:text-violet-200">
        <span className="text-[11px]">✦</span> IA
      </span>
      <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 text-[9px] font-bold uppercase tracking-[0.08em] text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Tú
      </span>
      <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2 text-[9px] font-bold uppercase tracking-[0.08em] text-violet-700 dark:border-violet-400/20 dark:bg-violet-400/10 dark:text-violet-300">
        <span className="h-1.5 w-1.5 rounded-full bg-violet-500" /> Equipo
      </span>
    </div>
  )
}
function ManagementMetric({ kind, label, value, sub }: { kind: ManagementKind; label: string; value: number; sub: string }) {
  const aura = kind === 'ai'
    ? 'linear-gradient(125deg, #8b5cf6, #22d3ee, #f472b6, #f59e0b)'
    : kind === 'mine'
      ? 'linear-gradient(125deg, #10b981, #34d399)'
      : 'linear-gradient(125deg, #8b5cf6, #c084fc)'
  const icon = kind === 'ai' ? '✦' : kind === 'mine' ? '●' : '◆'
  return (
    <div className="relative isolate rounded-[22px] p-px" style={{ background: aura }}>
      <span className={`pointer-events-none absolute -inset-1 z-0 rounded-[24px] opacity-20 blur-xl ${kind === 'ai' ? 'animate-pulse' : ''}`} style={{ background: aura }} />
      <div className="relative z-10 flex min-h-[116px] items-center gap-4 rounded-[21px] bg-white p-4 shadow-[0_10px_25px_rgba(15,23,42,0.07)] dark:bg-[#171d2b]">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-lg font-bold text-white shadow-md" style={{ background: aura }}>{icon}</span>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-1 text-3xl font-bold tracking-[-0.04em] text-slate-950 dark:text-white">{value}</p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{sub}</p>
        </div>
      </div>
    </div>
  )
}
function AiAgentNotice({ record, pendingCount, onReview }: {
  record: CrmRecord | null
  pendingCount: number
  onReview?: () => void
}) {
  const isExample = !record
  return (
    <div
      className="relative isolate rounded-[23px] p-px shadow-[0_18px_42px_rgba(15,23,42,0.2)]"
      style={{ background: 'linear-gradient(125deg, #8b5cf6, #22d3ee, #f472b6, #f59e0b)' }}
    >
      <div
        className="pointer-events-none absolute -inset-2 z-0 animate-pulse rounded-[28px] opacity-45 blur-2xl"
        style={{ background: 'linear-gradient(125deg, #8b5cf6, #22d3ee, #f472b6, #f59e0b)' }}
      />
      <div className="relative z-10 h-full overflow-hidden rounded-[22px] bg-slate-950 p-5 text-white">
        <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-indigo-500/40 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-12 left-1/4 h-32 w-32 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-1/4 h-24 w-24 rounded-full bg-fuchsia-500/15 blur-2xl" />
        <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/20 bg-gradient-to-br from-violet-500/35 via-cyan-400/20 to-fuchsia-400/30 text-lg text-white shadow-[0_0_28px_rgba(129,140,248,0.4)]">✦</span>
            <div>
              <p className="text-[13px] font-semibold">Agente IA de ventas</p>
              <p className="text-[10px] text-cyan-100/60">Monitoreo de intervención</p>
            </div>
          </div>
          <span className="relative flex h-7 min-w-7 items-center justify-center rounded-full border border-fuchsia-300/25 bg-fuchsia-400/15 px-2 text-[11px] font-bold text-fuchsia-100">
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-pulse rounded-full border-2 border-slate-950 bg-fuchsia-400" />
            {Math.max(pendingCount, 1)}
          </span>
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.07] p-4 backdrop-blur-sm">
          <div className="mb-2 flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-fuchsia-400 shadow-[0_0_12px_rgba(232,121,249,0.9)]" />
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-fuchsia-200">
              {isExample ? 'Notificación de ejemplo' : 'Intervención recomendada'}
            </span>
          </div>
          <p className="text-sm font-semibold leading-5 text-white">
            {record ? `Revisa a ${record.name}` : 'Un prospecto mostró intención de compra'}
          </p>
          <p className="mt-1.5 text-[11px] leading-5 text-slate-300">
            {record
              ? `${record.nextAction ?? 'Tiene una acción comercial pendiente.'}${pendingCount > 1 ? ` Hay ${pendingCount - 1} avisos adicionales.` : ''}`
              : 'El agente pausaría la automatización y avisaría al vendedor para que tome la conversación.'}
          </p>
          {record && onReview ? (
            <button onClick={onReview} className="mt-3 inline-flex h-8 items-center rounded-lg bg-white px-3 text-[11px] font-semibold text-slate-950 transition-colors hover:bg-indigo-50">
              Revisar oportunidad
            </button>
          ) : (
            <span className="mt-3 inline-flex rounded-lg border border-white/10 bg-white/[0.05] px-2.5 py-1.5 text-[10px] font-medium text-slate-300">
              Vista previa del agente
            </span>
          )}
        </div>
      </div>
      </div>
    </div>
  )
}
function Kpi({ label, value, sub, tint }: { label: string; value: string; sub: string; tint: string }) {
  return (
    <div className="relative min-h-[96px] overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-50 to-white px-3.5 py-3.5 shadow-[0_5px_16px_rgba(15,23,42,0.05)] dark:border-white/[0.06] dark:from-white/[0.05] dark:to-white/[0.025] sm:px-4">
      <span className="pointer-events-none absolute -right-7 -top-9 h-24 w-24 rounded-full opacity-[0.11] blur-2xl" style={{ background: tint }} />
      <div className="relative flex items-center gap-2">
        <span className="h-1.5 w-5 rounded-full" style={{ background: tint }} />
        <p className="truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500">{label}</p>
      </div>
      <p className="relative mt-2.5 truncate text-2xl font-bold leading-none tracking-[-0.035em] text-slate-950 dark:text-white">{value}</p>
      <p className="relative mt-1.5 truncate text-[10px] font-medium text-slate-500 dark:text-slate-400">{sub}</p>
    </div>
  )
}
function DrawerField({ label, value, href }: { label: string; value: string | null; href?: string }) {
  if (!value) return null
  return (
    <div className="flex min-h-9 items-center justify-between gap-4 border-b border-slate-100 pb-2 last:border-0 last:pb-0 dark:border-white/[0.05]">
      <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500">{label}</span>
      {href ? <a href={href} target="_blank" rel="noopener noreferrer" className="truncate text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400">{value}</a> : <span className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{value}</span>}
    </div>
  )
}
