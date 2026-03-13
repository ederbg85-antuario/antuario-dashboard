'use client'

import { useState, useMemo, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { CARD_S } from '@/components/ui/dashboard'

// ─── Types ────────────────────────────────────────────────────────────────────

type Order = {
  id: string
  contact_id: string | null
  client_id: string | null
  proposal_id: string | null
  title: string
  status: string
  total: number
  amount_paid: number
  balance: number
  payment_method: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

type Payment = {
  id: string
  order_id: string
  amount: number
  payment_method: string | null
  payment_date: string
  notes: string | null
  created_by: string | null
  created_at: string
}

type Contact = { id: string; full_name: string | null; email: string | null; company: string | null }
type Client = { id: string; name: string | null }
type Profile = { id: string; full_name: string | null; email: string | null }
type Proposal = { id: string; title: string; total: number; status: string }

type Props = {
  orgId: number
  currentUserId: string
  currentUserRole: string
  initialOrders: Order[]
  initialPayments: Payment[]
  contacts: Contact[]
  clients: Client[]
  profiles: Profile[]
  proposals: Proposal[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ORDER_STATUSES = [
  { value: 'all', label: 'Todos' },
  { value: 'pending', label: 'Pendiente' },
  { value: 'partial', label: 'Pago parcial' },
  { value: 'paid', label: 'Pagado' },
  { value: 'cancelled', label: 'Cancelado' },
]

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700',
  partial: 'bg-blue-50 text-blue-700',
  paid: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-red-50 text-red-500',
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  partial: 'Pago parcial',
  paid: 'Pagado',
  cancelled: 'Cancelado',
}

const PAYMENT_METHODS = [
  { value: 'transfer', label: 'Transferencia' },
  { value: 'cash', label: 'Efectivo' },
  { value: 'card', label: 'Tarjeta' },
  { value: 'check', label: 'Cheque' },
  { value: 'other', label: 'Otro' },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatMXN(n: number) {
  return (n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

function progressPercent(paid: number, total: number) {
  if (!total) return 0
  return Math.min(100, Math.round((paid / total) * 100))
}

function getSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

function deriveStatus(amountPaid: number, total: number): string {
  if (amountPaid <= 0) return 'pending'
  if (amountPaid >= total) return 'paid'
  return 'partial'
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PedidosClient({
  orgId, currentUserId, currentUserRole,
  initialOrders, initialPayments,
  contacts, clients, profiles, proposals,
}: Props) {
  const [orders, setOrders] = useState<Order[]>(initialOrders)
  const [payments, setPayments] = useState<Payment[]>(initialPayments)

  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)

  // Create order modal
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingOrder, setEditingOrder] = useState<Order | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // Order form
  const [formTitle, setFormTitle] = useState('')
  const [formContactId, setFormContactId] = useState('')
  const [formClientId, setFormClientId] = useState('')
  const [formProposalId, setFormProposalId] = useState('')
  const [formTotal, setFormTotal] = useState('')
  const [formPaymentMethod, setFormPaymentMethod] = useState('transfer')
  const [formNotes, setFormNotes] = useState('')

  // Payment modal
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('transfer')
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [paymentNotes, setPaymentNotes] = useState('')
  const [savingPayment, setSavingPayment] = useState(false)
  const [paymentError, setPaymentError] = useState('')

  // ── Computed ───────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return orders.filter(o => {
      if (statusFilter !== 'all' && o.status !== statusFilter) return false
      if (search) {
        const q = search.toLowerCase()
        const contact = contacts.find(c => c.id === o.contact_id)
        if (
          !o.title.toLowerCase().includes(q) &&
          !contact?.full_name?.toLowerCase().includes(q) &&
          !contact?.company?.toLowerCase().includes(q)
        ) return false
      }
      return true
    })
  }, [orders, statusFilter, search, contacts])

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: orders.length }
    orders.forEach(o => { map[o.status] = (map[o.status] ?? 0) + 1 })
    return map
  }, [orders])

  const summary = useMemo(() => ({
    totalRevenue: orders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + o.total, 0),
    totalCollected: orders.reduce((s, o) => s + (o.amount_paid ?? 0), 0),
    totalPending: orders.filter(o => o.status === 'pending' || o.status === 'partial')
      .reduce((s, o) => s + (o.balance ?? (o.total - o.amount_paid)), 0),
  }), [orders])

  const selectedPayments = useMemo(() =>
    selectedOrder ? payments.filter(p => p.order_id === selectedOrder.id) : [],
    [selectedOrder, payments]
  )

  // ── Open create modal ──────────────────────────────────────────────────────

  const openCreate = useCallback(() => {
    setFormTitle('')
    setFormContactId('')
    setFormClientId('')
    setFormProposalId('')
    setFormTotal('')
    setFormPaymentMethod('transfer')
    setFormNotes('')
    setFormError('')
    setEditingOrder(null)
    setShowCreateModal(true)
  }, [])

  const openEdit = useCallback((o: Order) => {
    setFormTitle(o.title)
    setFormContactId(o.contact_id ?? '')
    setFormClientId(o.client_id ?? '')
    setFormProposalId(o.proposal_id ?? '')
    setFormTotal(String(o.total))
    setFormPaymentMethod(o.payment_method ?? 'transfer')
    setFormNotes(o.notes ?? '')
    setFormError('')
    setEditingOrder(o)
    setShowCreateModal(true)
  }, [])

  // Auto-fill from proposal
  const handleProposalSelect = useCallback((proposalId: string) => {
    setFormProposalId(proposalId)
    if (proposalId) {
      const p = proposals.find(p => p.id === proposalId)
      if (p) {
        if (!formTitle) setFormTitle(p.title)
        setFormTotal(String(p.total))
      }
    }
  }, [proposals, formTitle])

  // ── Save order ─────────────────────────────────────────────────────────────

  const handleSaveOrder = useCallback(async () => {
    if (!formTitle.trim()) { setFormError('El título es obligatorio'); return }
    const total = parseFloat(formTotal)
    if (!formTotal || isNaN(total) || total <= 0) { setFormError('El total debe ser mayor a cero'); return }

    setSaving(true)
    setFormError('')
    const supabase = getSupabase()

    const payload = {
      organization_id: orgId,
      contact_id: formContactId || null,
      client_id: formClientId || null,
      proposal_id: formProposalId || null,
      title: formTitle.trim(),
      total,
      payment_method: formPaymentMethod || null,
      notes: formNotes.trim() || null,
    }

    if (editingOrder) {
      const { data, error } = await supabase
        .from('orders')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', editingOrder.id)
        .select()
        .single()
      if (error) { setFormError(error.message); setSaving(false); return }
      setOrders(prev => prev.map(o => o.id === editingOrder.id ? data : o))
      if (selectedOrder?.id === editingOrder.id) setSelectedOrder(data)
    } else {
      const { data, error } = await supabase
        .from('orders')
        .insert({ ...payload, status: 'pending', amount_paid: 0, created_by: currentUserId })
        .select()
        .single()
      if (error) { setFormError(error.message); setSaving(false); return }
      setOrders(prev => [data, ...prev])
    }

    setSaving(false)
    setShowCreateModal(false)
  }, [
    formTitle, formTotal, formContactId, formClientId, formProposalId,
    formPaymentMethod, formNotes, orgId, currentUserId, editingOrder, selectedOrder,
  ])

  // ── Delete order ───────────────────────────────────────────────────────────

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('¿Eliminar este pedido? También se eliminarán sus pagos.')) return
    const supabase = getSupabase()
    await supabase.from('orders').delete().eq('id', id)
    setOrders(prev => prev.filter(o => o.id !== id))
    setPayments(prev => prev.filter(p => p.order_id !== id))
    if (selectedOrder?.id === id) setSelectedOrder(null)
  }, [selectedOrder])

  // ── Register payment ───────────────────────────────────────────────────────

  const openPaymentModal = useCallback((order: Order) => {
    setSelectedOrder(order)
    const remaining = order.balance ?? (order.total - order.amount_paid)
    setPaymentAmount(String(remaining > 0 ? remaining : ''))
    setPaymentMethod('transfer')
    setPaymentDate(new Date().toISOString().slice(0, 10))
    setPaymentNotes('')
    setPaymentError('')
    setShowPaymentModal(true)
  }, [])

  const handleSavePayment = useCallback(async () => {
    if (!selectedOrder) return
    const amount = parseFloat(paymentAmount)
    if (!paymentAmount || isNaN(amount) || amount <= 0) {
      setPaymentError('El monto debe ser mayor a cero')
      return
    }
    const balance = selectedOrder.balance ?? (selectedOrder.total - selectedOrder.amount_paid)
    if (amount > balance + 0.01) {
      setPaymentError(`El monto no puede superar el saldo pendiente ($${formatMXN(balance)})`)
      return
    }

    setSavingPayment(true)
    setPaymentError('')
    const supabase = getSupabase()

    // Insert payment
    const { data: newPayment, error: payError } = await supabase
      .from('order_payments')
      .insert({
        order_id: selectedOrder.id,
        organization_id: orgId,
        amount,
        payment_method: paymentMethod,
        payment_date: paymentDate,
        notes: paymentNotes.trim() || null,
        created_by: currentUserId,
      })
      .select()
      .single()

    if (payError) { setPaymentError(payError.message); setSavingPayment(false); return }

    // Update order amount_paid + status
    const newAmountPaid = (selectedOrder.amount_paid ?? 0) + amount
    const newStatus = deriveStatus(newAmountPaid, selectedOrder.total)

    const { data: updatedOrder, error: orderError } = await supabase
      .from('orders')
      .update({
        amount_paid: newAmountPaid,
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', selectedOrder.id)
      .select()
      .single()

    if (orderError) { setPaymentError(orderError.message); setSavingPayment(false); return }

    setPayments(prev => [newPayment, ...prev])
    setOrders(prev => prev.map(o => o.id === updatedOrder.id ? updatedOrder : o))
    setSelectedOrder(updatedOrder)

    setSavingPayment(false)
    setShowPaymentModal(false)
  }, [
    selectedOrder, paymentAmount, paymentMethod, paymentDate,
    paymentNotes, orgId, currentUserId,
  ])

  // ── Cancel order ───────────────────────────────────────────────────────────

  const handleCancel = useCallback(async (id: string) => {
    if (!confirm('¿Cancelar este pedido?')) return
    const supabase = getSupabase()
    const { data } = await supabase
      .from('orders')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (data) {
      setOrders(prev => prev.map(o => o.id === id ? data : o))
      if (selectedOrder?.id === id) setSelectedOrder(data)
    }
  }, [selectedOrder])

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full min-h-screen bg-slate-50">

      {/* ── Left panel ───────────────────────────────────────────────────── */}
      <aside className="w-56 shrink-0 bg-white border-r border-slate-100 flex flex-col">
        <div className="p-5 border-b border-slate-100" style={{ background: 'linear-gradient(135deg,#f8fafc 0%,#f1f5f9 100%)' }}>
          <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-slate-400 mb-1">Pedidos</p>
          <p className="text-3xl font-extrabold text-slate-800 tabular-nums">{orders.length}</p>
        </div>

        {/* Status filters */}
        <div className="p-4 space-y-1">
          {ORDER_STATUSES.map(s => (
            <button
              key={s.value}
              onClick={() => setStatusFilter(s.value)}
              className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-sm transition-all ${statusFilter === s.value ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
                }`}
            >
              <span>{s.label}</span>
              <span className={`text-xs font-semibold ${statusFilter === s.value ? 'text-slate-300' : 'text-slate-400'}`}>
                {counts[s.value] ?? 0}
              </span>
            </button>
          ))}
        </div>

        {/* Revenue summary */}
        <div className="mx-4 mt-2 space-y-2">
          <div className="rounded-2xl p-3 bg-white" style={CARD_S}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Total facturado</p>
            <p className="text-sm font-bold text-slate-800 tabular-nums">${formatMXN(summary.totalRevenue)}</p>
          </div>
          <div className="rounded-2xl p-3 bg-emerald-50 border border-emerald-100">
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 mb-0.5">Total cobrado</p>
            <p className="text-sm font-bold text-emerald-800 tabular-nums">${formatMXN(summary.totalCollected)}</p>
          </div>
          <div className="rounded-2xl p-3 bg-amber-50 border border-amber-100">
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-500 mb-0.5">Por cobrar</p>
            <p className="text-sm font-bold text-amber-800 tabular-nums">${formatMXN(summary.totalPending)}</p>
          </div>
        </div>

        <div className="mt-auto p-4 border-t border-slate-100">
          <button
            onClick={openCreate}
            className="w-full bg-gradient-to-r from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 text-white text-sm font-semibold py-2.5 rounded-xl transition-all shadow-md"
          >
            + Nuevo pedido
          </button>
        </div>
      </aside>

      {/* ── Center — list ─────────────────────────────────────────────────── */}
      <main className={`flex flex-col transition-all duration-300 ${selectedOrder ? 'w-96 shrink-0' : 'flex-1'}`}>
        <div className="bg-white border-b border-slate-200 px-4 py-3">
          <input
            type="text"
            placeholder="Buscar por título o contacto..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <EmptyState
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />}
              title="Sin pedidos"
              subtitle="Crea un pedido o convierte una propuesta aceptada"
            />
          ) : (
            filtered.map(order => {
              const contact = contacts.find(c => c.id === order.contact_id)
              const isSelected = selectedOrder?.id === order.id
              const pct = progressPercent(order.amount_paid ?? 0, order.total)

              return (
                <button
                  key={order.id}
                  onClick={() => setSelectedOrder(isSelected ? null : order)}
                  className={`w-full text-left px-4 py-4 hover:bg-slate-50 transition-colors ${isSelected ? 'bg-slate-50 border-l-2 border-slate-800' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <p className="text-sm font-semibold text-slate-800 leading-tight">{order.title}</p>
                    <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[order.status] ?? 'bg-slate-100 text-slate-500'}`}>
                      {STATUS_LABELS[order.status] ?? order.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mb-2">
                    {contact?.full_name ?? contact?.email ?? 'Sin contacto'}
                    {contact?.company ? ` · ${contact.company}` : ''}
                  </p>
                  {/* Progress bar */}
                  <div className="mb-2">
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${order.status === 'paid' ? 'bg-emerald-500' : order.status === 'cancelled' ? 'bg-slate-300' : 'bg-blue-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>{formatDate(order.created_at)}</span>
                    <span>
                      <span className="font-semibold text-slate-700">${formatMXN(order.amount_paid ?? 0)}</span>
                      {' '}/{' '}
                      <span className="font-bold text-slate-800">${formatMXN(order.total)}</span>
                    </span>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </main>

      {/* ── Right panel — detail ──────────────────────────────────────────── */}
      {selectedOrder && (
        <div className="flex-1 overflow-y-auto bg-white border-l border-slate-200">
          <OrderDetail
            order={selectedOrder}
            payments={selectedPayments}
            contacts={contacts}
            profiles={profiles}
            proposals={proposals}
            onEdit={() => openEdit(selectedOrder)}
            onDelete={() => handleDelete(selectedOrder.id)}
            onRegisterPayment={() => openPaymentModal(selectedOrder)}
            onCancel={() => handleCancel(selectedOrder.id)}
            onClose={() => setSelectedOrder(null)}
          />
        </div>
      )}

      {/* ── Create / edit order modal ─────────────────────────────────────── */}
      {showCreateModal && (
        <OrderModal
          isEditing={!!editingOrder}
          saving={saving}
          error={formError}
          contacts={contacts}
          clients={clients}
          profiles={profiles}
          proposals={proposals}
          title={formTitle} setTitle={setFormTitle}
          contactId={formContactId} setContactId={setFormContactId}
          clientId={formClientId} setClientId={setFormClientId}
          proposalId={formProposalId} setProposalId={handleProposalSelect}
          total={formTotal} setTotal={setFormTotal}
          paymentMethod={formPaymentMethod} setPaymentMethod={setFormPaymentMethod}
          notes={formNotes} setNotes={setFormNotes}
          onSave={handleSaveOrder}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      {/* ── Register payment modal ────────────────────────────────────────── */}
      {showPaymentModal && selectedOrder && (
        <PaymentModal
          order={selectedOrder}
          saving={savingPayment}
          error={paymentError}
          amount={paymentAmount} setAmount={setPaymentAmount}
          method={paymentMethod} setMethod={setPaymentMethod}
          date={paymentDate} setDate={setPaymentDate}
          notes={paymentNotes} setNotes={setPaymentNotes}
          onSave={handleSavePayment}
          onClose={() => setShowPaymentModal(false)}
        />
      )}
    </div>
  )
}

// ─── Order Detail Panel ───────────────────────────────────────────────────────

function OrderDetail({
  order, payments, contacts, profiles, proposals,
  onEdit, onDelete, onRegisterPayment, onCancel, onClose,
}: {
  order: Order
  payments: Payment[]
  contacts: Contact[]
  profiles: Profile[]
  proposals: Proposal[]
  onEdit: () => void
  onDelete: () => void
  onRegisterPayment: () => void
  onCancel: () => void
  onClose: () => void
}) {
  const contact = contacts.find(c => c.id === order.contact_id)
  const proposal = proposals.find(p => p.id === order.proposal_id)
  const pct = progressPercent(order.amount_paid ?? 0, order.total)
  const balance = order.balance ?? (order.total - order.amount_paid)
  const canPay = order.status !== 'paid' && order.status !== 'cancelled'

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-100">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <h3 className="font-bold text-slate-900 text-lg leading-tight">{order.title}</h3>
            {contact && (
              <p className="text-sm text-slate-500 mt-0.5">
                {contact.full_name}{contact.company ? ` · ${contact.company}` : ''}
              </p>
            )}
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
        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_STYLES[order.status] ?? 'bg-slate-100 text-slate-500'}`}>
          {STATUS_LABELS[order.status] ?? order.status}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

        {/* Payment progress */}
        <div className="bg-slate-50 rounded-2xl p-4">
          <div className="flex items-end justify-between mb-3">
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Cobrado</p>
              <p className="text-2xl font-bold text-slate-900">${formatMXN(order.amount_paid ?? 0)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400 mb-0.5">Total</p>
              <p className="text-lg font-bold text-slate-700">${formatMXN(order.total)}</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-2.5 bg-slate-200 rounded-full overflow-hidden mb-2">
            <div
              className={`h-full rounded-full transition-all duration-500 ${order.status === 'paid' ? 'bg-emerald-500' :
                  order.status === 'cancelled' ? 'bg-slate-300' : 'bg-blue-500'
                }`}
              style={{ width: `${pct}%` }}
            />
          </div>

          <div className="flex justify-between text-xs">
            <span className="text-slate-400">{pct}% cobrado</span>
            {balance > 0 && (
              <span className="text-amber-600 font-medium">Pendiente: ${formatMXN(balance)}</span>
            )}
          </div>
        </div>

        {/* Info */}
        <Section title="Información">
          <Row label="Método de pago" value={PAYMENT_METHODS.find(m => m.value === order.payment_method)?.label ?? order.payment_method ?? '—'} />
          {proposal && <Row label="Propuesta origen" value={proposal.title} />}
          <Row label="Creado" value={formatDate(order.created_at)} />
          <Row label="Actualizado" value={formatDate(order.updated_at)} />
        </Section>

        {order.notes && (
          <Section title="Notas">
            <p className="text-sm text-slate-600 leading-relaxed">{order.notes}</p>
          </Section>
        )}

        {/* Payments history */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
            Historial de pagos
            {payments.length > 0 && (
              <span className="ml-2 bg-slate-100 text-slate-500 text-xs rounded-full px-2 py-0.5 font-normal">{payments.length}</span>
            )}
          </p>

          {payments.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">Sin pagos registrados</p>
          ) : (
            <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
              {payments.map(p => (
                <div key={p.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">${formatMXN(p.amount)}</p>
                    <p className="text-xs text-slate-400">
                      {PAYMENT_METHODS.find(m => m.value === p.payment_method)?.label ?? p.payment_method ?? '—'}
                      {' · '}
                      {formatDate(p.payment_date)}
                    </p>
                    {p.notes && <p className="text-xs text-slate-500 mt-0.5">{p.notes}</p>}
                  </div>
                  <div className="w-8 h-8 bg-emerald-50 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-2">
          {canPay && (
            <button
              onClick={onRegisterPayment}
              className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl py-2.5 text-sm font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Registrar pago
            </button>
          )}

          {order.status === 'paid' && (
            <div className="flex items-center justify-center gap-2 bg-emerald-50 rounded-xl py-3 text-sm font-medium text-emerald-700">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Pedido pagado completamente
            </div>
          )}

          {canPay && (
            <button
              onClick={onCancel}
              className="w-full border border-slate-200 text-slate-500 hover:bg-slate-50 rounded-xl py-2.5 text-sm font-medium transition-colors"
            >
              Cancelar pedido
            </button>
          )}
        </div>
      </div>

      <div className="border-t border-slate-100 px-6 py-3 flex items-center justify-between">
        <button onClick={onDelete} className="text-xs text-red-400 hover:text-red-600 transition-colors">
          Eliminar pedido
        </button>
        <p className="text-xs text-slate-400">Actualizado {formatDate(order.updated_at)}</p>
      </div>
    </div>
  )
}

// ─── Order Modal ──────────────────────────────────────────────────────────────

function OrderModal({
  isEditing, saving, error,
  contacts, clients, profiles, proposals,
  title, setTitle,
  contactId, setContactId,
  clientId, setClientId,
  proposalId, setProposalId,
  total, setTotal,
  paymentMethod, setPaymentMethod,
  notes, setNotes,
  onSave, onClose,
}: {
  isEditing: boolean; saving: boolean; error: string
  contacts: Contact[]; clients: Client[]; profiles: Profile[]; proposals: Proposal[]
  title: string; setTitle: (v: string) => void
  contactId: string; setContactId: (v: string) => void
  clientId: string; setClientId: (v: string) => void
  proposalId: string; setProposalId: (v: string) => void
  total: string; setTotal: (v: string) => void
  paymentMethod: string; setPaymentMethod: (v: string) => void
  notes: string; setNotes: (v: string) => void
  onSave: () => void; onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-900">{isEditing ? 'Editar pedido' : 'Nuevo pedido'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Link to proposal */}
          <div>
            <FieldLabel>Propuesta origen (opcional)</FieldLabel>
            <Select
              value={proposalId}
              onChange={setProposalId}
              options={[
                { value: '', label: 'Sin propuesta' },
                ...proposals.map(p => ({ value: p.id, label: p.title }))
              ]}
            />
            <p className="text-xs text-slate-400 mt-1">Al seleccionar, se auto-llena el título y total</p>
          </div>

          <Divider />

          <div>
            <FieldLabel>Título *</FieldLabel>
            <Input value={title} onChange={setTitle} placeholder="Pedido de servicios..." />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Contacto</FieldLabel>
              <Select value={contactId} onChange={setContactId}
                options={[{ value: '', label: 'Sin contacto' }, ...contacts.map(c => ({
                  value: c.id, label: c.full_name ?? c.email ?? c.id
                }))]}
              />
            </div>
            <div>
              <FieldLabel>Cliente</FieldLabel>
              <Select value={clientId} onChange={setClientId}
                options={[{ value: '', label: 'Sin cliente' }, ...clients.map(c => ({
                  value: c.id, label: c.name ?? c.id
                }))]}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Total *</FieldLabel>
              <Input value={total} onChange={setTotal} placeholder="0.00" type="number" />
            </div>
            <div>
              <FieldLabel>Método de pago</FieldLabel>
              <Select value={paymentMethod} onChange={setPaymentMethod}
                options={PAYMENT_METHODS}
              />
            </div>
          </div>

          <div>
            <FieldLabel>Notas</FieldLabel>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Notas del pedido..."
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300 resize-none"
            />
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
            {saving ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear pedido'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Payment Modal ────────────────────────────────────────────────────────────

function PaymentModal({
  order, saving, error,
  amount, setAmount,
  method, setMethod,
  date, setDate,
  notes, setNotes,
  onSave, onClose,
}: {
  order: Order; saving: boolean; error: string
  amount: string; setAmount: (v: string) => void
  method: string; setMethod: (v: string) => void
  date: string; setDate: (v: string) => void
  notes: string; setNotes: (v: string) => void
  onSave: () => void; onClose: () => void
}) {
  const balance = order.balance ?? (order.total - order.amount_paid)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-900">Registrar pago</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Order info */}
          <div className="bg-slate-50 rounded-xl p-3">
            <p className="text-xs text-slate-400 mb-1">Pedido</p>
            <p className="text-sm font-semibold text-slate-800">{order.title}</p>
            <div className="flex justify-between mt-2 text-xs text-slate-500">
              <span>Saldo pendiente</span>
              <span className="font-bold text-amber-700">${formatMXN(balance)}</span>
            </div>
          </div>

          <div>
            <FieldLabel>Monto del pago *</FieldLabel>
            <Input value={amount} onChange={setAmount} placeholder={`Máx. ${formatMXN(balance)}`} type="number" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Método</FieldLabel>
              <Select value={method} onChange={setMethod} options={PAYMENT_METHODS} />
            </div>
            <div>
              <FieldLabel>Fecha</FieldLabel>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
              />
            </div>
          </div>

          <div>
            <FieldLabel>Notas (opcional)</FieldLabel>
            <Input value={notes} onChange={setNotes} placeholder="Referencia, comprobante..." />
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
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? 'Registrando...' : 'Registrar pago'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Shared micro-components ──────────────────────────────────────────────────

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-slate-50 rounded-xl p-3">
      <p className="text-xs text-slate-400 mb-0.5">{label}</p>
      <p className={`text-sm font-bold ${color}`}>{value}</p>
    </div>
  )
}

function EmptyState({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center px-8">
      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
        <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">{icon}</svg>
      </div>
      <p className="text-sm font-medium text-slate-600 mb-1">{title}</p>
      <p className="text-xs text-slate-400">{subtitle}</p>
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
      <span className="text-xs text-slate-400 shrink-0 w-32">{label}</span>
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

function Divider() {
  return <div className="border-t border-slate-100" />
}
