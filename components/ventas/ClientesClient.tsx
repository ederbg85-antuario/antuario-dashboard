'use client'

import { useState, useMemo, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { CARD_S } from '@/components/ui/dashboard'

// ─── Types ────────────────────────────────────────────────────────────────────

type Client = {
  id: string
  name: string | null
  organization_id: number
  contact_id: string | null
  assigned_to: string | null
  created_by: string | null
  total_revenue: number | null
  total_purchases: number | null
  average_ticket: number | null
  last_purchase_at: string | null
  contracted_services: string[] | null
  created_at: string
  updated_at: string
}

type Contact = { id: string; full_name: string | null; email: string | null; company: string | null; phone: string | null; whatsapp: string | null }
type Profile = { id: string; full_name: string | null; email: string | null }
type Order = { id: string; client_id: string | null; contact_id: string | null; title: string; status: string; total: number; amount_paid: number; created_at: string }
type Proposal = { id: string; client_id: string | null; contact_id: string | null; title: string; status: string; total: number; created_at: string }

type Props = {
  orgId: number
  currentUserId: string
  currentUserRole: string
  initialClients: Client[]
  contacts: Contact[]
  profiles: Profile[]
  initialOrders: Order[]
  initialProposals: Proposal[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SORT_OPTIONS = [
  { value: 'revenue_desc', label: 'Mayor revenue' },
  { value: 'revenue_asc', label: 'Menor revenue' },
  { value: 'name_asc', label: 'Nombre A–Z' },
  { value: 'recent', label: 'Más recientes' },
]

const ORDER_STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700',
  partial: 'bg-blue-50 text-blue-700',
  paid: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-red-50 text-red-500',
}

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente', partial: 'Pago parcial', paid: 'Pagado', cancelled: 'Cancelado',
}

const PROPOSAL_STATUS_STYLES: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  sent: 'bg-blue-50 text-blue-600',
  accepted: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-red-50 text-red-500',
}

