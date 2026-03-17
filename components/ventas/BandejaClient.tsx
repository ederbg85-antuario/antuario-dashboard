'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams }                           from 'next/navigation'
import { createBrowserClient }                       from '@supabase/ssr'
import { CARD_S }                                    from '@/components/ui/dashboard'

// ── Types ──────────────────────────────────────────────────────────────────────
type ChatwootContact = {
  id: number
  name: string
  email: string
  phone_number?: string
  avatar_url?: string | null
  thumbnail?: string | null
}

type Message = {
  id: number
  content: string
  message_type: number
  created_at: number
  sender?: { name: string; avatar_url?: string | null }
  attachments?: { file_type: string; data_url: string; file_name?: string }[]
}

type Conversation = {
  id: number
  status: 'open' | 'resolved' | 'pending' | 'snoozed'
  unread_count: number
  created_at: number
  last_activity_at: number
  meta: { sender: ChatwootContact; channel: string }
  inbox_id: number
  labels?: string[]
  last_non_activity_message?: { content: string; message_type: number; created_at: number }
}

type AntuarioContact = {
  id: number; full_name: string; email: string | null; phone: string | null
  whatsapp: string | null; company: string | null; contact_type: string | null
  status: string | null; source: string | null; primary_channel: string | null
  notes: string | null; assigned_to: string | null
}
type ContactStats = { proposalCount: number; acceptedProposals: number; orderCount: number; totalSpent: number }

type Props = {
  orgId: number; userRole: string
  chatwootEnabled: boolean; inboxConfigured: boolean; chatwootBaseUrl: string | null
}

// ── Agent AI label ─────────────────────────────────────────────────────────────
const BOT_DISABLED_LABEL = 'agente-ia-pausado'

// ── Contact type config ────────────────────────────────────────────────────────
const CONTACT_TYPES = [
  { value: 'lead_irrelevant', label: 'Lead irrelevante', color: 'bg-slate-100 dark:bg-[#1a2030] text-slate-500' },
  { value: 'lead_potential',  label: 'Lead potencial',   color: 'bg-blue-100 text-blue-600' },
  { value: 'lead_relevant',   label: 'Lead relevante',   color: 'bg-emerald-100 text-emerald-700 dark:text-emerald-400' },
  { value: 'proposal',        label: 'Propuesta',        color: 'bg-amber-100 text-amber-700 dark:text-amber-400' },
  { value: 'active_proposal', label: 'Propuesta activa', color: 'bg-violet-100 text-violet-700' },
]
const CONTACT_TYPE_MAP = Object.fromEntries(CONTACT_TYPES.map(t => [t.value, t]))

function getSupabase() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
}

// ── Notification sound ────────────────────────────────────────────────────────
// Module-level singleton so the AudioContext survives across re-renders and
// can be unlocked once on first user interaction, then reused for all sounds.
let _audioCtx: AudioContext | null = null

function unlockAudio() {
  if (typeof window === 'undefined') return
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    if (!_audioCtx) _audioCtx = new AC()
    if (_audioCtx.state === 'suspended') _audioCtx.resume()
  } catch { /* silent */ }
}

