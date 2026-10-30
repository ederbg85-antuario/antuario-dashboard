'use client'
import CommerceShell from './CommerceShell'
import CommercialDistribution from './CommercialDistribution'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { CARD_S, EmptyState } from '@/components/ui/dashboard'

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
  subtotal: number
  tax_rate: number
  tax_amount: number
  total: number
  billing_type: string
  duration_months: number
  first_contact_at: string | null
  meeting_at: string | null
  phases: Phase[]
  kpis: Kpi[]
  packages: PackagesData
  notes: string | null
  terms_and_conditions: string | null
  pdf_url: string | null
  presented_at: string | null
  decided_at: string | null
  next_followup_on?: string | null
  next_action?: string | null
  source_channel: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

type ProposalItem = {
  id: string
  proposal_id: string
  concept: string
  description: string | null
  quantity: number
  unit_price: number
  total: number
  sort_order: number
}

// Fase del cronograma del proyecto y KPI/objetivo (guardados como jsonb en proposals)
type Phase = { name: string; detail: string; from_month: number; to_month: number }
type Kpi = { name: string; target: string; note: string }

// Esquema de PAQUETES (jsonb en proposals.packages): rutas de inicio y plazo.
// Si es null, la propuesta usa el esquema de iguala simple.
type PkgPlan = {
  id: string; name: string; includes: string
  recurring: number        // gestión mensual NETA (ya con descuento de bienvenida)
  recurringNormal: number  // valor mensual normal al renovar (descuento vencido)
  devBundle: number        // desarrollo (one-time) que se difiere en el plazo
  recommended?: boolean    // plan sugerido (fila destacada)
}
type PkgProject = { id: string; name: string; detail: string; price: number }
type PackagesData = { terms: number[]; plans: PkgPlan[]; projects?: PkgProject[]; recommendedTerm?: number } | null

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
  initialItems: ProposalItem[]
  initialChanges: ProposalChange[]
  contacts: Contact[]
  profiles: Profile[]
  orgBranding: OrgBranding
}

// ─── Etapas del pipeline de propuestas ────────────────────────────────────────

type Stage = { value: string; label: string; short: string; pill: string; dot: string; desc: string }

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
const TAX_OPTIONS = [0, 8, 16]
const BUCKET = 'proposal-files'

// Plantilla estándar de alianza anual: se vende capacidad para mover resultados,
// no una cuota rígida de entregables.
const TEMPLATE_ITEMS = [
  'Dirección estratégica, de cuenta y accountability',
  'Estrategia y gestión de campañas',
  'Contenido y operación de redes sociales',
  'Agente IA de atención comercial',
  'Sistema integral y tablero de medición',
  'Ecommerce nativo, mantenimiento y optimización',
  'SEO, DEO y optimización de conversión',
]

const TEMPLATE_ITEM_DESCRIPTIONS = [
  'Objetivos, priorización, seguimiento, análisis mensual y un responsable central.',
  'Meta Ads y Google Ads, pruebas, creativos, optimización y reporte.',
  'Planeación, producción, publicación y gestión adaptadas al rendimiento.',
  'Atención inicial, respuestas y guía de compra por WhatsApp.',
  'Datos de marketing y ventas disponibles 24/7, según el alcance contratado.',
  'Desarrollo incluido dentro de la alianza; mejora mensual del recorrido.',
  'Arquitectura para buscadores y sistemas de respuesta con IA; trabajo continuo.',
]

const TEMPLATE_ITEM_AMOUNTS = [4200, 4000, 4200, 2000, 2500, 3000, 1800]

const TEMPLATE_SOLUTION = 'Antuario asume la dirección y ejecución del sistema de demanda durante 12 meses: estrategia, campañas, contenido, redes, atención por WhatsApp, medición y optimización. La ruta integral agrega ecommerce nativo y un sistema a la medida que centraliza el embudo y queda preparado para integrar nuevas áreas y agentes de IA.'

const TEMPLATE_OBJECTIVE = 'Aumentar las ventas atribuibles y mejorar mes con mes la eficiencia del embudo. Las metas numéricas se fijan después de auditar la línea base, el ticket promedio, el margen, la conversión actual, el inventario y el presupuesto de pauta.'

const TEMPLATE_SCOPE = 'Alianza anual con estrategia y ejecución continua. La mezcla y frecuencia de contenido se adaptan a los resultados. Incluye gestión de Meta Ads y Google Ads hasta $40,000 MXN mensuales de pauta; el presupuesto publicitario se paga directamente a las plataformas. El sistema cubre únicamente las áreas descritas. Integraciones, automatizaciones o módulos futuros se cotizan por alcance.'

// Cronograma estándar de un proyecto anual. La operación puede generar ventas
// desde el lanzamiento; la estabilidad se construye con prueba y optimización.
const PHASE_TEMPLATE: Phase[] = [
  { name: 'Fundación y línea base', detail: 'Auditoría, objetivo compartido, KPIs, responsables, arquitectura de medición y estrategia.', from_month: 1, to_month: 1 },
  { name: 'Desarrollo e implementación', detail: 'Preparación de activos, sistema, medición, contenidos, campañas y agente según el alcance.', from_month: 1, to_month: 2 },
  { name: 'Lanzamiento y primeras ventas atribuibles', detail: 'Puesta en marcha de canales y aprendizaje inicial con datos reales.', from_month: 2, to_month: 3 },
  { name: 'Operación y producción continua', detail: 'Contenido, campañas, atención y mantenimiento de activos con cadencia adaptativa.', from_month: 2, to_month: 12 },
  { name: 'Medición, experimentación y optimización', detail: 'Ciclos mensuales para probar, aprender, reasignar inversión y mejorar el embudo.', from_month: 2, to_month: 12 },
  { name: 'Consolidación y plan del segundo año', detail: 'Evaluación del ciclo, aprendizajes, oportunidades de expansión y ajuste del modelo comercial.', from_month: 10, to_month: 12 },
]

// KPIs de negocio. Los targets se acuerdan después de establecer la línea base.
const KPI_TEMPLATE: Kpi[] = [
  { name: 'Ventas atribuibles', target: 'Crecimiento contra la línea base', note: 'Meta exacta después de auditoría' },
  { name: 'Costo por compra (CPA)', target: 'Mejora mensual hacia el rango acordado', note: 'Depende de margen, ticket y pauta' },
  { name: 'Retorno sobre pauta (ROAS)', target: 'Objetivo acordado por categoría', note: 'Separar adquisición y posicionamiento' },
  { name: 'Conversión del sitio (CVR)', target: 'Mejora contra la línea base', note: 'Medición completa en sistema nativo' },
  { name: 'Ticket promedio', target: 'Mantener o crecer según estrategia', note: '' },
  { name: 'Contactos y recurrencia en CRM', target: 'Crecimiento y seguimiento medible', note: 'Según accesos e integraciones' },
]

