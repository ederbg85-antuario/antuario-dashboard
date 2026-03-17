'use client'

import { useState, useMemo, useCallback, useRef } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
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
type OrgBranding = { name?: string | null; logo_url?: string | null } | null

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
  orgBranding: OrgBranding
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
  pending: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400',
  partial: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400',
  paid: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400',
  cancelled: 'bg-red-50 dark:bg-red-900/20 text-red-500',
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

async function fetchImageAsDataURL(url: string): Promise<string> {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch {
    return ''
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PedidosClient({
  orgId, currentUserId, currentUserRole,
  initialOrders, initialPayments,
  contacts, clients, profiles, proposals, orgBranding,
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

  // PDF remisión
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [pdfPayment, setPdfPayment] = useState<Payment | null>(null)
  const [pdfOrder, setPdfOrder] = useState<Order | null>(null)
  const [pdfContact, setPdfContact] = useState<Contact | undefined>(undefined)
  const [pdfLogoDataUrl, setPdfLogoDataUrl] = useState('')
  const [pdfToast, setPdfToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const pdfRef = useRef<HTMLDivElement>(null)

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

  // ── Generate PDF remisión ──────────────────────────────────────────────────

  const handleGeneratePdfPayment = useCallback(async (payment: Payment) => {
    const order = orders.find(o => o.id === payment.order_id)
    if (!order) return
    const contact = contacts.find(c => c.id === order.contact_id)

    let logoDataUrl = ''
    if (orgBranding?.logo_url) {
      logoDataUrl = await fetchImageAsDataURL(orgBranding.logo_url)
    }

    setPdfLogoDataUrl(logoDataUrl)
    setPdfPayment(payment)
    setPdfOrder(order)
    setPdfContact(contact)
    setGeneratingPdf(true)

    await new Promise(r => setTimeout(r, 500))

    try {
      const el = document.getElementById('remision-pdf-template') || pdfRef.current
      if (!el) throw new Error('Template element not found')

      const canvas = await html2canvas(el as HTMLElement, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff',
        logging: false,
      })

      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pdfW = pdf.internal.pageSize.getWidth()
      const pdfH = pdf.internal.pageSize.getHeight()
      const imgH = (canvas.height * pdfW) / canvas.width

      let renderedY = 0
      while (renderedY < imgH) {
        if (renderedY > 0) pdf.addPage()
        pdf.addImage(imgData, 'PNG', 0, -renderedY, pdfW, imgH)
        renderedY += pdfH
      }

      pdf.save(`Remision_${payment.id.slice(0, 8).toUpperCase()}.pdf`)
      setPdfToast({ type: 'success', message: '¡Remisión descargada! Revisa tu carpeta de descargas.' })
    } catch (err: unknown) {
      console.error('PDF Error:', err)
      setPdfToast({ type: 'error', message: 'Error al generar la remisión. Intenta de nuevo.' })
    } finally {
      setGeneratingPdf(false)
      setPdfPayment(null)
      setPdfOrder(null)
      setPdfLogoDataUrl('')
      setTimeout(() => setPdfToast(null), 4000)
    }
  }, [orders, contacts, orgBranding, pdfRef])

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
    <div className="flex h-full min-h-screen flex-col md:flex-row bg-slate-50 dark:bg-[#1a2030]">

      {/* ── PDF Loading Overlay ───────────────────────────────────────────── */}
      {generatingPdf && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#1e2535] rounded-2xl shadow-2xl px-6 py-6 md:px-10 md:py-8 flex flex-col items-center gap-4 min-w-[220px]">
            <div className="w-10 h-10 border-4 border-slate-200 dark:border-white/[0.08] border-t-slate-800 rounded-full animate-spin" />
            <p className="text-xs md:text-sm font-semibold text-slate-700 dark:text-slate-200">Generando remisión…</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 text-center">Esto puede tomar unos segundos</p>
          </div>
        </div>
      )}

      {/* ── Toast notification ────────────────────────────────────────────── */}
      {pdfToast && (
        <div className={`fixed top-4 right-4 md:top-5 md:right-5 z-[9999] flex items-center gap-3 px-4 md:px-5 py-3 md:py-3.5 rounded-xl shadow-lg text-xs md:text-sm font-medium transition-all ${
          pdfToast.type === 'success'
            ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 text-emerald-800'
            : 'bg-red-50 dark:bg-red-900/20 border border-red-200 text-red-700 dark:text-red-400'
        }`}>
          {pdfToast.type === 'success' ? (
            <svg className="w-4 h-4 shrink-0 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-4 h-4 shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
          {pdfToast.message}
        </div>
      )}

      {/* ── Left panel ───────────────────────────────────────────────────── */}
      <aside className="hidden md:flex md:w-56 shrink-0 bg-white dark:bg-[#1e2535] border-r border-slate-100 dark:border-white/[0.05] flex-col">
        <div className="p-4 md:p-5 border-b border-slate-100 dark:border-white/[0.05]" style={{ background: 'linear-gradient(135deg,#f8fafc 0%,#f1f5f9 100%)' }}>
          <p className="text-[9px] md:text-[10px] font-bold tracking-[0.14em] uppercase text-slate-400 dark:text-slate-500 mb-1">Pedidos</p>
          <p className="text-2xl md:text-3xl font-extrabold text-slate-800 dark:text-slate-100 dark:text-slate-100 tabular-nums">{orders.length}</p>
        </div>

        {/* Status filters */}
        <div className="p-4 space-y-1">
          {ORDER_STATUSES.map(s => (
            <button
              key={s.value}
              onClick={() => setStatusFilter(s.value)}
              className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-sm transition-all ${statusFilter === s.value ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:bg-[#1a2030]'
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
          <div className="rounded-2xl p-3 bg-white dark:bg-[#1e2535]" style={CARD_S}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-0.5">Total facturado</p>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100 dark:text-slate-100 tabular-nums">${formatMXN(summary.totalRevenue)}</p>
          </div>
          <div className="rounded-2xl p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100">
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 mb-0.5">Total cobrado</p>
            <p className="text-sm font-bold text-emerald-800 tabular-nums">${formatMXN(summary.totalCollected)}</p>
          </div>
          <div className="rounded-2xl p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-100">
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-500 mb-0.5">Por cobrar</p>
            <p className="text-sm font-bold text-amber-800 tabular-nums">${formatMXN(summary.totalPending)}</p>
          </div>
        </div>

        <div className="mt-auto p-4 md:p-4 border-t border-slate-100 dark:border-white/[0.05]">
          <button
            onClick={openCreate}
            className="w-full bg-gradient-to-r from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 text-white text-xs md:text-sm font-semibold py-2 md:py-2.5 rounded-xl active:scale-95 transition-all shadow-md"
          >
            + Nuevo pedido
          </button>
        </div>
      </aside>

      {/* ── Center — list ─────────────────────────────────────────────────── */}
      <main className={`flex flex-col transition-all duration-300 min-w-0 ${selectedOrder ? 'hidden md:flex md:w-96 shrink-0' : 'flex-1'}`}>
        <div className="bg-white dark:bg-[#1e2535] border-b border-slate-200 dark:border-white/[0.08] px-3 md:px-4 py-3">
          <input
            type="text"
            placeholder="Buscar..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-slate-50 dark:bg-[#1a2030] dark:bg-[#0d1117] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2 text-xs md:text-sm text-slate-700 dark:text-slate-200 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-700"
          />
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-white/[0.05]">
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
                  className={`w-full text-left px-3 md:px-4 py-3 md:py-4 active:scale-95 md:active:scale-100 hover:bg-slate-50 dark:hover:bg-[#2a3448] dark:bg-[#1a2030] transition-all duration-200 ${isSelected ? 'bg-slate-50 dark:bg-[#2a3448] md:border-l-2 md:border-slate-800' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <p className="text-xs md:text-sm font-semibold text-slate-800 dark:text-slate-100 dark:text-slate-100 leading-tight">{order.title}</p>
                    <span className={`shrink-0 text-[10px] md:text-xs px-1.5 md:px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[order.status] ?? 'bg-slate-100 dark:bg-[#1a2030] text-slate-500'}`}>
                      {STATUS_LABELS[order.status] ?? order.status}
                    </span>
                  </div>
                  <p className="text-[11px] md:text-xs text-slate-500 dark:text-slate-400 mb-2 truncate">
                    {contact?.full_name ?? contact?.email ?? 'Sin contacto'}
                    {contact?.company ? ` · ${contact.company}` : ''}
                  </p>
                  {/* Progress bar */}
                  <div className="mb-2">
                    <div className="h-1.5 bg-slate-100 dark:bg-[#1a2030] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${order.status === 'paid' ? 'bg-emerald-500' : order.status === 'cancelled' ? 'bg-slate-300' : 'bg-blue-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[10px] md:text-xs text-slate-400">
                    <span className="truncate">{formatDate(order.created_at)}</span>
                    <span className="shrink-0">
                      <span className="font-semibold text-slate-700 dark:text-slate-200">${formatMXN(order.amount_paid ?? 0)}</span>
                      <span className="hidden md:inline">{' '}/{' '}</span>
                      <span className="font-bold text-slate-800 dark:text-slate-100 hidden md:inline">${formatMXN(order.total)}</span>
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
        <div className="fixed inset-0 md:relative md:inset-auto md:flex-1 z-40 md:z-auto overflow-y-auto bg-white dark:bg-[#1e2535] md:border-l border-slate-200 dark:border-white/[0.08]">
          <OrderDetail
            order={selectedOrder}
            payments={selectedPayments}
            contacts={contacts}
            profiles={profiles}
            proposals={proposals}
            generatingPdf={generatingPdf}
            onEdit={() => openEdit(selectedOrder)}
            onDelete={() => handleDelete(selectedOrder.id)}
            onRegisterPayment={() => openPaymentModal(selectedOrder)}
            onCancel={() => handleCancel(selectedOrder.id)}
            onGeneratePdfPayment={handleGeneratePdfPayment}
            onClose={() => setSelectedOrder(null)}
          />
        </div>
      )}

      {/* ── Hidden PDF Remisión Template ──────────────────────────────────── */}
      {pdfPayment && pdfOrder && (
        <div style={{ position: 'absolute', left: '-9999px', top: 0, zIndex: -100 }}>
          <div
            id="remision-pdf-template"
            ref={pdfRef}
            style={{ width: '210mm', minHeight: '297mm', background: '#fff' }}
          >
            <RemisionPdfTemplate
              payment={pdfPayment}
              order={pdfOrder}
              contact={pdfContact}
              allOrderPayments={payments.filter(p => p.order_id === pdfOrder.id)}
              orgBranding={orgBranding}
              logoDataUrl={pdfLogoDataUrl}
            />
          </div>
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
  generatingPdf,
  onEdit, onDelete, onRegisterPayment, onCancel, onGeneratePdfPayment, onClose,
}: {
  order: Order
  payments: Payment[]
  contacts: Contact[]
  profiles: Profile[]
  proposals: Proposal[]
  generatingPdf: boolean
  onEdit: () => void
  onDelete: () => void
  onRegisterPayment: () => void
  onCancel: () => void
  onGeneratePdfPayment: (payment: Payment) => void
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
      <div className="px-3 md:px-6 py-4 md:py-5 border-b border-slate-100 dark:border-white/[0.05]">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-slate-900 dark:text-slate-50 dark:text-white text-base md:text-lg leading-tight truncate">{order.title}</h3>
            {contact && (
              <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                {contact.full_name}{contact.company ? ` · ${contact.company}` : ''}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={onEdit} className="text-[10px] md:text-xs border border-slate-200 dark:border-white/[0.08] rounded-lg px-2 md:px-3 py-1 md:py-1.5 text-slate-600 dark:text-slate-300 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1a2030] active:scale-95 transition-all">
              Editar
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:text-slate-300 p-1 active:scale-95 transition-all">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <span className={`inline-block text-[10px] md:text-xs px-2 md:px-2.5 py-0.5 md:py-1 rounded-full font-medium ${STATUS_STYLES[order.status] ?? 'bg-slate-100 dark:bg-[#1a2030] text-slate-500'}`}>
          {STATUS_LABELS[order.status] ?? order.status}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 md:px-6 py-4 md:py-5 space-y-5 md:space-y-6">

        {/* Payment progress */}
        <div className="bg-slate-50 dark:bg-[#1a2030] rounded-2xl p-3 md:p-4">
          <div className="flex items-end justify-between mb-3">
            <div className="min-w-0">
              <p className="text-[10px] md:text-xs text-slate-400 dark:text-slate-500 mb-0.5">Cobrado</p>
              <p className="text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-50">${formatMXN(order.amount_paid ?? 0)}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[10px] md:text-xs text-slate-400 dark:text-slate-500 mb-0.5">Total</p>
              <p className="text-base md:text-lg font-bold text-slate-700 dark:text-slate-200">${formatMXN(order.total)}</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-2.5 bg-slate-200 dark:bg-[#2a3448] rounded-full overflow-hidden mb-2">
            <div
              className={`h-full rounded-full transition-all duration-500 ${order.status === 'paid' ? 'bg-emerald-500' :
                  order.status === 'cancelled' ? 'bg-slate-300' : 'bg-blue-500'
                }`}
              style={{ width: `${pct}%` }}
            />
          </div>

          <div className="flex flex-col md:flex-row md:justify-between gap-1 md:gap-0 text-[10px] md:text-xs">
            <span className="text-slate-400">{pct}% cobrado</span>
            {balance > 0 && (
              <span className="text-amber-600 dark:text-amber-400 font-medium">Pendiente: ${formatMXN(balance)}</span>
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
            <p className="text-sm text-slate-600 dark:text-slate-300 dark:text-slate-300 leading-relaxed">{order.notes}</p>
          </Section>
        )}

        {/* Payments history */}
        <div>
          <p className="text-[10px] md:text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
            Historial de pagos
            {payments.length > 0 && (
              <span className="ml-2 bg-slate-100 dark:bg-[#1a2030] text-slate-500 dark:text-slate-400 text-[10px] md:text-xs rounded-full px-1.5 md:px-2 py-0.5 font-normal">{payments.length}</span>
            )}
          </p>

          {payments.length === 0 ? (
            <p className="text-xs md:text-sm text-slate-400 dark:text-slate-500 text-center py-6">Sin pagos registrados</p>
          ) : (
            <div className="border border-slate-200 dark:border-white/[0.08] rounded-xl divide-y divide-slate-100 dark:divide-white/[0.05] overflow-hidden">
              {payments.map(p => (
                <div key={p.id} className="flex items-start justify-between px-3 md:px-4 py-3 gap-2 md:gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs md:text-sm font-semibold text-slate-800 dark:text-slate-100">${formatMXN(p.amount)}</p>
                    <p className="text-[10px] md:text-xs text-slate-400 mt-0.5">
                      {PAYMENT_METHODS.find(m => m.value === p.payment_method)?.label ?? p.payment_method ?? '—'}
                      {' · '}
                      {formatDate(p.payment_date)}
                    </p>
                    {p.notes && <p className="text-[10px] md:text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">{p.notes}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 md:gap-2 shrink-0 self-center">
                    {/* Botón exportar remisión */}
                    <button
                      onClick={() => onGeneratePdfPayment(p)}
                      disabled={generatingPdf}
                      title="Exportar remisión PDF"
                      className="w-6 md:w-7 h-6 md:h-7 rounded-lg border border-slate-200 dark:border-white/[0.08] flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#1a2030] active:scale-95 transition-all disabled:opacity-40"
                    >
                      <svg className="w-3 md:w-3.5 h-3 md:h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                    </button>
                    <div className="w-6 md:w-7 h-6 md:h-7 bg-emerald-50 dark:bg-emerald-900/20 rounded-full flex items-center justify-center shrink-0">
                      <svg className="w-3 md:w-3.5 h-3 md:h-3.5 text-emerald-600 dark:text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
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
              className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl py-2 md:py-2.5 text-xs md:text-sm font-medium active:scale-95 transition-all"
            >
              <svg className="w-3.5 md:w-4 h-3.5 md:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Registrar pago
            </button>
          )}

          {order.status === 'paid' && (
            <div className="flex items-center justify-center gap-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl py-2 md:py-3 text-xs md:text-sm font-medium text-emerald-700 dark:text-emerald-400">
              <svg className="w-3.5 md:w-4 h-3.5 md:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Pedido pagado completamente
            </div>
          )}

          {canPay && (
            <button
              onClick={onCancel}
              className="w-full border border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-[#1a2030] rounded-xl py-2 md:py-2.5 text-xs md:text-sm font-medium active:scale-95 transition-all"
            >
              Cancelar pedido
            </button>
          )}
        </div>
      </div>

      <div className="border-t border-slate-100 dark:border-white/[0.05] px-3 md:px-6 py-3 flex items-center justify-between gap-2">
        <button onClick={onDelete} className="text-[10px] md:text-xs text-red-400 hover:text-red-600 active:scale-95 transition-all">
          Eliminar pedido
        </button>
        <p className="text-[10px] md:text-xs text-slate-400 shrink-0">Actualizado {formatDate(order.updated_at)}</p>
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
      <div className="bg-white dark:bg-[#1e2535] rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-4 md:px-6 py-4 md:py-5 border-b border-slate-100 dark:border-white/[0.05] flex items-center justify-between sticky top-0 bg-white dark:bg-[#1e2535]">
          <h3 className="font-bold text-slate-900 dark:text-slate-50 text-base md:text-lg">{isEditing ? 'Editar pedido' : 'Nuevo pedido'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:text-slate-300 active:scale-95 transition-all p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-4 md:px-6 py-4 md:py-5 space-y-4">
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
            <p className="text-[10px] md:text-xs text-slate-400 dark:text-slate-500 mt-1">Al seleccionar, se auto-llena el título y total</p>
          </div>

          <Divider />

          <div>
            <FieldLabel>Título *</FieldLabel>
            <Input value={title} onChange={setTitle} placeholder="Pedido de servicios..." />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
              className="w-full border border-slate-200 dark:border-white/[0.08] rounded-xl px-3 py-2.5 text-xs md:text-sm text-slate-700 dark:text-slate-200 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-700 resize-none"
            />
          </div>

          {error && <p className="text-xs md:text-sm text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>}
        </div>

        <div className="px-4 md:px-6 py-3 md:py-4 border-t border-slate-100 dark:border-white/[0.05] flex flex-col-reverse md:flex-row gap-2 md:gap-3 md:justify-end">
          <button onClick={onClose} className="text-xs md:text-sm text-slate-600 dark:text-slate-300 dark:text-slate-300 px-4 py-2 rounded-lg border border-slate-200 dark:border-white/[0.08] hover:bg-slate-50 dark:hover:bg-[#1a2030] active:scale-95 transition-all">
            Cancelar
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="bg-slate-900 hover:bg-slate-800 text-white text-xs md:text-sm font-medium px-5 py-2 rounded-lg active:scale-95 transition-all disabled:opacity-50"
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
      <div className="bg-white dark:bg-[#1e2535] rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="px-4 md:px-6 py-4 md:py-5 border-b border-slate-100 dark:border-white/[0.05] flex items-center justify-between sticky top-0 bg-white dark:bg-[#1e2535]">
          <h3 className="font-bold text-slate-900 dark:text-slate-50 text-base md:text-lg">Registrar pago</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:text-slate-300 active:scale-95 transition-all p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-4 md:px-6 py-4 md:py-5 space-y-4">
          {/* Order info */}
          <div className="bg-slate-50 dark:bg-[#1a2030] rounded-xl p-3">
            <p className="text-[10px] md:text-xs text-slate-400 dark:text-slate-500 mb-1">Pedido</p>
            <p className="text-xs md:text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{order.title}</p>
            <div className="flex flex-col md:flex-row md:justify-between gap-1 md:gap-0 mt-2 text-[10px] md:text-xs text-slate-500">
              <span>Saldo pendiente</span>
              <span className="font-bold text-amber-700 dark:text-amber-400">${formatMXN(balance)}</span>
            </div>
          </div>

          <div>
            <FieldLabel>Monto del pago *</FieldLabel>
            <Input value={amount} onChange={setAmount} placeholder={`Máx. ${formatMXN(balance)}`} type="number" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                className="w-full border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2 text-xs md:text-sm text-slate-700 dark:text-slate-200 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-700"
              />
            </div>
          </div>

          <div>
            <FieldLabel>Notas (opcional)</FieldLabel>
            <Input value={notes} onChange={setNotes} placeholder="Referencia, comprobante..." />
          </div>

          {error && <p className="text-xs md:text-sm text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>}
        </div>

        <div className="px-4 md:px-6 py-3 md:py-4 border-t border-slate-100 dark:border-white/[0.05] flex flex-col-reverse md:flex-row gap-2 md:gap-3 md:justify-end">
          <button onClick={onClose} className="text-xs md:text-sm text-slate-600 dark:text-slate-300 dark:text-slate-300 px-4 py-2 rounded-lg border border-slate-200 dark:border-white/[0.08] hover:bg-slate-50 dark:hover:bg-[#1a2030] active:scale-95 transition-all">
            Cancelar
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs md:text-sm font-medium px-5 py-2 rounded-lg active:scale-95 transition-all disabled:opacity-50"
          >
            {saving ? 'Registrando...' : 'Registrar pago'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── PDF Remisión Template ────────────────────────────────────────────────────

function RemisionPdfTemplate({ payment, order, contact, allOrderPayments, orgBranding, logoDataUrl }: {
  payment: Payment
  order: Order
  contact: Contact | undefined
  allOrderPayments: Payment[]
  orgBranding: OrgBranding
  logoDataUrl: string
}) {
  const orgName = orgBranding?.name ?? 'Mi Empresa'
  const folioNum = `REM-${payment.id.slice(0, 8).toUpperCase()}`

  // Índice de este pago dentro del historial del pedido (ordenados por fecha asc)
  const sortedPayments = [...allOrderPayments].sort(
    (a, b) => new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime()
  )
  const paymentIndex = sortedPayments.findIndex(p => p.id === payment.id) + 1
  const totalPayments = sortedPayments.length

  // Acumulado pagado antes de este pago
  const paidBefore = sortedPayments
    .slice(0, paymentIndex - 1)
    .reduce((sum, p) => sum + p.amount, 0)
  const paidAfter = paidBefore + payment.amount
  const remainingAfter = Math.max(0, order.total - paidAfter)
  const progressPct = Math.min(100, Math.round((paidAfter / order.total) * 100))

  const methodLabel = PAYMENT_METHODS.find(m => m.value === payment.payment_method)?.label ?? payment.payment_method ?? '—'

  // ── Paleta (misma que propuestas pero con acento esmeralda para pagos)
  const C = {
    darkBg:    '#161928',
    darkBg2:   '#1e2235',
    accent:    '#10b981',       // emerald-500 — pagos = dinero recibido
    accentSub: '#6ee7b7',
    white:     '#ffffff',
    bodyBg:    '#f8fafc',
    border:    '#e8edf4',
    text:      '#1e293b',
    textMid:   '#475569',
    textLight: '#94a3b8',
    textFaint: '#cbd5e1',
  }

  const label: React.CSSProperties = {
    fontSize: '8px',
    fontWeight: 700,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: C.textLight,
    marginBottom: '5px',
  }

  return (
    <div style={{
      fontFamily: 'Arial, Helvetica, sans-serif',
      background: C.white,
      color: C.text,
      minHeight: '297mm',
      width: '210mm',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      overflow: 'hidden',
    }}>

      {/* ══ HEADER OSCURO ═══════════════════════════════════════════════════ */}
      <div style={{
        background: `linear-gradient(135deg, ${C.darkBg} 0%, ${C.darkBg2} 100%)`,
        padding: '36px 48px 32px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        position: 'relative',
      }}>
        {/* Decoración geométrica */}
        <div style={{
          position: 'absolute', top: 0, right: 0,
          width: '160px', height: '100%',
          background: 'rgba(255,255,255,0.02)',
          clipPath: 'polygon(40% 0, 100% 0, 100% 100%, 0% 100%)',
        }} />
        <div style={{
          position: 'absolute', top: 0, right: '60px',
          width: '80px', height: '100%',
          background: 'rgba(255,255,255,0.015)',
          clipPath: 'polygon(40% 0, 100% 0, 100% 100%, 0% 100%)',
        }} />

        {/* Izquierda: Logo + nombre org */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', zIndex: 1 }}>
          {logoDataUrl ? (
            <img
              src={logoDataUrl}
              alt={orgName}
              style={{ height: '68px', width: 'auto', display: 'block', objectFit: 'contain' }}
            />
          ) : (
            <div style={{ fontSize: '28px', fontWeight: 900, color: C.white, letterSpacing: '-0.04em', lineHeight: 1 }}>
              {orgName}
            </div>
          )}
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)', fontWeight: 500, letterSpacing: '0.02em' }}>
            {orgName}
          </div>
        </div>

        {/* Derecha: tipo + folio */}
        <div style={{ textAlign: 'right', zIndex: 1 }}>
          <div style={{
            display: 'inline-block',
            fontSize: '9px', fontWeight: 700,
            letterSpacing: '0.18em', textTransform: 'uppercase',
            color: C.accent,
            background: 'rgba(16,185,129,0.15)',
            border: '1px solid rgba(16,185,129,0.35)',
            padding: '4px 12px',
            borderRadius: '20px',
            marginBottom: '10px',
          }}>
            Remisión de Pago
          </div>
          <div style={{ fontSize: '8px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: '4px' }}>
            Folio
          </div>
          <div style={{ fontSize: '18px', fontWeight: 900, color: C.white, fontFamily: 'monospace', letterSpacing: '0.06em' }}>
            {folioNum}
          </div>
          <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)', marginTop: '4px', letterSpacing: '0.04em' }}>
            Pago {paymentIndex} de {totalPayments}
          </div>
        </div>
      </div>

      {/* Línea de acento esmeralda */}
      <div style={{ height: '3px', background: `linear-gradient(90deg, ${C.accent} 0%, #34d399 60%, transparent 100%)` }} />

      {/* ══ CUERPO ══════════════════════════════════════════════════════════ */}
      <div style={{ flex: 1, padding: '36px 48px', display: 'flex', flexDirection: 'column' }}>

        {/* ── META INFO ─────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          marginBottom: '28px', paddingBottom: '24px',
          borderBottom: `1px solid ${C.border}`,
        }}>
          {/* Info del cliente */}
          <div>
            <div style={label}>Recibido de</div>
            {contact ? (
              <>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', lineHeight: 1.2, marginBottom: '4px' }}>
                  {contact.full_name ?? '—'}
                </div>
                {contact.company && (
                  <div style={{ fontSize: '12px', color: C.textMid, fontWeight: 500, marginBottom: '2px' }}>{contact.company}</div>
                )}
                {contact.email && (
                  <div style={{ fontSize: '11px', color: C.textLight }}>{contact.email}</div>
                )}
              </>
            ) : (
              <div style={{ fontSize: '13px', color: C.textLight, fontStyle: 'italic' }}>Cliente no especificado</div>
            )}
          </div>

          {/* Meta del pago */}
          <div style={{ display: 'flex', gap: '28px' }}>
            {[
              { lbl: 'Fecha de pago', val: formatDate(payment.payment_date) },
              { lbl: 'Método', val: methodLabel },
              { lbl: 'Fecha de emisión', val: formatDate(payment.created_at) },
            ].map(({ lbl, val }) => (
              <div key={lbl} style={{ textAlign: 'right' }}>
                <div style={label}>{lbl}</div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: C.text }}>{val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── MONTO DEL PAGO ────────────────────────────────────────────── */}
        <div style={{ marginBottom: '28px' }}>
          <div style={{
            display: 'inline-block',
            width: '28px', height: '3px',
            background: C.accent,
            borderRadius: '2px',
            marginBottom: '10px',
          }} />
          <div style={{ fontSize: '13px', color: C.textLight, fontWeight: 500, marginBottom: '6px', letterSpacing: '0.02em' }}>
            {order.title}
          </div>
          {/* Monto grande destacado */}
          <div style={{
            background: `linear-gradient(135deg, ${C.darkBg} 0%, ${C.darkBg2} 100%)`,
            borderRadius: '16px',
            padding: '28px 32px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>
                Monto recibido
              </div>
              <div style={{ fontSize: '42px', fontWeight: 900, color: C.white, letterSpacing: '-0.03em', lineHeight: 1 }}>
                ${formatMXN(payment.amount)}
              </div>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', marginTop: '6px', letterSpacing: '0.05em' }}>
                MXN — Pesos Mexicanos
              </div>
            </div>
            {/* Badge confirmación */}
            <div style={{
              width: '60px', height: '60px',
              borderRadius: '50%',
              background: 'rgba(16,185,129,0.2)',
              border: '2px solid rgba(16,185,129,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          </div>
        </div>

        {/* ── DESGLOSE DEL PEDIDO ───────────────────────────────────────── */}
        <div style={{ marginBottom: '28px' }}>
          <div style={{ ...label, marginBottom: '12px' }}>Desglose del pedido</div>

          <div style={{
            border: `1px solid ${C.border}`,
            borderRadius: '12px',
            overflow: 'hidden',
          }}>
            {/* Tabla */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
              <thead>
                <tr style={{ background: C.bodyBg, borderBottom: `1px solid ${C.border}` }}>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, fontSize: '8.5px', letterSpacing: '0.12em', textTransform: 'uppercase', color: C.textLight }}>
                    Concepto
                  </th>
                  <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, fontSize: '8.5px', letterSpacing: '0.12em', textTransform: 'uppercase', color: C.textLight, width: '140px' }}>
                    Monto
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 600, color: C.text, marginBottom: '2px' }}>Total del pedido</div>
                    <div style={{ fontSize: '10px', color: C.textLight }}>{order.title}</div>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: C.text }}>
                    ${formatMXN(order.total)}
                  </td>
                </tr>
                <tr style={{ borderBottom: `1px solid ${C.border}`, background: C.bodyBg }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 500, color: C.textMid }}>Pagado anteriormente</div>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', color: C.textMid }}>
                    ${formatMXN(paidBefore)}
                  </td>
                </tr>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 700, color: C.accent }}>Este pago</div>
                    {payment.notes && (
                      <div style={{ fontSize: '10px', color: C.textLight, marginTop: '2px' }}>{payment.notes}</div>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: C.accent, fontSize: '13px' }}>
                    ${formatMXN(payment.amount)}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Resumen final */}
            <div style={{
              background: `linear-gradient(135deg, ${C.darkBg} 0%, ${C.darkBg2} 100%)`,
              padding: '16px 20px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: '8.5px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: '4px' }}>
                  Saldo restante
                </div>
                <div style={{ fontSize: '18px', fontWeight: 900, color: remainingAfter === 0 ? C.accent : '#fbbf24', letterSpacing: '-0.02em' }}>
                  {remainingAfter === 0 ? 'LIQUIDADO' : `$${formatMXN(remainingAfter)}`}
                </div>
              </div>
              {/* Barra de progreso */}
              <div style={{ textAlign: 'right', minWidth: '140px' }}>
                <div style={{ fontSize: '8.5px', color: 'rgba(255,255,255,0.4)', marginBottom: '6px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  {progressPct}% cubierto
                </div>
                <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: '3px',
                    width: `${progressPct}%`,
                    background: progressPct === 100
                      ? `linear-gradient(90deg, ${C.accent}, #34d399)`
                      : `linear-gradient(90deg, #fbbf24, #f59e0b)`,
                  }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── FOOTER ══════════════════════════════════════════════════════ */}
        <div style={{
          marginTop: 'auto', paddingTop: '20px',
          borderTop: `1px solid ${C.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: C.accent }} />
            <span style={{ fontSize: '10px', fontWeight: 700, color: C.textMid }}>{orgName}</span>
          </div>
          <div style={{ fontSize: '9px', color: C.textFaint, letterSpacing: '0.04em' }}>
            Remisión generada con Antuario Dashboard · {folioNum}
          </div>
        </div>

      </div>
    </div>
  )
}


// ─── Shared micro-components ──────────────────────────────────────────────────

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-slate-50 dark:bg-[#1a2030] rounded-xl p-3">
      <p className="text-xs text-slate-400 dark:text-slate-500 mb-0.5">{label}</p>
      <p className={`text-sm font-bold ${color}`}>{value}</p>
    </div>
  )
}

function EmptyState({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center px-8">
      <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-[#1a2030] flex items-center justify-center mb-3">
        <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">{icon}</svg>
      </div>
      <p className="text-sm font-medium text-slate-600 dark:text-slate-300 dark:text-slate-300 mb-1">{title}</p>
      <p className="text-xs text-slate-400">{subtitle}</p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start justify-between py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0 w-32">{label}</span>
      <span className="text-sm text-slate-700 dark:text-slate-200 dark:text-slate-200 text-right">{value ?? '—'}</span>
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{children}</label>
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
      className="w-full border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-200 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-700"
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
      className="w-full border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-200 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-700 bg-white dark:bg-[#1e2535]"
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

function Divider() {
  return <div className="border-t border-slate-100 dark:border-white/[0.05]" />
}
