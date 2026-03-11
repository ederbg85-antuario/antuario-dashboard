'use client'

import { useState, useMemo, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import FileUploader, { type ContactFile } from '@/components/common/FileUploader'

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
  { value: 'all', label: 'Todos', color: 'bg-slate-100 text-slate-700' },
  { value: 'lead_irrelevant', label: 'Leads irrelevantes', color: 'bg-red-50 text-red-600' },
  { value: 'lead_potential', label: 'Leads potenciales', color: 'bg-amber-50 text-amber-600' },
  { value: 'lead_relevant', label: 'Leads relevantes', color: 'bg-emerald-50 text-emerald-600' },
  { value: 'proposal', label: 'Propuestas', color: 'bg-blue-50 text-blue-600' },
  { value: 'active_proposal', label: 'Propuestas activas', color: 'bg-violet-50 text-violet-600' },
]

const STATUS_FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Activos' },
  { value: 'dormant', label: 'En reposo' },
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
  full_name: '',
  email: '',
  phone: '',
  company: '',
  contact_type: 'lead_potential',
  status: 'active',
  source: 'direct',
  source_campaign: '',
  source_medium: '',
  whatsapp: '',
  linkedin: '',
  primary_channel: 'email',
  notes: '',
  assigned_to: '',
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

function avatarColor(name: string | null) {
  const colors = ['bg-violet-500', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-cyan-500']
  if (!name) return colors[0]
  return colors[name.charCodeAt(0) % colors.length]
}

// ─── Supabase client ──────────────────────────────────────────────────────────

function getSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ContactosClient({
  orgId,
  currentUserId,
  currentUserRole,
  initialContacts,
  profiles,
  initialNotes,
  initialChannels,
  initialProposals,
  initialOrders,
  contactFiles,
}: Props) {
  const [contacts, setContacts] = useState<Contact[]>(initialContacts)
  const [notes, setNotes] = useState<Note[]>(initialNotes)
  const [channels, setChannels] = useState<Channel[]>(initialChannels)

  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')

  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingContact, setEditingContact] = useState<Contact | null>(null)

  const [newNote, setNewNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // ── Filtered contacts ──────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return contacts.filter(c => {
      if (typeFilter !== 'all' && c.contact_type !== typeFilter) return false
      if (statusFilter !== 'all' && c.status !== statusFilter) return false
      if (search) {
        const q = search.toLowerCase()
        const matches =
          c.full_name?.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q) ||
          c.company?.toLowerCase().includes(q)
        if (!matches) return false
      }
      return true
    })
  }, [contacts, typeFilter, statusFilter, search])

  // ── Counts per type ────────────────────────────────────────────────────────

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: contacts.length }
    contacts.forEach(c => {
      if (c.contact_type) map[c.contact_type] = (map[c.contact_type] ?? 0) + 1
    })
    return map
  }, [contacts])

  const statusCounts = useMemo(() => ({
    all: contacts.length,
    active: contacts.filter(c => c.status === 'active').length,
    dormant: contacts.filter(c => c.status === 'dormant').length,
  }), [contacts])

  // ── Contact proposals & orders ─────────────────────────────────────────────

  const contactProposals = useMemo(() =>
    selectedContact ? initialProposals.filter(p => p.contact_id === selectedContact.id) : [],
    [selectedContact, initialProposals]
  )

  const contactOrders = useMemo(() =>
    selectedContact ? initialOrders.filter(o => o.contact_id === selectedContact.id) : [],
    [selectedContact, initialOrders]
  )

  const contactChannels = useMemo(() =>
    selectedContact ? channels.filter(ch => ch.contact_id === selectedContact.id) : [],
    [selectedContact, channels]
  )

  const contactNotes = useMemo(() =>
    selectedContact ? notes.filter(n => n.contact_id === selectedContact.id) : [],
    [selectedContact, notes]
  )

  const closingRate = useMemo(() => {
    if (!contactProposals.length) return null
    const closed = contactProposals.filter(p => p.status === 'accepted').length
    return Math.round((closed / contactProposals.length) * 100)
  }, [contactProposals])

  const totalSpent = useMemo(() =>
    contactOrders.filter(o => o.status !== 'cancelled').reduce((sum, o) => sum + (o.total ?? 0), 0),
    [contactOrders]
  )

  const lastInteraction = useMemo(() => {
    const dates = [
      ...(contactProposals.map(p => p.created_at)),
      ...(contactOrders.map(o => o.created_at)),
    ].filter(Boolean)
    if (!dates.length) return null
    return dates.sort().reverse()[0]
  }, [contactProposals, contactOrders])

  // ── CRUD ───────────────────────────────────────────────────────────────────

  const openCreate = useCallback(() => {
    setForm(EMPTY_FORM)
    setFormError('')
    setEditingContact(null)
    setShowCreateModal(true)
  }, [])

  const openEdit = useCallback((c: Contact) => {
    setForm({
      full_name: c.full_name ?? '',
      email: c.email ?? '',
      phone: c.phone ?? '',
      company: c.company ?? '',
      contact_type: c.contact_type ?? 'lead_potential',
      status: c.status ?? 'active',
      source: c.source ?? 'direct',
      source_campaign: c.source_campaign ?? '',
      source_medium: c.source_medium ?? '',
      whatsapp: c.whatsapp ?? '',
      linkedin: c.linkedin ?? '',
      primary_channel: c.primary_channel ?? 'email',
      notes: c.notes ?? '',
      assigned_to: c.assigned_to ?? '',
    })
    setFormError('')
    setEditingContact(c)
    setShowCreateModal(true)
  }, [])

  const handleSave = useCallback(async () => {
    if (!form.full_name.trim()) { setFormError('El nombre es obligatorio'); return }
    setSaving(true)
    setFormError('')
    const supabase = getSupabase()
    const payload = {
      full_name: form.full_name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      company: form.company.trim() || null,
      contact_type: form.contact_type,
      status: form.status,
      source: form.source,
      source_campaign: form.source_campaign.trim() || null,
      source_medium: form.source_medium.trim() || null,
      whatsapp: form.whatsapp.trim() || null,
      linkedin: form.linkedin.trim() || null,
      primary_channel: form.primary_channel,
      notes: form.notes.trim() || null,
      assigned_to: form.assigned_to || null,
      organization_id: orgId,
    }

    if (editingContact) {
      const { data, error } = await supabase
        .from('contacts')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', editingContact.id)
        .select()
        .single()
      if (error) { setFormError(error.message); setSaving(false); return }
      setContacts(prev => prev.map(c => c.id === editingContact.id ? data : c))
      if (selectedContact?.id === editingContact.id) setSelectedContact(data)
    } else {
      const { data, error } = await supabase
        .from('contacts')
        .insert({ ...payload, created_by: currentUserId })
        .select()
        .single()
      if (error) { setFormError(error.message); setSaving(false); return }
      setContacts(prev => [data, ...prev])
    }

    setSaving(false)
    setShowCreateModal(false)
  }, [form, editingContact, orgId, currentUserId, selectedContact])

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('¿Eliminar este contacto? Esta acción no se puede deshacer.')) return
    const supabase = getSupabase()
    await supabase.from('contacts').delete().eq('id', id)
    setContacts(prev => prev.filter(c => c.id !== id))
    if (selectedContact?.id === id) setSelectedContact(null)
  }, [selectedContact])

  const handleAddNote = useCallback(async () => {
    if (!newNote.trim() || !selectedContact) return
    setSavingNote(true)
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('contact_notes')
      .insert({
        contact_id: selectedContact.id,
        organization_id: orgId,
        content: newNote.trim(),
        created_by: currentUserId,
      })
      .select()
      .single()
    if (!error && data) {
      setNotes(prev => [data, ...prev])
      setNewNote('')
    }
    setSavingNote(false)
  }, [newNote, selectedContact, orgId, currentUserId])

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full min-h-screen bg-slate-50">

      {/* ── Left Panel — Filters ──────────────────────────────────────────── */}
      <aside className="w-64 shrink-0 bg-white border-r border-slate-200 flex flex-col">
        <div className="p-5 border-b border-slate-100">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1">Contactos</h2>
          <p className="text-2xl font-bold text-slate-800">{contacts.length}</p>
        </div>

        {/* Type filters */}
        <div className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Tipo de contacto</p>
          <div className="space-y-1">
            {CONTACT_TYPES.map(t => (
              <button
                key={t.value}
                onClick={() => setTypeFilter(t.value)}
                className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-all ${
                  typeFilter === t.value
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span>{t.label}</span>
                <span className={`text-xs font-medium tabular-nums ${typeFilter === t.value ? 'text-slate-300' : 'text-slate-400'}`}>
                  {counts[t.value] ?? 0}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Status filters */}
        <div className="px-4 pb-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Estado</p>
          <div className="space-y-1">
            {STATUS_FILTERS.map(s => (
              <button
                key={s.value}
                onClick={() => setStatusFilter(s.value)}
                className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-all ${
                  statusFilter === s.value
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span>{s.label}</span>
                <span className={`text-xs font-medium tabular-nums ${statusFilter === s.value ? 'text-slate-300' : 'text-slate-400'}`}>
                  {statusCounts[s.value as keyof typeof statusCounts] ?? 0}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-auto p-4 border-t border-slate-100">
          <button
            onClick={openCreate}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
          >
            + Nuevo contacto
          </button>
        </div>
      </aside>

      {/* ── Center — Contact List ─────────────────────────────────────────── */}
      <main className={`flex flex-col transition-all duration-300 ${selectedContact ? 'w-80 shrink-0' : 'flex-1'}`}>
        {/* Search */}
        <div className="bg-white border-b border-slate-200 px-4 py-3">
          <input
            type="text"
            placeholder="Buscar por nombre, empresa o email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center px-8">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a4 4 0 00-5.477-3.72M9 20H4v-2a4 4 0 015.477-3.72M15 10a4 4 0 11-8 0 4 4 0 018 0zm6 0a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-slate-600 mb-1">Sin contactos</p>
              <p className="text-xs text-slate-400">Ajusta los filtros o crea un nuevo contacto</p>
            </div>
          ) : (
            filtered.map(c => {
              const typeConfig = getTypeConfig(c.contact_type)
              const isSelected = selectedContact?.id === c.id
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedContact(isSelected ? null : c)}
                  className={`w-full text-left px-4 py-3.5 hover:bg-slate-50 transition-colors ${isSelected ? 'bg-slate-50 border-l-2 border-slate-800' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-white text-xs font-bold ${avatarColor(c.full_name)}`}>
                      {getInitials(c.full_name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <p className="text-sm font-semibold text-slate-800 truncate">{c.full_name ?? '—'}</p>
                        {c.status === 'dormant' && (
                          <span className="shrink-0 text-xs text-slate-400">En reposo</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 truncate">{c.company ?? c.email ?? '—'}</p>
                      <div className="mt-1">
                        <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${typeConfig.color}`}>
                          {typeConfig.label}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </main>

      {/* ── Right Panel — Contact Detail ──────────────────────────────────── */}
      {selectedContact && (
        <div className="flex-1 overflow-y-auto bg-white border-l border-slate-200">
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

      {/* ── Create / Edit Modal ───────────────────────────────────────────── */}
      {showCreateModal && (
        <ContactModal
          form={form}
          profiles={profiles}
          isEditing={!!editingContact}
          saving={saving}
          error={formError}
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
  onEdit, onDelete, onClose,
  orgId, currentUserId, contactFiles,
}: {
  contact: Contact
  profiles: Profile[]
  channels: Channel[]
  notes: Note[]
  proposals: Proposal[]
  orders: Order[]
  closingRate: number | null
  totalSpent: number
  lastInteraction: string | null
  newNote: string
  savingNote: boolean
  onNewNoteChange: (v: string) => void
  onAddNote: () => void
  onEdit: () => void
  onDelete: () => void
  onClose: () => void
  orgId: number
  currentUserId: string
  contactFiles: ContactFile[]
}) {
  const [tab, setTab] = useState<'info' | 'actividad' | 'notas' | 'archivos'>('info')
  const typeConfig = getTypeConfig(contact.contact_type)
  const assignedProfile = profiles.find(p => p.id === contact.assigned_to)
  const sourceLabel = SOURCES.find(s => s.value === contact.source)?.label ?? contact.source ?? '—'

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-100">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-sm ${avatarColor(contact.full_name)}`}>
              {getInitials(contact.full_name)}
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-lg leading-tight">{contact.full_name ?? '—'}</h3>
              <p className="text-sm text-slate-500">{contact.company ?? '—'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={onEdit} className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-50 transition-colors">
              Editar
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${typeConfig.color}`}>{typeConfig.label}</span>
          {contact.status === 'active'
            ? <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 font-medium">Activo</span>
            : <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 font-medium">En reposo</span>
          }
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-100 px-6">
        {(['info', 'actividad', 'notas', 'archivos'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`py-3 px-1 mr-5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t ? 'border-slate-800 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            {t === 'info' ? 'Información' : t === 'actividad' ? 'Actividad' : t === 'notas' ? 'Notas' : 'Archivos'}
            {t === 'notas' && notes.length > 0 && (
              <span className="ml-1.5 bg-slate-100 text-slate-500 text-xs rounded-full px-1.5 py-0.5">{notes.length}</span>
            )}
            {t === 'archivos' && contactFiles.length > 0 && (
              <span className="ml-1.5 bg-slate-100 text-slate-500 text-xs rounded-full px-1.5 py-0.5">{contactFiles.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

        {/* ── Info tab ────────────────────────────────────────────────────── */}
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
                  <div key={ch.id} className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs">{CHANNELS.find(c => c.value === ch.channel_type)?.icon}</span>
                      <span className="text-sm text-slate-700">{ch.value}</span>
                    </div>
                    {ch.is_primary && (
                      <span className="text-xs bg-slate-100 text-slate-500 rounded-full px-2 py-0.5">Principal</span>
                    )}
                  </div>
                ))}
              </Section>
            )}

            {contact.notes && (
              <Section title="Notas generales">
                <p className="text-sm text-slate-600 leading-relaxed">{contact.notes}</p>
              </Section>
            )}
          </>
        )}

        {/* ── Actividad tab ────────────────────────────────────────────────── */}
        {tab === 'actividad' && (
          <>
            {/* Commercial KPIs */}
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Propuestas" value={proposals.length} />
              <StatCard label="Pedidos" value={orders.length} />
              <StatCard label="Tasa de cierre" value={closingRate !== null ? `${closingRate}%` : '—'} />
              <StatCard label="Última actividad" value={formatDate(lastInteraction)} small />
            </div>

            {totalSpent > 0 && (
              <div className="bg-emerald-50 rounded-xl p-4">
                <p className="text-xs text-emerald-600 font-medium mb-1">Total invertido</p>
                <p className="text-2xl font-bold text-emerald-700">
                  ${totalSpent.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </p>
              </div>
            )}

            {proposals.length > 0 && (
              <Section title="Propuestas">
                {proposals.map(p => (
                  <div key={p.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-slate-700 truncate max-w-[180px]">{p.title}</p>
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
                      <p className="text-sm font-medium text-slate-700 truncate max-w-[180px]">{o.title}</p>
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
              <div className="text-center py-8 text-slate-400 text-sm">Sin actividad comercial registrada</div>
            )}
          </>
        )}

        {/* ── Notas tab ──────────────────────────────────────────────────────── */}
        {tab === 'notas' && (
          <>
            <div className="flex flex-col gap-2">
              <textarea
                value={newNote}
                onChange={e => onNewNoteChange(e.target.value)}
                placeholder="Agregar nota sobre este contacto..."
                rows={3}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300 resize-none"
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
              {notes.length === 0 ? (
                <p className="text-center text-sm text-slate-400 py-6">Sin notas aún</p>
              ) : (
                notes.map(n => (
                  <div key={n.id} className="bg-slate-50 rounded-xl p-3">
                    <p className="text-sm text-slate-700 leading-relaxed">{n.content}</p>
                    <p className="text-xs text-slate-400 mt-2">{formatDate(n.created_at)}</p>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {/* ── Archivos tab ─────────────────────────────────────────────────── */}
        {tab === 'archivos' && (
          <div className="px-5 py-4">
            <FileUploader
              orgId={orgId}
              contactId={contact.id}
              currentUserId={currentUserId}
              initialFiles={contactFiles}
            />
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="border-t border-slate-100 px-6 py-3 flex items-center justify-between">
        <button
          onClick={onDelete}
          className="text-xs text-red-400 hover:text-red-600 transition-colors"
        >
          Eliminar contacto
        </button>
        <p className="text-xs text-slate-400">Actualizado {formatDate(contact.updated_at)}</p>
      </div>
    </div>
  )
}

// ─── Contact Modal ────────────────────────────────────────────────────────────

function ContactModal({ form, profiles, isEditing, saving, error, onChange, onSave, onClose }: {
  form: typeof EMPTY_FORM
  profiles: Profile[]
  isEditing: boolean
  saving: boolean
  error: string
  onChange: (key: string, val: string) => void
  onSave: () => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-900">{isEditing ? 'Editar contacto' : 'Nuevo contacto'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Basic info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <FieldLabel>Nombre completo *</FieldLabel>
              <Input value={form.full_name} onChange={v => onChange('full_name', v)} placeholder="Juan García" />
            </div>
            <div>
              <FieldLabel>Empresa</FieldLabel>
              <Input value={form.company} onChange={v => onChange('company', v)} placeholder="Empresa S.A." />
            </div>
            <div>
              <FieldLabel>Email</FieldLabel>
              <Input value={form.email} onChange={v => onChange('email', v)} placeholder="juan@empresa.com" type="email" />
            </div>
            <div>
              <FieldLabel>Teléfono</FieldLabel>
              <Input value={form.phone} onChange={v => onChange('phone', v)} placeholder="+52 55 0000 0000" />
            </div>
            <div>
              <FieldLabel>WhatsApp</FieldLabel>
              <Input value={form.whatsapp} onChange={v => onChange('whatsapp', v)} placeholder="+52 55 0000 0000" />
            </div>
            <div>
              <FieldLabel>LinkedIn</FieldLabel>
              <Input value={form.linkedin} onChange={v => onChange('linkedin', v)} placeholder="linkedin.com/in/..." />
            </div>
          </div>

          <Divider />

          {/* Classification */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Tipo de contacto</FieldLabel>
              <Select value={form.contact_type} onChange={v => onChange('contact_type', v)}
                options={CONTACT_TYPES.filter(t => t.value !== 'all').map(t => ({ value: t.value, label: t.label }))} />
            </div>
            <div>
              <FieldLabel>Estado</FieldLabel>
              <Select value={form.status} onChange={v => onChange('status', v)}
                options={[{ value: 'active', label: 'Activo' }, { value: 'dormant', label: 'En reposo' }]} />
            </div>
            <div>
              <FieldLabel>Canal principal</FieldLabel>
              <Select value={form.primary_channel} onChange={v => onChange('primary_channel', v)}
                options={CHANNELS.map(c => ({ value: c.value, label: c.label }))} />
            </div>
            <div>
              <FieldLabel>Responsable</FieldLabel>
              <Select value={form.assigned_to} onChange={v => onChange('assigned_to', v)}
                options={[{ value: '', label: 'Sin asignar' }, ...profiles.map(p => ({ value: p.id, label: p.full_name ?? p.email ?? p.id }))]} />
            </div>
          </div>

          <Divider />

          {/* Marketing source */}
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Fuente de marketing</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Fuente</FieldLabel>
              <Select value={form.source} onChange={v => onChange('source', v)}
                options={SOURCES.map(s => ({ value: s.value, label: s.label }))} />
            </div>
            <div>
              <FieldLabel>Medio</FieldLabel>
              <Input value={form.source_medium} onChange={v => onChange('source_medium', v)} placeholder="cpc, email, social..." />
            </div>
            <div className="col-span-2">
              <FieldLabel>Campaña</FieldLabel>
              <Input value={form.source_campaign} onChange={v => onChange('source_campaign', v)} placeholder="Nombre de la campaña" />
            </div>
          </div>

          <Divider />

          {/* Notes */}
          <div>
            <FieldLabel>Notas</FieldLabel>
            <textarea
              value={form.notes}
              onChange={e => onChange('notes', e.target.value)}
              rows={3}
              placeholder="Contexto comercial, observaciones..."
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300 resize-none"
            />
          </div>

          {error && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onClose} className="text-sm text-slate-600 hover:text-slate-800 px-4 py-2 rounded-lg border border-slate-200 transition-colors">
            Cancelar
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear contacto'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Small reusable components ────────────────────────────────────────────────

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
      <span className="text-xs text-slate-400 shrink-0 w-32">{label}</span>
      <span className="text-sm text-slate-700 text-right">{value ?? '—'}</span>
    </div>
  )
}

function StatCard({ label, value, small }: { label: string; value: string | number; small?: boolean }) {
  return (
    <div className="bg-slate-50 rounded-xl p-3">
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className={`font-bold text-slate-800 ${small ? 'text-sm' : 'text-xl'}`}>{value}</p>
    </div>
  )
}

function ProposalStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-500',
    sent: 'bg-blue-50 text-blue-600',
    accepted: 'bg-emerald-50 text-emerald-600',
    rejected: 'bg-red-50 text-red-500',
  }
  const labels: Record<string, string> = {
    draft: 'Borrador', sent: 'Enviada', accepted: 'Aceptada', rejected: 'Rechazada'
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[status] ?? 'bg-slate-100 text-slate-500'}`}>
      {labels[status] ?? status}
    </span>
  )
}

function OrderStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: 'bg-amber-50 text-amber-600',
    partial: 'bg-blue-50 text-blue-600',
    paid: 'bg-emerald-50 text-emerald-600',
    cancelled: 'bg-red-50 text-red-500',
  }
  const labels: Record<string, string> = {
    pending: 'Pendiente', partial: 'Parcial', paid: 'Pagado', cancelled: 'Cancelado'
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[status] ?? 'bg-slate-100 text-slate-500'}`}>
      {labels[status] ?? status}
    </span>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-slate-500 mb-1">{children}</label>
}

function Input({ value, onChange, placeholder, type = 'text' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
    />
  )
}

function Select({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[]
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white"
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

function Divider() {
  return <div className="border-t border-slate-100" />
}