const DEFAULT_TERMS = `• Todos los precios son más IVA. Los pagos de la iguala son al inicio de cada periodo.
• Los precios de cada concepto están pensados como paquete; si se quita o se contrata algo por separado, este desglose no aplica y se recotiza.
• El contrato inicial es de 12 meses con una iguala mensual fija durante el primer año. El segundo año puede ajustar alcance y modelo de cobro según resultados.
• La pauta publicitaria no está incluida: se paga directamente a las plataformas. La gestión incluida cubre hasta $40,000 MXN mensuales de pauta; arriba de ese monto se ajusta el fee.
• La frecuencia y mezcla de publicaciones se adaptan a los resultados. Producciones especiales, influencers, talento, locaciones y medios se pagan o cotizan por separado.
• El sistema se desarrolla a la medida y su uso está incluido durante el contrato. La iguala cubre mantenimiento de las áreas descritas; nuevas áreas, integraciones y automatizaciones se cotizan por alcance. Existe opción de compra o transferencia posterior.
• Los objetivos y KPIs se definen con precisión después de establecer una línea base confiable. Antuario responde por la estrategia, ejecución, medición y optimización de las áreas bajo su control.
• La aprobación de anuncios, la disponibilidad de inventario, la legalidad y documentación de productos, precios, márgenes, atención humana y cumplimiento de pedidos dependen del cliente y de terceros.
• El periodo no se pausa si se exceden las fechas de pago acordadas, salvo convenio escrito.
• Propuesta inicial (v1), ajustable antes de firma. Después del primer año se revisan resultados, alcance y condiciones.
• Para arrancar: acordamos términos y fechas de pago → contrato → firma → primera factura → primer pago → inicia el cronograma del proyecto.`

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMoney(n: number, currency = 'MXN', compact = false) {
  if (compact && Math.abs(n) >= 1000) {
    return `${currency === 'USD' ? 'US$' : '$'}${(n / 1000).toLocaleString('es-MX', { maximumFractionDigits: 1 })}k`
  }
  return `${currency === 'USD' ? 'US$' : '$'}${(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function formatDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

function toDateInput(s: string | null) {
  return s ? s.slice(0, 10) : ''
}
function fromDateInput(s: string) {
  return s ? new Date(`${s}T12:00:00`).toISOString() : null
}
function daysBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null
  const d = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
  return d >= 0 ? d : null
}

function proposalValues(billing: string, amount: number, duration: number) {
  const monthly = billing === 'monthly' ? amount : 0
  const contract = billing === 'monthly' ? amount * (duration || 0) : amount
  const annual = billing === 'monthly' ? amount * 12 : amount
  return { monthly, contract, annual }
}

// ─── Paquetes ────────────────────────────────────────────────────────────────
// Mensualidad de un plan en un plazo = gestión neta + (desarrollo diferido / plazo).
function pkgMonthly(plan: { recurring: number; devBundle: number }, term: number) {
  return Math.round(plan.recurring + (term > 0 ? plan.devBundle / term : 0))
}
function hasPackages(pk: PackagesData): pk is NonNullable<PackagesData> {
  return !!pk && Array.isArray(pk.plans) && pk.plans.length > 0
}
const EMPTY_PACKAGES = { terms: [12], plans: [], projects: [], recommendedTerm: 12 } as NonNullable<PackagesData>

// Escalera estándar del nuevo modelo: marketing primero y una infraestructura
// cada vez más completa. Los importes sirven como base editable.
const PACKAGES_TEMPLATE: NonNullable<PackagesData> = {
  terms: [12],
  recommendedTerm: 12,
  plans: [
    { id: 'performance', name: 'Performance', includes: 'Campañas, creativos y contenido publicitario. Medición dentro de las plataformas disponibles.', recurring: 12900, recurringNormal: 12900, devBundle: 0 },
    { id: 'demanda-360', name: 'Demanda 360', includes: 'Marketing completo, redes, agente de atención y tablero de marketing conservando la plataforma actual.', recurring: 17300, recurringNormal: 17300, devBundle: 0 },
    { id: 'comercio-integral', name: 'Comercio integral', includes: 'Marketing 360, ecommerce nativo, agente, CRM, SEO/DEO, optimización web y sistema integral.', recurring: 21700, recurringNormal: 21700, devBundle: 0, recommended: true },
  ],
  projects: [],
}

function tempId() { return Math.random().toString(36).slice(2) }

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

type ItemRow = { key: string; concept: string; description: string; amount: string }
type PhaseRow = { key: string; name: string; detail: string; from_month: string; to_month: string }
type KpiRow = { key: string; name: string; target: string; note: string }

type Draft = {
  contact_id: string
  title: string
  client_need: string
  proposed_solution: string
  objective: string
  scope: string
  amount: string
  currency: string
  taxRate: string
  billingType: string
  durationMonths: string
  firstContactAt: string
  meetingAt: string
  items: ItemRow[]
  phases: PhaseRow[]
  kpis: KpiRow[]
  packages: PackagesData
  terms: string
  notes: string
  source_channel: string
  stage: string
}

const EMPTY_DRAFT: Draft = {
  contact_id: '', title: '', client_need: '', proposed_solution: '',
  objective: '', scope: '', amount: '', currency: 'MXN', taxRate: '16',
  billingType: 'monthly', durationMonths: '12', firstContactAt: '', meetingAt: '',
  items: [], phases: [], kpis: [], packages: null, terms: DEFAULT_TERMS, notes: '', source_channel: '', stage: 'documentando',
}

function draftFromProposal(p: Proposal, items: ProposalItem[]): Draft {
  return {
    contact_id: p.contact_id ?? '',
    title: p.title ?? '',
    client_need: p.client_need ?? '',
    proposed_solution: p.proposed_solution ?? '',
    objective: p.objective ?? '',
    scope: p.scope ?? '',
    amount: p.amount ? String(p.amount) : '',
    currency: p.currency ?? 'MXN',
    taxRate: p.tax_rate != null ? String(p.tax_rate) : '16',
    billingType: p.billing_type ?? 'monthly',
    durationMonths: p.duration_months != null ? String(p.duration_months) : '12',
    firstContactAt: toDateInput(p.first_contact_at),
    meetingAt: toDateInput(p.meeting_at),
    items: items
      .filter(it => it.proposal_id === p.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(it => ({ key: it.id, concept: it.concept, description: it.description ?? '', amount: String(it.unit_price ?? it.total ?? 0) })),
    phases: (p.phases ?? []).map(ph => ({ key: tempId(), name: ph.name ?? '', detail: ph.detail ?? '', from_month: String(ph.from_month ?? 1), to_month: String(ph.to_month ?? 1) })),
    kpis: (p.kpis ?? []).map(k => ({ key: tempId(), name: k.name ?? '', target: k.target ?? '', note: k.note ?? '' })),
    packages: p.packages ?? null,
    terms: p.terms_and_conditions ?? DEFAULT_TERMS,
    notes: p.notes ?? '',
    source_channel: p.source_channel ?? '',
    stage: p.stage ?? 'documentando',
  }
}

function computeTotals(items: ItemRow[], manualAmount: string, taxRate: string) {
  const rows = items.filter(r => r.concept.trim())
  const itemsSum = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)
  const subtotal = rows.length ? itemsSum : (parseFloat(manualAmount) || 0)
  const rate = parseFloat(taxRate) || 0
  const tax = Number((subtotal * rate / 100).toFixed(2))
  return { subtotal, tax, total: subtotal + tax, hasItems: rows.length > 0 }
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PropuestasClient({
  orgId, currentUserId,
  initialProposals, initialItems, initialChanges,
  contacts, orgBranding,
}: Props) {
  const [proposals, setProposals] = useState<Proposal[]>(initialProposals)
  const [allItems, setAllItems] = useState<ProposalItem[]>(initialItems)
  const [changes, setChanges] = useState<ProposalChange[]>(initialChanges)

  const [stageFilter, setStageFilter] = useState('all')
  const [search, setSearch] = useState('')

  const [selectedId, setSelectedId] = useState<string | null>(null)
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

  // ── Métricas de valor y desempeño ─────────────────────────────────────────────
  const metrics = useMemo(() => {
    const active = proposals.filter(p => !['aceptada','rechazada'].includes(p.stage))
    let mrr = 0, annual = 0, contract = 0
    for (const p of active) {
      const v = proposalValues(p.billing_type, p.amount || 0, p.duration_months)
      mrr += v.monthly; annual += v.annual; contract += v.contract
    }
    const won = proposals.filter(p => p.stage === 'aceptada').length
    const lost = proposals.filter(p => p.stage === 'rechazada').length
    const closeRate = won + lost > 0 ? Math.round((won / (won + lost)) * 100) : null
    const closed = proposals.filter(p => p.decided_at)
    const closeDays = closed
      .map(p => daysBetween(p.first_contact_at ?? p.created_at, p.decided_at))
      .filter((d): d is number => d != null)
    const avgClose = closeDays.length ? Math.round(closeDays.reduce((a, b) => a + b, 0) / closeDays.length) : null
    const wonValue = proposals.filter(p => p.stage === 'aceptada')
      .reduce((s, p) => s + proposalValues(p.billing_type, p.amount || 0, p.duration_months).contract, 0)
    return { mrr, annual, contract, closeRate, avgClose, wonValue, activeCount: active.length }
  }, [proposals])


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
    setSelectedId(null); setDraft(EMPTY_DRAFT); setError(''); setDrawerOpen(true)
  }, [])
  const openProposal = useCallback((p: Proposal) => {
    setSelectedId(p.id); setDraft(draftFromProposal(p, allItems)); setError(''); setDrawerOpen(true)
  }, [allItems])
  const closeDrawer = useCallback(() => {
    setDrawerOpen(false); setTimeout(() => setSelectedId(null), 200)
  }, [])

  // ── Guardar (insert / update) ─────────────────────────────────────────────────
  const save = useCallback(async () => {
    if (!draft.title.trim()) { setError('Ponle un título a la propuesta.'); return }
    setSaving(true); setError('')
    const supabase = getSupabase()
    const now = new Date().toISOString()
    const { subtotal, tax, total } = computeTotals(draft.items, draft.amount, draft.taxRate)

    const prev = selected
    const presented_at = (['presentada', 'cambios', 'aceptada', 'rechazada'].includes(draft.stage))
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
      amount: subtotal,
      currency: draft.currency,
      subtotal,
      tax_rate: parseFloat(draft.taxRate) || 0,
      tax_amount: tax,
      total,
      billing_type: draft.billingType,
      duration_months: parseInt(draft.durationMonths) || 0,
      first_contact_at: fromDateInput(draft.firstContactAt),
      meeting_at: fromDateInput(draft.meetingAt),
      phases: draft.phases
        .filter(p => p.name.trim())
        .map(p => ({ name: p.name.trim(), detail: p.detail.trim(), from_month: parseInt(p.from_month) || 1, to_month: parseInt(p.to_month) || (parseInt(p.from_month) || 1) })),
      kpis: draft.kpis
        .filter(k => k.name.trim())
        .map(k => ({ name: k.name.trim(), target: k.target.trim(), note: k.note.trim() })),
      packages: hasPackages(draft.packages)
        ? {
            terms: draft.packages.terms.filter(n => n > 0),
            recommendedTerm: draft.packages.recommendedTerm ?? null,
            plans: draft.packages.plans
              .filter(pl => pl.name.trim())
              .map(pl => ({ id: pl.id, name: pl.name.trim(), includes: pl.includes.trim(), recurring: pl.recurring || 0, recurringNormal: pl.recurringNormal || 0, devBundle: pl.devBundle || 0, recommended: !!pl.recommended })),
            projects: (draft.packages.projects ?? []).filter(pr => pr.name.trim()).map(pr => ({ id: pr.id, name: pr.name.trim(), detail: pr.detail.trim(), price: pr.price || 0 })),
          }
        : null,
      terms_and_conditions: draft.terms.trim() || null,
      notes: draft.notes.trim() || null,
      source_channel: draft.source_channel.trim() || null,
      stage: draft.stage,
      status: STAGE_TO_STATUS[draft.stage] ?? 'draft',
      presented_at,
      decided_at,
      updated_at: now,
    }

    let proposalId = selectedId
    if (selectedId) {
      const { data, error: e } = await supabase.from('proposals').update(payload).eq('id', selectedId).select().single()
      if (e) { setError(e.message); setSaving(false); return }
      setProposals(prev => prev.map(p => p.id === selectedId ? data as Proposal : p))
    } else {
      const { data, error: e } = await supabase.from('proposals')
        .insert({ ...payload, assigned_to: currentUserId, created_by: currentUserId }).select().single()
      if (e) { setError(e.message); setSaving(false); return }
      const created = data as Proposal
      proposalId = created.id
      setProposals(prev => [created, ...prev])
      setSelectedId(created.id)
    }

    if (proposalId) {
      await supabase.from('proposal_items').delete().eq('proposal_id', proposalId)
      const rows = draft.items.filter(r => r.concept.trim()).map((r, i) => ({
        organization_id: orgId, proposal_id: proposalId!, concept: r.concept.trim(),
        description: r.description.trim() || null, quantity: 1,
        unit_price: parseFloat(r.amount) || 0, total: parseFloat(r.amount) || 0, sort_order: i,
      }))
      const pid = proposalId
      if (rows.length) {
        const { data: ins } = await supabase.from('proposal_items').insert(rows).select()
        setAllItems(prev => [...prev.filter(it => it.proposal_id !== pid), ...((ins as ProposalItem[]) ?? [])])
      } else {
        setAllItems(prev => prev.filter(it => it.proposal_id !== pid))
      }
    }
    setSaving(false)
  }, [draft, selected, selectedId, orgId, currentUserId])

  const setStage = useCallback((stage: string) => setDraft(d => ({ ...d, stage })), [])

  const removeProposal = useCallback(async (p: Proposal) => {
    if (!confirm(`¿Eliminar la propuesta "${p.title}"? Esta acción no se puede deshacer.`)) return
    const supabase = getSupabase()
    if (p.pdf_url) await supabase.storage.from(BUCKET).remove([p.pdf_url])
    await supabase.from('proposal_items').delete().eq('proposal_id', p.id)
    await supabase.from('proposals').delete().eq('id', p.id)
    setProposals(prev => prev.filter(x => x.id !== p.id))
    setAllItems(prev => prev.filter(x => x.proposal_id !== p.id))
    setChanges(prev => prev.filter(x => x.proposal_id !== p.id))
    closeDrawer()
  }, [closeDrawer])

  return (
    <CommerceShell title="Propuestas" variant="proposals" metrics={[
        {label:'Abiertas',value:String(metrics.activeCount),note:`${counts.all} registradas`},
        {label:'Cotizado abierto',value:formatMoney(proposals.filter(p=>!['aceptada','rechazada'].includes(p.stage)&&p.currency==='MXN').reduce((n,p)=>n+Number(p.total),0)),note:'MXN · no equivale a ingresos'},
        {label:'Tasa de cierre',value:metrics.closeRate===null?'—':`${metrics.closeRate}%`,note:`${counts.aceptada??0} ganadas · ${counts.rechazada??0} perdidas`},
        {label:'Días a cierre',value:metrics.avgClose??'—',note:'Con fechas registradas'}
      ]} actions={<button className="op-button" onClick={openCreate}>＋ Nueva propuesta</button>} note="Propuestas registradas · todos los periodos. Cierre sobre decisiones registradas.">
      <div className="commerce-proposal-insights"><CommercialDistribution title="Etapas de las propuestas" rows={STAGES.map(st=>({name:st.short,value:counts[st.value]??0}))} note="Registros por etapa · sin convertir cotizaciones en ingreso"/><article className="op-card commerce-followup-focus"><span className="op-eyebrow">SEGUIMIENTO</span><h2>Lo próximo por resolver</h2><div><strong>{proposals.filter(p=>!['aceptada','rechazada'].includes(p.stage)&&!p.next_action?.trim()).length}</strong><span>sin siguiente acción</span></div><div><strong>{proposals.filter(p=>!['aceptada','rechazada'].includes(p.stage)&&p.next_followup_on&&p.next_followup_on<new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City'}).format(new Date())).length}</strong><span>seguimientos vencidos</span></div></article></div>
      <details className="rounded-3xl bg-white dark:bg-[#161b27] p-5" style={CARD_S}>
        <summary className="cursor-pointer text-sm font-semibold">Siguientes pasos comerciales · {metrics.activeCount} oportunidades</summary>
        <p className="text-[10px] text-slate-500 my-3">Seguimiento manual · envíos aún desactivados</p>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{proposals.filter(p=>!['aceptada','rechazada'].includes(p.stage)).map(p=><CommercialFollowUp key={p.id} proposal={p} onUpdate={patch=>setProposals(prev=>prev.map(row=>row.id===p.id?{...row,...patch}:row))} onOpen={()=>openProposal(p)}/>)}</div>
      </details>

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
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente o título…"
              className="w-full sm:w-56 pl-9 pr-3 py-2 text-sm rounded-xl bg-white dark:bg-[#161b27] border border-slate-200 dark:border-white/[0.08] text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-white/10" />
          </div>

        </div>
      </div>

      {/* ── Grid de fichas ───────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="rounded-3xl bg-white dark:bg-[#161b27] py-10" style={CARD_S}>
          <EmptyState message={proposals.length === 0 ? 'Aún no hay propuestas. Crea la primera ficha.' : 'No hay propuestas en esta etapa.'} />
        </div>
      ) : (
        <div className="commerce-proposal-grid">
          {filtered.map(p => (
            <ProposalCard key={p.id} p={p} contact={p.contact_id ? contactsById[p.contact_id] : null}
              pendingChanges={changes.filter(c => c.proposal_id === p.id && !c.resolved).length}
              onClick={() => openProposal(p)} />
          ))}
        </div>
      )}

      {/* ── Drawer ────────────────────────────────────────────────────────────── */}
      {drawerOpen && (
        <ProposalDrawer
          orgId={orgId} currentUserId={currentUserId} isNew={!selectedId} proposal={selected}
          draft={draft} setDraft={setDraft} setStage={setStage}
          contacts={contacts} contactsById={contactsById} orgBranding={orgBranding}
          changes={changes.filter(c => selectedId && c.proposal_id === selectedId)}
          saving={saving} error={error} onSave={save} onClose={closeDrawer}
          onDelete={selected ? () => removeProposal(selected) : undefined}
          onProposalPatch={(patch) => { if (selectedId) setProposals(prev => prev.map(p => p.id === selectedId ? { ...p, ...patch } : p)) }}
          onChangesPatch={setChanges}
        />
      )}
    </CommerceShell>
  )
}

// ─── Tarjetas de KPI ─────────────────────────────────────────────────────────

function FilterChip({ label, count, active, onClick, dot }: { label: string; count: number; active: boolean; onClick: () => void; dot?: string }) {
  return (
    <button onClick={onClick}
      className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${active ? 'bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-900' : 'bg-white dark:bg-[#161b27] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.04]'}`}
      style={active ? undefined : CARD_S}>
      {dot && <span className="w-1.5 h-1.5 rounded-full" style={{ background: dot }} />}
      {label}
      <span className={`text-[10px] ${active ? 'opacity-70' : 'text-slate-400'}`}>{count}</span>
    </button>
  )
}

