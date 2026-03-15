'use client'

import { useState, useMemo, useCallback, useRef } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import { CARD_S } from '@/components/ui/dashboard'

// ─── Types ────────────────────────────────────────────────────────────────────

type Proposal = {
  id: string
  contact_id: string | null
  client_id: string | null
  assigned_to: string | null
  title: string
  status: string
  module_label: string | null
  subtotal: number
  tax_rate: number
  tax_amount: number
  total: number
  notes: string | null
  terms_and_conditions: string | null
  pdf_url: string | null
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

type Contact = { id: string; full_name: string | null; email: string | null; company: string | null }
type Client = { id: string; name: string | null }
type Profile = { id: string; full_name: string | null; email: string | null }
type OrgBranding = { name?: string | null; logo_url?: string | null } | null

type ItemForm = {
  id: string // temp id for local state
  concept: string
  description: string
  quantity: string
  unit_price: string
}

type Props = {
  orgId: number
  currentUserId: string
  currentUserRole: string
  initialProposals: Proposal[]
  initialItems: ProposalItem[]
  contacts: Contact[]
  clients: Client[]
  profiles: Profile[]
  orgBranding: OrgBranding
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUSES = [
  { value: 'all', label: 'Todas' },
  { value: 'draft', label: 'Borrador' },
  { value: 'sent', label: 'Enviada' },
  { value: 'accepted', label: 'Aceptada' },
  { value: 'rejected', label: 'Rechazada' },
]

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  sent: 'bg-blue-50 text-blue-600',
  accepted: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-red-50 text-red-500',
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  sent: 'Enviada',
  accepted: 'Aceptada',
  rejected: 'Rechazada',
}

const TAX_OPTIONS = [0, 8, 16]

const EMPTY_ITEM: ItemForm = {
  id: '',
  concept: '',
  description: '',
  quantity: '1',
  unit_price: '',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatMXN(n: number) {
  return n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

function tempId() {
  return Math.random().toString(36).slice(2)
}

function getSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
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

export default function PropuestasClient({
  orgId, currentUserId, currentUserRole,
  initialProposals, initialItems,
  contacts, clients, profiles, orgBranding,
}: Props) {
  const [proposals, setProposals] = useState<Proposal[]>(initialProposals)
  const [allItems, setAllItems] = useState<ProposalItem[]>(initialItems)

  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')

  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editingProposal, setEditingProposal] = useState<Proposal | null>(null)

  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // Form state
  const [formTitle, setFormTitle] = useState('')
  const [formContactId, setFormContactId] = useState('')
  const [formClientId, setFormClientId] = useState('')
  const [formAssignedTo, setFormAssignedTo] = useState('')
  const [formStatus, setFormStatus] = useState('draft')
  const [formModuleLabel, setFormModuleLabel] = useState('Propuesta')
  const [formTaxRate, setFormTaxRate] = useState(16)
  const [formNotes, setFormNotes] = useState('')
  const [formTerms, setFormTerms] = useState('')
  const [formItems, setFormItems] = useState<ItemForm[]>([{ ...EMPTY_ITEM, id: tempId() }])

  const [convertingId, setConvertingId] = useState<string | null>(null)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [pdfProposal, setPdfProposal] = useState<Proposal | null>(null)
  const [pdfItems, setPdfItems] = useState<ProposalItem[]>([])
  const [pdfContact, setPdfContact] = useState<Contact | undefined>(undefined)
  const [pdfLogoDataUrl, setPdfLogoDataUrl] = useState('')
  const [pdfToast, setPdfToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const pdfRef = useRef<HTMLDivElement>(null)

  // ── Computed ───────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return proposals.filter(p => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false
      if (search) {
        const q = search.toLowerCase()
        const contact = contacts.find(c => c.id === p.contact_id)
        if (
          !p.title.toLowerCase().includes(q) &&
          !contact?.full_name?.toLowerCase().includes(q) &&
          !contact?.company?.toLowerCase().includes(q)
        ) return false
      }
      return true
    })
  }, [proposals, statusFilter, search, contacts])

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: proposals.length }
    proposals.forEach(p => { map[p.status] = (map[p.status] ?? 0) + 1 })
    return map
  }, [proposals])

  const selectedItems = useMemo(() =>
    selectedProposal ? allItems.filter(i => i.proposal_id === selectedProposal.id) : [],
    [selectedProposal, allItems]
  )

  // ── Form item calculations ─────────────────────────────────────────────────

  const computedSubtotal = useMemo(() => {
    return formItems.reduce((sum, item) => {
      const qty = parseFloat(item.quantity) || 0
      const price = parseFloat(item.unit_price) || 0
      return sum + qty * price
    }, 0)
  }, [formItems])

  const computedTaxAmount = useMemo(() => computedSubtotal * (formTaxRate / 100), [computedSubtotal, formTaxRate])
  const computedTotal = useMemo(() => computedSubtotal + computedTaxAmount, [computedSubtotal, computedTaxAmount])

  // ── Open modal ─────────────────────────────────────────────────────────────

  const openCreate = useCallback(() => {
    setFormTitle('')
    setFormContactId('')
    setFormClientId('')
    setFormAssignedTo('')
    setFormStatus('draft')
    setFormModuleLabel('Propuesta')
    setFormTaxRate(16)
    setFormNotes('')
    setFormTerms('')
    setFormItems([{ ...EMPTY_ITEM, id: tempId() }])
    setFormError('')
    setEditingProposal(null)
    setShowModal(true)
  }, [])

  const openEdit = useCallback((p: Proposal) => {
    const items = allItems.filter(i => i.proposal_id === p.id)
    setFormTitle(p.title)
    setFormContactId(p.contact_id ?? '')
    setFormClientId(p.client_id ?? '')
    setFormAssignedTo(p.assigned_to ?? '')
    setFormStatus(p.status)
    setFormModuleLabel(p.module_label ?? 'Propuesta')
    setFormTaxRate(p.tax_rate ?? 16)
    setFormNotes(p.notes ?? '')
    setFormTerms(p.terms_and_conditions ?? '')
    setFormItems(items.length > 0
      ? items.map(i => ({
        id: i.id,
        concept: i.concept,
        description: i.description ?? '',
        quantity: String(i.quantity),
        unit_price: String(i.unit_price),
      }))
      : [{ ...EMPTY_ITEM, id: tempId() }]
    )
    setFormError('')
    setEditingProposal(p)
    setShowModal(true)
  }, [allItems])

  // ── Item form helpers ──────────────────────────────────────────────────────

  const updateItem = useCallback((id: string, key: keyof ItemForm, val: string) => {
    setFormItems(prev => prev.map(item => item.id === id ? { ...item, [key]: val } : item))
  }, [])

  const addItem = useCallback(() => {
    setFormItems(prev => [...prev, { ...EMPTY_ITEM, id: tempId() }])
  }, [])

  const removeItem = useCallback((id: string) => {
    setFormItems(prev => prev.filter(item => item.id !== id))
  }, [])

  // ── Save ───────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!formTitle.trim()) { setFormError('El título es obligatorio'); return }
    if (formItems.some(i => !i.concept.trim())) { setFormError('Todos los conceptos deben tener nombre'); return }

    setSaving(true)
    setFormError('')
    const supabase = getSupabase()

    const payload = {
      organization_id: orgId,
      contact_id: formContactId || null,
      client_id: formClientId || null,
      assigned_to: formAssignedTo || null,
      title: formTitle.trim(),
      status: formStatus,
      module_label: formModuleLabel,
      subtotal: computedSubtotal,
      tax_rate: formTaxRate,
      tax_amount: computedTaxAmount,
      total: computedTotal,
      notes: formNotes.trim() || null,
      terms_and_conditions: formTerms.trim() || null,
    }

    let proposalId: string

    if (editingProposal) {
      const { data, error } = await supabase
        .from('proposals')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', editingProposal.id)
        .select()
        .single()
      if (error) { setFormError(error.message); setSaving(false); return }
      proposalId = editingProposal.id
      setProposals(prev => prev.map(p => p.id === editingProposal.id ? data : p))
      if (selectedProposal?.id === editingProposal.id) setSelectedProposal(data)

      // Delete existing items
      await supabase.from('proposal_items').delete().eq('proposal_id', proposalId)
      setAllItems(prev => prev.filter(i => i.proposal_id !== proposalId))
    } else {
      const { data, error } = await supabase
        .from('proposals')
        .insert({ ...payload, created_by: currentUserId })
        .select()
        .single()
      if (error) { setFormError(error.message); setSaving(false); return }
      proposalId = data.id
      setProposals(prev => [data, ...prev])
    }

    // Insert items
    const itemsPayload = formItems
      .filter(i => i.concept.trim())
      .map((item, idx) => {
        const qty = parseFloat(item.quantity) || 0
        const price = parseFloat(item.unit_price) || 0
        return {
          proposal_id: proposalId,
          organization_id: orgId,
          concept: item.concept.trim(),
          description: item.description.trim() || null,
          quantity: qty,
          unit_price: price,
          total: qty * price,
          sort_order: idx,
        }
      })

    if (itemsPayload.length > 0) {
      const { data: newItems } = await supabase
        .from('proposal_items')
        .insert(itemsPayload)
        .select()
      if (newItems) setAllItems(prev => [...prev, ...newItems])
    }

    setSaving(false)
    setShowModal(false)
  }, [
    formTitle, formItems, formContactId, formClientId, formAssignedTo,
    formStatus, formModuleLabel, formTaxRate, formNotes, formTerms,
    computedSubtotal, computedTaxAmount, computedTotal,
    orgId, currentUserId, editingProposal, selectedProposal,
  ])

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('¿Eliminar esta propuesta?')) return
    const supabase = getSupabase()
    await supabase.from('proposals').delete().eq('id', id)
    setProposals(prev => prev.filter(p => p.id !== id))
    setAllItems(prev => prev.filter(i => i.proposal_id !== id))
    if (selectedProposal?.id === id) setSelectedProposal(null)
  }, [selectedProposal])

  // ── Update status ──────────────────────────────────────────────────────────

  const handleStatusChange = useCallback(async (id: string, status: string) => {
    const supabase = getSupabase()
    const { data } = await supabase
      .from('proposals')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (data) {
      setProposals(prev => prev.map(p => p.id === id ? data : p))
      if (selectedProposal?.id === id) setSelectedProposal(data)
    }
  }, [selectedProposal])

  // ── Convert to order ───────────────────────────────────────────────────────

  const handleConvertToOrder = useCallback(async (proposal: Proposal) => {
    if (!confirm(`¿Convertir "${proposal.title}" en pedido?`)) return
    setConvertingId(proposal.id)
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('orders')
      .insert({
        organization_id: orgId,
        contact_id: proposal.contact_id,
        client_id: proposal.client_id,
        proposal_id: proposal.id,
        title: proposal.title,
        status: 'pending',
        total: proposal.total,
        amount_paid: 0,
        created_by: currentUserId,
      })
      .select()
      .single()

    if (!error) {
      await handleStatusChange(proposal.id, 'accepted')
      setPdfToast({ type: 'success', message: 'Pedido creado correctamente.' })
      setTimeout(() => setPdfToast(null), 4000)
    } else {
      setPdfToast({ type: 'error', message: 'Error al crear el pedido: ' + error.message })
      setTimeout(() => setPdfToast(null), 4000)
    }
    setConvertingId(null)
  }, [orgId, currentUserId, handleStatusChange])

  // ── PDF generation — html2canvas + jsPDF ─────────────────────────────────

  const handleGeneratePdf = useCallback(async (proposal: Proposal) => {
    const items = allItems.filter(i => i.proposal_id === proposal.id)
    const contact = contacts.find(c => c.id === proposal.contact_id)

    // Pre-load logo as base64 to avoid CORS issues with html2canvas
    let logoDataUrl = ''
    if (orgBranding?.logo_url) {
      logoDataUrl = await fetchImageAsDataURL(orgBranding.logo_url)
    }

    // Mount hidden template and show loading overlay
    setPdfLogoDataUrl(logoDataUrl)
    setPdfProposal(proposal)
    setPdfItems(items)
    setPdfContact(contact)
    setGeneratingPdf(true)

    // Wait for DOM paint
    await new Promise(r => setTimeout(r, 500))

    try {
      const el = document.getElementById('premium-pdf-template') || pdfRef.current
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

      // Multi-page support: split content across pages if taller than A4
      let renderedY = 0
      while (renderedY < imgH) {
        if (renderedY > 0) pdf.addPage()
        pdf.addImage(imgData, 'PNG', 0, -renderedY, pdfW, imgH)
        renderedY += pdfH
      }

      pdf.save(`Propuesta_${proposal.id.slice(0, 8).toUpperCase()}.pdf`)
      setPdfToast({ type: 'success', message: '¡PDF descargado! Revisa tu carpeta de descargas.' })
    } catch (err: any) {
      console.error('PDF Error:', err)
      setPdfToast({ type: 'error', message: 'Error al generar el PDF. Intenta de nuevo.' })
    } finally {
      setGeneratingPdf(false)
      setPdfProposal(null)
      setPdfLogoDataUrl('')
      setTimeout(() => setPdfToast(null), 4000)
    }
  }, [allItems, contacts, orgBranding, pdfRef])

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full min-h-screen bg-slate-50">

      {/* ── PDF Loading Overlay ───────────────────────────────────────────── */}
      {generatingPdf && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl px-10 py-8 flex flex-col items-center gap-4 min-w-[220px]">
            <div className="w-10 h-10 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
            <p className="text-sm font-semibold text-slate-700">Generando PDF…</p>
            <p className="text-xs text-slate-400 text-center">Esto puede tomar unos segundos</p>
          </div>
        </div>
      )}

      {/* ── Toast notification ────────────────────────────────────────────── */}
      {pdfToast && (
        <div className={`fixed top-5 right-5 z-[9999] flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-lg text-sm font-medium transition-all ${
          pdfToast.type === 'success'
            ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
            : 'bg-red-50 border border-red-200 text-red-700'
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

      {/* ── Left panel — filters ──────────────────────────────────────────── */}
      <aside className="w-56 shrink-0 bg-white border-r border-slate-100 flex flex-col">

        {/* Header — dark gradient */}
        <div
          className="px-5 py-5 shrink-0"
          style={{ background: 'linear-gradient(135deg, #161928 0%, #1e2235 100%)' }}
        >
          <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-slate-500 mb-1">Propuestas</p>
          <p className="text-3xl font-extrabold text-white tabular-nums">{proposals.length}</p>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-400"
                style={{ width: `${proposals.length ? Math.round((counts['accepted'] ?? 0) / proposals.length * 100) : 0}%` }}
              />
            </div>
            <span className="text-[10px] text-slate-500 shrink-0">
              {proposals.length ? Math.round((counts['accepted'] ?? 0) / proposals.length * 100) : 0}% cerradas
            </span>
          </div>
        </div>

        {/* Scrollable filters */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-1">
            {STATUSES.map(s => (
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
          <div className="mx-4 mb-4">
            <div className="rounded-2xl p-3 bg-emerald-50 border border-emerald-100" style={CARD_S}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 mb-1">Total aceptado</p>
              <p className="text-base font-bold text-emerald-800 tabular-nums">
                ${formatMXN(proposals.filter(p => p.status === 'accepted').reduce((s, p) => s + p.total, 0))}
              </p>
            </div>
          </div>
        </div>

        {/* ── CTA fijo siempre visible ────────────────────────────────────────── */}
        <div className="shrink-0 p-4 bg-white border-t border-slate-100">
          <button
            onClick={openCreate}
            className="w-full flex items-center justify-center gap-2 text-sm font-bold py-3 rounded-xl transition-all"
            style={{
              background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
              color: '#fff',
              boxShadow: '0 4px 18px rgba(15,23,42,0.35)',
            }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Nueva propuesta
          </button>
        </div>
      </aside>

      {/* ── Center — list ─────────────────────────────────────────────────── */}
      <main className={`flex flex-col transition-all duration-300 ${selectedProposal ? 'w-96 shrink-0' : 'flex-1'}`}>
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
            <div className="flex flex-col items-center justify-center py-24 text-center px-8">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-slate-600 mb-1">Sin propuestas</p>
              <p className="text-xs text-slate-400">Crea tu primera propuesta comercial</p>
            </div>
          ) : (
            filtered.map(p => {
              const contact = contacts.find(c => c.id === p.contact_id)
              const isSelected = selectedProposal?.id === p.id
              const itemCount = allItems.filter(i => i.proposal_id === p.id).length
              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedProposal(isSelected ? null : p)}
                  className={`w-full text-left px-4 py-4 hover:bg-slate-50 transition-colors ${isSelected ? 'bg-slate-50 border-l-2 border-slate-800' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <p className="text-sm font-semibold text-slate-800 leading-tight">{p.title}</p>
                    <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[p.status] ?? 'bg-slate-100 text-slate-500'}`}>
                      {STATUS_LABELS[p.status] ?? p.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mb-2">
                    {contact?.full_name ?? contact?.email ?? 'Sin contacto'}{contact?.company ? ` · ${contact.company}` : ''}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">{itemCount} concepto{itemCount !== 1 ? 's' : ''} · {formatDate(p.created_at)}</span>
                    <span className="text-sm font-bold text-slate-800">${formatMXN(p.total)}</span>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </main>

      {/* ── Right panel — detail ──────────────────────────────────────────── */}
      {selectedProposal && (
        <div className="flex-1 overflow-y-auto bg-white border-l border-slate-200">
          <ProposalDetail
            proposal={selectedProposal}
            items={selectedItems}
            contacts={contacts}
            profiles={profiles}
            convertingId={convertingId}
            generatingPdf={generatingPdf}
            onEdit={() => openEdit(selectedProposal)}
            onDelete={() => handleDelete(selectedProposal.id)}
            onStatusChange={(status) => handleStatusChange(selectedProposal.id, status)}
            onConvertToOrder={() => handleConvertToOrder(selectedProposal)}
            onGeneratePdf={() => handleGeneratePdf(selectedProposal)}
            onClose={() => setSelectedProposal(null)}
          />
        </div>
      )}

      {/* ── Modal ─────────────────────────────────────────────────────────── */}
      {showModal && (
        <ProposalModal
          isEditing={!!editingProposal}
          saving={saving}
          error={formError}
          contacts={contacts}
          clients={clients}
          profiles={profiles}
          // form fields
          title={formTitle} setTitle={setFormTitle}
          contactId={formContactId} setContactId={setFormContactId}
          clientId={formClientId} setClientId={setFormClientId}
          assignedTo={formAssignedTo} setAssignedTo={setFormAssignedTo}
          status={formStatus} setStatus={setFormStatus}
          moduleLabel={formModuleLabel} setModuleLabel={setFormModuleLabel}
          taxRate={formTaxRate} setTaxRate={setFormTaxRate}
          notes={formNotes} setNotes={setFormNotes}
          terms={formTerms} setTerms={setFormTerms}
          items={formItems}
          subtotal={computedSubtotal}
          taxAmount={computedTaxAmount}
          total={computedTotal}
          onUpdateItem={updateItem}
          onAddItem={addItem}
          onRemoveItem={removeItem}
          onSave={handleSave}
          onClose={() => setShowModal(false)}
        />
      )}

      {/* ── Hidden PDF Template for html2canvas ──────────────────────────── */}
      {pdfProposal && (
        <div style={{ position: 'absolute', left: '-9999px', top: 0, zIndex: -100 }}>
          <div
            id="premium-pdf-template"
            ref={pdfRef}
            style={{ width: '210mm', minHeight: '297mm', background: '#fff' }}
          >
            <ProposalPdfTemplate
              proposal={pdfProposal}
              items={pdfItems}
              contact={pdfContact}
              orgBranding={orgBranding}
              logoDataUrl={pdfLogoDataUrl}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── PDF Template Component (Modern Minimal Design) ───────────────────────────

function ProposalPdfTemplate({ proposal, items, contact, orgBranding, logoDataUrl }: {
  proposal: Proposal
  items: ProposalItem[]
  contact: Contact | undefined
  orgBranding: OrgBranding
  logoDataUrl: string
}) {
  const orgName = orgBranding?.name ?? 'Mi Empresa'
  const propNum = proposal.id.slice(0, 8).toUpperCase()

  // ── Paleta de colores alineada al dashboard ───────────────────────────────
  const C = {
    darkBg:    '#161928',       // sidebar fondo oscuro
    darkBg2:   '#1e2235',       // sidebar fondo secundario
    accent:    '#ef4444',       // rojo propuestas (bg-red-500)
    accentSub: '#fca5a5',       // rojo suave
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
        {/* Decoración geométrica sutil */}
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
            <div style={{
              fontSize: '28px', fontWeight: 900, color: C.white,
              letterSpacing: '-0.04em', lineHeight: 1,
            }}>
              {orgName}
            </div>
          )}
          <div style={{
            fontSize: '11px', color: 'rgba(255,255,255,0.45)',
            fontWeight: 500, letterSpacing: '0.02em',
          }}>
            {orgName}
          </div>
        </div>

        {/* Derecha: tipo + número de documento */}
        <div style={{ textAlign: 'right', zIndex: 1 }}>
          <div style={{
            display: 'inline-block',
            fontSize: '9px', fontWeight: 700,
            letterSpacing: '0.18em', textTransform: 'uppercase',
            color: C.accent,
            background: 'rgba(239,68,68,0.15)',
            border: '1px solid rgba(239,68,68,0.3)',
            padding: '4px 12px',
            borderRadius: '20px',
            marginBottom: '10px',
          }}>
            {proposal.module_label ?? 'Propuesta'}
          </div>
          <div style={{
            fontSize: '8px', fontWeight: 700, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)',
            marginBottom: '4px',
          }}>
            No. de documento
          </div>
          <div style={{
            fontSize: '22px', fontWeight: 900, color: C.white,
            fontFamily: 'monospace', letterSpacing: '0.06em',
          }}>
            {propNum}
          </div>
        </div>
      </div>

      {/* Línea de acento rojo */}
      <div style={{ height: '3px', background: `linear-gradient(90deg, ${C.accent} 0%, #f87171 60%, transparent 100%)` }} />

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
            <div style={label}>Preparado para</div>
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
              <div style={{ fontSize: '13px', color: C.textLight, fontStyle: 'italic' }}>Destinatario no especificado</div>
            )}
          </div>

          {/* Meta de la propuesta */}
          <div style={{ display: 'flex', gap: '28px' }}>
            {[
              { lbl: 'Fecha de emisión', val: formatDate(proposal.created_at) },
              { lbl: 'Vigencia', val: '30 días naturales' },
              { lbl: 'Estado', val: STATUS_LABELS[proposal.status] ?? proposal.status },
            ].map(({ lbl, val }) => (
              <div key={lbl} style={{ textAlign: 'right' }}>
                <div style={label}>{lbl}</div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: C.text, letterSpacing: '0.01em' }}>{val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── TÍTULO DE LA PROPUESTA ────────────────────────────────────── */}
        <div style={{ marginBottom: '28px' }}>
          <div style={{
            display: 'inline-block',
            width: '28px', height: '3px',
            background: C.accent,
            borderRadius: '2px',
            marginBottom: '10px',
          }} />
          <div style={{ fontSize: '21px', fontWeight: 900, color: '#0f172a', lineHeight: 1.2, letterSpacing: '-0.02em' }}>
            {proposal.title}
          </div>
        </div>

        {/* ── TABLA DE CONCEPTOS ────────────────────────────────────────── */}
        <div style={{ marginBottom: '28px' }}>
          <div style={{ ...label, marginBottom: '10px' }}>Conceptos del proyecto</div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px', borderRadius: '10px', overflow: 'hidden' }}>
            <thead>
              <tr style={{ background: `linear-gradient(135deg, ${C.darkBg} 0%, ${C.darkBg2} 100%)` }}>
                <th style={{ padding: '11px 16px', textAlign: 'left', fontWeight: 700, fontSize: '8.5px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)' }}>
                  Concepto
                </th>
                <th style={{ padding: '11px 16px', textAlign: 'center', fontWeight: 700, fontSize: '8.5px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)', width: '60px' }}>
                  Cant.
                </th>
                <th style={{ padding: '11px 16px', textAlign: 'right', fontWeight: 700, fontSize: '8.5px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)', width: '110px' }}>
                  P. Unitario
                </th>
                <th style={{ padding: '11px 16px', textAlign: 'right', fontWeight: 700, fontSize: '8.5px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)', width: '110px' }}>
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={idx} style={{
                  background: idx % 2 === 0 ? C.white : C.bodyBg,
                  borderBottom: `1px solid ${C.border}`,
                }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 600, color: C.text, marginBottom: item.description ? '3px' : 0 }}>
                      {item.concept}
                    </div>
                    {item.description && (
                      <div style={{ fontSize: '10px', color: C.textLight, lineHeight: 1.45 }}>{item.description}</div>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center', color: C.textMid, fontWeight: 500 }}>
                    {item.quantity}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', color: C.textMid }}>
                    ${formatMXN(item.unit_price)}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: C.text }}>
                    ${formatMXN(item.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── TOTALES + NOTAS ───────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '28px', marginBottom: '28px' }}>

          {/* Notas y términos */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {proposal.notes && (
              <div>
                <div style={label}>Notas adicionales</div>
                <div style={{
                  fontSize: '11px', color: C.textMid, lineHeight: 1.65,
                  background: C.bodyBg,
                  border: `1px solid ${C.border}`,
                  borderLeft: `3px solid ${C.accent}`,
                  borderRadius: '6px',
                  padding: '11px 14px',
                }}>
                  {proposal.notes}
                </div>
              </div>
            )}
            {proposal.terms_and_conditions && (
              <div>
                <div style={label}>Términos y condiciones</div>
                <div style={{
                  fontSize: '10px', color: C.textMid, lineHeight: 1.65,
                  background: C.bodyBg,
                  border: `1px solid ${C.border}`,
                  borderRadius: '6px',
                  padding: '11px 14px',
                  whiteSpace: 'pre-wrap', fontStyle: 'italic',
                }}>
                  {proposal.terms_and_conditions}
                </div>
              </div>
            )}
            {!proposal.notes && !proposal.terms_and_conditions && (
              <div style={{ fontSize: '11px', color: C.textFaint, fontStyle: 'italic' }}>
                Para cualquier duda, no dudes en contactarnos.
              </div>
            )}
          </div>

          {/* Caja de totales */}
          <div style={{
            minWidth: '230px',
            border: `1px solid ${C.border}`,
            borderRadius: '12px',
            overflow: 'hidden',
          }}>
            {/* Subtotal / IVA */}
            <div style={{ padding: '16px 20px', background: C.bodyBg }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontSize: '11px', color: C.textMid, fontWeight: 500 }}>Subtotal</span>
                <span style={{ fontSize: '11px', color: C.text, fontWeight: 600 }}>${formatMXN(proposal.subtotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '11px', color: C.textMid, fontWeight: 500 }}>IVA ({proposal.tax_rate}%)</span>
                <span style={{ fontSize: '11px', color: C.text, fontWeight: 600 }}>${formatMXN(proposal.tax_amount)}</span>
              </div>
            </div>
            {/* Total destacado */}
            <div style={{
              padding: '18px 20px',
              background: `linear-gradient(135deg, ${C.darkBg} 0%, ${C.darkBg2} 100%)`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            }}>
              <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)' }}>
                Total
              </span>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '24px', fontWeight: 900, color: C.white, letterSpacing: '-0.025em', lineHeight: 1 }}>
                  ${formatMXN(proposal.total)}
                </div>
                <div style={{ fontSize: '8.5px', color: 'rgba(255,255,255,0.35)', marginTop: '3px', letterSpacing: '0.05em' }}>
                  MXN — Pesos Mexicanos
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ══ FOOTER ══════════════════════════════════════════════════════ */}
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
            Documento generado con Antuario Dashboard · {propNum}
          </div>
        </div>

      </div>{/* fin cuerpo */}
    </div>
  )
}


