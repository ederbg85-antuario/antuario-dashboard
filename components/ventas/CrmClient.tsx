'use client'

import { useMemo, useState } from 'react'
import { PAGE_WRAP, PageHeader, CARD_S } from '@/components/ui/dashboard'

// ─── Datos de entrada ────────────────────────────────────────────────────────
type Prospect = {
  id: string; full_name: string | null; company: string | null; title: string | null
  email: string | null; phone: string | null; icp_segment: string | null; stage: string
  deal_path: string | null; assigned_to: string | null; touches: number | null
  next_action_at: string | null; next_action: string | null; contact_id: string | null
  updated_at: string | null; created_at: string | null
}
type Contact = {
  id: string; full_name: string | null; company: string | null; position: string | null
  email: string | null; phone: string | null; contact_type: string | null; source: string | null
  assigned_to: string | null; meeting_at: string | null; updated_at: string | null; created_at: string | null
}
type Proposal = { id: string; title: string | null; stage: string | null; total: string | null; amount: string | null; contact_id: string | null }
type Profile = { id: string; full_name: string | null; email: string | null }
type Props = {
  orgId: number; currentUserId: string; currentUserRole: string
  prospects: Prospect[]; contacts: Contact[]; proposals: Proposal[]; profiles: Profile[]
}

// ─── Modelo unificado ────────────────────────────────────────────────────────
type Kind = 'prospecto' | 'contacto'
type CrmRecord = {
  id: string; kind: Kind; name: string; company: string | null; title: string | null
  email: string | null; phone: string | null; col: string; stageLabel: string
  origin: string; segment: string | null; ownerId: string | null; value: number | null
  href: string; updatedAt: string | null; touches: number | null; nextActionAt: string | null
}

// Columnas del pipeline unificado (frío + warm en un solo flujo).
const COLS = [
  { key: 'por_contactar', label: 'Por contactar', color: '#94a3b8' },
  { key: 'contactado',    label: 'Contactado',    color: '#38bdf8' },
  { key: 'interesado',    label: 'Interesado',    color: '#34d399' },
  { key: 'reunion',       label: 'Reunión',       color: '#8b5cf6' },
  { key: 'propuesta',     label: 'Propuesta',     color: '#f59e0b' },
  { key: 'cliente',       label: 'Cliente',       color: '#14b8a6' },
]
const colMeta = (k: string) => COLS.find(c => c.key === k)