// ─── Tarjeta de propuesta ──────────────────────────────────────────────────────

function ProposalCard({ p, contact, pendingChanges, onClick }: { p: Proposal; contact: Contact | null; pendingChanges: number; onClick: () => void }) {
  const st = STAGE_MAP[p.stage] ?? STAGES[0]
  const v = proposalValues(p.billing_type, p.amount || 0, p.duration_months)
  const isMonthly = p.billing_type === 'monthly'
  const pk = p.packages
  const pkgFrom = hasPackages(pk)
    ? Math.min(...pk.plans.flatMap(pl => pk.terms.map(t => pkgMonthly(pl, t))))
    : null
  return (
    <button onClick={onClick}
      className="commerce-proposal-card"
      style={CARD_S}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full ${st.pill}`}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.dot }} />
          {st.label}
        </span>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-slate-400">
            {isMonthly ? 'Mensual' : 'Único'}
          </span>
          {p.pdf_url && (
            <span title="Tiene PDF guardado" className="text-slate-400 dark:text-slate-500">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            </span>
          )}
        </div>
      </div>

      <p className="text-[15px] font-bold text-slate-900 dark:text-white leading-snug line-clamp-2">{p.title}</p>
      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 truncate">
        {contact ? (contact.company ? `${contact.full_name} · ${contact.company}` : contact.full_name) : 'Sin contacto vinculado'}
      </p>

      <div className="mt-4 flex items-end justify-between">
        <div>
          {pkgFrom != null ? (
            <>
              <p className="text-lg font-extrabold text-slate-900 dark:text-white tabular-nums leading-none">
                <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 mr-1">desde</span>
                {formatMoney(pkgFrom, p.currency)}
                <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 ml-1">/mes + IVA</span>
              </p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                {hasPackages(pk) ? `${pk.plans.length} paquete${pk.plans.length > 1 ? 's' : ''} · plazos ${pk.terms.join('/')} m` : ''}
              </p>
            </>
          ) : p.amount > 0 ? (
            <>
              <p className="text-lg font-extrabold text-slate-900 dark:text-white tabular-nums leading-none">
                {formatMoney(p.amount, p.currency)}
                <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 ml-1">{isMonthly ? '/mes' : 'único'}{p.tax_rate > 0 ? ' + IVA' : ''}</span>
              </p>
              {isMonthly && (
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                  Contrato {formatMoney(v.contract, p.currency, true)} · {p.duration_months} meses
                </p>
              )}
            </>
          ) : (
            <p className="text-lg font-extrabold text-slate-300 dark:text-slate-600">Por definir</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
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
}

// ─── Drawer ─────────────────────────────────────────────────────────────────────

function ProposalDrawer({
  orgId, currentUserId, isNew, proposal, draft, setDraft, setStage,
  contacts, contactsById, orgBranding, changes,
  saving, error, onSave, onClose, onDelete, onProposalPatch, onChangesPatch,
}: {
  orgId: number; currentUserId: string; isNew: boolean; proposal: Proposal | null
  draft: Draft; setDraft: React.Dispatch<React.SetStateAction<Draft>>; setStage: (s: string) => void
  contacts: Contact[]; contactsById: Record<string, Contact>; orgBranding: OrgBranding
  changes: ProposalChange[]; saving: boolean; error: string
  onSave: () => void; onClose: () => void; onDelete?: () => void
  onProposalPatch: (patch: Partial<Proposal>) => void
  onChangesPatch: React.Dispatch<React.SetStateAction<ProposalChange[]>>
}) {
  const contact = draft.contact_id ? contactsById[draft.contact_id] : null
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft(d => ({ ...d, [k]: v }))

  const totals = useMemo(() => computeTotals(draft.items, draft.amount, draft.taxRate), [draft.items, draft.amount, draft.taxRate])
  const values = useMemo(
    () => proposalValues(draft.billingType, totals.subtotal, parseInt(draft.durationMonths) || 0),
    [draft.billingType, draft.durationMonths, totals.subtotal]
  )

  const addItem = () => setDraft(d => ({ ...d, items: [...d.items, { key: tempId(), concept: '', description: '', amount: '' }] }))
  const updateItem = (key: string, field: 'concept' | 'description' | 'amount', v: string) =>
    setDraft(d => ({ ...d, items: d.items.map(it => it.key === key ? { ...it, [field]: v } : it) }))
  const removeItem = (key: string) => setDraft(d => ({ ...d, items: d.items.filter(it => it.key !== key) }))
  const loadTemplate = () => setDraft(d => ({
    ...d,
    billingType: 'monthly',
    durationMonths: '12',
    proposed_solution: d.proposed_solution.trim() || TEMPLATE_SOLUTION,
    objective: d.objective.trim() || TEMPLATE_OBJECTIVE,
    scope: d.scope.trim() || TEMPLATE_SCOPE,
    terms: DEFAULT_TERMS,
    packages: d.packages ?? JSON.parse(JSON.stringify(PACKAGES_TEMPLATE)),
    items: TEMPLATE_ITEMS.map((concept, index) => ({
      key: tempId(),
      concept,
      description: TEMPLATE_ITEM_DESCRIPTIONS[index] ?? '',
      amount: String(TEMPLATE_ITEM_AMOUNTS[index] ?? ''),
    })),
    phases: d.phases.length ? d.phases : PHASE_TEMPLATE.map(ph => ({ key: tempId(), name: ph.name, detail: ph.detail, from_month: String(ph.from_month), to_month: String(ph.to_month) })),
    kpis: d.kpis.length ? d.kpis : KPI_TEMPLATE.map(k => ({ key: tempId(), name: k.name, target: k.target, note: k.note })),
  }))

  // Fases del cronograma
  const addPhase = () => setDraft(d => ({ ...d, phases: [...d.phases, { key: tempId(), name: '', detail: '', from_month: '1', to_month: '1' }] }))
  const updatePhase = (key: string, field: 'name' | 'detail' | 'from_month' | 'to_month', v: string) =>
    setDraft(d => ({ ...d, phases: d.phases.map(p => p.key === key ? { ...p, [field]: v } : p) }))
  const removePhase = (key: string) => setDraft(d => ({ ...d, phases: d.phases.filter(p => p.key !== key) }))
  const loadPhaseTemplate = () => setDraft(d => ({ ...d, phases: PHASE_TEMPLATE.map(ph => ({ key: tempId(), name: ph.name, detail: ph.detail, from_month: String(ph.from_month), to_month: String(ph.to_month) })) }))

  // KPIs / objetivos
  const addKpi = () => setDraft(d => ({ ...d, kpis: [...d.kpis, { key: tempId(), name: '', target: '', note: '' }] }))
  const updateKpi = (key: string, field: 'name' | 'target' | 'note', v: string) =>
    setDraft(d => ({ ...d, kpis: d.kpis.map(k => k.key === key ? { ...k, [field]: v } : k) }))
  const removeKpi = (key: string) => setDraft(d => ({ ...d, kpis: d.kpis.filter(k => k.key !== key) }))
  const loadKpiTemplate = () => setDraft(d => ({ ...d, kpis: KPI_TEMPLATE.map(k => ({ key: tempId(), name: k.name, target: k.target, note: k.note })) }))

  // Paquetes (esquema de alianza con planes y plazos)
  const pkg = draft.packages
  const setPkg = (fn: (p: NonNullable<PackagesData>) => NonNullable<PackagesData>) =>
    setDraft(d => ({ ...d, packages: fn(d.packages ?? { ...EMPTY_PACKAGES }) }))
  const loadPackagesTemplate = () => setDraft(d => ({ ...d, packages: JSON.parse(JSON.stringify(PACKAGES_TEMPLATE)) }))
  const clearPackages = () => setDraft(d => ({ ...d, packages: null }))
  const updateTerms = (v: string) => setPkg(p => ({ ...p, terms: v.split(',').map(s => parseInt(s.trim())).filter(n => n > 0) }))
  const setRecommendedTerm = (n: number) => setPkg(p => ({ ...p, recommendedTerm: n }))
  const addPlan = () => setPkg(p => ({ ...p, plans: [...p.plans, { id: tempId(), name: '', includes: '', recurring: 0, recurringNormal: 0, devBundle: 0 }] }))
  const updatePlan = (id: string, field: keyof PkgPlan, v: string | number | boolean) =>
    setPkg(p => ({ ...p, plans: p.plans.map(pl => pl.id === id ? { ...pl, [field]: v } : pl) }))
  const setRecommendedPlan = (id: string) => setPkg(p => ({ ...p, plans: p.plans.map(pl => ({ ...pl, recommended: pl.id === id })) }))
  const removePlan = (id: string) => setPkg(p => ({ ...p, plans: p.plans.filter(pl => pl.id !== id) }))
  const addProject = () => setPkg(p => ({ ...p, projects: [...(p.projects ?? []), { id: tempId(), name: '', detail: '', price: 0 }] }))
  const updateProject = (id: string, field: keyof PkgProject, v: string | number) =>
    setPkg(p => ({ ...p, projects: (p.projects ?? []).map(pr => pr.id === id ? { ...pr, [field]: v } : pr) }))
  const removeProject = (id: string) => setPkg(p => ({ ...p, projects: (p.projects ?? []).filter(pr => pr.id !== id) }))

  const durationNum = parseInt(draft.durationMonths) || 0

  // ── Brief IA ──────────────────────────────────────────────────────────────
  const [editorTab,setEditorTab]=useState('brief')
  const editorScroll=useRef<HTMLDivElement>(null)
  const drawerRoot=useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)
  const aiBrief = useMemo(() => buildAIBrief(draft, contact, orgBranding, totals, values), [draft, contact, orgBranding, totals, values])
  const copyBrief = async () => { try { await navigator.clipboard.writeText(aiBrief); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch {} }

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
    if (proposal.pdf_url) await supabase.storage.from(BUCKET).remove([proposal.pdf_url])
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false })
    if (upErr) { setPdfErr(upErr.message); setPdfBusy(false); return }
    const { error: dbErr } = await supabase.from('proposals').update({ pdf_url: path, updated_at: new Date().toISOString() }).eq('id', proposal.id)
    if (dbErr) { setPdfErr(dbErr.message); setPdfBusy(false); return }
    onProposalPatch({ pdf_url: path }); setPdfBusy(false)
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
    onProposalPatch({ pdf_url: null }); setPdfBusy(false)
  }

  // ── Cambios ──────────────────────────────────────────────────────────────────
  const [newChange, setNewChange] = useState('')
  const [changeBusy, setChangeBusy] = useState(false)
  const addChange = async () => {
    if (!newChange.trim() || !proposal) return
    setChangeBusy(true)
    const { data, error: e } = await getSupabase().from('proposal_changes')
      .insert({ organization_id: orgId, proposal_id: proposal.id, description: newChange.trim(), created_by: currentUserId }).select().single()
    setChangeBusy(false)
    if (e) { setPdfErr(e.message); return }
    onChangesPatch(prev => [data as ProposalChange, ...prev]); setNewChange('')
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

  useEffect(() => {
    const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow
    drawerRoot.current?.focus();document.body.style.overflow='hidden'
    const onKey=(e:KeyboardEvent)=>{
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onClose();return}
      if(e.key!=='Tab')return
      const fields=Array.from(drawerRoot.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]')??[]).filter(el=>el.offsetParent!==null)
      if(!fields.length){e.preventDefault();return}
      const first=fields[0],last=fields[fields.length-1]
      if(e.shiftKey&&(document.activeElement===first||document.activeElement===drawerRoot.current)){e.preventDefault();last.focus()}
      else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===drawerRoot.current)){e.preventDefault();first.focus()}
    }
    document.addEventListener('keydown',onKey,true)
    return()=>{document.removeEventListener('keydown',onKey,true);document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus()}
  },[onClose])

  const stageObj = STAGE_MAP[draft.stage] ?? STAGES[0]
  const isMonthly = draft.billingType === 'monthly'

  // Recorrido comercial
  const timeline = [
    { label: 'Primer contacto', date: draft.firstContactAt ? `${draft.firstContactAt}T12:00:00` : null },
    { label: 'Reunión', date: draft.meetingAt ? `${draft.meetingAt}T12:00:00` : null },
    { label: 'Propuesta', date: proposal?.created_at ?? null },
    { label: 'Presentada', date: proposal?.presented_at ?? null },
    { label: 'Cierre', date: proposal?.decided_at ?? null },
  ]

  return (
    <div ref={drawerRoot} tabIndex={-1} className="fixed inset-0 z-[60] flex justify-end" role="dialog" aria-modal="true" aria-label={isNew?'Nueva propuesta':'Editar propuesta'}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-2xl h-full bg-slate-100 dark:bg-[#0b0f18] shadow-2xl flex flex-col animate-[slideIn_.2s_ease-out]">
        <style>{`@keyframes slideIn{from{transform:translateX(24px);opacity:.6}to{transform:translateX(0);opacity:1}}`}</style>

        {/* Header */}
        <div className="shrink-0 px-5 py-4 bg-white dark:bg-[#161b27] border-b border-slate-100 dark:border-white/[0.06]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">{isNew ? 'Nueva propuesta' : 'Ficha de propuesta'}</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white truncate mt-0.5">{draft.title || 'Sin título'}</p>
              {contact && <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{contact.company ? `${contact.full_name} · ${contact.company}` : contact.full_name}</p>}
            </div>
            <button aria-label="Cerrar propuesta" onClick={onClose} className="shrink-0 w-8 h-8 rounded-xl bg-slate-100 dark:bg-white/[0.06] flex items-center justify-center text-slate-500 hover:bg-slate-200 dark:hover:bg-white/[0.1] transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-1 -mb-1">
            {STAGES.map(s => (
              <button key={s.value} onClick={() => setStage(s.value)} title={s.desc}
                className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all ${draft.stage === s.value ? s.pill : 'bg-slate-100 dark:bg-white/[0.05] text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-white/[0.08]'}`}
                style={draft.stage === s.value ? { boxShadow: `0 5px 16px ${s.dot}22` } : undefined}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot }} />{s.short}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">{stageObj.desc}</p>
        </div>

        <nav className="proposal-editor-tabs" aria-label="Apartados de la propuesta">{[['brief','Brief'],['investment','Inversión'],['plan','Plan'],['document','Documento']].map(([key,label])=><button key={key} aria-pressed={editorTab===key} disabled={key==='document'&&isNew} onClick={()=>{setEditorTab(key);editorScroll.current?.scrollTo({top:0})}}>{label}</button>)}</nav>
        {/* Body: all draft fields remain mounted when switching tabs. */}
        <div ref={editorScroll} data-editor-tab={editorTab} className="proposal-editor flex-1 overflow-y-auto px-4 py-4 space-y-3">

          <details className="proposal-value-summary"><summary>Resumen económico y fechas</summary>
          {/* Resumen de valor */}
          <div className="rounded-2xl p-4 text-white" style={{ background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', ...CARD_S }}>
            {hasPackages(pkg) ? (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-white/50 font-bold mb-2 text-center">Paquetes · mensualidad por plazo</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-center border-collapse">
                    <thead>
                      <tr>
                        <th className="text-left text-[10px] font-bold text-white/50 pb-1.5 pr-2">Paquete</th>
                        {pkg.terms.map(t => (
                          <th key={t} className="text-[10px] font-bold text-white/50 pb-1.5 px-1 whitespace-nowrap">{t} m{pkg.recommendedTerm === t ? ' ★' : ''}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pkg.plans.map(pl => (
                        <tr key={pl.id} className="border-t border-white/10">
                          <td className="text-left py-1.5 pr-2">
                            <span className="text-[12px] font-bold">{pl.name || 'Plan'}</span>
                            {pl.recommended && <span className="ml-1 text-[8px] font-bold uppercase tracking-wide text-emerald-300">rec.</span>}
                          </td>
                          {pkg.terms.map(t => {
                            const isRec = pl.recommended && pkg.recommendedTerm === t
                            return (
                              <td key={t} className={`py-1.5 px-1 tabular-nums ${isRec ? 'bg-white/10 rounded-lg' : ''}`}>
                                <span className={`text-[13px] font-extrabold ${isRec ? 'text-emerald-300' : ''}`}>{formatMoney(pkgMonthly(pl, t), draft.currency)}</span>
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[9px] text-white/40 mt-2 text-center">Mensualidad = gestión + desarrollo diferido / plazo. Precios + IVA. Pauta de ads aparte. ★ = plazo sugerido.</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-white/50 font-bold">{isMonthly ? 'Mensual' : 'Único'}</p>
                  <p className="text-lg font-extrabold tabular-nums mt-0.5">{formatMoney(totals.subtotal, draft.currency, true)}</p>
                </div>
                <div className="border-x border-white/10">
                  <p className="text-[10px] uppercase tracking-wider text-white/50 font-bold">Contrato</p>
                  <p className="text-lg font-extrabold tabular-nums mt-0.5">{formatMoney(values.contract, draft.currency, true)}</p>
                  {isMonthly && <p className="text-[9px] text-white/40">{draft.durationMonths || 0} meses</p>}
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-white/50 font-bold">Anual</p>
                  <p className="text-lg font-extrabold tabular-nums mt-0.5">{formatMoney(values.annual, draft.currency, true)}</p>
                </div>
              </div>
            )}
            {/* Recorrido */}
            <div className="mt-3 pt-3 border-t border-white/10 flex items-center gap-1 overflow-x-auto">
              {timeline.map((t, i) => (
                <div key={t.label} className="flex items-center gap-1 shrink-0">
                  {i > 0 && <span className="text-white/25 text-[10px]">→</span>}
                  <div className={`px-2 py-1 rounded-lg ${t.date ? 'bg-white/10' : 'bg-white/[0.03]'}`}>
                    <p className="text-[9px] text-white/50 leading-none">{t.label}</p>
                    <p className={`text-[10px] font-semibold leading-tight mt-0.5 ${t.date ? 'text-white' : 'text-white/30'}`}>{t.date ? formatDate(t.date) : '—'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          </details>
          {/* Datos */}
          <DCard title="Datos">
            <Field label="Título de la propuesta *">
              <input value={draft.title} onChange={e => set('title', e.target.value)} placeholder="Ej. Posicionamiento orgánico en redes — Verdant Comfort" className={inputCls} />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Contacto / cliente">
                <select value={draft.contact_id} onChange={e => set('contact_id', e.target.value)} className={inputCls}>
                  <option value="">— Sin vincular —</option>
                  {contacts.map(c => <option key={c.id} value={c.id}>{c.full_name}{c.company ? ` · ${c.company}` : ''}</option>)}
                </select>
              </Field>
              <Field label="Origen / canal">
                <input value={draft.source_channel} onChange={e => set('source_channel', e.target.value)} placeholder="Ej. Google Ads, Métrica BTL…" className={inputCls} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Primer contacto" hint="Cuándo escribió el lead">
                <input type="date" value={draft.firstContactAt} onChange={e => set('firstContactAt', e.target.value)} className={inputCls} />
              </Field>
              <Field label="Reunión (Meet)" hint="Fecha de la videollamada">
                <input type="date" value={draft.meetingAt} onChange={e => set('meetingAt', e.target.value)} className={inputCls} />
              </Field>
            </div>
          </DCard>

          {/* Brief */}
          <DCard title="Brief — qué necesita y qué le proponemos">
            <Field label="Necesidades del cliente" hint="Qué nos pidió (de la videollamada)">
              <textarea value={draft.client_need} onChange={e => set('client_need', e.target.value)} rows={4} placeholder="Lo que el cliente expresó que necesita…" className={textareaCls} />
            </Field>
            <Field label="Solución que proponemos">
              <textarea value={draft.proposed_solution} onChange={e => set('proposed_solution', e.target.value)} rows={4} placeholder="Servicios, enfoque y entregables…" className={textareaCls} />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Objetivo / resultado esperado">
                <textarea value={draft.objective} onChange={e => set('objective', e.target.value)} rows={3} placeholder="Qué resultado busca el cliente…" className={textareaCls} />
              </Field>
              <Field label="Alcance / entregables">
                <textarea value={draft.scope} onChange={e => set('scope', e.target.value)} rows={3} placeholder="Qué incluye, áreas, reportes, límites…" className={textareaCls} />
              </Field>
            </div>
            <Field label="Notas internas" hint="Solo para el equipo, no va en el PDF">
              <textarea value={draft.notes} onChange={e => set('notes', e.target.value)} rows={2} placeholder="Contexto interno, señales de compra, riesgos…" className={textareaCls} />
            </Field>
          </DCard>

          {/* Inversión */}
          <DCard title="Inversión — desglose por concepto">
            <div className="grid grid-cols-3 gap-3">
              <Field label="Tipo de cobro">
                <select value={draft.billingType} onChange={e => set('billingType', e.target.value)} className={inputCls}>
                  <option value="monthly">Iguala mensual</option>
                  <option value="one_time">Pago único</option>
                </select>
              </Field>
              {isMonthly ? (
                <Field label="Duración (meses)">
                  <input type="number" min={1} value={draft.durationMonths} onChange={e => set('durationMonths', e.target.value)} className={inputCls} />
                </Field>
              ) : <div />}
              <Field label="IVA">
                <select value={draft.taxRate} onChange={e => set('taxRate', e.target.value)} className={inputCls}>
                  {TAX_OPTIONS.map(t => <option key={t} value={String(t)}>{t}%</option>)}
                </select>
              </Field>
            </div>

            {draft.items.length === 0 && (
              <button onClick={loadTemplate}
                className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-2.5 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 active:scale-[0.99] transition-all">
                Cargar modelo integral anual completo
              </button>
            )}

            <div className="space-y-2">
              {draft.items.map((it) => (
                <div key={it.key} className="flex items-start gap-2">
                  <div className="flex-1 space-y-1.5">
                    <input value={it.concept} onChange={e => updateItem(it.key, 'concept', e.target.value)} placeholder="Concepto" className={inputCls} />
                    <input value={it.description} onChange={e => updateItem(it.key, 'description', e.target.value)} placeholder="Descripción breve (opcional)" className={inputCls + ' text-xs'} />
                  </div>
                  <div className="w-28 shrink-0">
                    <input type="number" inputMode="decimal" value={it.amount} onChange={e => updateItem(it.key, 'amount', e.target.value)} placeholder="0" className={inputCls + ' text-right'} />
                  </div>
                  <button onClick={() => removeItem(it.key)} className="shrink-0 mt-2 p-1 rounded-lg text-slate-300 dark:text-slate-600 hover:text-red-500 transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
              <button onClick={addItem}
                className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-xl border border-dashed border-slate-300 dark:border-white/[0.12] text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 4v16m8-8H4" /></svg>
                Agregar concepto
              </button>
            </div>

            {!totals.hasItems && (
              <Field label="Monto (sin desglose)">
                <input type="number" inputMode="decimal" value={draft.amount} onChange={e => set('amount', e.target.value)} placeholder="0" className={inputCls} />
              </Field>
            )}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Moneda</span>
              <select value={draft.currency} onChange={e => set('currency', e.target.value)} className={inputCls + ' w-24'}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="rounded-2xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 p-3.5 space-y-1.5">
              <div className="flex items-center justify-between text-sm"><span className="opacity-70">Subtotal {isMonthly ? '(mensual)' : ''}</span><span className="font-semibold tabular-nums">{formatMoney(totals.subtotal, draft.currency)}</span></div>
              <div className="flex items-center justify-between text-sm"><span className="opacity-70">IVA ({draft.taxRate}%)</span><span className="font-semibold tabular-nums">{formatMoney(totals.tax, draft.currency)}</span></div>
              <div className="flex items-center justify-between text-base pt-1.5 border-t border-white/15 dark:border-slate-900/15"><span className="font-bold">Total {isMonthly ? '/ mes' : ''}</span><span className="font-extrabold tabular-nums">{formatMoney(totals.total, draft.currency)}</span></div>
            </div>
          </DCard>

          {/* Paquetes del modelo de alianza anual */}
          <DCard title="Paquetes — rutas de inicio (opcional)">
            <p className="text-[11px] text-slate-400 dark:text-slate-500 -mt-1">
              Compara niveles de infraestructura bajo la misma metodología de resultados. El modelo estándar usa un contrato de 12 meses; el desglose de arriba corresponde a la ruta recomendada.
            </p>
            {!hasPackages(pkg) ? (
              <button onClick={loadPackagesTemplate}
                className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-2.5 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 active:scale-[0.99] transition-all">
                Cargar rutas Performance / Demanda 360 / Integral
              </button>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Plazos (meses)" hint="El modelo estándar usa 12 meses">
                    <input value={pkg.terms.join(', ')} onChange={e => updateTerms(e.target.value)} placeholder="12" className={inputCls} />
                  </Field>
                  <Field label="Plazo sugerido">
                    <select value={pkg.recommendedTerm ?? ''} onChange={e => setRecommendedTerm(parseInt(e.target.value) || 0)} className={inputCls}>
                      <option value="">— Ninguno —</option>
                      {pkg.terms.map(t => <option key={t} value={t}>{t} meses</option>)}
                    </select>
                  </Field>
                </div>

                <div className="space-y-2">
                  {pkg.plans.map(pl => (
                    <div key={pl.id} className="rounded-xl bg-slate-50 dark:bg-[#0f1420] border border-slate-100 dark:border-white/[0.05] p-2.5 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <input value={pl.name} onChange={e => updatePlan(pl.id, 'name', e.target.value)} placeholder="Nombre del paquete (ej. Full)" className={inputCls} />
                        <label className="shrink-0 flex items-center gap-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400 cursor-pointer" title="Marcar como paquete recomendado">
                          <input type="radio" name="recommendedPlan" checked={!!pl.recommended} onChange={() => setRecommendedPlan(pl.id)} className="accent-emerald-500" />rec.
                        </label>
                        <button onClick={() => removePlan(pl.id)} className="shrink-0 p-1 rounded-lg text-slate-300 dark:text-slate-600 hover:text-red-500 transition-colors">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                      <input value={pl.includes} onChange={e => updatePlan(pl.id, 'includes', e.target.value)} placeholder="Qué incluye el paquete" className={inputCls + ' text-xs'} />
                      <div className="grid grid-cols-3 gap-2">
                        <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Gestión neta/mes
                          <input type="number" inputMode="decimal" value={pl.recurring || ''} onChange={e => updatePlan(pl.id, 'recurring', parseFloat(e.target.value) || 0)} placeholder="0" className={inputCls + ' text-right mt-0.5'} />
                        </label>
                        <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Normal al renovar
                          <input type="number" inputMode="decimal" value={pl.recurringNormal || ''} onChange={e => updatePlan(pl.id, 'recurringNormal', parseFloat(e.target.value) || 0)} placeholder="0" className={inputCls + ' text-right mt-0.5'} />
                        </label>
                        <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Desarrollo adicional
                          <input type="number" inputMode="decimal" value={pl.devBundle || ''} onChange={e => updatePlan(pl.id, 'devBundle', parseFloat(e.target.value) || 0)} placeholder="0" className={inputCls + ' text-right mt-0.5'} />
                        </label>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        {pkg.terms.map(t => (
                          <span key={t} className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-slate-200/70 dark:bg-white/[0.06] text-slate-600 dark:text-slate-300 tabular-nums">
                            {t}m: {formatMoney(pkgMonthly(pl, t), draft.currency)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                  <button onClick={addPlan} className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-xl border border-dashed border-slate-300 dark:border-white/[0.12] text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 4v16m8-8H4" /></svg>
                    Agregar paquete
                  </button>
                </div>

                <div className="pt-1 space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Opciones a proyecto (Camino A)</p>
                  {(pkg.projects ?? []).map(pr => (
                    <div key={pr.id} className="rounded-xl bg-slate-50 dark:bg-[#0f1420] border border-slate-100 dark:border-white/[0.05] p-2.5 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <input value={pr.name} onChange={e => updateProject(pr.id, 'name', e.target.value)} placeholder="Opción (ej. A1 · Web sola)" className={inputCls} />
                        <div className="w-28 shrink-0"><input type="number" inputMode="decimal" value={pr.price || ''} onChange={e => updateProject(pr.id, 'price', parseFloat(e.target.value) || 0)} placeholder="0" className={inputCls + ' text-right'} /></div>
                        <button onClick={() => removeProject(pr.id)} className="shrink-0 p-1 rounded-lg text-slate-300 dark:text-slate-600 hover:text-red-500 transition-colors">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                      <input value={pr.detail} onChange={e => updateProject(pr.id, 'detail', e.target.value)} placeholder="Qué incluye" className={inputCls + ' text-xs'} />
                    </div>
                  ))}
                  <button onClick={addProject} className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-xl border border-dashed border-slate-300 dark:border-white/[0.12] text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 4v16m8-8H4" /></svg>
                    Agregar opción a proyecto
                  </button>
                </div>

                <button onClick={clearPackages} className="text-[11px] font-semibold text-red-500 hover:text-red-600 transition-colors">Quitar esquema de paquetes</button>
              </>
            )}
          </DCard>

          {/* Cronograma del proyecto (solo igualas) */}
          {isMonthly && (
            <DCard title="Cronograma del proyecto — fases">
              <p className="text-[11px] text-slate-400 dark:text-slate-500 -mt-1">Se vende como proyecto: cada fase con el mes en que ocurre dentro del contrato ({durationNum} meses).</p>
              {draft.phases.length === 0 ? (
                <button onClick={loadPhaseTemplate} className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-2.5 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 active:scale-[0.99] transition-all">
                  ✨ Cargar fases estándar
                </button>
              ) : (
                <>
                  {durationNum > 0 && <PhaseGantt phases={draft.phases} duration={durationNum} />}
                  <div className="space-y-2">
                    {draft.phases.map((ph, i) => (
                      <div key={ph.key} className="rounded-xl bg-slate-50 dark:bg-[#0f1420] border border-slate-100 dark:border-white/[0.05] p-2.5 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="shrink-0 w-5 h-5 rounded-md bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
                          <input value={ph.name} onChange={e => updatePhase(ph.key, 'name', e.target.value)} placeholder="Nombre de la fase" className={inputCls} />
                          <button onClick={() => removePhase(ph.key)} className="shrink-0 p-1 rounded-lg text-slate-300 dark:text-slate-600 hover:text-red-500 transition-colors">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                        <input value={ph.detail} onChange={e => updatePhase(ph.key, 'detail', e.target.value)} placeholder="Qué pasa en esta fase" className={inputCls + ' text-xs'} />
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-slate-400 dark:text-slate-500">Del mes</span>
                          <input type="number" min={1} max={durationNum} value={ph.from_month} onChange={e => updatePhase(ph.key, 'from_month', e.target.value)} className={inputCls + ' w-16 text-center py-1'} />
                          <span className="text-[11px] text-slate-400 dark:text-slate-500">al mes</span>
                          <input type="number" min={1} max={durationNum} value={ph.to_month} onChange={e => updatePhase(ph.key, 'to_month', e.target.value)} className={inputCls + ' w-16 text-center py-1'} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <button onClick={addPhase} className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-xl border border-dashed border-slate-300 dark:border-white/[0.12] text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 4v16m8-8H4" /></svg>
                    Agregar fase
                  </button>
                </>
              )}
            </DCard>
          )}

          {/* Objetivos y KPIs (solo igualas) */}
          {isMonthly && (
            <DCard title="Objetivos y KPIs del periodo">
              <p className="text-[11px] text-slate-400 dark:text-slate-500 -mt-1">Aproximados/ejemplos: se afinan en la fase de planeación. Solo lo que realmente podemos medir y mejorar.</p>
              {draft.kpis.length === 0 ? (
                <button onClick={loadKpiTemplate} className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-2.5 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 active:scale-[0.99] transition-all">
                  ✨ Cargar KPIs de ejemplo
                </button>
              ) : (
                <div className="space-y-2">
                  {draft.kpis.map(k => (
                    <div key={k.key} className="rounded-xl bg-slate-50 dark:bg-[#0f1420] border border-slate-100 dark:border-white/[0.05] p-2.5 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <input value={k.name} onChange={e => updateKpi(k.key, 'name', e.target.value)} placeholder="KPI (ej. Ventas atribuibles o CPA)" className={inputCls} />
                        <button onClick={() => removeKpi(k.key)} className="shrink-0 p-1 rounded-lg text-slate-300 dark:text-slate-600 hover:text-red-500 transition-colors">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input value={k.target} onChange={e => updateKpi(k.key, 'target', e.target.value)} placeholder="Meta (ej. +2,500 a 3,000)" className={inputCls + ' text-xs'} />
                        <input value={k.note} onChange={e => updateKpi(k.key, 'note', e.target.value)} placeholder="Nota (opcional)" className={inputCls + ' text-xs'} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {draft.kpis.length > 0 && (
                <button onClick={addKpi} className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-xl border border-dashed border-slate-300 dark:border-white/[0.12] text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 4v16m8-8H4" /></svg>
                  Agregar KPI
                </button>
              )}
            </DCard>
          )}

          {/* Condiciones */}
          <DCard title="Condiciones de la propuesta">
            <Field label="Condiciones / notas comerciales" hint="Aparecen en el PDF. Vienen prellenadas; ajústalas si hace falta.">
              <textarea value={draft.terms} onChange={e => set('terms', e.target.value)} rows={6} className={textareaCls} />
            </Field>
          </DCard>

          {/* Guardar */}
          {error && <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>}
          <button onClick={onSave} disabled={saving}
            className="w-full flex items-center justify-center gap-2 text-sm font-bold py-3 rounded-xl text-white transition-all active:scale-[0.99] disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)' }}>
            {saving ? <Spinner /> : null}{isNew ? 'Crear propuesta' : 'Guardar cambios'}
          </button>

          {isNew ? (
            <p className="text-xs text-center text-slate-400 dark:text-slate-500">Guarda la propuesta para generar el brief, adjuntar el PDF y registrar cambios.</p>
          ) : (
            <>
              {/* Documento IA + PDF */}
              <DCard title="Documento — brief para IA + PDF">
                <div className="rounded-2xl bg-slate-50 dark:bg-[#0f1420] p-3 border border-slate-100 dark:border-white/[0.05]">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Brief listo para el agente IA</p>
                    <button onClick={copyBrief} className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 active:scale-95 transition-all">{copied ? '¡Copiado!' : 'Copiar brief'}</button>
                  </div>
                  <pre className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400 whitespace-pre-wrap max-h-40 overflow-y-auto">{aiBrief}</pre>
                </div>
                <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={e => uploadPdf(e.target.files?.[0])} />
                {proposal?.pdf_url ? (
                  <div className="flex items-center gap-3 rounded-2xl bg-slate-50 dark:bg-[#0f1420] p-3 border border-slate-100 dark:border-white/[0.05]">
                    <span className="text-2xl">📄</span>
                    <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">Propuesta en PDF</p><p className="text-[11px] text-slate-400 dark:text-slate-500">Guardada en el dashboard</p></div>
                    <button onClick={downloadPdf} disabled={pdfBusy} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-white dark:bg-white/[0.06] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.1] transition-colors disabled:opacity-50">{pdfBusy ? '…' : 'Ver'}</button>
                    <button onClick={() => fileRef.current?.click()} disabled={pdfBusy} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-white dark:bg-white/[0.06] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.1] transition-colors disabled:opacity-50">Reemplazar</button>
                    <button onClick={deletePdf} disabled={pdfBusy} className="text-xs font-semibold p-1.5 rounded-lg text-slate-400 hover:text-red-500 transition-colors disabled:opacity-50">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                ) : (
                  <button onClick={() => fileRef.current?.click()} disabled={pdfBusy}
                    className="w-full border-2 border-dashed border-slate-200 dark:border-white/[0.1] rounded-2xl p-4 text-center hover:border-slate-300 dark:hover:border-white/[0.2] transition-all disabled:opacity-60">
                    {pdfBusy ? <span className="flex items-center justify-center gap-2 text-sm text-slate-500"><Spinner /> Subiendo PDF…</span>
                      : <><p className="text-sm font-medium text-slate-600 dark:text-slate-300">Subir PDF de la propuesta</p><p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">Máx. 25 MB</p></>}
                  </button>
                )}
                {pdfErr && <p className="text-xs text-red-500">{pdfErr}</p>}
              </DCard>

              {/* Cambios */}
              <DCard title="Cambios solicitados por el cliente">
                <div className="flex items-start gap-2">
                  <textarea value={newChange} onChange={e => setNewChange(e.target.value)} rows={2} placeholder="Ej. Pidió bajar el alcance del mes 1 y ajustar el precio…" className={textareaCls} />
                  <button onClick={addChange} disabled={changeBusy || !newChange.trim()} className="shrink-0 text-sm font-bold px-3.5 py-2 rounded-xl text-white transition-all active:scale-95 disabled:opacity-50" style={{ background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)' }}>{changeBusy ? <Spinner /> : 'Agregar'}</button>
                </div>
                {changes.length === 0 ? <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-2">Sin cambios registrados.</p> : (
                  <div className="space-y-2">
                    {changes.map(c => (
                      <div key={c.id} className={`flex items-start gap-2.5 rounded-2xl p-3 ${c.resolved ? 'bg-slate-50 dark:bg-white/[0.03]' : 'bg-slate-50 dark:bg-[#0f1420] border border-slate-100 dark:border-white/[0.05]'}`}>
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
              </DCard>

              {onDelete && (
                <div className="flex justify-end pt-1">
                  <button onClick={onDelete} className="text-xs font-semibold text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 px-3 py-1.5 rounded-lg transition-colors">Eliminar propuesta</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Subcomponentes ───────────────────────────────────────────────────────────

const inputCls = 'w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#0f1420] border border-slate-200 dark:border-white/[0.08] text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-white/10'
const textareaCls = inputCls + ' resize-y leading-relaxed'

function PhaseGantt({ phases, duration }: { phases: PhaseRow[]; duration: number }) {
  const months = Array.from({ length: Math.max(1, Math.min(duration, 18)) }, (_, i) => i + 1)
  const rows = phases.filter(p => p.name.trim())
  if (!rows.length) return null
  return (
    <div className="rounded-xl bg-slate-50 dark:bg-[#0f1420] border border-slate-100 dark:border-white/[0.05] p-2.5 overflow-x-auto">
      <div className="min-w-max">
        <div className="flex items-center gap-px mb-1 pl-[44%]">
          {months.map(m => (
            <div key={m} className="w-6 text-center text-[9px] font-semibold text-slate-400 dark:text-slate-500">{m}</div>
          ))}
        </div>
        {rows.map((p, i) => {
          const from = parseInt(p.from_month) || 1
          const to = parseInt(p.to_month) || from
          return (
            <div key={p.key} className="flex items-center gap-1 mb-1">
              <div className="w-[44%] pr-2 text-[10px] text-slate-600 dark:text-slate-300 truncate leading-tight">{i + 1}. {p.name}</div>
              <div className="flex items-center gap-px">
                {months.map(m => {
                  const on = m >= from && m <= to
                  return <div key={m} className={`w-6 h-3 rounded-sm ${on ? 'bg-slate-900 dark:bg-white' : 'bg-slate-200/60 dark:bg-white/[0.06]'}`} />
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DCard({ title, children }: { title: string; children: React.ReactNode }) {
  const section=title.startsWith('Datos')||title.startsWith('Brief')?'brief':title.startsWith('Inversión')||title.startsWith('Paquetes')?'investment':title.startsWith('Documento')||title.startsWith('Cambios')?'document':'plan'
  return (
    <div data-section={section} className="proposal-editor-section rounded-2xl bg-white dark:bg-[#161b27] p-4 space-y-3" style={CARD_S}>
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

function buildAIBrief(
  draft: Draft, contact: Contact | null, org: OrgBranding,
  totals: { subtotal: number; tax: number; total: number; hasItems: boolean },
  values: { monthly: number; contract: number; annual: number },
): string {
  const orgName = org?.name || 'Antuario'
  const cur = draft.currency
  const isMonthly = draft.billingType === 'monthly'
  const itemRows = draft.items.filter(r => r.concept.trim())
  const desglose = itemRows.length
    ? itemRows.map(r => `- ${r.concept.trim()}${r.description.trim() ? ` (${r.description.trim()})` : ''}: ${formatMoney(parseFloat(r.amount) || 0, cur)}`).join('\n')
    : '(sin desglose)'
  const phaseRows = draft.phases.filter(p => p.name.trim())
  const cronograma = phaseRows.length
    ? phaseRows.map((p, i) => `${i + 1}. ${p.name.trim()} (mes ${p.from_month}${p.to_month !== p.from_month ? `–${p.to_month}` : ''})${p.detail.trim() ? `: ${p.detail.trim()}` : ''}`).join('\n')
    : null
  const kpiRows = draft.kpis.filter(k => k.name.trim())
  const objetivos = kpiRows.length
    ? kpiRows.map(k => `- ${k.name.trim()}: ${k.target.trim() || '(meta a definir)'}${k.note.trim() ? ` — ${k.note.trim()}` : ''}`).join('\n')
    : null

  const pk = draft.packages
  const paquetes = hasPackages(pk)
    ? [
        pk.plans.map(pl => {
          const opts = pk.terms.map(t => `${t} meses: ${formatMoney(pkgMonthly(pl, t), cur)}/mes`).join(' · ')
          return `- ${pl.name}${pl.recommended ? ' (recomendado)' : ''}: ${pl.includes}\n    Mensualidad -> ${opts}\n    Gestion neta ${formatMoney(pl.recurring, cur)}/mes · valor normal al renovar ${formatMoney(pl.recurringNormal, cur)}/mes · desarrollo diferido ${formatMoney(pl.devBundle, cur)}`
        }).join('\n'),
        (pk.projects && pk.projects.length ? `\n  Opciones a proyecto (Camino A):\n` + pk.projects.map(pr => `  - ${pr.name}: ${formatMoney(pr.price, cur)}${pr.detail ? ` — ${pr.detail}` : ''}`).join('\n') : ''),
      ].join('\n')
    : null

  const lines = [
    `# Brief de propuesta comercial — ${orgName}`,
    ``,
    `Título: ${draft.title || '(sin título)'}`,
    `Cliente: ${contact?.full_name ?? '(sin contacto)'}${contact?.company ? ` — ${contact.company}` : ''}`,
    contact?.email ? `Correo: ${contact.email}` : null,
    contact?.phone ? `Teléfono: ${contact.phone}` : null,
    draft.source_channel ? `Origen: ${draft.source_channel}` : null,
    `Modelo: ${isMonthly ? `Iguala mensual (contrato ${draft.durationMonths || 0} meses)` : 'Pago único'}`,
    ``,
    `## Necesidades del cliente`, draft.client_need || '(pendiente)', ``,
    `## Solución que propone ${orgName}`, draft.proposed_solution || '(pendiente)', ``,
    `## Objetivo / resultado esperado`, draft.objective || '(pendiente)', ``,
    `## Alcance / entregables`, draft.scope || '(pendiente)', ``,
    cronograma ? `## Cronograma del proyecto (${draft.durationMonths || 0} meses)` : null,
    cronograma, cronograma ? `` : null,
    objetivos ? `## Objetivos y KPIs del periodo (aproximados, se afinan en planeación)` : null,
    objetivos, objetivos ? `` : null,
    paquetes ? `## Paquetes (esquema de alianza; plazos ${hasPackages(pk) ? pk.terms.join('/') : ''} meses; mensualidad = gestión + desarrollo diferido/plazo)` : null,
    paquetes, paquetes ? `` : null,
    `## Inversión (desglose${paquetes ? ' del plan/plazo recomendado' : ''})`, desglose, ``,
    `Subtotal${isMonthly ? ' mensual' : ''}: ${formatMoney(totals.subtotal, cur)}`,
    `IVA (${draft.taxRate}%): ${formatMoney(totals.tax, cur)}`,
    `Total${isMonthly ? ' mensual' : ''}: ${formatMoney(totals.total, cur)}`,
    isMonthly ? `Valor del contrato (${draft.durationMonths || 0} meses): ${formatMoney(values.contract, cur)} + IVA` : null,
    ``,
    `## Condiciones`, draft.terms || '(sin condiciones)', ``,
    `---`,
    `Instrucción: Redacta una propuesta comercial profesional en PDF para ${contact?.company ?? 'el cliente'}, `,
    `con el tono y branding de ${orgName}. Estructura: portada, entendimiento de la necesidad, solución, `,
    `alcance y entregables, inversión con el desglose por concepto (precios + IVA), condiciones y siguientes pasos.`,
  ].filter((l): l is string => l != null)
  return lines.join('\n')
}

function CommercialFollowUp({proposal,onUpdate,onOpen}:{proposal:Proposal;onUpdate:(patch:Partial<Proposal>)=>void;onOpen:()=>void}){
 const [date,setDate]=useState(proposal.next_followup_on??''),[action,setAction]=useState(proposal.next_action??''),[pending,setPending]=useState(false),[notice,setNotice]=useState('')
 async function saveFollowUp(){setPending(true);const res=await fetch('/api/operations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({table:'proposals',id:proposal.id,values:{next_followup_on:date||null,next_action:action||null}})});if(res.ok){onUpdate({next_followup_on:date||null,next_action:action||null});setNotice('Guardado')}else setNotice('No se pudo guardar');setPending(false)}
 return <article className="rounded-2xl bg-slate-50 dark:bg-[#20202c] p-4 space-y-3"><button onClick={onOpen} className="text-left text-xs font-semibold leading-relaxed line-clamp-2">{proposal.title}</button><label className="block text-[10px] text-slate-500">Próximo seguimiento<input aria-label={`Próximo seguimiento de ${proposal.title}`} type="date" value={date} onChange={e=>setDate(e.target.value)} className="mt-1 block w-full rounded-xl bg-white dark:bg-[#17171f] px-3 py-2 text-xs text-slate-700 dark:text-slate-200"/></label><input aria-label={`Siguiente acción de ${proposal.title}`} placeholder="Siguiente acción" value={action} onChange={e=>setAction(e.target.value)} className="w-full rounded-xl bg-white dark:bg-[#17171f] px-3 py-2 text-xs"/><div className="flex justify-between items-center"><span className="text-[10px] text-slate-500" role="status">{notice}</span><button disabled={pending} onClick={saveFollowUp} className="text-xs font-semibold text-violet-700 dark:text-violet-300">{pending?'Guardando…':'Guardar seguimiento'}</button></div></article>
}
