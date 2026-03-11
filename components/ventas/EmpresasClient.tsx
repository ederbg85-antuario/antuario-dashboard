'use client'

import { useState, useMemo, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'

// ─── Types ────────────────────────────────────────────────────────────────────

type Company = {
  id: string; organization_id: number; name: string; industry: string | null
  website: string | null; phone: string | null; email: string | null
  city: string | null; country: string | null; notes: string | null
  assigned_to: string | null; created_by: string | null
  created_at: string; updated_at: string
}
type Contact = {
  id: string; full_name: string | null; email: string | null
  phone: string | null; company_id: string | null
  position: string | null; contact_type: string | null; status: string | null
}
type Profile = { id: string; full_name: string | null; email: string | null }

type Props = {
  orgId: number; currentUserId: string; currentUserRole: string
  initialCompanies: Company[]; contacts: Contact[]; profiles: Profile[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const INDUSTRIES = [
  'Manufactura', 'Comercio', 'Servicios', 'Tecnología', 'Construcción',
  'Salud', 'Educación', 'Alimentos', 'Logística', 'Marketing', 'Otro',
]

const EMPTY_FORM = {
  name: '', industry: '', website: '', phone: '',
  email: '', city: '', country: 'México', notes: '', assigned_to: '',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

function avatarColor(name: string) {
  const colors = ['bg-violet-500','bg-blue-500','bg-emerald-500','bg-amber-500','bg-rose-500','bg-cyan-500']
  return colors[name.charCodeAt(0) % colors.length]
}

function formatDate(s: string) {
  return new Date(s).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

function getSB() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function EmpresasClient({
  orgId, currentUserId, initialCompanies, contacts, profiles,
}: Props) {
  const [companies, setCompanies] = useState<Company[]>(initialCompanies)
  const [search, setSearch]       = useState('')
  const [selected, setSelected]   = useState<Company | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing]     = useState<Company | null>(null)
  const [form, setForm]           = useState(EMPTY_FORM)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  // ── Derived ────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    if (!search) return companies
    const q = search.toLowerCase()
    return companies.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.industry?.toLowerCase().includes(q) ||
      c.city?.toLowerCase().includes(q)
    )
  }, [companies, search])

  const companyContacts = useMemo(() =>
    selected ? contacts.filter(c => c.company_id === selected.id) : [],
    [selected, contacts]
  )

  const kpis = useMemo(() => {
    const withContacts = companies.filter(co =>
      contacts.some(c => c.company_id === co.id)
    ).length
    const industries = new Set(companies.map(c => c.industry).filter(Boolean)).size
    return { total: companies.length, withContacts, industries }
  }, [companies, contacts])

  // ── CRUD ───────────────────────────────────────────────────────────────────

  const openCreate = useCallback(() => {
    setForm(EMPTY_FORM); setError(''); setEditing(null); setShowModal(true)
  }, [])

  const openEdit = useCallback((c: Company) => {
    setForm({
      name: c.name, industry: c.industry ?? '', website: c.website ?? '',
      phone: c.phone ?? '', email: c.email ?? '', city: c.city ?? '',
      country: c.country ?? 'México', notes: c.notes ?? '',
      assigned_to: c.assigned_to ?? '',
    })
    setError(''); setEditing(c); setShowModal(true)
  }, [])

  const handleSave = useCallback(async () => {
    if (!form.name.trim()) { setError('El nombre es obligatorio'); return }
    setSaving(true); setError('')
    const client = getSB()
    const payload = {
      organization_id: orgId,
      name:        form.name.trim(),
      industry:    form.industry    || null,
      website:     form.website     || null,
      phone:       form.phone       || null,
      email:       form.email       || null,
      city:        form.city        || null,
      country:     form.country     || null,
      notes:       form.notes       || null,
      assigned_to: form.assigned_to || null,
    }

    if (editing) {
      const { data, error: e } = await client
        .from('companies').update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', editing.id).select().single()
      if (e) { setError(e.message); setSaving(false); return }
      setCompanies(p => p.map(c => c.id === editing.id ? data : c))
      if (selected?.id === editing.id) setSelected(data)
    } else {
      const { data, error: e } = await client
        .from('companies').insert({ ...payload, created_by: currentUserId })
        .select().single()
      if (e) { setError(e.message); setSaving(false); return }
      setCompanies(p => [data, ...p].sort((a, b) => a.name.localeCompare(b.name)))
    }

    setSaving(false); setShowModal(false)
  }, [form, editing, orgId, currentUserId, selected])

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('¿Eliminar esta empresa? Los contactos asociados quedarán sin empresa.')) return
    await getSB().from('companies').delete().eq('id', id)
    setCompanies(p => p.filter(c => c.id !== id))
    if (selected?.id === id) setSelected(null)
  }, [selected])

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full min-h-screen bg-slate-50">

      {/* ── Left sidebar ─────────────────────────────────────────────────── */}
      <aside className="w-64 shrink-0 bg-white border-r border-slate-200 flex flex-col">
        <div className="p-5 border-b border-slate-100">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">Empresas</h2>
          <div className="grid grid-cols-1 gap-3">
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs text-slate-400">Total</p>
              <p className="text-2xl font-bold text-slate-900">{kpis.total}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-blue-50 rounded-xl p-3">
                <p className="text-xs text-blue-500">Con contactos</p>
                <p className="text-lg font-bold text-blue-700">{kpis.withContacts}</p>
              </div>
              <div className="bg-violet-50 rounded-xl p-3">
                <p className="text-xs text-violet-500">Industrias</p>
                <p className="text-lg font-bold text-violet-700">{kpis.industries}</p>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-auto p-4 border-t border-slate-100">
          <button onClick={openCreate}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium py-2.5 rounded-lg transition-colors">
            + Nueva empresa
          </button>
        </div>
      </aside>

      {/* ── Center list ───────────────────────────────────────────────────── */}
      <main className={`flex flex-col transition-all ${selected ? 'w-80 shrink-0' : 'flex-1'}`}>
        <div className="bg-white border-b border-slate-200 px-4 py-3">
          <input
            type="text" placeholder="Buscar empresa..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center px-8">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <p className="text-sm font-medium text-slate-600">Sin empresas</p>
              <p className="text-xs text-slate-400 mt-1">Crea tu primera empresa B2B</p>
            </div>
          ) : (
            filtered.map(company => {
              const cnt      = contacts.filter(c => c.company_id === company.id).length
              const isActive = selected?.id === company.id
              return (
                <button key={company.id} onClick={() => setSelected(isActive ? null : company)}
                  className={`w-full text-left px-4 py-4 hover:bg-slate-50 transition-colors ${isActive ? 'bg-slate-50 border-l-2 border-slate-800' : ''}`}>
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`w-9 h-9 rounded-xl shrink-0 flex items-center justify-center text-white text-xs font-bold ${avatarColor(company.name)}`}>
                      {getInitials(company.name)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{company.name}</p>
                      <p className="text-xs text-slate-400 truncate">
                        {company.industry ?? '—'}{company.city ? ` · ${company.city}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 pl-12">
                    <span className="text-xs bg-slate-100 text-slate-500 rounded-full px-2 py-0.5">
                      {cnt} contacto{cnt !== 1 ? 's' : ''}
                    </span>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </main>

      {/* ── Right detail panel ────────────────────────────────────────────── */}
      {selected && (
        <div className="flex-1 overflow-y-auto bg-white border-l border-slate-200">
          <CompanyDetail
            company={selected}
            contacts={companyContacts}
            profiles={profiles}
            onEdit={() => openEdit(selected)}
            onDelete={() => handleDelete(selected.id)}
            onClose={() => setSelected(null)}
          />
        </div>
      )}

      {/* ── Modal ─────────────────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900">{editing ? 'Editar empresa' : 'Nueva empresa'}</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <Field label="Nombre *">
                <Input value={form.name} onChange={v => set('name', v)} placeholder="Nombre de la empresa" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Industria">
                  <select value={form.industry} onChange={e => set('industry', e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white">
                    <option value="">Sin industria</option>
                    {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </Field>
                <Field label="Ciudad">
                  <Input value={form.city} onChange={v => set('city', v)} placeholder="Ciudad" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Teléfono">
                  <Input value={form.phone} onChange={v => set('phone', v)} placeholder="+52 55..." />
                </Field>
                <Field label="Email">
                  <Input value={form.email} onChange={v => set('email', v)} placeholder="contacto@empresa.com" type="email" />
                </Field>
              </div>
              <Field label="Sitio web">
                <Input value={form.website} onChange={v => set('website', v)} placeholder="https://empresa.com" />
              </Field>
              <Field label="Responsable">
                <select value={form.assigned_to} onChange={e => set('assigned_to', e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white">
                  <option value="">Sin asignar</option>
                  {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name ?? p.email}</option>)}
                </select>
              </Field>
              <Field label="Notas">
                <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
                  rows={3} placeholder="Notas internas..."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300 resize-none" />
              </Field>
              {error && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)}
                className="text-sm text-slate-600 px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                className="bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors disabled:opacity-50">
                {saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear empresa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function CompanyDetail({
  company, contacts, profiles, onEdit, onDelete, onClose,
}: {
  company: Company; contacts: Contact[]
  profiles: Profile[]; onEdit: () => void; onDelete: () => void; onClose: () => void
}) {
  const assigned = profiles.find(p => p.id === company.assigned_to)

  const STATUS_LABELS: Record<string, { label: string; color: string }> = {
    lead_irrelevant: { label: 'Lead Irrel.',  color: 'bg-slate-100 text-slate-500' },
    lead_potential:  { label: 'Lead Pot.',    color: 'bg-yellow-50 text-yellow-700' },
    lead_relevant:   { label: 'Lead Rel.',    color: 'bg-blue-50 text-blue-700' },
    proposal:        { label: 'Propuesta',    color: 'bg-violet-50 text-violet-700' },
    active_proposal: { label: 'Prop. Act.',   color: 'bg-orange-50 text-orange-700' },
    cliente:         { label: 'Cliente',      color: 'bg-emerald-50 text-emerald-700' },
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-5 border-b border-slate-100">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-sm ${avatarColor(company.name)}`}>
              {getInitials(company.name)}
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-lg leading-tight">{company.name}</h3>
              <p className="text-sm text-slate-500">{company.industry ?? '—'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onEdit} className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-50">Editar</button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
        {/* Info */}
        <Section title="Información">
          <Row label="Email"       value={company.email} />
          <Row label="Teléfono"    value={company.phone} />
          <Row label="Web"         value={company.website} />
          <Row label="Ciudad"      value={company.city} />
          <Row label="País"        value={company.country} />
          <Row label="Responsable" value={assigned?.full_name ?? assigned?.email} />
          <Row label="Cliente desde" value={formatDate(company.created_at)} />
        </Section>

        {/* Contacts */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
            Contactos ({contacts.length})
          </p>
          {contacts.length === 0 ? (
            <p className="text-xs text-slate-400 py-2">Sin contactos asociados</p>
          ) : (
            <div className="space-y-2">
              {contacts.map(c => {
                const st = STATUS_LABELS[c.status ?? '']
                return (
                  <div key={c.id} className="flex items-center gap-3 p-3 border border-slate-100 rounded-xl">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${avatarColor(c.full_name ?? 'U')}`}>
                      {getInitials(c.full_name ?? 'U')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">{c.full_name ?? '—'}</p>
                      <p className="text-xs text-slate-400">{c.position ?? c.email ?? '—'}</p>
                    </div>
                    {st && (
                      <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${st.color}`}>
                        {st.label}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Notes */}
        {company.notes && (
          <Section title="Notas">
            <p className="text-sm text-slate-600 bg-slate-50 rounded-xl p-3">{company.notes}</p>
          </Section>
        )}
      </div>

      <div className="border-t border-slate-100 px-6 py-3 flex justify-between items-center">
        <button onClick={onDelete} className="text-xs text-red-400 hover:text-red-600">Eliminar empresa</button>
        <p className="text-xs text-slate-400">Desde {formatDate(company.created_at)}</p>
      </div>
    </div>
  )
}

// ─── Micro components ─────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  )
}
function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start justify-between py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-xs text-slate-400 shrink-0 w-28">{label}</span>
      <span className="text-sm text-slate-700 text-right">{value ?? '—'}</span>
    </div>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>{children}</div>
}
function Input({ value, onChange, placeholder, type = 'text' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300" />
  )
}