const ORIGINS: Record<string, { label: string; cls: string }> = {
  frio:      { label: 'Frío',     cls: 'bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-slate-300' },
  web:       { label: 'Web',      cls: 'bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-300' },
  whatsapp:  { label: 'WhatsApp', cls: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300' },
  referido:  { label: 'Referido', cls: 'bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-300' },
  otro:      { label: 'Otro',     cls: 'bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-slate-400' },
}
const SEGMENTS: Record<string, { label: string; accent: string }> = {
  despacho_legal:         { label: 'Legal',       accent: '#6366f1' },
  promotora_inmobiliaria: { label: 'Inmobiliaria',accent: '#0ea5e9' },
  agencia_marketing:      { label: 'Agencia',     accent: '#ec4899' },
}

// ─── Mapeos de etapa ─────────────────────────────────────────────────────────
function prospectCol(stage: string): string | null {
  switch (stage) {
    case 'por_investigar':
    case 'por_contactar': return 'por_contactar'
    case 'contactado':
    case 'siguiendo': return 'contactado'
    case 'interesado': return 'interesado'
    case 'reunion_agendada': return 'reunion'
    case 'convertido': return null   // ya existe como contacto → no duplicar
    case 'descartado': return 'descartado'
    default: return 'por_contactar'
  }
}
const PROSPECT_STAGE_LABEL: Record<string, string> = {
  por_investigar: 'Por investigar', por_contactar: 'Por contactar', contactado: 'Contactado',
  siguiendo: 'En seguimiento', interesado: 'Interesado', reunion_agendada: 'Reunión agendada',
  convertido: 'Convertido', descartado: 'Descartado',
}
function contactCol(type: string | null, hasProposal: boolean): string {
  if (type === 'client') return 'cliente'
  if (type === 'active_proposal' || hasProposal) return 'propuesta'
  if (type === 'proposal') return 'reunion'
  if (type === 'lead_potential' || type === 'lead_relevant') return 'interesado'
  if (type === 'lead_irrelevant') return 'descartado'
  return 'por_contactar' // lead_nuevo y otros
}
const CONTACT_TYPE_LABEL: Record<string, string> = {
  lead_nuevo: 'Lead nuevo', lead_potential: 'Lead potencial', lead_relevant: 'Lead relevante',
  lead_irrelevant: 'Descartado', proposal: 'Reunión / propuesta', active_proposal: 'Propuesta activa', client: 'Cliente',
}
function sourceOrigin(source: string | null): string {
  if (!source) return 'otro'
  if (source.includes('formulario') || source.includes('landing')) return 'web'
  if (source.includes('mensajeria') || source.includes('whatsapp')) return 'whatsapp'
  if (source.includes('prospeccion') || source.includes('frio') || source.includes('tarjeta')) return 'frio'
  if (source.includes('referido')) return 'referido'
  return 'otro'
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const num = (s: string | null) => { const n = Number(s); return Number.isFinite(n) ? n : 0 }
function money(v: number | null): string {
  if (!v) return ''
  if (v >= 1000) return `$${Math.round(v / 1000)}k`
  return `$${Math.round(v)}`
}
function initials(name: string | null): string {
  if (!name) return '?'
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?'
}
function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', day: '2-digit', month: 'short' })
}
function profileName(profiles: Profile[], id: string | null): string {
  if (!id) return 'Sin asignar'
  const p = profiles.find(x => x.id === id)
  return p?.full_name || p?.email || 'Miembro'
}

// ─── Componente ──────────────────────────────────────────────────────────────
export default function CrmClient({ currentUserId, currentUserRole, prospects, contacts, proposals, profiles }: Props) {
  const isManager = currentUserRole === 'owner' || currentUserRole === 'admin'
  const [view, setView] = useState<'tablero' | 'lista'>('tablero')
  const [origin, setOrigin] = useState<string>('todos')
  const [owner, setOwner] = useState<string>(isManager ? 'todos' : currentUserId)
  const [query, setQuery] = useState('')
  const [showDiscarded, setShowDiscarded] = useState(false)
  const [selected, setSelected] = useState<CrmRecord | null>(null)

  // Mejor propuesta por contacto (valor + existencia)
  const propByContact = useMemo(() => {
    const m: Record<string, number> = {}
    for (const p of proposals) {
      if (!p.contact_id) continue
      const v = num(p.total) || num(p.amount)
      if (!(p.contact_id in m) || v > m[p.contact_id]) m[p.contact_id] = v
    }
    return m
  }, [proposals])

  // Normalización a registros unificados
  const records = useMemo<CrmRecord[]>(() => {
    const out: CrmRecord[] = []
    for (const p of prospects) {
      const col = prospectCol(p.stage)
      if (!col) continue
      out.push({
        id: 'p_' + p.id, kind: 'prospecto', name: p.full_name || p.company || 'Sin nombre',
        company: p.company, title: p.title, email: p.email, phone: p.phone, col,
        stageLabel: PROSPECT_STAGE_LABEL[p.stage] ?? p.stage, origin: 'frio',
        segment: p.icp_segment, ownerId: p.assigned_to, value: null, href: '/ventas/prospeccion',
        updatedAt: p.updated_at, touches: p.touches ?? 0, nextActionAt: p.next_action_at,
      })
    }
    for (const c of contacts) {
      const hasProp = c.id in propByContact
      const col = contactCol(c.contact_type, hasProp)
      const value = propByContact[c.id] ?? null
      const href = col === 'cliente' ? '/ventas/clientes' : hasProp ? '/ventas/propuestas' : '/ventas/contactos'
      out.push({
        id: 'c_' + c.id, kind: 'contacto', name: c.full_name || c.company || 'Sin nombre',
        company: c.company, title: c.position, email: c.email, phone: c.phone, col,
        stageLabel: CONTACT_TYPE_LABEL[c.contact_type ?? ''] ?? (c.contact_type ?? '—'),
        origin: sourceOrigin(c.source), segment: null, ownerId: c.assigned_to, value, href,
        updatedAt: c.updated_at, touches: null, nextActionAt: null,
      })
    }
    return out
  }, [prospects, contacts, propByContact])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return records.filter(r => {
      if (!showDiscarded && r.col === 'descartado') return false
      if (origin !== 'todos' && r.origin !== origin) return false
      if (owner !== 'todos' && r.ownerId !== owner) return false
      if (q && ![r.name, r.company, r.email, r.title].some(v => (v ?? '').toLowerCase().includes(q))) return false
      return true
    })
  }, [records, showDiscarded, origin, owner, query])

  const byCol = useMemo(() => {
    const m: Record<string, CrmRecord[]> = {}
    COLS.forEach(c => { m[c.key] = [] })
    for (const r of filtered) { if (m[r.col]) m[r.col].push(r) }
    return m
  }, [filtered])

  const kpis = useMemo(() => {
    const total = filtered.length
    const enPipeline = filtered.filter(r => !['cliente', 'descartado'].includes(r.col)).length
    const propuestas = filtered.filter(r => r.col === 'propuesta').length
    const clientes = filtered.filter(r => r.col === 'cliente').length
    const frio = filtered.filter(r => r.origin === 'frio').length
    return { total, enPipeline, propuestas, clientes, frio }
  }, [filtered])

  const owners = useMemo(() => {
    const ids = new Set<string>()
    records.forEach(r => { if (r.ownerId) ids.add(r.ownerId) })
    return Array.from(ids)
  }, [records])

  return (
    <div className={PAGE_WRAP}>
      <div className="max-w-7xl mx-auto w-full space-y-4">
        <div className="flex items-start justify-between gap-3">
          <PageHeader
            eyebrow="Ventas · CRM"
            title="CRM"
            sub="Todo el pipeline en un solo lugar: prospección en frío, contactos, propuestas y clientes."
          />
          <a href="/ventas/prospeccion" className="shrink-0 mt-1 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 dark:border-white/[0.12] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.05] transition-colors">
            Venta en frío →
          </a>
        </div>

        {/* Controles */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-xl border border-slate-200 dark:border-white/[0.1] p-0.5 bg-white dark:bg-[#1a2030]">
            <Tab active={view === 'tablero'} onClick={() => setView('tablero')} label="Tablero" />
            <Tab active={view === 'lista'} onClick={() => setView('lista')} label="Lista" />
          </div>
          <div className="flex-1" />
          {isManager && (
            <select value={owner} onChange={e => setOwner(e.target.value)} className="text-xs rounded-lg border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-[#1a2030] text-slate-600 dark:text-slate-300 px-2.5 py-1.5 outline-none">
              <option value="todos">Todos los vendedores</option>
              {owners.map(id => <option key={id} value={id}>{profileName(profiles, id)}</option>)}
            </select>
          )}
          <button onClick={() => setShowDiscarded(v => !v)} className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${showDiscarded ? 'bg-slate-800 dark:bg-white/10 text-white border-transparent' : 'border-slate-200 dark:border-white/[0.12] text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/[0.05]'}`}>
            Descartados
          </button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          <Kpi label="Registros" value={kpis.total} tint="#64748b" />
          <Kpi label="En pipeline" value={kpis.enPipeline} tint="#38bdf8" />
          <Kpi label="Fríos" value={kpis.frio} tint="#94a3b8" />
          <Kpi label="Propuestas" value={kpis.propuestas} tint="#f59e0b" />
          <Kpi label="Clientes" value={kpis.clientes} tint="#14b8a6" />
        </div>

        {/* Filtros de origen + búsqueda */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5">
            <Pill active={origin === 'todos'} onClick={() => setOrigin('todos')} label="Todos" />
            {Object.entries(ORIGINS).map(([k, m]) => (
              <Pill key={k} active={origin === k} onClick={() => setOrigin(k)} label={m.label} />
            ))}
          </div>
          <div className="flex-1 min-w-[180px]">
            <div className="relative">
              <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar nombre, empresa, correo…" className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1a2030] text-slate-800 dark:text-slate-100 placeholder:text-slate-400 outline-none focus:border-slate-400 dark:focus:border-white/20" />
            </div>
          </div>
        </div>

        {/* ── Tablero ── */}
        {view === 'tablero' ? (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {COLS.map(c => (
              <div key={c.key} className="flex-shrink-0 w-[240px] rounded-2xl bg-slate-50/70 dark:bg-white/[0.02] border border-slate-200 dark:border-white/[0.06] p-2.5">
                <div className="flex items-center gap-2 px-1 pb-2.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: c.color }} />
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{c.label}</span>
                  <span className="ml-auto text-[11px] font-mono text-slate-400 dark:text-slate-500 tabular-nums bg-white dark:bg-white/[0.06] rounded-full px-2 py-0.5">{byCol[c.key].length}</span>
                </div>
                <div className="space-y-2 max-h-[62vh] overflow-y-auto pr-0.5">
                  {byCol[c.key].length === 0 ? (
                    <p className="text-[11px] text-slate-300 dark:text-slate-600 italic text-center py-4">Vacío</p>
                  ) : byCol[c.key].map(r => <BoardCard key={r.id} r={r} onClick={() => setSelected(r)} />)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <ListView records={filtered} profiles={profiles} onSelect={setSelected} />
        )}
      </div>

      {selected && <DetailDrawer r={selected} profiles={profiles} onClose={() => setSelected(null)} />}
    </div>
  )
}

// ─── Tarjeta del tablero ─────────────────────────────────────────────────────
function BoardCard({ r, onClick }: { r: CrmRecord; onClick: () => void }) {
  const seg = r.segment ? SEGMENTS[r.segment] : null
  return (
    <button onClick={onClick} className="w-full text-left rounded-xl bg-white dark:bg-[#1e2535] border border-slate-200 dark:border-white/[0.08] px-3 py-2.5 hover:border-slate-300 dark:hover:border-white/20 transition-colors" style={CARD_S}>
      <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 truncate">{r.name}</p>
      {r.company && <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">{r.company}</p>}
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${ORIGINS[r.origin]?.cls ?? ''}`}>{ORIGINS[r.origin]?.label ?? r.origin}</span>
        {seg && <span className="text-[9.5px] font-semibold" style={{ color: seg.accent }}>{seg.label}</span>}
        {r.value ? <span className="text-[10px] font-bold font-mono text-amber-600 dark:text-amber-400 ml-auto">{money(r.value)}</span> : null}
      </div>
    </button>
  )
}