// ─── Proposal Detail Panel ────────────────────────────────────────────────────

function ProposalDetail({
  proposal, items, contacts, profiles,
  convertingId, generatingPdf,
  onEdit, onDelete, onStatusChange, onConvertToOrder, onGeneratePdf, onClose,
}: {
  proposal: Proposal
  items: ProposalItem[]
  contacts: Contact[]
  profiles: Profile[]
  convertingId: string | null
  generatingPdf: boolean
  onEdit: () => void
  onDelete: () => void
  onStatusChange: (s: string) => void
  onConvertToOrder: () => void
  onGeneratePdf: () => void
  onClose: () => void
}) {
  const contact = contacts.find(c => c.id === proposal.contact_id)
  const assignedProfile = profiles.find(p => p.id === proposal.assigned_to)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-100">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="font-bold text-slate-900 text-lg leading-tight">{proposal.title}</h3>
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

        {/* Status selector */}
        <div className="flex items-center gap-2 flex-wrap">
          {(['draft', 'sent', 'accepted', 'rejected'] as const).map(s => (
            <button
              key={s}
              onClick={() => onStatusChange(s)}
              className={`text-xs px-2.5 py-1 rounded-full font-medium transition-all ${proposal.status === s
                ? STATUS_STYLES[s]
                : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                }`}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

        {/* Info */}
        <Section title="Información">
          <Row label="Responsable" value={assignedProfile?.full_name ?? assignedProfile?.email ?? '—'} />
          <Row label="Etiqueta" value={proposal.module_label} />
          <Row label="Creado" value={formatDate(proposal.created_at)} />
          <Row label="Actualizado" value={formatDate(proposal.updated_at)} />
        </Section>

        {/* Items */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Conceptos</p>
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-3 py-2 text-xs font-medium text-slate-500">Concepto</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-slate-500">Cant.</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-slate-500">P. Unit.</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-slate-500">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.length === 0 ? (
                  <tr><td colSpan={4} className="px-3 py-4 text-center text-xs text-slate-400">Sin conceptos</td></tr>
                ) : (
                  items.map(item => (
                    <tr key={item.id}>
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-slate-700">{item.concept}</p>
                        {item.description && <p className="text-xs text-slate-400">{item.description}</p>}
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-600">{item.quantity}</td>
                      <td className="px-3 py-2.5 text-right text-slate-600">${formatMXN(item.unit_price)}</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-slate-800">${formatMXN(item.total)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Totals */}
        <div className="bg-slate-50 rounded-xl p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Subtotal</span>
            <span className="text-slate-700 font-medium">${formatMXN(proposal.subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">IVA ({proposal.tax_rate}%)</span>
            <span className="text-slate-700 font-medium">${formatMXN(proposal.tax_amount)}</span>
          </div>
          <div className="flex justify-between text-base border-t border-slate-200 pt-2 mt-2">
            <span className="font-bold text-slate-800">Total</span>
            <span className="font-bold text-slate-900 text-lg">${formatMXN(proposal.total)}</span>
          </div>
        </div>

        {proposal.notes && (
          <Section title="Notas">
            <p className="text-sm text-slate-600 leading-relaxed">{proposal.notes}</p>
          </Section>
        )}

        {proposal.terms_and_conditions && (
          <Section title="Términos y condiciones">
            <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{proposal.terms_and_conditions}</p>
          </Section>
        )}

        {/* Actions */}
        <div className="space-y-2">
          <button
            onClick={onGeneratePdf}
            disabled={generatingPdf}
            className="w-full flex items-center justify-center gap-2 border border-slate-200 rounded-xl py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            {generatingPdf ? 'Generando...' : 'Exportar PDF'}
          </button>

          {proposal.status !== 'accepted' && proposal.status !== 'rejected' && (
            <button
              onClick={onConvertToOrder}
              disabled={convertingId === proposal.id}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              {convertingId === proposal.id ? 'Convirtiendo...' : 'Convertir en pedido'}
            </button>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-slate-100 px-6 py-3 flex items-center justify-between">
        <button onClick={onDelete} className="text-xs text-red-400 hover:text-red-600 transition-colors">
          Eliminar propuesta
        </button>
      </div>
    </div>
  )
}

// ─── Proposal Modal ───────────────────────────────────────────────────────────

function ProposalModal({
  isEditing, saving, error,
  contacts, clients, profiles,
  title, setTitle,
  contactId, setContactId,
  clientId, setClientId,
  assignedTo, setAssignedTo,
  status, setStatus,
  moduleLabel, setModuleLabel,
  taxRate, setTaxRate,
  notes, setNotes,
  terms, setTerms,
  items, subtotal, taxAmount, total,
  onUpdateItem, onAddItem, onRemoveItem,
  onSave, onClose,
}: {
  isEditing: boolean; saving: boolean; error: string
  contacts: Contact[]; clients: Client[]; profiles: Profile[]
  title: string; setTitle: (v: string) => void
  contactId: string; setContactId: (v: string) => void
  clientId: string; setClientId: (v: string) => void
  assignedTo: string; setAssignedTo: (v: string) => void
  status: string; setStatus: (v: string) => void
  moduleLabel: string; setModuleLabel: (v: string) => void
  taxRate: number; setTaxRate: (v: number) => void
  notes: string; setNotes: (v: string) => void
  terms: string; setTerms: (v: string) => void
  items: ItemForm[]
  subtotal: number; taxAmount: number; total: number
  onUpdateItem: (id: string, key: keyof ItemForm, val: string) => void
  onAddItem: () => void
  onRemoveItem: (id: string) => void
  onSave: () => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto flex flex-col">

        {/* Modal header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <h3 className="font-bold text-slate-900">{isEditing ? 'Editar propuesta' : 'Nueva propuesta'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5 flex-1">

          {/* Title + label */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <FieldLabel>Título *</FieldLabel>
              <Input value={title} onChange={setTitle} placeholder="Propuesta de servicios digitales" />
            </div>
            <div>
              <FieldLabel>Etiqueta</FieldLabel>
              <Input value={moduleLabel} onChange={setModuleLabel} placeholder="Propuesta / Cotización" />
            </div>
          </div>

          {/* Contact + client + assigned */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <FieldLabel>Contacto</FieldLabel>
              <Select value={contactId} onChange={setContactId}
                options={[{ value: '', label: 'Sin contacto' }, ...contacts.map(c => ({
                  value: c.id, label: c.full_name ?? c.email ?? c.id
                }))]} />
            </div>
            <div>
              <FieldLabel>Cliente</FieldLabel>
              <Select value={clientId} onChange={setClientId}
                options={[{ value: '', label: 'Sin cliente' }, ...clients.map(c => ({
                  value: c.id, label: c.name ?? c.id
                }))]} />
            </div>
            <div>
              <FieldLabel>Responsable</FieldLabel>
              <Select value={assignedTo} onChange={setAssignedTo}
                options={[{ value: '', label: 'Sin asignar' }, ...profiles.map(p => ({
                  value: p.id, label: p.full_name ?? p.email ?? p.id
                }))]} />
            </div>
          </div>

          {/* Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Estado</FieldLabel>
              <Select value={status} onChange={setStatus}
                options={STATUSES.filter(s => s.value !== 'all').map(s => ({ value: s.value, label: s.label }))} />
            </div>
            <div>
              <FieldLabel>IVA</FieldLabel>
              <Select value={String(taxRate)} onChange={v => setTaxRate(Number(v))}
                options={TAX_OPTIONS.map(t => ({ value: String(t), label: `${t}%` }))} />
            </div>
          </div>

          <Divider />

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Conceptos</p>
              <button onClick={onAddItem} className="text-xs text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg px-3 py-1 transition-colors">
                + Agregar
              </button>
            </div>

            <div className="space-y-3">
              {items.map((item, idx) => (
                <div key={item.id} className="border border-slate-200 rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 w-5">{idx + 1}</span>
                    <div className="flex-1">
                      <Input value={item.concept} onChange={v => onUpdateItem(item.id, 'concept', v)} placeholder="Nombre del concepto *" />
                    </div>
                    {items.length > 1 && (
                      <button onClick={() => onRemoveItem(item.id)} className="text-red-400 hover:text-red-600 p-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <Input value={item.description} onChange={v => onUpdateItem(item.id, 'description', v)} placeholder="Descripción (opcional)" />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <FieldLabel>Cantidad</FieldLabel>
                      <Input value={item.quantity} onChange={v => onUpdateItem(item.id, 'quantity', v)} placeholder="1" type="number" />
                    </div>
                    <div>
                      <FieldLabel>Precio unitario</FieldLabel>
                      <Input value={item.unit_price} onChange={v => onUpdateItem(item.id, 'unit_price', v)} placeholder="0.00" type="number" />
                    </div>
                  </div>
                  {item.concept && item.unit_price && (
                    <div className="text-right text-sm font-semibold text-slate-700">
                      Total: ${formatMXN((parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Totals preview */}
          <div className="bg-slate-50 rounded-xl p-4 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Subtotal</span>
              <span className="font-medium text-slate-700">${formatMXN(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">IVA ({taxRate}%)</span>
              <span className="font-medium text-slate-700">${formatMXN(taxAmount)}</span>
            </div>
            <div className="flex justify-between text-base border-t border-slate-200 pt-1.5 mt-1.5">
              <span className="font-bold text-slate-800">Total</span>
              <span className="font-bold text-slate-900">${formatMXN(total)}</span>
            </div>
          </div>

          <Divider />

          {/* Notes + terms */}
          <div className="space-y-3">
            <div>
              <FieldLabel>Notas internas</FieldLabel>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                placeholder="Notas para el equipo..."
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300 resize-none"
              />
            </div>
            <div>
              <FieldLabel>Términos y condiciones</FieldLabel>
              <textarea
                value={terms}
                onChange={e => setTerms(e.target.value)}
                rows={3}
                placeholder="Vigencia de la propuesta, condiciones de pago..."
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300 resize-none"
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 sticky bottom-0 bg-white">
          <button onClick={onClose} className="text-sm text-slate-600 hover:text-slate-800 px-4 py-2 rounded-lg border border-slate-200 transition-colors">
            Cancelar
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear propuesta'}
          </button>
        </div>
      </div>
    </div>
  )
}


// ─── PDF Builder — Template Premium ──────────────────────────────────────────





// ─── Shared small components ──────────────────────────────────────────────────

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

function Divider() {
  return <div className="border-t border-slate-100" />
}
