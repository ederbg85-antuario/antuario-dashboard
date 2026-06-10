'use client'

import { useMemo, useState } from 'react'

// ── Tipos ─────────────────────────────────────────────────────────────────────
type Formulario = {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
  whatsapp: string | null
  company: string | null
  contact_type: string | null
  source: string | null
  notes: string | null
  created_at: string
  assigned_to: string | null
}
type Profile = { id: string; full_name: string | null; email: string | null }

type Props = {
  formularios: Formulario[]
  profiles: Profile[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getInitials(name: string | null): string {
  if (!name) return '?'
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?'
}

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500',
  'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-fuchsia-500',
]
function avatarColor(name: string | null): string {
  const s = name ?? '?'
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

// Las notas del formulario web tienen el formato:
//   "Servicio de interés: X\n\nMensaje:\n...\n\nEnviado desde: URL"
function parseNotes(notes: string | null): { servicio: string | null; mensaje: string | null; url: string | null } {
  if (!notes) return { servicio: null, mensaje: null, url: null }
  const servicio = notes.match(/Servicio de interés:\s*(.+)/)?.[1]?.trim() ?? null
  const url = notes.match(/Enviado desde:\s*(\S+)/)?.[1]?.trim() ?? null
  let mensaje: string | null = null
  const m = notes.match(/Mensaje:\s*\n([\s\S]*?)(?:\n\nEnviado desde:|$)/)
  if (m) mensaje = m[1].trim() || null
  return { servicio, mensaje, url }
}

// ── Componente ─────────────────────────────────────────────────────────────────
export default function FormulariosClient({ formularios, profiles }: Props) {
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  const profileById = useMemo(() => {
    const map = new Map<string, Profile>()
    profiles.forEach(p => map.set(p.id, p))
    return map
  }, [profiles])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return formularios
    return formularios.filter(f =>
      [f.full_name, f.email, f.phone, f.company, f.notes]
        .some(v => (v ?? '').toLowerCase().includes(q))
    )
  }, [formularios, query])

  const nuevos = formularios.filter(f => f.contact_type === 'lead_nuevo').length

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* ── Encabezado ──────────────────────────────────────────── */}
      <div className="mb-5 md:mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-lg md:text-2xl font-bold text-slate-800 dark:text-slate-100">Formularios web</h1>
          <span className="text-[11px] md:text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/[0.08] text-slate-500 dark:text-slate-400 tabular-nums">
            {formularios.length}
          </span>
        </div>
        <p className="text-xs md:text-sm text-slate-400 dark:text-slate-500 mt-1">
          Mensajes enviados desde el formulario de{' '}
          <a href="https://www.antuario.mx/contacto" target="_blank" rel="noopener noreferrer" className="underline decoration-dotted hover:text-slate-600 dark:hover:text-slate-300">
            antuario.mx/contacto
          </a>
          {nuevos > 0 && <> · <span className="text-emerald-600 dark:text-emerald-400 font-medium">{nuevos} sin atender</span></>}
        </p>
      </div>

      {/* ── Buscador ────────────────────────────────────────────── */}
      {formularios.length > 0 && (
        <div className="relative mb-4">
          <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar por nombre, correo, empresa…"
            className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1a2030] text-slate-800 dark:text-slate-100 placeholder:text-slate-400 outline-none focus:border-slate-400 dark:focus:border-white/20"
          />
        </div>
      )}

      {/* ── Lista ───────────────────────────────────────────────── */}
      {formularios.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 md:py-24 text-center px-4 rounded-2xl border border-dashed border-slate-200 dark:border-white/[0.08]">
          <svg className="w-10 h-10 mb-3 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Aún no hay formularios</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-xs">
            Cuando alguien envíe el formulario de contacto de la web, aparecerá aquí automáticamente.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-slate-400 dark:text-slate-500">
          Sin resultados para “{query}”.
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map(f => {
            const { servicio, mensaje, url } = parseNotes(f.notes)
            const isOpen = openId === f.id
            const isNuevo = f.contact_type === 'lead_nuevo'
            const responsable = f.assigned_to ? profileById.get(f.assigned_to) : null
            const tel = f.whatsapp || f.phone

            return (
              <div
                key={f.id}
                className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e2535] overflow-hidden"
              >
                <button
                  onClick={() => setOpenId(isOpen ? null : f.id)}
                  className="w-full text-left px-3.5 md:px-5 py-3.5 md:py-4 flex items-start gap-3 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors"
                >
                  <div className={`w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-white text-xs font-bold ${avatarColor(f.full_name)}`}>
                    {getInitials(f.full_name)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                        {f.full_name ?? f.email ?? '—'}
                      </p>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isNuevo && (
                          <span className="text-[9px] md:text-[10px] bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-full px-1.5 md:px-2 py-0.5 font-bold tracking-wide whitespace-nowrap">
                            NUEVO
                          </span>
                        )}
                        <span className="text-[10px] md:text-xs text-slate-400 dark:text-slate-500 tabular-nums whitespace-nowrap">
                          {daysSince(f.created_at) === 0 ? 'Hoy' : `${daysSince(f.created_at)}d`}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] md:text-xs text-slate-400 dark:text-slate-500">
                      {servicio && (
                        <span className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-slate-400 truncate max-w-[55%]">
                          {servicio}
                        </span>
                      )}
                      <span className="truncate">{f.company || f.email || tel || ''}</span>
                    </div>
                  </div>
                </button>

                {/* ── Detalle expandible ──────────────────────────── */}
                {isOpen && (
                  <div className="px-3.5 md:px-5 pb-4 pt-1 border-t border-slate-100 dark:border-white/[0.06] space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 pt-3">
                      <Field label="Nombre" value={f.full_name} />
                      <Field label="Servicio de interés" value={servicio} />
                      <Field label="Correo" value={f.email} href={f.email ? `mailto:${f.email}` : undefined} />
                      <Field label="Teléfono / WhatsApp" value={tel} href={tel ? `https://wa.me/52${(tel).replace(/\D/g, '').slice(-10)}` : undefined} />
                      <Field label="Empresa" value={f.company} />
                      <Field label="Recibido" value={formatDate(f.created_at)} />
                      {responsable && <Field label="Asignado a" value={responsable.full_name ?? responsable.email} />}
                      {url && <Field label="Página de origen" value={url} href={url} />}
                    </div>

                    {mensaje && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Mensaje</p>
                        <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap bg-slate-50 dark:bg-white/[0.04] rounded-xl px-3 py-2.5">
                          {mensaje}
                        </p>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2 pt-1">
                      {f.email && (
                        <a href={`mailto:${f.email}`} className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-800 dark:bg-white/10 text-white hover:opacity-90 transition-opacity">
                          Responder por correo
                        </a>
                      )}
                      {tel && (
                        <a href={`https://wa.me/52${tel.replace(/\D/g, '').slice(-10)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:opacity-90 transition-opacity">
                          WhatsApp
                        </a>
                      )}
                      <a href="/ventas/contactos" className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/[0.12] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.05] transition-colors">
                        Ver en Contactos
                      </a>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Campo de detalle ───────────────────────────────────────────────────────────
function Field({ label, value, href }: { label: string; value: string | null; href?: string }) {
  if (!value) return null
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</p>
      {href ? (
        <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" className="text-sm text-blue-600 dark:text-blue-400 hover:underline break-words">
          {value}
        </a>
      ) : (
        <p className="text-sm text-slate-700 dark:text-slate-200 break-words">{value}</p>
      )}
    </div>
  )
}