// ─── Vista de lista ──────────────────────────────────────────────────────────
function ListView({ records, profiles, onSelect }: { records: CrmRecord[]; profiles: Profile[]; onSelect: (r: CrmRecord) => void }) {
  if (records.length === 0) return <div className="py-14 text-center text-sm text-slate-400 dark:text-slate-500">No hay registros con estos filtros.</div>
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e2535] overflow-hidden" style={CARD_S}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
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
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-white text-[9px] font-bold" style={{ background: cm?.color ?? '#94a3b8' }}>{initials(r.name)}</span>
                      <span className="font-medium text-slate-800 dark:text-slate-100 truncate">{r.name}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400 truncate max-w-[160px]">{r.company ?? '—'}</td>
                  <td className="py-2.5 px-3"><span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300"><span className="w-1.5 h-1.5 rounded-full" style={{ background: cm?.color }} />{cm?.label}</span></td>
                  <td className="py-2.5 px-3"><span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${ORIGINS[r.origin]?.cls ?? ''}`}>{ORIGINS[r.origin]?.label ?? r.origin}</span></td>
                  <td className="py-2.5 px-3 font-mono text-[12px] text-amber-600 dark:text-amber-400">{r.value ? money(r.value) : '—'}</td>
                  <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400 truncate">{profileName(profiles, r.ownerId)}</td>
                  <td className="py-2.5 px-3 text-slate-400 dark:text-slate-500 text-[11px]">{fmtDate(r.updatedAt)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Panel de detalle ────────────────────────────────────────────────────────
function DetailDrawer({ r, profiles, onClose }: { r: CrmRecord; profiles: Profile[]; onClose: () => void }) {
  const cm = colMeta(r.col)
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30 dark:bg-black/50 backdrop-blur-[2px]" onClick={onClose}>
      <div className="w-full max-w-md h-full bg-white dark:bg-[#1a2030] border-l border-slate-200 dark:border-white/[0.08] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-5 space-y-5">
          <div className="flex items-start gap-3">
            <span className="w-11 h-11 rounded-full shrink-0 flex items-center justify-center text-white text-sm font-bold" style={{ background: cm?.color ?? '#94a3b8' }}>{initials(r.name)}</span>
            <div className="flex-1 min-w-0">
              <p className="text-base font-bold text-slate-900 dark:text-white truncate">{r.name}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{r.title}{r.title && r.company ? ' · ' : ''}{r.company}</p>
            </div>
            <button onClick={onClose} className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ background: (cm?.color ?? '#94a3b8') + '1a', color: cm?.color }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: cm?.color }} />{cm?.label}</span>
            <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full ${ORIGINS[r.origin]?.cls ?? ''}`}>{ORIGINS[r.origin]?.label}</span>
            <span className="text-[10px] font-medium px-2 py-1 rounded-full bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-slate-400">{r.kind === 'prospecto' ? 'Prospecto frío' : 'Contacto CRM'}</span>
          </div>

          <div className="space-y-2.5">
            <DrawerField label="Correo" value={r.email} href={r.email ? `mailto:${r.email}` : undefined} />
            <DrawerField label="Teléfono" value={r.phone} href={r.phone ? `https://wa.me/${r.phone.replace(/[^0-9]/g, '')}` : undefined} />
            <DrawerField label="Etapa (origen)" value={r.stageLabel} />
            <DrawerField label="Vendedor" value={profileName(profiles, r.ownerId)} />
            {r.value ? <DrawerField label="Valor de propuesta" value={money(r.value)} /> : null}
            {r.nextActionAt ? <DrawerField label="Próxima acción" value={fmtDate(r.nextActionAt)} /> : null}
            <DrawerField label="Última actualización" value={fmtDate(r.updatedAt)} />
          </div>

          <a href={r.href} className="block text-center text-xs font-semibold px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 transition-opacity">
            Ver ficha completa →
          </a>
        </div>
      </div>
    </div>
  )
}