const PROPOSAL_STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador', sent: 'Enviada', accepted: 'Aceptada', rejected: 'Rechazada',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatMXN(n: number | null | undefined) {
  return (n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDate(s: string | null | undefined) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
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

function getSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

const EMPTY_FORM = {
  name: '',
  contact_id: '',
  assigned_to: '',
  contracted_services: '',
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ClientesClient({
  orgId, currentUserId, currentUserRole,
  initialClients, contacts, profiles,
  initialOrders, initialProposals,
}: Props) {
  const [clients, setClients] = useState<Client[]>(initialClients)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('revenue_desc')

  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)

  // ── Computed ───────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = clients.filter(c => {
      if (!search) return true
      const q = search.toLowerCase()
      const contact = contacts.find(ct => ct.id === c.contact_id)
      return (
        c.name?.toLowerCase().includes(q) ||
        contact?.full_name?.toLowerCase().includes(q) ||
        contact?.company?.toLowerCase().includes(q)
      )
    })

    switch (sort) {
      case 'revenue_desc': list = [...list].sort((a, b) => (b.total_revenue ?? 0) - (a.total_revenue ?? 0)); break
      case 'revenue_asc': list = [...list].sort((a, b) => (a.total_revenue ?? 0) - (b.total_revenue ?? 0)); break
      case 'name_asc': list = [...list].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')); break
      case 'recent': list = [...list].sort((a, b) => b.created_at.localeCompare(a.created_at)); break
    }
    return list
  }, [clients, search, sort, contacts])

  const portfolio = useMemo(() => ({
    totalRevenue: clients.reduce((s, c) => s + (c.total_revenue ?? 0), 0),
    totalClients: clients.length,
    avgTicket: clients.length
      ? clients.reduce((s, c) => s + (c.average_ticket ?? 0), 0) / clients.length
      : 0,
    topClient: clients.reduce<Client | null>((top, c) =>
      !top || (c.total_revenue ?? 0) > (top.total_revenue ?? 0) ? c : top, null),
  }), [clients])

  const clientOrders = useMemo(() =>
    selectedClient ? initialOrders.filter(o => o.client_id === selectedClient.id) : [],
    [selectedClient, initialOrders]
  )

  const clientProposals = useMemo(() =>
    selectedClient ? initialProposals.filter(p => p.client_id === selectedClient.id) : [],
    [selectedClient, initialProposals]
  )

  const clientContact = useMemo(() =>
    selectedClient ? contacts.find(c => c.id === selectedClient.contact_id) ?? null : null,
    [selectedClient, contacts]
  )

  // ── CRUD ───────────────────────────────────────────────────────────────────

  const openCreate = useCallback(() => {
    setForm(EMPTY_FORM)
    setFormError('')
    setEditingClient(null)
    setShowModal(true)
  }, [])

  const openEdit = useCallback((c: Client) => {
    setForm({
      name: c.name ?? '',
      contact_id: c.contact_id ?? '',
      assigned_to: c.assigned_to ?? '',
      contracted_services: (c.contracted_services ?? []).join(', '),
    })
    setFormError('')
    setEditingClient(c)
    setShowModal(true)
  }, [])

  const handleSave = useCallback(async () => {
    if (!form.name.trim()) { setFormError('El nombre es obligatorio'); return }
    setSaving(true)
    setFormError('')
    const supabase = getSupabase()

    const services = form.contracted_services
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)

    const payload = {
      organization_id: orgId,
      name: form.name.trim(),
      contact_id: form.contact_id || null,
      assigned_to: form.assigned_to || null,
      contracted_services: services.length > 0 ? services : null,
    }

    if (editingClient) {
      const { data, error } = await supabase
        .from('clients')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', editingClient.id)
        .select()
        .single()
      if (error) { setFormError(error.message); setSaving(false); return }
      setClients(prev => prev.map(c => c.id === editingClient.id ? data : c))
      if (selectedClient?.id === editingClient.id) setSelectedClient(data)
    } else {
      const { data, error } = await supabase
        .from('clients')
        .insert({ ...payload, created_by: currentUserId })
        .select()
        .single()
      if (error) { setFormError(error.message); setSaving(false); return }
      setClients(prev => [data, ...prev])
    }

    setSaving(false)
    setShowModal(false)
  }, [form, editingClient, orgId, currentUserId, selectedClient])

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('¿Eliminar este cliente?')) return
    const supabase = getSupabase()
    await supabase.from('clients').delete().eq('id', id)
    setClients(prev => prev.filter(c => c.id !== id))
    if (selectedClient?.id === id) setSelectedClient(null)
  }, [selectedClient])

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full min-h-screen bg-slate-50">

      {/* ── Left panel ───────────────────────────────────────────────────── */}
      <aside className="w-64 shrink-0 bg-white border-r border-slate-100 flex flex-col">

        {/* Dark gradient header — shrink-0 */}
        <div className="px-5 py-5 shrink-0" style={{ background: 'linear-gradient(135deg, #161928 0%, #1e2235 100%)' }}>
          <p className="text-[10px] font-bold tracking-[0.14em] uppercase mb-1" style={{ color: 'rgba(148,163,184,0.7)' }}>Clientes</p>
          <p className="text-3xl font-extrabold tabular-nums text-white">{clients.length}</p>
          <div className="mt-3 flex items-center gap-3 text-xs" style={{ color: 'rgba(148,163,184,0.85)' }}>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
              {clients.filter(c => (c.total_revenue ?? 0) > 0).length} activos
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-500 inline-block" />
              {clients.filter(c => !c.total_revenue).length} nuevos
            </span>
          </div>
        </div>

        {/* Scrollable KPIs — flex-1 overflow-y-auto */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          <div className="rounded-2xl p-3 bg-emerald-50 border border-emerald-100">
            <p className="text-[10px] font-bold tracking-widest uppercase text-emerald-500 mb-0.5">Revenue total</p>
            <p className="text-base font-bold text-emerald-800 tabular-nums">${formatMXN(portfolio.totalRevenue)}</p>
          </div>
          <div className="rounded-2xl p-3 bg-blue-50 border border-blue-100">
            <p className="text-[10px] font-bold tracking-widest uppercase text-blue-500 mb-0.5">Ticket promedio</p>
            <p className="text-base font-bold text-blue-800 tabular-nums">${formatMXN(portfolio.avgTicket)}</p>
          </div>
          {portfolio.topClient && (
            <div className="rounded-2xl p-3 bg-violet-50 border border-violet-100">
              <p className="text-[10px] font-bold tracking-widest uppercase text-violet-500 mb-0.5">Cliente top</p>
              <p className="text-sm font-bold text-violet-800 truncate">{portfolio.topClient.name ?? '—'}</p>
              <p className="text-xs text-violet-500 mt-0.5">${formatMXN(portfolio.topClient.total_revenue)}</p>
            </div>
          )}
        </div>

        {/* Sticky CTA — shrink-0 */}
        <div className="shrink-0 p-4 bg-white border-t border-slate-100">
          <button
            onClick={openCreate}
            className="w-full flex items-center justify-center gap-2 text-white text-sm font-semibold py-3 rounded-xl transition-all"
            style={{
              background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
              boxShadow: '0 4px 18px rgba(15,23,42,0.35)',
            }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Nuevo cliente
          </button>
        </div>
      </aside>

      {/* ── Center — list ─────────────────────────────────────────────────── */}
      <main className={`flex flex-col transition-all duration-300 ${selectedClient ? 'w-80 shrink-0' : 'flex-1'}`}>
        {/* Search + sort */}
        <div className="bg-white border-b border-slate-200 px-4 py-3 flex gap-2">
          <input
            type="text"
            placeholder="Buscar cliente..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
          <select
            value={sort}
            onChange={e => setSort(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-300"
          >
            {SORT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Client list */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center px-8">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <p className="text-sm font-medium text-slate-600 mb-1">Sin clientes</p>
              <p className="text-xs text-slate-400">Crea un cliente o convierte un contacto</p>
            </div>
          ) : (
            filtered.map(client => {
              const contact = contacts.find(c => c.id === client.contact_id)
              const isSelected = selectedClient?.id === client.id
              const orders = initialOrders.filter(o => o.client_id === client.id)
              const paidOrders = orders.filter(o => o.status === 'paid').length

              return (
                <button
                  key={client.id}
                  onClick={() => setSelectedClient(isSelected ? null : client)}
                  className={`w-full text-left px-4 py-4 hover:bg-slate-50 transition-colors ${isSelected ? 'bg-slate-50 border-l-2 border-slate-800' : ''}`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-white text-xs font-bold ${avatarColor(client.name)}`}>
                      {getInitials(client.name)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{client.name ?? '—'}</p>
                      {contact && (
                        <p className="text-xs text-slate-400 truncate">
                          {contact.full_name}{contact.company ? ` · ${contact.company}` : ''}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-1">
                    <MiniStat label="Revenue" value={`$${formatMXN(client.total_revenue)}`} />
                    <MiniStat label="Pedidos" value={`${orders.length}`} />
                    <MiniStat label="Pagados" value={`${paidOrders}`} />
                  </div>
                </button>
              )
            })
          )}
        </div>
      </main>

      {/* ── Right panel — client detail ───────────────────────────────────── */}
      {selectedClient && (
        <div className="flex-1 overflow-y-auto bg-white border-l border-slate-200">
          <ClientDetail
            client={selectedClient}
            contact={clientContact}
            profiles={profiles}
            orders={clientOrders}
            proposals={clientProposals}
            onEdit={() => openEdit(selectedClient)}
            onDelete={() => handleDelete(selectedClient.id)}
            onClose={() => setSelectedClient(null)}
          />
        </div>
      )}

      {/* ── Modal ─────────────────────────────────────────────────────────── */}
      {showModal && (
        <ClientModal
          isEditing={!!editingClient}
          saving={saving}
          error={formError}
          contacts={contacts}
          profiles={profiles}
          form={form}
          onChange={(key, val) => setForm(prev => ({ ...prev, [key]: val }))}
          onSave={handleSave}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}

// ─── Client Detail Panel ──────────────────────────────────────────────────────

function ClientDetail({
  client, contact, profiles, orders, proposals,
  onEdit, onDelete, onClose,
}: {
  client: Client
  contact: Contact | null
  profiles: Profile[]
  orders: Order[]
  proposals: Proposal[]
  onEdit: () => void
  onDelete: () => void
  onClose: () => void
}) {
  const [tab, setTab] = useState<'info' | 'pedidos' | 'propuestas'>('info')
  const assigned = profiles.find(p => p.id === client.assigned_to)

  const totalCollected = orders
    .filter(o => o.status !== 'cancelled')
    .reduce((s, o) => s + (o.amount_paid ?? 0), 0)

  const closingRate = proposals.length
    ? Math.round((proposals.filter(p => p.status === 'accepted').length / proposals.length) * 100)
    : null

  const lastOrder = orders.length
    ? orders.sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
    : null

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-100">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-sm ${avatarColor(client.name)}`}>
              {getInitials(client.name)}
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-lg leading-tight">{client.name ?? '—'}</h3>
              {contact && (
                <p className="text-sm text-slate-500">
                  {contact.full_name}{contact.company ? ` · ${contact.company}` : ''}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={onEdit} className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-50">
              Editar
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-100 px-6">
        {(['info', 'pedidos', 'propuestas'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`py-3 px-1 mr-5 text-sm font-medium border-b-2 -mb-px transition-colors capitalize ${tab === t ? 'border-slate-800 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
          >
            {t === 'info' ? 'Información' : t}
            {t === 'pedidos' && orders.length > 0 && (
              <span className="ml-1.5 bg-slate-100 text-slate-500 text-xs rounded-full px-1.5 py-0.5">{orders.length}</span>
            )}
            {t === 'propuestas' && proposals.length > 0 && (
              <span className="ml-1.5 bg-slate-100 text-slate-500 text-xs rounded-full px-1.5 py-0.5">{proposals.length}</span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

        {/* ── Info ────────────────────────────────────────────────────────── */}
        {tab === 'info' && (
          <>
            {/* Revenue KPIs */}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-2xl p-4" style={CARD_S}>
                <p className="text-xs text-emerald-600 font-semibold mb-1">Revenue total</p>
                <p className="text-3xl font-extrabold text-emerald-800 tabular-nums">${formatMXN(client.total_revenue)}</p>
                <p className="text-xs text-emerald-600 mt-1">${formatMXN(totalCollected)} cobrado efectivamente</p>
              </div>
              <StatCard label="Compras" value={String(client.total_purchases ?? 0)} />
              <StatCard label="Ticket promedio" value={`$${formatMXN(client.average_ticket)}`} />
              {closingRate !== null && (
                <StatCard label="Tasa de cierre" value={`${closingRate}%`} />
              )}
              {lastOrder && (
                <StatCard label="Última compra" value={formatDate(lastOrder.created_at)} small />
              )}
            </div>

            {/* Contracted services */}
            {client.contracted_services && client.contracted_services.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Servicios contratados</p>
                <div className="flex flex-wrap gap-2">
                  {client.contracted_services.map((s, i) => (
                    <span key={i} className="bg-slate-100 text-slate-600 text-xs px-2.5 py-1 rounded-full font-medium">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Contact info */}
            {contact && (
              <Section title="Contacto asociado">
                <Row label="Nombre" value={contact.full_name} />
                <Row label="Email" value={contact.email} />
                <Row label="Teléfono" value={contact.phone} />
                <Row label="WhatsApp" value={contact.whatsapp} />
              </Section>
            )}

            <Section title="Administración">
              <Row label="Responsable" value={assigned?.full_name ?? assigned?.email ?? '—'} />
              <Row label="Cliente desde" value={formatDate(client.created_at)} />
              <Row label="Última compra" value={formatDate(client.last_purchase_at)} />
            </Section>
          </>
        )}

        {/* ── Pedidos ──────────────────────────────────────────────────────── */}
        {tab === 'pedidos' && (
          <>
            {orders.length === 0 ? (
              <p className="text-center text-sm text-slate-400 py-8">Sin pedidos registrados</p>
            ) : (
              <div className="space-y-2">
                {orders.map(o => (
                  <div key={o.id} className="border border-slate-200 rounded-xl p-3">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="text-sm font-semibold text-slate-800 leading-tight">{o.title}</p>
                      <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${ORDER_STATUS_STYLES[o.status] ?? 'bg-slate-100 text-slate-500'}`}>
                        {ORDER_STATUS_LABELS[o.status] ?? o.status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>{formatDate(o.created_at)}</span>
                      <span className="font-semibold text-slate-700">${formatMXN(o.total)}</span>
                    </div>
                    {/* Mini progress */}
                    {o.status !== 'cancelled' && (
                      <div className="mt-2 h-1 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${o.status === 'paid' ? 'bg-emerald-500' : 'bg-blue-400'}`}
                          style={{ width: `${Math.min(100, Math.round(((o.amount_paid ?? 0) / o.total) * 100))}%` }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Propuestas ────────────────────────────────────────────────────── */}
        {tab === 'propuestas' && (
          <>
            {proposals.length === 0 ? (
              <p className="text-center text-sm text-slate-400 py-8">Sin propuestas registradas</p>
            ) : (
              <div className="space-y-2">
                {proposals.map(p => (
                  <div key={p.id} className="border border-slate-200 rounded-xl p-3">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="text-sm font-semibold text-slate-800 leading-tight">{p.title}</p>
                      <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${PROPOSAL_STATUS_STYLES[p.status] ?? 'bg-slate-100 text-slate-500'}`}>
                        {PROPOSAL_STATUS_LABELS[p.status] ?? p.status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>{formatDate(p.created_at)}</span>
                      <span className="font-semibold text-slate-700">${formatMXN(p.total)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-slate-100 px-6 py-3 flex items-center justify-between">
        <button onClick={onDelete} className="text-xs text-red-400 hover:text-red-600 transition-colors">
          Eliminar cliente
        </button>
        <p className="text-xs text-slate-400">Desde {formatDate(client.created_at)}</p>
      </div>
    </div>
  )
}

// ─── Client Modal ─────────────────────────────────────────────────────────────

function ClientModal({
  isEditing, saving, error,
  contacts, profiles, form, onChange,
  onSave, onClose,
}: {
  isEditing: boolean; saving: boolean; error: string
  contacts: Contact[]; profiles: Profile[]
  form: typeof EMPTY_FORM
  onChange: (key: string, val: string) => void
  onSave: () => void; onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-900">{isEditing ? 'Editar cliente' : 'Nuevo cliente'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <FieldLabel>Nombre del cliente / empresa *</FieldLabel>
            <Input value={form.name} onChange={v => onChange('name', v)} placeholder="Empresa S.A. de C.V." />
          </div>

          <div>
            <FieldLabel>Contacto asociado</FieldLabel>
            <Select value={form.contact_id} onChange={v => onChange('contact_id', v)}
              options={[
                { value: '', label: 'Sin contacto' },
                ...contacts.map(c => ({ value: c.id, label: `${c.full_name ?? c.email}${c.company ? ` · ${c.company}` : ''}` }))
              ]}
            />
          </div>

          <div>
            <FieldLabel>Responsable</FieldLabel>
            <Select value={form.assigned_to} onChange={v => onChange('assigned_to', v)}
              options={[
                { value: '', label: 'Sin asignar' },
                ...profiles.map(p => ({ value: p.id, label: p.full_name ?? p.email ?? p.id }))
              ]}
            />
          </div>

          <div>
            <FieldLabel>Servicios contratados</FieldLabel>
            <Input
              value={form.contracted_services}
              onChange={v => onChange('contracted_services', v)}
              placeholder="SEO, Google Ads, Redes Sociales (separados por coma)"
            />
            <p className="text-xs text-slate-400 mt-1">Separa cada servicio con una coma</p>
          </div>

          {error && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onClose} className="text-sm text-slate-600 px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">
            Cancelar
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear cliente'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Micro components ─────────────────────────────────────────────────────────

function KpiCard({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  return (
    <div className="bg-white rounded-2xl p-3" style={CARD_S}>
      <p className="text-[10px] font-bold tracking-widest uppercase text-slate-400 mb-0.5">{label}</p>
      <p className={`text-sm font-bold truncate ${color}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 rounded-lg px-2 py-1.5 text-center">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-xs font-bold text-slate-700 mt-0.5 truncate">{value}</p>
    </div>
  )
}

function StatCard({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="bg-white rounded-2xl p-3" style={CARD_S}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{label}</p>
      <p className={`font-bold text-slate-800 ${small ? 'text-sm' : 'text-xl'}`}>{value}</p>
    </div>
  )
}

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