function playNotificationSound() {
  try {
    const ctx = _audioCtx
    if (!ctx || ctx.state !== 'running') return
    // Two-punch notification: a sharp attack "ding" followed by a deeper resonant tone
    // Similar to Telegram/WhatsApp desktop notification style
    const hits: { freq: number; type: OscillatorType; time: number; vol: number; decay: number }[] = [
      { freq: 1200,  type: 'sine',     time: 0,    vol: 0.7, decay: 0.22 },
      { freq: 900,   type: 'triangle', time: 0.01, vol: 0.5, decay: 0.28 },
      { freq: 1800,  type: 'sine',     time: 0.22, vol: 0.7, decay: 0.22 },
      { freq: 1200,  type: 'triangle', time: 0.23, vol: 0.4, decay: 0.28 },
    ]
    hits.forEach(({ freq, type, time, vol, decay }) => {
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.type = type; osc.frequency.value = freq
      gain.gain.setValueAtTime(0, ctx.currentTime + time)
      gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + time + 0.008)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + time + decay)
      osc.start(ctx.currentTime + time); osc.stop(ctx.currentTime + time + decay + 0.05)
    })
  } catch { /* silent fail */ }
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function timeAgo(ts: number) {
  const d = Date.now() / 1000 - ts
  if (d < 60)    return 'ahora'
  if (d < 3600)  return `${Math.floor(d / 60)}m`
  if (d < 86400) return `${Math.floor(d / 3600)}h`
  return `${Math.floor(d / 86400)}d`
}
function formatTime(ts: number) {
  return new Date(ts * 1000).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

function Avatar({ name, url, size = 8 }: { name: string; url?: string | null; size?: number }) {
  const [err, setErr] = useState(false)
  const initials = name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
  const color = ['bg-violet-500','bg-blue-500','bg-rose-500','bg-amber-500','bg-emerald-500','bg-cyan-500'][name.charCodeAt(0) % 6]
  if (url && !err) return <img src={url} alt={name} onError={() => setErr(true)} className={`w-${size} h-${size} rounded-full object-cover shrink-0`} />
  return <span className={`w-${size} h-${size} rounded-full ${color} flex items-center justify-center text-white text-xs font-bold shrink-0`}>{initials}</span>
}

function StatusBadge({ status }: { status: string }) {
  const m: Record<string, { l: string; c: string }> = {
    open:     { l: 'Abierta',   c: 'bg-emerald-100 text-emerald-700 dark:text-emerald-400' },
    resolved: { l: 'Resuelta',  c: 'bg-slate-100 dark:bg-[#1a2030] text-slate-500' },
    pending:  { l: 'Pendiente', c: 'bg-amber-100 text-amber-700 dark:text-amber-400' },
    snoozed:  { l: 'Pospuesta', c: 'bg-violet-100 text-violet-700' },
  }
  const { l, c } = m[status] ?? { l: status, c: 'bg-slate-100 dark:bg-[#1a2030] text-slate-500' }
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${c}`}>{l}</span>
}

function ChannelIcon({ channel }: { channel: string }) {
  if (channel?.includes('whatsapp')) return (
    <svg className="w-3 h-3 text-emerald-500" fill="currentColor" viewBox="0 0 24 24">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  )
  if (channel?.includes('email')) return (
    <svg className="w-3 h-3 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
    </svg>
  )
  return (
    <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/>
    </svg>
  )
}

// ── Empty states ───────────────────────────────────────────────────────────────
function NotConfigured({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
      <div className="w-16 h-16 rounded-2xl bg-slate-50 dark:bg-[#1a2030] dark:bg-[#0d1117] flex items-center justify-center">
        <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/>
        </svg>
      </div>
      <div className="text-center">
        <p className="text-slate-800 dark:text-slate-100 font-semibold">Mensajería no disponible</p>
        <p className="text-slate-500 text-sm mt-1 max-w-xs">{isAdmin ? 'La mensajería no está activada en el sistema.' : 'La mensajería no está disponible en este momento.'}</p>
      </div>
    </div>
  )
}

function InboxNotAssigned({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
      <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
        <svg className="w-8 h-8 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
        </svg>
      </div>
      <div className="text-center">
        <p className="text-slate-800 dark:text-slate-100 font-semibold">Bandeja no configurada</p>
        <p className="text-slate-500 text-sm mt-1 max-w-sm">{isAdmin ? 'Esta organización aún no tiene una bandeja asignada.' : 'La bandeja de tu organización aún no está lista.'}</p>
        {isAdmin && <a href="/configuracion/integraciones" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-violet-600 hover:text-violet-700 underline underline-offset-2">Ir a Integraciones →</a>}
      </div>
    </div>
  )
}

// ── Contact Panel ──────────────────────────────────────────────────────────────
function ContactPanel({ conversation, onContactUpdated }: { conversation: Conversation; onContactUpdated: (c: AntuarioContact) => void }) {
  const [contact, setContact]           = useState<AntuarioContact | null>(null)
  const [status, setStatus]             = useState<'loading' | 'found' | 'creating' | 'error'>('loading')
  const [saving, setSaving]             = useState(false)
  const [toast, setToast]               = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)
  const [typeDropdown, setTypeDropdown] = useState(false)
  const [stats, setStats]               = useState<ContactStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3000)
  }

  const fetchStats = useCallback(async (contactId: number) => {
    setStatsLoading(true)
    try {
      const sb = getSupabase()
      const [{ data: props }, { data: orders }] = await Promise.all([
        sb.from('proposals').select('id,status,total').eq('contact_id', String(contactId)),
        sb.from('orders').select('id,status,total').eq('contact_id', String(contactId)),
      ])
      setStats({
        proposalCount:     props?.length ?? 0,
        acceptedProposals: props?.filter(p => p.status === 'accepted').length ?? 0,
        orderCount:        orders?.length ?? 0,
        totalSpent:        orders?.filter(o => o.status !== 'cancelled').reduce((s, o) => s + (o.total ?? 0), 0) ?? 0,
      })
    } finally { setStatsLoading(false) }
  }, [])

  const autoCreate = useCallback(async (sender: ChatwootContact) => {
    const name     = sender.name?.trim() ?? ''
    const rawPhone = sender.phone_number ?? ''
    const email    = sender.email?.trim() ?? ''
    const digits   = rawPhone.replace(/\D/g, '')
    const phone    = digits.length >= 10 ? digits.slice(-10) : digits
    if (!name || (!phone && !email)) { setStatus('error'); return }
    setStatus('creating')
    try {
      const res  = await fetch('/api/contacts/chatwoot-sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, phone: phone || undefined, email: email || undefined }) })
      const data = await res.json()
      if (data.contact) { setContact(data.contact); setStatus('found'); onContactUpdated(data.contact); fetchStats(data.contact.id); showToast('Contacto guardado automáticamente') }
      else setStatus('error')
    } catch { setStatus('error') }
  }, [fetchStats, onContactUpdated]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const sender   = conversation.meta?.sender
    const rawPhone = sender?.phone_number ?? ''
    const email    = sender?.email?.trim() ?? ''
    const digits   = rawPhone.replace(/\D/g, '')
    const phone10  = digits.length >= 10 ? digits.slice(-10) : digits
    setContact(null); setStats(null); setStatus('loading'); setTypeDropdown(false)

    if (!phone10 && !email) { if (sender?.name?.trim()) autoCreate(sender); else setStatus('error'); return }

    const qs = new URLSearchParams()
    if (phone10) qs.set('phone', phone10)
    if (email)   qs.set('email', email)

    fetch(`/api/contacts/chatwoot-sync?${qs}`)
      .then(r => r.json())
      .then(data => { if (data.contact) { setContact(data.contact); setStatus('found'); fetchStats(data.contact.id) } else autoCreate(sender!) })
      .catch(() => setStatus('error'))
  }, [conversation.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const updateType = async (newType: string) => {
    if (!contact || saving) return
    setSaving(true); setTypeDropdown(false)
    try {
      const res  = await fetch('/api/contacts/chatwoot-sync', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contact_id: contact.id, contact_type: newType, conversation_id: conversation.id }) })
      const data = await res.json()
      if (!res.ok) { showToast(data.error ?? 'Error', 'err'); return }
      const updated = { ...contact, contact_type: newType }
      setContact(updated); onContactUpdated(updated); showToast('Clasificación actualizada')
    } finally { setSaving(false) }
  }

  return (
    <div className="w-60 shrink-0 border-l border-slate-100 dark:border-white/[0.05] flex flex-col bg-white dark:bg-[#1e2535] overflow-y-auto">
      <div className="px-4 pt-4 pb-3 border-b border-slate-100 dark:border-white/[0.05]">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Contacto</p>
      </div>
      {toast && <div className={`mx-3 mt-3 px-3 py-2 rounded-xl text-xs font-medium ${toast.type === 'ok' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' : 'bg-red-50 dark:bg-red-900/20 text-red-600'}`}>{toast.msg}</div>}

      {(status === 'loading' || status === 'creating') && (
        <div className="flex-1 flex flex-col items-center justify-center gap-2">
          <div className="w-5 h-5 border-2 border-violet-200 border-t-violet-500 rounded-full animate-spin" />
          {status === 'creating' && <p className="text-[11px] text-slate-400">Guardando contacto…</p>}
        </div>
      )}
      {status === 'error' && <div className="p-4 text-center"><p className="text-xs text-slate-400">Sin datos suficientes para identificar al contacto</p></div>}

      {status === 'found' && contact && (
        <div className="flex flex-col">
          {/* Identity */}
          <div className="px-4 py-4 flex flex-col items-center gap-2 border-b border-slate-100 dark:border-white/[0.05]">
            <Avatar name={contact.full_name} url={null} size={10} />
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-50 dark:text-white leading-tight">{contact.full_name}</p>
              {contact.company && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{contact.company}</p>}
            </div>
          </div>

          {/* Classification */}
          <div className="px-4 py-3 border-b border-slate-100 dark:border-white/[0.05]">
            <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Clasificación</p>
            <div className="relative">
              <button onClick={() => setTypeDropdown(v => !v)} disabled={saving}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-white/[0.08] hover:border-slate-300 dark:border-white/[0.1] transition-colors">
                {contact.contact_type
                  ? <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${CONTACT_TYPE_MAP[contact.contact_type]?.color ?? 'bg-slate-100 dark:bg-[#1a2030] text-slate-500'}`}>{CONTACT_TYPE_MAP[contact.contact_type]?.label ?? contact.contact_type}</span>
                  : <span className="text-xs text-slate-400">Sin clasificar</span>
                }
                {saving
                  ? <div className="w-3 h-3 border-2 border-slate-300 dark:border-white/[0.1] border-t-slate-500 rounded-full animate-spin shrink-0" />
                  : <svg className="w-3 h-3 text-slate-400 dark:text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
                }
              </button>
              {typeDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-[#1e2535] border border-slate-200 dark:border-white/[0.08] rounded-xl shadow-lg z-10 py-1 overflow-hidden">
                  {CONTACT_TYPES.map(t => (
                    <button key={t.value} onClick={() => updateType(t.value)}
                      className={`w-full text-left px-3 py-2 hover:bg-slate-50 dark:bg-[#1a2030] transition-colors flex items-center gap-2 ${contact.contact_type === t.value ? 'bg-slate-50 dark:bg-[#1a2030]' : ''}`}>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${t.color}`}>{t.label}</span>
                      {contact.contact_type === t.value && <svg className="w-3 h-3 text-violet-500 ml-auto shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/></svg>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="px-4 py-3 border-b border-slate-100 dark:border-white/[0.05]">
            <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Actividad</p>
            {statsLoading
              ? <div className="flex justify-center py-2"><div className="w-4 h-4 border-2 border-slate-200 dark:border-white/[0.08] border-t-slate-400 rounded-full animate-spin" /></div>
              : stats ? (
                <div className="space-y-2">
                  <div className="flex justify-between"><span className="text-[11px] text-slate-500">Propuestas</span><span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">{stats.proposalCount}{stats.acceptedProposals > 0 && <span className="text-[10px] text-emerald-500 ml-1">({stats.acceptedProposals} acept.)</span>}</span></div>
                  <div className="flex justify-between"><span className="text-[11px] text-slate-500">Pedidos</span><span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">{stats.orderCount}</span></div>
                  {stats.totalSpent > 0 && (
                    <div className="mt-1 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl px-3 py-2">
                      <p className="text-[10px] text-emerald-600 font-medium">Total gastado</p>
                      <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">${stats.totalSpent.toLocaleString('es-MX', { minimumFractionDigits: 0 })}</p>
                    </div>
                  )}
                  {stats.proposalCount === 0 && stats.orderCount === 0 && <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center py-1">Sin actividad registrada</p>}
                </div>
              ) : null
            }
          </div>

          {/* Contact details */}
          <div className="px-4 py-3 border-b border-slate-100 dark:border-white/[0.05]">
            <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Datos</p>
            <div className="space-y-1.5">
              {(contact.phone || contact.whatsapp) && (
                <div className="flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
                  <span className="text-xs text-slate-600 dark:text-slate-300 dark:text-slate-300 truncate">{contact.phone ?? contact.whatsapp}</span>
                </div>
              )}
              {contact.email && (
                <div className="flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                  <span className="text-xs text-slate-600 dark:text-slate-300 dark:text-slate-300 truncate">{contact.email}</span>
                </div>
              )}
              {contact.company && (
                <div className="flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
                  <span className="text-xs text-slate-600 dark:text-slate-300 dark:text-slate-300 truncate">{contact.company}</span>
                </div>
              )}
            </div>
          </div>

          {/* Labels */}
          {conversation.labels && conversation.labels.length > 0 && (
            <div className="px-4 py-3 border-b border-slate-100 dark:border-white/[0.05]">
              <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Etiquetas</p>
              <div className="flex flex-wrap gap-1">
                {conversation.labels.map(l => <span key={l} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-[#1a2030] text-slate-600 dark:text-slate-300">{l}</span>)}
              </div>
            </div>
          )}

          <div className="px-4 py-3">
            <a href={`/ventas/contactos?contact_id=${contact.id}`}
              className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl border border-slate-200 dark:border-white/[0.08] text-xs font-medium text-slate-600 dark:text-slate-300 dark:text-slate-300 hover:border-violet-300 hover:text-violet-600 transition-colors">
              Ver ficha completa
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function BandejaClient({ orgId, userRole, chatwootEnabled, inboxConfigured, chatwootBaseUrl }: Props) {
  const searchParams                            = useSearchParams()
  const [conversations, setConversations]       = useState<Conversation[]>([])
  const [selected, setSelected]                 = useState<Conversation | null>(null)
  const [messages, setMessages]                 = useState<Message[]>([])
  const [loading, setLoading]                   = useState(true)
  const [msgLoading, setMsgLoading]             = useState(false)
  const [sending, setSending]                   = useState(false)
  const [text, setText]                         = useState('')
  const [filter, setFilter]                     = useState<'open' | 'resolved' | 'pending'>('open')
  const [search, setSearch]                     = useState(() => searchParams.get('q') ?? '')
  const [page, setPage]                         = useState(1)
  const [hasMore, setHasMore]                   = useState(false)
  const [totalCount, setTotalCount]             = useState(0)
  const [error, setError]                       = useState<string | null>(null)
  const [showContactPanel, setShowContactPanel] = useState(true)
  const messagesEndRef                          = useRef<HTMLDivElement>(null)
  const messagesContainerRef                    = useRef<HTMLDivElement>(null)
  const isInitialMsgLoad                        = useRef(true)
  const prevMsgIdsRef                           = useRef<Set<number>>(new Set())
  const prevConvUnreadRef                       = useRef<Map<number, number>>(new Map())
  const isAdmin = ['owner', 'admin'].includes(userRole)

  const scrollToBottom = useCallback((force = false) => {
    const c = messagesContainerRef.current; if (!c) return
    const distFromBottom = c.scrollHeight - c.scrollTop - c.clientHeight
    if (force || distFromBottom < 120) setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: force ? 'auto' : 'smooth' }), 80)
  }, [])

  // ── Fetch conversations ────────────────────────────────────────────────────
  const fetchConversations = useCallback(async (p = 1, append = false) => {
    try {
      setError(null)
      const qs = new URLSearchParams({ status: filter, page: String(p) })
      if (search) qs.set('search', search)
      const res  = await fetch(`/api/chatwoot/conversations?${qs}`)
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error al cargar'); return }
      const items: Conversation[] = data.data?.payload ?? []
      setTotalCount(data.data?.meta?.all_count ?? 0)
      setHasMore(items.length === 25)
      if (append) {
        setConversations(prev => { const ids = new Set(prev.map(c => c.id)); return [...prev, ...items.filter(c => !ids.has(c.id))] })
      } else {
        setConversations(items)
      }
    } catch (e) { setError(String(e)) }
    finally { setLoading(false) }
  }, [filter, search])

  // Silent poll for conversations list (detects new unread counts)
  const pollConversationsSilent = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ status: filter, page: '1' })
      if (search) qs.set('search', search)
      const res  = await fetch(`/api/chatwoot/conversations?${qs}`)
      const data = await res.json()
      if (!res.ok) return
      const items: Conversation[] = data.data?.payload ?? []
      // Detect new unread messages in the list
      // isFirstPoll: true when the map is empty (no previous data to compare)
      const isFirstPoll = prevConvUnreadRef.current.size === 0
      let hasNew = false
      items.forEach(conv => {
        const prev = prevConvUnreadRef.current.get(conv.id)
        if (!isFirstPoll && prev !== undefined && conv.unread_count > prev) hasNew = true
        prevConvUnreadRef.current.set(conv.id, conv.unread_count)
      })
      // Play sound only if user is NOT already viewing that conversation
      if (hasNew && (!selected || !items.some(c => c.id === selected.id && c.unread_count > 0))) {
        playNotificationSound()
      }
      setConversations(items)
      setTotalCount(data.data?.meta?.all_count ?? 0)
      setHasMore(items.length === 25)
    } catch { /* silent */ }
  }, [filter, search, selected])

  // ── Fetch messages (initial) ───────────────────────────────────────────────
  const fetchMessages = useCallback(async (convId: number) => {
    setMsgLoading(true)
    try {
      const res  = await fetch(`/api/chatwoot/conversations/${convId}/messages`)
      const data = await res.json()
      if (!res.ok) return
      const msgs = (data.payload ?? [] as Message[]).sort((a: Message, b: Message) => a.created_at - b.created_at)
      prevMsgIdsRef.current = new Set(msgs.map((m: Message) => m.id))
      setMessages(msgs)
      if (isInitialMsgLoad.current) { isInitialMsgLoad.current = false; scrollToBottom(true) }
    } finally { setMsgLoading(false) }
  }, [scrollToBottom])

  // Silent poll for messages (detects new incoming)
  const pollMessagesSilent = useCallback(async (convId: number) => {
    try {
      const res  = await fetch(`/api/chatwoot/conversations/${convId}/messages`)
      const data = await res.json()
      if (!res.ok) return
      const msgs = (data.payload ?? [] as Message[]).sort((a: Message, b: Message) => a.created_at - b.created_at)
      const prevIds = prevMsgIdsRef.current
      if (prevIds.size > 0) {
        const newIncoming = msgs.filter((m: Message) => m.message_type === 0 && !prevIds.has(m.id))
        if (newIncoming.length > 0) { playNotificationSound(); scrollToBottom(true) }
        else scrollToBottom(false)
      }
      prevMsgIdsRef.current = new Set(msgs.map((m: Message) => m.id))
      setMessages(msgs)
    } catch { /* silent */ }
  }, [scrollToBottom])

  // ── Send ───────────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    if (!text.trim() || !selected || sending) return
    const content = text.trim(); setText(''); setSending(true)
    try {
      const res  = await fetch(`/api/chatwoot/conversations/${selected.id}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, message_type: 'outgoing', private: false }),
      })
      const data = await res.json()
      if (res.ok && data.id) {
        setMessages(prev => { const updated = [...prev, data]; prevMsgIdsRef.current.add(data.id); return updated })
        scrollToBottom(true)
      }
    } finally { setSending(false) }
  }, [text, selected, sending, scrollToBottom])

  // ── Agent AI label toggle ─────────────────────────────────────────────────
  const toggleAgentLabel = useCallback(async (conv: Conversation) => {
    const botPaused   = conv.labels?.includes(BOT_DISABLED_LABEL) ?? false
    const otherLabels = (conv.labels ?? []).filter(l => l !== BOT_DISABLED_LABEL)
    const newLabels   = botPaused ? otherLabels : [...otherLabels, BOT_DISABLED_LABEL]
    const res = await fetch(`/api/chatwoot/conversations/${conv.id}/labels`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ labels: newLabels }),
    })
    if (res.ok) {
      const json     = await res.json().catch(() => ({}))
      const updated  = json.payload ?? newLabels
      setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, labels: updated } : c))
      setSelected(prev => prev && prev.id === conv.id ? { ...prev, labels: updated } : prev)
    }
  }, [])

  // ── Status update (resolve / reopen) ──────────────────────────────────────
  const updateStatus = useCallback(async (convId: number, status: string) => {
    const res = await fetch(`/api/chatwoot/conversations/${convId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
    })
    if (res.ok) {
      setConversations(prev => prev.map(c => c.id === convId ? { ...c, status: status as Conversation['status'] } : c))
      if (selected?.id === convId) setSelected(prev => prev ? { ...prev, status: status as Conversation['status'] } : prev)
    }
  }, [selected])

  // ── Effects ────────────────────────────────────────────────────────────────

  // Unlock AudioContext on first user interaction so notification sound works
  // even when no conversation is open at the time the sound needs to play.
  useEffect(() => {
    document.addEventListener('click',   unlockAudio)
    document.addEventListener('keydown', unlockAudio)
    return () => {
      document.removeEventListener('click',   unlockAudio)
      document.removeEventListener('keydown', unlockAudio)
    }
  }, [])

  // Load conversations on filter/search change
  useEffect(() => {
    if (!chatwootEnabled || !inboxConfigured) return
    setPage(1); setSelected(null)
    setLoading(true)
    fetchConversations(1, false)
  }, [filter, fetchConversations, chatwootEnabled, inboxConfigured])

  // Load messages when conversation selected
  useEffect(() => {
    if (!selected || !chatwootEnabled || !inboxConfigured) return
    isInitialMsgLoad.current = true
    prevMsgIdsRef.current = new Set()
    fetchMessages(selected.id)
  }, [selected?.id, fetchMessages, chatwootEnabled, inboxConfigured])

  // ── POLLING: messages (every 5 s when conversation open) ──────────────────
  useEffect(() => {
    if (!selected || !chatwootEnabled || !inboxConfigured) return
    const interval = setInterval(() => pollMessagesSilent(selected.id), 5000)
    return () => clearInterval(interval)
  }, [selected?.id, pollMessagesSilent, chatwootEnabled, inboxConfigured])

  // ── POLLING: conversations list (every 10 s) ───────────────────────────────
  useEffect(() => {
    if (!chatwootEnabled || !inboxConfigured) return
    const interval = setInterval(pollConversationsSilent, 10000)
    return () => clearInterval(interval)
  }, [pollConversationsSilent, chatwootEnabled, inboxConfigured])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  // ── Guards ─────────────────────────────────────────────────────────────────
  if (!chatwootEnabled) return (
    <div className="px-4 py-4"><div className="rounded-3xl bg-white dark:bg-[#1e2535] flex flex-col items-center justify-center" style={{ ...CARD_S, minHeight: 480 }}><NotConfigured isAdmin={isAdmin} /></div></div>
  )
  if (!inboxConfigured) return (
    <div className="px-4 py-4"><div className="rounded-3xl bg-white dark:bg-[#1e2535] flex flex-col items-center justify-center" style={{ ...CARD_S, minHeight: 480 }}><InboxNotAssigned isAdmin={isAdmin} /></div></div>
  )

  // ── Layout ─────────────────────────────────────────────────────────────────
  // h-[calc(100vh-5rem)] = viewport minus the fixed topbar (pt-20 = 5rem on <main>)
  return (
    <div className="px-4 pb-4 h-[calc(100vh-5rem)] flex flex-col gap-3 overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between shrink-0 pt-2">
        <div>
          <h1 className="text-base font-semibold text-slate-800 dark:text-slate-100">Bandeja de entrada</h1>
          <p className="text-slate-400 text-xs mt-0.5">
            {totalCount} conversación{totalCount !== 1 ? 'es' : ''} · {filter === 'open' ? 'Abiertas' : filter === 'resolved' ? 'Resueltas' : 'Pendientes'}
          </p>
        </div>
        <div className="flex gap-1 p-1 bg-slate-100 dark:bg-[#1a2030] rounded-xl">
          {(['open', 'pending', 'resolved'] as const).map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filter === s ? 'bg-white dark:bg-[#1e2535] text-slate-900 dark:text-slate-50 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-slate-200'}`}>
              {s === 'open' ? 'Abiertas' : s === 'pending' ? 'Pendientes' : 'Resueltas'}
            </button>
          ))}
        </div>
      </div>

      {/* Main grid */}
      <div className="flex gap-3 flex-1 min-h-0">

        {/* ── Conversation list ───────────────────────────────────────────── */}
        <div className="w-72 shrink-0 rounded-2xl bg-white dark:bg-[#1e2535] flex flex-col overflow-hidden" style={CARD_S}>
          <div className="p-3 border-b border-slate-100 dark:border-white/[0.05] shrink-0">
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-[#1a2030] dark:bg-[#0d1117] rounded-xl px-3 py-2">
              <svg className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              <input type="text" placeholder="Buscar…" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchConversations(1)} className="flex-1 bg-transparent text-xs text-slate-700 dark:text-slate-200 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 outline-none" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-50 min-h-0">
            {loading && conversations.length === 0 ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="p-3 flex gap-3 items-start animate-pulse">
                  <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-[#1a2030] shrink-0" />
                  <div className="flex-1 space-y-2"><div className="h-3 bg-slate-100 dark:bg-[#1a2030] rounded w-3/4" /><div className="h-2.5 bg-slate-100 dark:bg-[#1a2030] rounded" /></div>
                </div>
              ))
            ) : error && conversations.length === 0 ? (
              <div className="p-4 text-center"><p className="text-red-500 text-xs">{error}</p><button onClick={() => fetchConversations(1)} className="mt-2 text-xs text-blue-600 hover:underline">Reintentar</button></div>
            ) : conversations.length === 0 ? (
              <div className="p-8 text-center"><p className="text-slate-400 text-sm">Sin conversaciones {filter === 'open' ? 'abiertas' : filter}</p></div>
            ) : (
              <>
                {conversations.map(conv => (
                  <button key={conv.id} onClick={() => { isInitialMsgLoad.current = true; setSelected(conv) }}
                    className={`w-full p-3 flex gap-3 items-start text-left transition-colors hover:bg-slate-50 dark:bg-[#1a2030] ${selected?.id === conv.id ? 'bg-violet-50 border-l-2 border-violet-500' : ''}`}>
                    <div className="relative shrink-0">
                      <Avatar name={conv.meta?.sender?.name ?? '?'} url={conv.meta?.sender?.thumbnail ?? conv.meta?.sender?.avatar_url} size={9} />
                      {conv.unread_count > 0 && <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-violet-500 rounded-full text-white text-[9px] font-bold flex items-center justify-center">{conv.unread_count > 9 ? '9+' : conv.unread_count}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className={`text-xs truncate ${conv.unread_count > 0 ? 'font-semibold text-slate-900 dark:text-slate-50' : 'font-medium text-slate-700 dark:text-slate-200'}`}>{conv.meta?.sender?.name ?? 'Sin nombre'}</span>
                        <div className="flex items-center gap-1 shrink-0"><ChannelIcon channel={conv.meta?.channel ?? ''} /><span className="text-[10px] text-slate-400">{timeAgo(conv.last_activity_at)}</span></div>
                      </div>
                      <p className={`text-[11px] truncate ${conv.unread_count > 0 ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400'}`}>
                        {conv.last_non_activity_message?.message_type === 1 && <span className="text-slate-400">Tú: </span>}
                        {conv.last_non_activity_message?.content ?? 'Sin mensajes'}
                      </p>
                      <div className="flex items-center gap-1 mt-1"><StatusBadge status={conv.status} /><span className="text-[10px] text-slate-400">#{conv.id}</span></div>
                    </div>
                  </button>
                ))}
                {hasMore && <button onClick={() => { const p = page + 1; setPage(p); fetchConversations(p, true) }} className="w-full py-3 text-xs text-violet-600 hover:text-violet-700 font-medium">Cargar más</button>}
              </>
            )}
          </div>
        </div>

        {/* ── Conversation detail ─────────────────────────────────────────── */}
        {selected ? (
          <div className="flex-1 rounded-2xl bg-white dark:bg-[#1e2535] flex overflow-hidden min-w-0" style={CARD_S}>

            {/* Messages column */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

              {/* Header */}
              <div className="px-4 py-2.5 border-b border-slate-100 dark:border-white/[0.05] flex items-center gap-3 shrink-0">
                <Avatar name={selected.meta?.sender?.name ?? '?'} url={selected.meta?.sender?.thumbnail ?? selected.meta?.sender?.avatar_url} size={8} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 dark:text-slate-50 dark:text-white text-sm truncate">{selected.meta?.sender?.name ?? 'Sin nombre'}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <ChannelIcon channel={selected.meta?.channel ?? ''} />
                    <span className="text-[11px] text-slate-400">#{selected.id}</span>
                    <StatusBadge status={selected.status} />
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-1.5 shrink-0">

                  {/* Agente IA toggle (label-based) */}
                  {(() => {
                    const botPaused = selected.labels?.includes(BOT_DISABLED_LABEL) ?? false
                    return (
                      <button
                        onClick={() => toggleAgentLabel(selected)}
                        title={botPaused ? 'Agente IA pausado — clic para activar' : 'Agente IA activo — clic para pausar'}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          botPaused
                            ? 'bg-slate-100 dark:bg-[#1a2030] text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:bg-[#2a3448]'
                            : 'bg-violet-100 text-violet-700 hover:bg-violet-200'
                        }`}
                      >
                        {botPaused ? (
                          <><span className="w-1.5 h-1.5 rounded-full bg-slate-300" />Agente IA pausado</>
                        ) : (
                          <><span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />Agente IA activo</>
                        )}
                      </button>
                    )
                  })()}

                  {/* Resolve / Reopen */}
                  {selected.status === 'open' || selected.status === 'pending' ? (
                    <button onClick={() => updateStatus(selected.id, 'resolved')}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-xs font-medium hover:bg-emerald-100 transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
                      Resolver
                    </button>
                  ) : (
                    <button onClick={() => updateStatus(selected.id, 'open')}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-[#1a2030] text-slate-600 dark:text-slate-300 dark:text-slate-300 text-xs font-medium hover:bg-slate-200 dark:bg-[#2a3448] transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                      Reabrir
                    </button>
                  )}

                  {/* Contact panel toggle */}
                  <button onClick={() => setShowContactPanel(v => !v)}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${showContactPanel ? 'bg-violet-100 text-violet-600' : 'bg-slate-100 dark:bg-[#1a2030] text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:text-slate-300'}`}>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
                {msgLoading ? (
                  <div className="flex items-center justify-center h-full"><div className="w-6 h-6 border-2 border-violet-300 border-t-violet-600 rounded-full animate-spin" /></div>
                ) : messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-slate-400 dark:text-slate-500 text-sm">Sin mensajes aún</div>
                ) : (
                  messages.map(msg => {
                    const isOut  = msg.message_type === 1
                    const isAct  = msg.message_type === 2 || msg.message_type === 3
                    if (isAct) return <div key={msg.id} className="flex justify-center"><span className="text-[10px] text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-[#1a2030] dark:bg-[#0d1117] px-3 py-1 rounded-full">{msg.content}</span></div>
                    return (
                      <div key={msg.id} className={`flex gap-2 ${isOut ? 'justify-end' : 'justify-start'}`}>
                        {!isOut && <Avatar name={selected.meta?.sender?.name ?? '?'} url={selected.meta?.sender?.thumbnail ?? selected.meta?.sender?.avatar_url} size={7} />}
                        <div className={`max-w-[70%] flex flex-col gap-1 ${isOut ? 'items-end' : 'items-start'}`}>
                          <div className={`px-3 py-2 rounded-2xl text-sm leading-relaxed ${isOut ? 'bg-violet-600 text-white rounded-br-sm' : 'bg-slate-100 dark:bg-[#1a2030] text-slate-800 dark:text-slate-100 dark:text-slate-100 rounded-bl-sm'}`}>{msg.content}</div>
                          {msg.attachments?.map((att, i) => att.file_type === 'image'
                            ? <img key={i} src={att.data_url} alt={att.file_name ?? 'img'} className="max-w-[200px] rounded-xl" />
                            : <a key={i} href={att.data_url} target="_blank" rel="noreferrer" className="text-xs text-violet-600 underline">{att.file_name ?? 'Archivo'}</a>
                          )}
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 px-1">{formatTime(msg.created_at)}</span>
                        </div>
                      </div>
                    )
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply input */}
              <div className="px-4 py-3 border-t border-slate-100 dark:border-white/[0.05] shrink-0">
                {selected.status === 'resolved' ? (
                  <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-[#1a2030] dark:bg-[#0d1117] rounded-xl">
                    <svg className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
                    <span className="text-sm text-slate-500">Conversación resuelta.</span>
                    <button onClick={() => updateStatus(selected.id, 'open')} className="ml-auto text-xs text-violet-600 font-medium hover:underline">Reabrir</button>
                  </div>
                ) : (
                  <div className="flex gap-3 items-end">
                    <textarea value={text} onChange={e => setText(e.target.value)} onKeyDown={handleKeyDown}
                      placeholder="Escribe un mensaje… (Enter para enviar)"
                      rows={2}
                      className="flex-1 resize-none bg-slate-50 dark:bg-[#1a2030] dark:bg-[#0d1117] rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 outline-none focus:ring-2 focus:ring-violet-200 transition-all"
                    />
                    <button onClick={sendMessage} disabled={!text.trim() || sending}
                      className="w-10 h-10 rounded-xl bg-violet-600 text-white flex items-center justify-center hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0">
                      {sending
                        ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
                      }
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Contact panel */}
            {showContactPanel && (
              <ContactPanel conversation={selected} onContactUpdated={() => {}} />
            )}
          </div>

        ) : (
          <div className="flex-1 rounded-2xl bg-white dark:bg-[#1e2535] flex flex-col items-center justify-center gap-3" style={CARD_S}>
            <div className="w-16 h-16 rounded-2xl bg-slate-50 dark:bg-[#1a2030] dark:bg-[#0d1117] flex items-center justify-center">
              <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/>
              </svg>
            </div>
            <div className="text-center">
              <p className="text-slate-500 text-sm font-medium">Selecciona una conversación</p>
              <p className="text-slate-400 text-xs mt-0.5">Elige una de la lista para ver los mensajes</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