function DrawerField({ label, value, href }: { label: string; value: string | null; href?: string }) {
  if (!value) return null
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 dark:border-white/[0.05] pb-2">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</span>
      {href ? <a href={href} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 dark:text-blue-400 hover:underline truncate">{value}</a> : <span className="text-sm text-slate-700 dark:text-slate-200 truncate">{value}</span>}
    </div>
  )
}

// ─── Átomos ──────────────────────────────────────────────────────────────────
function Tab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return <button onClick={onClick} className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${active ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}>{label}</button>
}
function Pill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return <button onClick={onClick} className={`text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors ${active ? 'bg-slate-800 dark:bg-white/10 text-white border-transparent' : 'bg-white dark:bg-[#1a2030] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/[0.1] hover:bg-slate-50 dark:hover:bg-white/[0.05]'}`}>{label}</button>
}
function Kpi({ label, value, tint }: { label: string; value: number; tint: string }) {
  return (
    <div className="rounded-2xl bg-white dark:bg-[#1e2535] border border-slate-200 dark:border-white/[0.08] px-3.5 py-3" style={CARD_S}>
      <div className="flex items-center gap-1.5 mb-1"><span className="w-1.5 h-1.5 rounded-full" style={{ background: tint }} /><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 truncate">{label}</p></div>
      <p className="text-xl font-bold text-slate-800 dark:text-slate-100 tabular-nums">{value}</p>
    </div>
  )
}
