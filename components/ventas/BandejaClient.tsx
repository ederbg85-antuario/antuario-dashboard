'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { CARD_S } from '@/components/ui/dashboard'

// ── Types ──────────────────────────────────────────────────────────────────────
type Contact = {
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
  message_type: number  // 0=incoming, 1=outgoing, 2=activity, 3=template
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
  meta: {
    sender: Contact
    channel: string
  }
  inbox_id: number
  labels?: string[]
  last_non_activity_message?: {
    content: string
    message_type: number
    created_at: number
  }
}

type Props = {
  orgId: number
  userRole: string
  isConfigured: boolean
  chatwootBaseUrl: string | null
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function timeAgo(ts: number): string {
  const diff = Date.now() / 1000 - ts
  if (diff < 60)   return 'ahora'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

function formatTime(ts: number): string {
  const d = new Date(ts * 1000)
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

function Avatar({ name, url, size = 8 }: { name: string; url?: string | null; size?: number }) {
  const [err, setErr] = useState(false)
  const initials = name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
  const colors   = ['bg-violet-500', 'bg-blue-500', 'bg-rose-500', 'bg-amber-500', 'bg-emerald-500', 'bg-cyan-500']
  const color    = colors[name.charCodeAt(0) % colors.length]

  if (url && !err) {
    return (
      <img
        src={url}
        alt={name}
        onError={() => setErr(true)}
        className={`w-${size} h-${size} rounded-full object-cover shrink-0`}
      />
    )
  }
  return (
    <span className={`w-${size} h-${size} rounded-full ${color} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
      {initials}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    open:     { label: 'Abierta',   cls: 'bg-emerald-100 text-emerald-700' },
    resolved: { label: 'Resuelta',  cls: 'bg-slate-100 text-slate-500' },
    pending:  { label: 'Pendiente', cls: 'bg-amber-100 text-amber-700' },
    snoozed:  { label: 'Pospuesta', cls: 'bg-violet-100 text-violet-700' },
  }
  const { label, cls } = map[status] ?? { label: status, cls: 'bg-slate-100 text-slate-500' }
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${cls}`}>{label}</span>
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

// ── Not configured state ───────────────────────────────────────────────────────
function NotConfigured({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
      <div className="w-16 h-16 rounded-2xl bg-violet-50 flex items-center justify-center">
        <svg className="w-8 h-8 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/>
        </svg>
      </div>
      <div className="text-center">
        <p className="text-slate-800 font-semibold text-base">Bandeja de entrada no configurada</p>
        <p className="text-slate-500 text-sm mt-1 max-w-xs">
          {isAdmin
            ? 'Conecta tu instancia de Chatwoot para ver las conversaciones de tu equipo aquí.'
            : 'Un administrador necesita conectar Chatwoot en Configuración → Integraciones.'}
        </p>
      </div>
      {isAdmin && (
        <a
          href="/configuracion/integraciones"
          className="px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors"
        >
          Configurar Chatwoot →
        </a>
      )}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function BandejaClient({ orgId, userRole, isConfigured, chatwootBaseUrl }: Props) {
  const [conversations, setConversations]   = useState<Conversation[]>([])
  const [selected, setSelected]             = useState<Conversation | null>(null)
  const [messages, setMessages]             = useState<Message[]>([])
  const [loading, setLoading]               = useState(true)
  const [msgLoading, setMsgLoading]         = useState(false)
  const [sending, setSending]               = useState(false)
  const [text, setText]                     = useState('')
  const [filter, setFilter]                 = useState<'open' | 'resolved' | 'pending'>('open')
  const [search, setSearch]                 = useState('')
  const [page, setPage]                     = useState(1)
  const [hasMore, setHasMore]               = useState(false)
  const [totalCount, setTotalCount]         = useState(0)
  const [error, setError]                   = useState<string | null>(null)
  const messagesEndRef                      = useRef<HTMLDivElement>(null)
  const pollRef                             = useRef<ReturnType<typeof setInterval> | null>(null)
  const isAdmin = ['owner', 'admin'].includes(userRole)

  // ── Fetch conversations ────────────────────────────────────────────────────
  const fetchConversations = useCallback(async (p = 1, append = false) => {
    try {
      setLoading(!append)
      setError(null)
      const qs = new URLSearchParams({ status: filter, page: String(p) })
      if (search) qs.set('search', search)
      const res  = await fetch(`/api/chatwoot/conversations?${qs}`)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Error al cargar conversaciones')
        return
      }
      const items: Conversation[] = data.data?.payload ?? []
      setTotalCount(data.data?.meta?.all_count ?? 0)
      setHasMore(items.length === 25)
      if (append) {
        setConversations(prev => {
          const ids = new Set(prev.map(c => c.id))
          return [...prev, ...items.filter(c => !ids.has(c.id))]
        })
      } else {
        setConversations(items)
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [filter, search])

  // ── Fetch messages ─────────────────────────────────────────────────────────
  const fetchMessages = useCallback(async (convId: number) => {
    setMsgLoading(true)
    try {
      const res  = await fetch(`/api/chatwoot/conversations/${convId}/messages`)
      const data = await res.json()
      if (!res.ok) return
      const msgs: Message[] = data.payload ?? []
      setMessages(msgs.sort((a, b) => a.created_at - b.created_at))
    } finally {
      setMsgLoading(false)
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
    }
  }, [])

  // ── Send message ───────────────────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    if (!text.trim() || !selected || sending) return
    const content = text.trim()
    setText('')
    setSending(true)
    try {
      const res = await fetch(`/api/chatwoot/conversations/${selected.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, message_type: 'outgoing', private: false }),
      })
      const data = await res.json()
      if (res.ok && data.id) {
        setMessages(prev => [...prev, data])
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
      }
    } finally {
      setSending(false)
    }
  }, [text, selected, sending])

  // ── Update conversation status ─────────────────────────────────────────────
  const updateStatus = useCallback(async (convId: number, status: string) => {
    const res = await fetch(`/api/chatwoot/conversations/${convId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (res.ok) {
      setConversations(prev => prev.map(c => c.id === convId ? { ...c, status: status as 'open' | 'resolved' | 'pending' } : c))
      if (selected?.id === convId) setSelected(prev => prev ? { ...prev, status: status as 'open' | 'resolved' | 'pending' } : prev)
    }
  }, [selected])

  // ── Effects ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isConfigured) return
    setPage(1)
    setSelected(null)
    fetchConversations(1, false)
  }, [filter, fetchConversations, isConfigured])

  useEffect(() => {
    if (!selected || !isConfigured) return
    fetchMessages(selected.id)
  }, [selected, fetchMessages, isConfigured])

  // Polling para nuevos mensajes
  useEffect(() => {
    if (!selected || !isConfigured) return
    pollRef.current = setInterval(() => fetchMessages(selected.id), 8000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [selected, fetchMessages, isConfigured])

  // ── Keyboard: Enter para enviar ────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  if (!isConfigured) {
    return (
      <div className="px-4 py-4">
        <div className="rounded-3xl bg-white flex flex-col items-center justify-center" style={{ ...CARD_S, minHeight: 480 }}>
          <NotConfigured isAdmin={isAdmin} />
        </div>
      </div>
    )
  }

  // ── Layout principal ───────────────────────────────────────────────────────
  return (
    <div className="px-4 py-4 h-[calc(100vh-2rem)] flex flex-col gap-4">

      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Bandeja de entrada</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {totalCount} conversación{totalCount !== 1 ? 'es' : ''} · {filter === 'open' ? 'Abiertas' : filter === 'resolved' ? 'Resueltas' : 'Pendientes'}
          </p>
        </div>
        {/* Filtros de estado */}
        <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
          {(['open', 'pending', 'resolved'] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filter === s
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {s === 'open' ? 'Abiertas' : s === 'pending' ? 'Pendientes' : 'Resueltas'}
            </button>
          ))}
        </div>
      </div>

      {/* Contenido principal: lista + detalle */}
      <div className="flex gap-4 flex-1 min-h-0">

        {/* ── Lista de conversaciones ──────────────────────────────────────── */}
        <div
          className="w-80 shrink-0 rounded-2xl bg-white flex flex-col overflow-hidden"
          style={CARD_S}
        >
          {/* Search */}
          <div className="p-3 border-b border-slate-100">
            <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2">
              <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
              <input
                type="text"
                placeholder="Buscar conversación..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && fetchConversations(1)}
                className="flex-1 bg-transparent text-xs text-slate-700 placeholder-slate-400 outline-none"
              />
            </div>
          </div>

          {/* Lista */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="p-3 flex gap-3 items-start animate-pulse">
                  <div className="w-9 h-9 rounded-full bg-slate-100 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-slate-100 rounded w-3/4" />
                    <div className="h-2.5 bg-slate-100 rounded w-full" />
                  </div>
                </div>
              ))
            ) : error ? (
              <div className="p-4 text-center">
                <p className="text-red-500 text-xs">{error}</p>
                <button onClick={() => fetchConversations(1)} className="mt-2 text-xs text-blue-600 hover:underline">Reintentar</button>
              </div>
            ) : conversations.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-slate-400 text-sm">Sin conversaciones {filter === 'open' ? 'abiertas' : filter}</p>
              </div>
            ) : (
              <>
                {conversations.map(conv => (
                  <button
                    key={conv.id}
                    onClick={() => setSelected(conv)}
                    className={`w-full p-3 flex gap-3 items-start text-left transition-colors hover:bg-slate-50 ${
                      selected?.id === conv.id ? 'bg-violet-50 border-l-2 border-violet-500' : ''
                    }`}
                  >
                    {/* Avatar */}
                    <div className="relative shrink-0">
                      <Avatar
                        name={conv.meta?.sender?.name ?? '?'}
                        url={conv.meta?.sender?.thumbnail ?? conv.meta?.sender?.avatar_url}
                        size={9}
                      />
                      {conv.unread_count > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-violet-500 rounded-full text-white text-[9px] font-bold flex items-center justify-center">
                          {conv.unread_count > 9 ? '9+' : conv.unread_count}
                        </span>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className={`text-xs truncate ${conv.unread_count > 0 ? 'font-semibold text-slate-900' : 'font-medium text-slate-700'}`}>
                          {conv.meta?.sender?.name ?? 'Sin nombre'}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          <ChannelIcon channel={conv.meta?.channel ?? ''} />
                          <span className="text-[10px] text-slate-400">{timeAgo(conv.last_activity_at)}</span>
                        </div>
                      </div>
                      <p className={`text-[11px] truncate ${conv.unread_count > 0 ? 'text-slate-700' : 'text-slate-400'}`}>
                        {conv.last_non_activity_message?.message_type === 1 && <span className="text-slate-400">Tú: </span>}
                        {conv.last_non_activity_message?.content ?? 'Sin mensajes'}
                      </p>
                      <div className="flex items-center gap-1 mt-1">
                        <StatusBadge status={conv.status} />
                        <span className="text-[10px] text-slate-400">#{conv.id}</span>
                      </div>
                    </div>
                  </button>
                ))}

                {/* Load more */}
                {hasMore && (
                  <button
                    onClick={() => { const p = page + 1; setPage(p); fetchConversations(p, true) }}
                    className="w-full py-3 text-xs text-violet-600 hover:text-violet-700 font-medium"
                  >
                    Cargar más
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Detalle de conversación ──────────────────────────────────────── */}
        {selected ? (
          <div className="flex-1 rounded-2xl bg-white flex flex-col overflow-hidden" style={CARD_S}>

            {/* Header de conversación */}
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3 shrink-0">
              <Avatar
                name={selected.meta?.sender?.name ?? '?'}
                url={selected.meta?.sender?.thumbnail ?? selected.meta?.sender?.avatar_url}
                size={9}
              />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-900 text-sm truncate">
                  {selected.meta?.sender?.name ?? 'Sin nombre'}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <ChannelIcon channel={selected.meta?.channel ?? ''} />
                  <span className="text-[11px] text-slate-400 capitalize">
                    {selected.meta?.channel?.replace('Channel::', '').replace('Api', 'API') ?? 'Canal'}
                  </span>
                  <span className="text-slate-300">·</span>
                  <span className="text-[11px] text-slate-400">Conversación #{selected.id}</span>
                  <StatusBadge status={selected.status} />
                </div>
              </div>

              {/* Acciones */}
              <div className="flex items-center gap-2 shrink-0">
                {selected.status === 'open' ? (
                  <button
                    onClick={() => updateStatus(selected.id, 'resolved')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-medium hover:bg-emerald-100 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
                    </svg>
                    Resolver
                  </button>
                ) : (
                  <button
                    onClick={() => updateStatus(selected.id, 'open')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-medium hover:bg-slate-200 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                    </svg>
                    Reabrir
                  </button>
                )}
              </div>
            </div>

            {/* Mensajes */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {msgLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="w-6 h-6 border-2 border-violet-300 border-t-violet-600 rounded-full animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                  Sin mensajes aún
                </div>
              ) : (
                messages.map(msg => {
                  const isOutgoing = msg.message_type === 1
                  const isActivity = msg.message_type === 2 || msg.message_type === 3

                  if (isActivity) {
                    return (
                      <div key={msg.id} className="flex justify-center">
                        <span className="text-[10px] text-slate-400 bg-slate-50 px-3 py-1 rounded-full">
                          {msg.content}
                        </span>
                      </div>
                    )
                  }

                  return (
                    <div key={msg.id} className={`flex gap-2 ${isOutgoing ? 'justify-end' : 'justify-start'}`}>
                      {!isOutgoing && (
                        <Avatar
                          name={selected.meta?.sender?.name ?? '?'}
                          url={selected.meta?.sender?.thumbnail ?? selected.meta?.sender?.avatar_url}
                          size={7}
                        />
                      )}
                      <div className={`max-w-[70%] ${isOutgoing ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                        <div className={`px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                          isOutgoing
                            ? 'bg-violet-600 text-white rounded-br-sm'
                            : 'bg-slate-100 text-slate-800 rounded-bl-sm'
                        }`}>
                          {msg.content}
                        </div>
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className="flex flex-col gap-1">
                            {msg.attachments.map((att, i) => (
                              att.file_type === 'image' ? (
                                <img key={i} src={att.data_url} alt={att.file_name ?? 'imagen'} className="max-w-[200px] rounded-xl" />
                              ) : (
                                <a key={i} href={att.data_url} target="_blank" rel="noreferrer"
                                   className="text-xs text-violet-600 underline">
                                  {att.file_name ?? 'Archivo adjunto'}
                                </a>
                              )
                            ))}
                          </div>
                        )}
                        <span className="text-[10px] text-slate-400 px-1">{formatTime(msg.created_at)}</span>
                      </div>
                    </div>
                  )
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input de respuesta */}
            <div className="px-4 py-3 border-t border-slate-100 shrink-0">
              {selected.status === 'resolved' ? (
                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                  <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
                  </svg>
                  <span className="text-sm text-slate-500">Conversación resuelta.</span>
                  <button
                    onClick={() => updateStatus(selected.id, 'open')}
                    className="ml-auto text-xs text-violet-600 font-medium hover:underline"
                  >
                    Reabrir para responder
                  </button>
                </div>
              ) : (
                <div className="flex gap-3 items-end">
                  <textarea
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Escribe un mensaje… (Enter para enviar, Shift+Enter para nueva línea)"
                    rows={2}
                    className="flex-1 resize-none bg-slate-50 rounded-xl px-3 py-2 text-sm text-slate-800 placeholder-slate-400 outline-none focus:ring-2 focus:ring-violet-200 transition-all"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!text.trim() || sending}
                    className="w-10 h-10 rounded-xl bg-violet-600 text-white flex items-center justify-center hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0"
                  >
                    {sending ? (
                      <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
                      </svg>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>

        ) : (
          /* Estado vacío: ninguna conversación seleccionada */
          <div
            className="flex-1 rounded-2xl bg-white flex flex-col items-center justify-center gap-3"
            style={CARD_S}
          >
            <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center">
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
