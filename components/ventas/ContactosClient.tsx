'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useSearchParams }                           from 'next/navigation'
import { createBrowserClient }                       from '@supabase/ssr'
import FileUploader, { type ContactFile } from '@/components/common/FileUploader'
import { CARD_S } from '@/components/ui/dashboard'

// ─── Types ────────────────────────────────────────────────────────────────────

type Contact = {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
  company: string | null
  pipeline_stage: string | null
  status: string | null
  contact_type: string | null
  source: string | null
  source_campaign: string | null
  source_medium: string | null
  whatsapp: string | null
  linkedin: string | null
  primary_channel: string | null
  notes: string | null
  assigned_to: string | null
  created_at: string | null
  updated_at: string | null
  created_by: string | null
}

type Profile = { id: string; full_name: string | null; email: string | null }
type Note = { id: string; contact_id: string; content: string; created_at: string; created_by: string | null }
type Channel = { id: string; contact_id: string; channel_type: string; value: string; is_primary: boolean }
type Proposal = { id: string; contact_id: string; status: string; total: number; title: string; created_at: string }
type Order = { id: string; contact_id: string; status: string; total: number; amount_paid: number; title: string; created_at: string }

type Props = {
  orgId: number
  currentUserId: string
  currentUserRole: string
  initialContacts: Contact[]
  profiles: Profile[]
  initialNotes: Note[]
  initialChannels: Channel[]
  initialProposals: Proposal[]
  initialOrders: Order[]
  contactFiles: ContactFile[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CONTACT_TYPES = [
  { value: 'all', label: 'Todos', color: 'bg-slate-100 text-slate-600', dot: '#94a3b8', accent: '#64748b' },
  { value: 'lead_irrelevant', label: 'Leads irrelevantes', color: 'bg-red-50 text-red-600', dot: '#f87171', accent: '#ef4444' },
  { value: 'lead_potential', label: 'Leads potenciales', color: 'bg-amber-50 text-amber-600', dot: '#fbbf24', accent: '#f59e0b' },
  { value: 'lead_relevant', label: 'Leads relevantes', color: 'bg-emerald-50 text-emerald-700', dot: '#34d399', accent: '#10b981' },
  { value: 'proposal', label: 'Propuestas', color: 'bg-blue-50 text-blue-600', dot: '#60a5fa', accent: '#3b82f6' },
  { value: 'active_proposal', label: 'Propuestas activas', color: 'bg-violet-50 text-violet-600', dot: '#a78bfa', accent: '#8b5cf6' },
]

const STATUS_FILTERS = [
  { value: 'all', label: 'Todos', icon: '◉' },
  { value: 'active', label: 'Activos', icon: '●' },
  { value: 'dormant', label: 'En reposo', icon: '○' },
]

const SOURCES = [
  { value: 'google_ads', label: 'Google Ads' },
  { value: 'seo', label: 'SEO' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'direct', label: 'Directo' },
  { value: 'referral', label: 'Referido' },
  { value: 'other', label: 'Otro' },
]

const CHANNELS = [
  { value: 'whatsapp', label: 'WhatsApp', icon: '💬' },
  { value: 'email', label: 'Email', icon: '📧' },
  { value: 'phone', label: 'Teléfono', icon: '📞' },
  { value: 'linkedin', label: 'LinkedIn', icon: '💼' },
]

const EMPTY_FORM = {
  full_name: '', email: '', phone: '', company: '',
  contact_type: 'lead_potential', status: 'active',
  source: 'direct', source_campaign: '', source_medium: '',
  whatsapp: '', linkedin: '', primary_channel: 'email',
  notes: '', assigned_to: '',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getTypeConfig(type: string | null) {
  return CONTACT_TYPES.find(t => t.value === type) ?? CONTACT_TYPES[0]
}
function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}
function getInitials(name: string | null) {
  if (!name) return '?'
  return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
}
function avatarBg(name: string | null) {
  const palette = [
    ['#dbeafe', '#1d4ed8'], ['#d1fae5', '#065f46'], ['#ede9fe', '#5b21b6'],
    ['#fef3c7', '#92400e'], ['#fce7f3', '#9d174d'], ['#e0f2fe', '#0c4a6e'],
  ]
  if (!name) return palette[0]
  return palette[name.charCodeAt(0) % palette.length]
}

function getSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ContactosClient({
  orgId, currentUserId, currentUserRole,
  initialContacts, profiles, initialNotes, initialChannels,
  initialProposals, initialOrders, contactFiles,
}: Props) {
  const searchParams = useSearchParams()

  const [contacts, setContacts] = useState<Contact[]>(initialContacts)
  const [notes, setNotes] = useState<Note[]>(initialNotes)
  const [channels, setChannels] = useState<Channel[]>(initialChannels)

  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')

  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)

  // Deep-link: si viene ?contact_id=X en la URL, pre-seleccionar ese contacto
  useEffect(() => {
    const paramId = searchParams.get('contact_id')
    if (!paramId || !initialContacts.length) return
    const match = initialContacts.find(c => String(c.id) === paramId)
    if (match) setSelectedContact(match)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingContact, setEditingContact] = useState<Contact | null>(null)
  const [newNote, setNewNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // ── Derived ──────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => contacts.filter(c => {
    if (typeFilter !== 'all' && c.contact_type !== typeFilter) return false
    if (statusFilter !== 'all' && c.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (!c.full_name?.toLowerCase().includes(q) && !c.email?.toLowerCase().includes(q) && !c.company?.toLowerCase().includes(q)) return false
    }
    return true
  }), [contacts, typeFilter, statusFilter, search])

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: contacts.length }
    contacts.forEach(c => { if (c.contact_type) map[c.contact_type] = (map[c.contact_type] ?? 0) + 1 })
    return map
  }, [contacts])

  const statusCounts = useMemo(() => ({
    all: contacts.length,
    active: contacts.filter(c => c.status === 'active').length,
    dormant: contacts.filter(c => c.status === 'dormant').length,
  }), [contacts])

  const contactProposals = useMemo(() =>
    selectedContact ? initialProposals.filter(p => p.contact_id === selectedContact.id) : [],
    [selectedContact, initialProposals])
  const contactOrders = useMemo(() =>
    selectedContact ? initialOrders.filter(o => o.contact_id === selectedContact.id) : [],
    [selectedContact, initialOrders])
  const contactChannels = useMemo(() =>
    selectedContact ? channels.filter(ch => ch.contact_id === selectedContact.id) : [],
    [selectedContact, channels])
  const contactNotes = useMemo(() =>
    selectedContact ? notes.filter(n => n.contact_id === selectedContact.id) : [],
    [selectedContact, notes])
  const closingRate = useMemo(() => {
    if (!contactProposals.length) return null
    return Math.round((contactProposals.filter(p => p.status === 'accepted').length / contactProposals.length) * 100)
  }, [contactProposals])
  const totalSpent = useMemo(() =>
    contactOrders.filter(o => o.status !== 'cancelled').reduce((sum, o) => sum + (o.total ?? 0), 0),
    [contactOrders])
  const lastInteraction = useMemo(() => {
    const dates = [...contactProposals.map(p => p.created_at), ...contactOrders.map(o => o.created_at)].filter(Boolean)
    return dates.length ? dates.sort().reverse()[0] : null
  }, [contactProposals, contactOrders])

  // ── CRUD ──────────────────────────────────────────────────────────────────────

  const openCreate = useCallback(() => { setForm(EMPTY_FORM); setFormError(''); setEditingContact(null); setShowCreateModal(true) }, [])
  const openEdit = useCallback((c: Contact) => {
    setForm({
      full_name: c.full_name ?? '', email: c.email ?? '', phone: c.phone ?? '', company: c.company ?? '',
      contact_type: c.contact_type ?? 'lead_potential', status: c.status ?? 'active', source: c.source ?? 'direct',
      source_campaign: c.source_campaign ?? '', source_medium: c.source_medium ?? '',
      whatsapp: c.whatsapp ?? '', linkedin: c.linkedin ?? '', primary_channel: c.primary_channel ?? 'email',
      notes: c.notes ?? '', assigned_to: c.assigned_to ?? ''
    })
    setFormError(''); setEditingContact(c); setShowCreateModal(true)
  }, [])

  const handleSave = useCallback(async () => {
    if (!form.full_name.trim()) { setFormError('El nombre es obligatorio'); return }
    setSaving(true); setFormError('')
    const supabase = getSupabase()
    const payload = {
      full_name: form.full_name.trim(), email: form.email.trim() || null,
      phone: form.phone.trim() || null, company: form.company.trim() || null,
      contact_type: form.contact_type, status: form.status, source: form.source,
      source_campaign: form.source_campaign.trim() || null, source_medium: form.source_medium.trim() || null,
      whatsapp: form.whatsapp.trim() || null, linkedin: form.linkedin.trim() || null,
      primary_channel: form.primary_channel, notes: form.notes.trim() || null,
      assigned_to: form.assigned_to || null, organization_id: orgId
    }
    if (editingContact) {
      const { data, error } = await supabase.from('contacts').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editingContact.id).select().single()
      if (error) { setFormError(error.message); setSaving(false); return }
      setContacts(prev => prev.map(c => c.id === editingContact.id ? data : c))
      if (selectedContact?.id === editingContact.id) setSelectedContact(data)
    } else {
      const { data, error } = await supabase.from('contacts').insert({ ...payload, created_by: currentUserId }).select().single()
      if (error) { setFormError(error.message); setSaving(false); return }
      setContacts(prev => [data, ...prev])
    }
    setSaving(false); setShowCreateModal(false)
  }, [form, editingContact, orgId, currentUserId, selectedContact])

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('¿Eliminar este contacto?')) return
    await getSupabase().from('contacts').delete().eq('id', id)
    setContacts(prev => prev.filter(c => c.id !== id))
    if (selectedContact?.id === id) setSelectedContact(null)
  }, [selectedContact])

  const handleAddNote = useCallback(async () => {
    if (!newNote.trim() || !selectedContact) return
    setSavingNote(true)
    const { data, error } = await getSupabase().from('contact_notes').insert({
      contact_id: selectedContact.id, organization_id: orgId, content: newNote.trim(), created_by: currentUserId,
    }).select().single()
    if (!error && data) { setNotes(prev => [data, ...prev]); setNewNote('') }
    setSavingNote(false)
  }, [newNote, selectedContact, orgId, currentUserId])

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full min-h-screen bg-slate-50">

      {/* ── LEFT PANEL — Stats + Filters ──────────────────────────────────────── */}
      <aside className="w-72 shrink-0 bg-white dark:bg-[#161b27] border-r border-slate-100 dark:border-slate-800 flex flex-col">

        {/* Header — dark gradient matching sidebar */}
        <div
          className="px-5 py-5 shrink-0"
          style={{ background: 'linear-gradient(135deg, #161928 0%, #1e2235 100%)' }}
        >
          <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-slate-500 dark:text-slate-400 mb-1">Contactos</p>
          <p className="text-4xl font-extrabold text-white tabular-nums leading-tight">{contacts.length}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {statusCounts.active} activos · {statusCounts.dormant} en reposo
          </p>
        </div>

        {/* Scrollable filter area */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

          {/* Tipo de Contacto */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3">Tipo de Contacto</p>
            <div className="grid grid-cols-2 gap-2">
              {CONTACT_TYPES.map(t => {
                const isActive = typeFilter === t.value
                const count = counts[t.value] ?? 0
                return (
                  <button
                    key={t.value}
                    onClick={() => setTypeFilter(t.value)}
                    className="text-left rounded-2xl p-3 border transition-all"
                    style={{
                      background: isActive ? t.accent : '#f8fafc',
                      borderColor: isActive ? t.accent : '#f1f5f9',
                      boxShadow: isActive ? `0 4px 14px ${t.dot}44` : 'none',
                    }}
                  >
                    <div className="w-8 h-1.5 rounded-full mb-2.5" style={{ background: t.dot }} />
                    <p className="text-[11px] font-medium leading-tight truncate" style={{ color: isActive ? 'rgba(255,255,255,0.8)' : '#94a3b8' }}>
                      {t.label === 'Todos' ? 'Todos' : t.label.replace('Leads ', '').replace('Propuestas', 'Prop.')}
                    </p>
                    <p className="text-xl font-extrabold tabular-nums mt-0.5" style={{ color: isActive ? '#fff' : '#0f172a' }}>
                      {count.toLocaleString()}
                    </p>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Estado del Contacto */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3">Estado del Contacto</p>
            <div className="grid grid-cols-2 gap-2">
              {STATUS_FILTERS.map(s => {
                const isActive = statusFilter === s.value
                const count = statusCounts[s.value as keyof typeof statusCounts] ?? 0
                const accent = s.value === 'active' ? '#10b981' : s.value === 'dormant' ? '#94a3b8' : '#64748b'
                return (
                  <button
                    key={s.value}
                    onClick={() => setStatusFilter(s.value)}
                    className="col-span-1 text-left rounded-2xl p-3 border transition-all"
                    style={{
                      background: isActive ? accent : '#f8fafc',
                      borderColor: isActive ? accent : '#f1f5f9',
                      boxShadow: isActive ? `0 4px 14px ${accent}44` : 'none',
                    }}
                  >
                    <div className="w-8 h-1.5 rounded-full mb-2.5" style={{ background: accent, opacity: isActive ? 1 : 0.5 }} />
                    <p className="text-[11px] font-medium" style={{ color: isActive ? 'rgba(255,255,255,0.8)' : '#94a3b8' }}>{s.label}</p>
                    <p className="text-xl font-extrabold tabular-nums mt-0.5" style={{ color: isActive ? '#fff' : '#0f172a' }}>
                      {count.toLocaleString()}
                    </p>
                  </button>
                )
              })}
            </div>
          </div>

        </div>

        {/* ── CTA fijo siempre visible ─────────────────────────────────────────── */}
        <div className="shrink-0 p-4 bg-white dark:bg-[#161b27] border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={openCreate}
            className="w-full flex items-center justify-center gap-2 text-sm font-bold py-3 rounded-xl transition-all shadow-lg"
            style={{
              background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
              color: '#fff',
              boxShadow: '0 4px 18px rgba(15,23,42,0.35)',
            }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Nuevo contacto
          </button>
        </div>
      </aside>

      {/* ── CENTER — Contact List ──────────────────────────────────────────────── */}
      <main className={`flex flex-col transition-all duration-300 ${selectedContact ? 'w-96 shrink-0' : 'flex-1'}`}>

        {/* Search bar */}
        <div className="bg-white dark:bg-[#161b27] border-b border-slate-100 dark:border-slate-800 px-4 py-3 flex items-center gap-3">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Buscar por nombre, empresa o email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-slate-50 dark:bg-[#0d1117] border border-slate-200 dark:border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-700 focus:border-slate-300"
            />
          </div>
          <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums shrink-0">{filtered.length} resultado{filtered.length !== 1 ? 's' : ''}</span>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center px-8">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-[#1a2030] flex items-center justify-center mb-4">
                <svg className="w-7 h-7 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a4 4 0 00-5.477-3.72M9 20H4v-2a4 4 0 015.477-3.72M15 10a4 4 0 11-8 0 4 4 0 018 0zm6 0a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-1">Sin contactos</p>
              <p className="text-xs text-slate-400">Ajusta los filtros o crea uno nuevo</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {filtered.map(c => {
                const typeConfig = getTypeConfig(c.contact_type)
                const [bgColor, textColor] = avatarBg(c.full_name)
                const isSelected = selectedContact?.id === c.id
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedContact(isSelected ? null : c)}
                    className="w-full text-left px-5 py-4 hover:bg-slate-50 transition-colors group"
                    style={isSelected ? { background: '#f8fafc', borderLeft: '3px solid #0f172a' } : { borderLeft: '3px solid transparent' }}
                  >
                    <div className="flex items-center gap-3.5">
                      {/* Avatar */}
                      <div
                        className="w-10 h-10 rounded-2xl shrink-0 flex items-center justify-center text-sm font-bold"
                        style={{ background: bgColor, color: textColor }}
                      >
                        {getInitials(c.full_name)}
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{c.full_name ?? '—'}</p>
                          {/* Type badge */}
                          <span
                            className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                            style={{ background: `${typeConfig.dot}22`, color: typeConfig.accent }}
                          >
                            {typeConfig.label === 'Todos' ? '' : typeConfig.label.replace('Leads ', '').replace('Propuestas activas', 'Prop. Act.').replace('Propuestas', 'Prop.')}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{c.company ?? c.email ?? '—'}</p>
                      </div>

                      {/* Status dot */}
                      <div className="shrink-0 flex items-center gap-1.5">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ background: c.status === 'active' ? '#10b981' : '#cbd5e1' }}
                        />
                        <span className="text-[10px] text-slate-400">
                          {c.status === 'active' ? 'Activo' : 'En reposo'}
                        </span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </main>

      {/* ── RIGHT PANEL — Detail ───────────────────────────────────────────────── */}
      {selectedContact && (
        <div className="flex-1 overflow-y-auto bg-white dark:bg-[#161b27] border-l border-slate-100 dark:border-slate-800">
          <DetailPanel
            contact={selectedContact}
            profiles={profiles}
            channels={contactChannels}
            notes={contactNotes}
            proposals={contactProposals}
            orders={contactOrders}
            closingRate={closingRate}
            totalSpent={totalSpent}
            lastInteraction={lastInteraction}
            newNote={newNote}
            savingNote={savingNote}
            onNewNoteChange={setNewNote}
            onAddNote={handleAddNote}
            onEdit={() => openEdit(selectedContact)}
            onDelete={() => handleDelete(selectedContact.id)}
            onClose={() => setSelectedContact(null)}
            orgId={orgId}
            currentUserId={currentUserId}
            contactFiles={contactFiles.filter(f => f.contact_id === selectedContact.id)}
          />
        </div>
      )}

      {/* ── Modal ──────────────────────────────────────────────────────────────── */}
      {showCreateModal && (
        <ContactModal
          form={form} profiles={profiles} isEditing={!!editingContact}
          saving={saving} error={formError}
          onChange={(key, val) => setForm(prev => ({ ...prev, [key]: val }))}
          onSave={handleSave}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  )
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function DetailPanel({
  contact, profiles, channels, notes, proposals, orders,
  closingRate, totalSpent, lastInteraction,
  newNote, savingNote, onNewNoteChange, onAddNote,
  onEdit, onDelete, onClose, orgId, currentUserId, contactFiles,
}: {
  contact: Contact; profiles: Profile[]; channels: Channel[]; notes: Note[]
  proposals: Proposal[]; orders: Order[]; closingRate: number | null; totalSpent: number
  lastInteraction: string | null; newNote: string; savingNote: boolean
  onNewNoteChange: (v: string) => void; onAddNote: () => void
  onEdit: () => void; onDelete: () => void; onClose: () => void
  orgId: number; currentUserId: string; contactFiles: ContactFile[]
}) {
  const [tab, setTab] = useState<'info' | 'actividad' | 'notas' | 'archivos'>('info')
  const typeConfig = getTypeConfig(contact.contact_type)
  const [bgColor, textColor] = avatarBg(contact.full_name)
  const assignedProfile = profiles.find(p => p.id === contact.assigned_to)
  const sourceLabel = SOURCES.find(s => s.value === contact.source)?.label ?? contact.source ?? '—'

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3.5">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-sm shrink-0"
              style={{ background: bgColor, color: textColor }}
            >
              {getInitials(contact.full_name)}
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base leading-tight">{contact.full_name ?? '—'}</h3>
              <p className="text-sm text-slate-400">{contact.company ?? '—'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Ir a chat: busca por teléfono o nombre */}
            {(contact.phone || contact.whatsapp || contact.full_name) && (
              <a
                href={`/ventas/bandeja?q=${encodeURIComponent(contact.full_name ?? contact.phone ?? contact.whatsapp ?? '')}`}
                title="Ver conversación en la bandeja"
                className="flex items-center gap-1.5 text-xs border border-emerald-200 rounded-lg px-3 py-1.5 text-emerald-600 hover:bg-emerald-50 transition-colors font-medium"
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                Chat
              </a>
            )}
            <button onClick={onEdit} className="text-xs border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-50 transition-colors font-medium">
              Editar
            </button>
            <button onClick={onClose} className="text-slate-300 hover:text-slate-500 p-1.5 rounded-lg hover:bg-slate-50 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {/* Badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="text-xs px-2.5 py-1 rounded-full font-semibold"
            style={{ background: `${typeConfig.dot}22`, color: typeConfig.accent }}
          >
            {typeConfig.label}
          </span>
          {contact.status === 'active'
            ? <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 font-semibold flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />Activo</span>
            : <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 dark:bg-[#1a2030] text-slate-500 dark:text-slate-400 font-semibold flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-slate-300 inline-block" />En reposo</span>
          }
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-100 dark:border-slate-800 px-6">
        {(['info', 'actividad', 'notas', 'archivos'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`py-3 px-1 mr-5 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === t ? 'border-slate-800 text-slate-900' : 'border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-600'}`}
          >
            {t === 'info' ? 'Información' : t === 'actividad' ? 'Actividad' : t === 'notas' ? 'Notas' : 'Archivos'}
            {t === 'notas' && notes.length > 0 && <span className="ml-1.5 bg-slate-100 dark:bg-[#1a2030] text-slate-500 dark:text-slate-400 text-[10px] rounded-full px-1.5 py-0.5">{notes.length}</span>}
            {t === 'archivos' && contactFiles.length > 0 && <span className="ml-1.5 bg-slate-100 dark:bg-[#1a2030] text-slate-500 dark:text-slate-400 text-[10px] rounded-full px-1.5 py-0.5">{contactFiles.length}</span>}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

        {tab === 'info' && (
          <>
            <Section title="Información general">
              <Row label="Email" value={contact.email} />
              <Row label="Teléfono" value={contact.phone} />
              <Row label="WhatsApp" value={contact.whatsapp} />
              <Row label="LinkedIn" value={contact.linkedin} />
              <Row label="Canal principal" value={CHANNELS.find(c => c.value === contact.primary_channel)?.label ?? contact.primary_channel} />
              <Row label="Responsable" value={assignedProfile?.full_name ?? assignedProfile?.email ?? '—'} />
              <Row label="Creado" value={formatDate(contact.created_at)} />
            </Section>
            <Section title="Fuente de marketing">
              <Row label="Fuente" value={sourceLabel} />
              <Row label="Campaña" value={contact.source_campaign} />
              <Row label="Medio" value={contact.source_medium} />
            </Section>
            {channels.length > 0 && (
              <Section title="Canales de comunicación">
                {channels.map(ch => (
                  <div key={ch.id} className="flex items-center justify-between py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs">{CHANNELS.find(c => c.value === ch.channel_type)?.icon}</span>
                      <span className="text-sm text-slate-700">{ch.value}</span>
                    </div>
                    {ch.is_primary && <span className="text-xs bg-slate-100 dark:bg-[#1a2030] text-slate-500 dark:text-slate-400 rounded-full px-2 py-0.5">Principal</span>}
                  </div>
                ))}
              </Section>
            )}
            {contact.notes && (
              <Section title="Notas generales">
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{contact.notes}</p>
              </Section>
            )}
          </>
        )}

        {tab === 'actividad' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Propuestas" value={proposals.length} />
              <StatCard label="Pedidos" value={orders.length} />
              <StatCard label="Tasa de cierre" value={closingRate !== null ? `${closingRate}%` : '—'} />
              <StatCard label="Última actividad" value={formatDate(lastInteraction)} small />
            </div>
            {totalSpent > 0 && (
              <div className="bg-emerald-50 rounded-2xl p-4">
                <p className="text-xs text-emerald-600 font-medium mb-1">Total invertido</p>
                <p className="text-2xl font-bold text-emerald-700">${totalSpent.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
              </div>
            )}
            {proposals.length > 0 && (
              <Section title="Propuestas">
                {proposals.map(p => (
                  <div key={p.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate max-w-[180px]">{p.title}</p>
                      <p className="text-xs text-slate-400">{formatDate(p.created_at)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-800">${(p.total ?? 0).toLocaleString('es-MX')}</p>
                      <ProposalStatusBadge status={p.status} />
                    </div>
                  </div>
                ))}
              </Section>
            )}
            {orders.length > 0 && (
              <Section title="Pedidos">
                {orders.map(o => (
                  <div key={o.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate max-w-[180px]">{o.title}</p>
                      <p className="text-xs text-slate-400">{formatDate(o.created_at)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-800">${(o.total ?? 0).toLocaleString('es-MX')}</p>
                      <OrderStatusBadge status={o.status} />
                    </div>
                  </div>
                ))}
              </Section>
            )}
            {proposals.length === 0 && orders.length === 0 && (
              <div className="text-center py-10 text-slate-400 dark:text-slate-500 text-sm">Sin actividad comercial registrada</div>
            )}
          </>
        )}

        {tab === 'notas' && (
          <>
            <div className="flex flex-col gap-2">
              <textarea
                value={newNote}
                onChange={e => onNewNoteChange(e.target.value)}
                placeholder="Agregar nota sobre este contacto..."
                rows={3}
                className="w-full border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-700 resize-none"
              />
              <button
                onClick={onAddNote}
                disabled={savingNote || !newNote.trim()}
                className="self-end bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-40"
              >
                {savingNote ? 'Guardando...' : 'Agregar nota'}
              </button>
            </div>
            <div className="space-y-3">
              {notes.length === 0
                ? <p className="text-center text-sm text-slate-400 dark:text-slate-500 py-6">Sin notas aún</p>
                : notes.map(n => (
                  <div key={n.id} className="bg-slate-50 rounded-xl p-3.5">
                    <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">{n.content}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">{formatDate(n.created_at)}</p>
                  </div>
                ))
              }
            </div>
          </>
        )}

        {tab === 'archivos' && (
          <FileUploader orgId={orgId} contactId={contact.id} currentUserId={currentUserId} initialFiles={contactFiles} />
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-slate-100 dark:border-slate-800 px-6 py-3 flex items-center justify-between">
        <button onClick={onDelete} className="text-xs text-red-400 hover:text-red-600 transition-colors">Eliminar contacto</button>
        <p className="text-xs text-slate-400">Actualizado {formatDate(contact.updated_at)}</p>
      </div>
    </div>
  )
}

// ─── Contact Modal ────────────────────────────────────────────────────────────

function ContactModal({ form, profiles, isEditing, saving, error, onChange, onSave, onClose }: {
  form: typeof EMPTY_FORM; profiles: Profile[]; isEditing: boolean
  saving: boolean; error: string; onChange: (key: string, val: string) => void
  onSave: () => void; onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-[#161b27] rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="font-bold text-slate-900">{isEditing ? 'Editar contacto' : 'Nuevo contacto'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><FieldLabel>Nombre completo *</FieldLabel><Input value={form.full_name} onChange={v => onChange('full_name', v)} placeholder="Juan García" /></div>
            <div><FieldLabel>Empresa</FieldLabel><Input value={form.company} onChange={v => onChange('company', v)} placeholder="Empresa S.A." /></div>
            <div><FieldLabel>Email</FieldLabel><Input value={form.email} onChange={v => onChange('email', v)} placeholder="juan@empresa.com" type="email" /></div>
            <div><FieldLabel>Teléfono</FieldLabel><Input value={form.phone} onChange={v => onChange('phone', v)} placeholder="+52 55 0000 0000" /></div>
            <div><FieldLabel>WhatsApp</FieldLabel><Input value={form.whatsapp} onChange={v => onChange('whatsapp', v)} placeholder="+52 55 0000 0000" /></div>
            <div className="col-span-2"><FieldLabel>LinkedIn</FieldLabel><Input value={form.linkedin} onChange={v => onChange('linkedin', v)} placeholder="linkedin.com/in/..." /></div>
          </div>
          <Divider />
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>Tipo de contacto</FieldLabel><Select value={form.contact_type} onChange={v => onChange('contact_type', v)} options={CONTACT_TYPES.filter(t => t.value !== 'all').map(t => ({ value: t.value, label: t.label }))} /></div>
            <div><FieldLabel>Estado</FieldLabel><Select value={form.status} onChange={v => onChange('status', v)} options={[{ value: 'active', label: 'Activo' }, { value: 'dormant', label: 'En reposo' }]} /></div>
            <div><FieldLabel>Canal principal</FieldLabel><Select value={form.primary_channel} onChange={v => onChange('primary_channel', v)} options={CHANNELS.map(c => ({ value: c.value, label: c.label }))} /></div>
            <div><FieldLabel>Responsable</FieldLabel><Select value={form.assigned_to} onChange={v => onChange('assigned_to', v)} options={[{ value: '', label: 'Sin asignar' }, ...profiles.map(p => ({ value: p.id, label: p.full_name ?? p.email ?? p.id }))]} /></div>
          </div>
          <Divider />
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Fuente de marketing</p>
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>Fuente</FieldLabel><Select value={form.source} onChange={v => onChange('source', v)} options={SOURCES.map(s => ({ value: s.value, label: s.label }))} /></div>
            <div><FieldLabel>Medio</FieldLabel><Input value={form.source_medium} onChange={v => onChange('source_medium', v)} placeholder="cpc, email, social..." /></div>
            <div className="col-span-2"><FieldLabel>Campaña</FieldLabel><Input value={form.source_campaign} onChange={v => onChange('source_campaign', v)} placeholder="Nombre de la campaña" /></div>
          </div>
          <Divider />
          <div>
            <FieldLabel>Notas</FieldLabel>
            <textarea value={form.notes} onChange={e => onChange('notes', e.target.value)} rows={3} placeholder="Contexto comercial, observaciones..."
              className="w-full border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-700 resize-none" />
          </div>
          {error && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        </div>
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3">
          <button onClick={onClose} className="text-sm text-slate-600 dark:text-slate-300 hover:text-slate-800 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-800 transition-colors">Cancelar</button>
          <button onClick={onSave} disabled={saving} className="bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors disabled:opacity-50">
            {saving ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear contacto'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Small components ─────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  )
}
function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start justify-between py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0 w-32">{label}</span>
      <span className="text-sm text-slate-700 dark:text-slate-200 text-right">{value ?? '—'}</span>
    </div>
  )
}
function StatCard({ label, value, small }: { label: string; value: string | number; small?: boolean }) {
  return (
    <div className="bg-slate-50 rounded-2xl p-3.5">
      <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">{label}</p>
      <p className={`font-bold text-slate-800 dark:text-slate-100 ${small ? 'text-sm' : 'text-2xl'}`}>{value}</p>
    </div>
  )
}
function ProposalStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = { draft: 'bg-slate-100 text-slate-500', sent: 'bg-blue-50 text-blue-600', accepted: 'bg-emerald-50 text-emerald-600', rejected: 'bg-red-50 text-red-500' }
  const labels: Record<string, string> = { draft: 'Borrador', sent: 'Enviada', accepted: 'Aceptada', rejected: 'Rechazada' }
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[status] ?? 'bg-slate-100 text-slate-500'}`}>{labels[status] ?? status}</span>
}
function OrderStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = { pending: 'bg-amber-50 text-amber-600', partial: 'bg-blue-50 text-blue-600', paid: 'bg-emerald-50 text-emerald-600', cancelled: 'bg-red-50 text-red-500' }
  const labels: Record<string, string> = { pending: 'Pendiente', partial: 'Parcial', paid: 'Pagado', cancelled: 'Cancelado' }
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[status] ?? 'bg-slate-100 text-slate-500'}`}>{labels[status] ?? status}</span>
}
function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{children}</label>
}
function Input({ value, onChange, placeholder, type = 'text' }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
    className="w-full border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-700" />
}
function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return <select value={value} onChange={e => onChange(e.target.value)}
    className="w-full border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-700 bg-white">
    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
}
function Divider() { return <div className="border-t border-slate-100 dark:border-slate-800" /> }
