'use client'

import { useState, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'

// ─── Types ────────────────────────────────────────────────────────────────────

type Connection = {
  id: string
  source: string
  status: string
  external_name: string | null
  external_id: string | null
  last_sync_at: string | null
  last_error: string | null
  connected_by: string | null
  created_at: string
  token_expires_at: string | null
}

type SyncJob = {
  id: string
  source: string
  status: string
  date_from: string
  date_to: string
  records_inserted: number
  started_at: string
  completed_at: string | null
  error_message: string | null
}

type Props = {
  orgId: number
  currentUserId: string
  currentUserRole: string
  initialConnections: Connection[]
  syncJobs: SyncJob[]
  mensajeriaActiva: boolean
  chatwootInboxId: number | null
}

// ─── Source definitions ───────────────────────────────────────────────────────

const SOURCES = [
  {
    key: 'ga4',
    label: 'Google Analytics 4',
    description: 'Sesiones, conversiones, páginas, eventos y tráfico de tu sitio web.',
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V5h2v11z" fill="#E37400"/>
      </svg>
    ),
    color: 'border-orange-200 bg-orange-50',
    dashboardHref: '/marketing/web',
    dashboardLabel: 'Ver Web Analytics',
  },
  {
    key: 'search_console',
    label: 'Google Search Console',
    description: 'Clics orgánicos, impresiones, CTR, posición y keywords de búsqueda.',
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
        <circle cx="11" cy="11" r="7" stroke="#1A73E8" strokeWidth="2"/>
        <path d="m16.5 16.5 4 4" stroke="#1A73E8" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
    color: 'border-blue-200 bg-blue-50 dark:bg-blue-900/20',
    dashboardHref: '/marketing/seo',
    dashboardLabel: 'Ver SEO',
  },
  {
    key: 'google_ads',
    label: 'Google Ads',
    description: 'Inversión, conversiones, CPA, CTR y rendimiento por campaña.',
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
        <path d="M3 17.5L8 7l5 8.5 3-5.5 5 8.5H3z" fill="#FBBC04"/>
      </svg>
    ),
    color: 'border-yellow-200 bg-yellow-50 dark:bg-amber-900/20',
    dashboardHref: '/marketing/ads',
    dashboardLabel: 'Ver Google Ads',
  },
  {
    key: 'google_business_profile',
    label: 'Google Business Profile',
    description: 'Visualizaciones, llamadas, solicitudes de dirección y clics al sitio.',
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="#34A853"/>
      </svg>
    ),
    color: 'border-green-200 bg-green-50 dark:bg-emerald-900/20',
    dashboardHref: '/marketing/gmb',
    dashboardLabel: 'Ver Business Profile',
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function getSB() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function IntegracionesClient({
  orgId, currentUserId, currentUserRole,
  initialConnections, syncJobs, mensajeriaActiva, chatwootInboxId: initialInboxId,
}: Props) {
  const [connections, setConnections] = useState<Connection[]>(initialConnections)
  const inboxActivo                   = !!initialInboxId
  const [disconnecting, setDisconnecting] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [syncing, setSyncing]       = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState<string | null>(null)
  const [activeTab, setActiveTab]   = useState<'sources' | 'logs'>('sources')

  // ── Conectar: redirigir al endpoint del servidor ──────────────────────────
  // El servidor construye la URL de Google con los tokens correctos.
  // NUNCA construir la URL OAuth en el cliente — el GOOGLE_CLIENT_SECRET
  // solo debe vivir en el servidor.
  const handleConnect = useCallback((source: string) => {
    window.location.href = `/api/oauth/google/connect?source=${source}`
  }, [])

  // ── Completar configuración de una conexión pending ───────────────────────
  // Las conexiones en estado 'pending' ya tienen tokens OAuth válidos.
  // NO iniciar un nuevo flujo OAuth — ir directo al selector de propiedad
  // con el connection_id existente para que el usuario elija la propiedad.
  const handleCompleteSetup = useCallback((conn: Connection) => {
    window.location.href = `/oauth/seleccionar-propiedad?connection_id=${conn.id}&source=${conn.source}`
  }, [])

  const handleDisconnect = useCallback(async (connection: Connection) => {
    const src = SOURCES.find(s => s.key === connection.source)
    if (!confirm(`¿Desconectar ${src?.label}? Se revocarán los tokens. Los datos históricos se conservan.`)) return

    setDisconnecting(connection.id)
    const client = getSB()
    const { error } = await client
      .from('marketing_connections')
      .update({
        status:        'revoked',
        access_token:  null,
        refresh_token: null,
      })
      .eq('id', connection.id)

    if (!error) {
      setConnections(p => p.map(c =>
        c.id === connection.id ? { ...c, status: 'revoked' } : c
      ))
    }
    setDisconnecting(null)
  }, [])

  // ── Eliminar conexión en error sin tokens ─────────────────────────────────
  // Limpia conexiones fantasma (error, sin tokens) que bloquean la UI.
  const handleDeleteConnection = useCallback(async (connection: Connection) => {
    const src = SOURCES.find(s => s.key === connection.source)
    if (!confirm(`¿Eliminar esta conexión de ${src?.label ?? connection.source}? No tiene tokens activos y no sirve.`)) return
    setDeleting(connection.id)
    const client = getSB()
    const { error } = await client
      .from('marketing_connections')
      .update({ status: 'revoked', access_token: null, refresh_token: null })
      .eq('id', connection.id)
    if (!error) {
      setConnections(p => p.filter(c => c.id !== connection.id))
    }
    setDeleting(null)
  }, [])

  const handleManualSync = useCallback(async (connection: Connection) => {
    setSyncing(connection.id)
    try {
      const res = await fetch('/api/marketing/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_id: connection.id }),
      })
      const data = await res.json()
      if (res.ok) {
        alert('Sync iniciado. Los datos aparecerán en unos minutos.')
      } else {
        alert(`Error: ${data.message ?? 'Error desconocido'}`)
      }
    } catch {
      alert('No se pudo conectar con el servidor.')
    }
    setSyncing(null)
  }, [])

  const handleRefreshToken = useCallback(async (connection: Connection) => {
    setRefreshing(connection.id)
    try {
      const res = await fetch('/api/oauth/google/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_id: connection.id }),
      })
      const data = await res.json()
      if (res.ok) {
        setConnections(p => p.map(c =>
          c.id === connection.id
            ? { ...c, token_expires_at: data.token_expires_at, status: 'active', last_error: null }
            : c
        ))
        alert('Token renovado exitosamente.')
      } else if (data.code === 'invalid_grant') {
        alert('El token fue revocado por Google. Debes reconectar la integración.')
      } else {
        alert(`Error al renovar: ${data.message ?? 'Error desconocido'}`)
      }
    } catch {
      alert('No se pudo conectar con el servidor.')
    }
    setRefreshing(null)
  }, [])

  const isOwnerOrAdmin = ['owner', 'admin'].includes(currentUserRole)

  // ── Leer parámetros de URL (éxito o error del callback) ──────────────────
  const urlParams = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search) : null
  const connectedSource = urlParams?.get('connected')
  const errorParam      = urlParams?.get('error')

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-3 md:p-6 max-w-4xl">

      {/* Header */}
      <div className="mb-4 md:mb-6">
        <h1 className="text-lg md:text-xl font-bold text-slate-900 dark:text-slate-50">Integraciones</h1>
        <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Conecta tus cuentas de Google para sincronizar datos automáticamente cada noche.
        </p>
      </div>

      {/* Banners de éxito / error desde callback */}
      {connectedSource && (
        <div className="mb-4 p-3 md:p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 rounded-xl flex items-start md:items-center gap-2 md:gap-3">
          <span className="text-emerald-500 text-base md:text-lg shrink-0">✓</span>
          <p className="text-xs md:text-sm text-emerald-800 font-medium">
            {SOURCES.find(s => s.key === connectedSource)?.label ?? connectedSource} conectado exitosamente.
            Los datos aparecerán después del primer sync automático.
          </p>
        </div>
      )}
      {errorParam && (
        <div className="mb-4 p-3 md:p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-xl flex items-start gap-2 md:gap-3">
          <span className="text-red-500 text-base md:text-lg shrink-0">⚠</span>
          <div>
            <p className="text-xs md:text-sm text-red-800 font-medium">Error al conectar la integración</p>
            <p className="text-xs text-red-600 mt-0.5 font-mono break-words">{errorParam}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 md:mb-6 border-b border-slate-200 dark:border-white/[0.08] overflow-x-auto">
        <button
          onClick={() => setActiveTab('sources')}
          className={`px-3 md:px-4 py-2 md:py-2.5 text-xs md:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'sources'
              ? 'border-slate-900 text-slate-900 dark:text-slate-50'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-200'
          }`}>
          Fuentes de datos
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={`px-3 md:px-4 py-2 md:py-2.5 text-xs md:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'logs'
              ? 'border-slate-900 text-slate-900 dark:text-slate-50'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-200'
          }`}>
          Historial de sync
          {syncJobs.some(j => j.status === 'failed') && (
            <span className="ml-2 w-2 h-2 bg-red-500 rounded-full inline-block" />
          )}
        </button>
      </div>

      {activeTab === 'sources' ? (
        <div className="space-y-4">

          {/* Info badge */}
          <div className="flex items-start md:items-center gap-2 p-2 md:p-3 bg-slate-50 dark:bg-[#1a2030] dark:bg-[#0d1117] rounded-xl border border-slate-200 dark:border-white/[0.08] mb-4 md:mb-6">
            <GoogleLogo className="w-4 h-4 shrink-0 mt-0.5 md:mt-0" />
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Todas las integraciones usan OAuth 2.0 de Google. Tus credenciales nunca se almacenan en texto plano.
              El sync automático se ejecuta cada noche a las 2 AM.
            </p>
          </div>

          {!isOwnerOrAdmin && (
            <div className="p-3 md:p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 rounded-xl text-xs md:text-sm text-amber-800 mb-4">
              Solo los propietarios y administradores pueden conectar o desconectar integraciones.
            </div>
          )}

          {SOURCES.map(source => {
            // Priorizar: active > pending > error.
            // Si hay múltiples conexiones para un source (ej. una activa + una en error),
            // mostrar la mejor disponible. Evita que una conexión error antigua
            // oculte una activa más reciente.
            const STATUS_PRIORITY: Record<string, number> = { active: 0, pending: 1, error: 2 }
            const candidatas = connections
              .filter(c => c.source === source.key && c.status !== 'revoked')
              .sort((a, b) =>
                (STATUS_PRIORITY[a.status] ?? 9) - (STATUS_PRIORITY[b.status] ?? 9)
              )
            const conn = candidatas[0] ?? null

            // Conexiones error adicionales que el usuario puede querer limpiar
            // (sin tokens, distintas a la principal mostrada)
            const errorConns = candidatas.filter(
              c => c.id !== conn?.id && c.status === 'error' && !c.token_expires_at
            )

            const isActive  = !!conn && conn.status === 'active'
            const isPending = !!conn && conn.status === 'pending'
            const hasError  = !!conn && conn.status === 'error'

            // Token expirado = access_token de 1h caducó. Esto es NORMAL en Google OAuth.
            // Solo mostrar alerta si NO hay token_expires_at (nunca tuvo token) o si
            // el status es 'error' (refresh_token revocado).
            // El access_token se auto-renueva en cada sync, así que un token expirado
            // no es un problema real mientras el refresh_token siga válido.
            const tokenExpired = !!conn?.token_expires_at &&
              new Date(conn.token_expires_at) < new Date()
            // Alerta real = token vencido Y status error (refresh_token revocado)
            const tokenNeedsAttention = tokenExpired && conn?.status === 'error'

            // Activa pero sin sync todavía
            const needsSync  = isActive && !conn.last_sync_at
            // Activa pero sin external_id (no debería ocurrir, pero por si acaso)
            const needsSetup = isActive && !conn.external_id

            return (
              <div key={source.key}
                className={`border rounded-2xl p-3 md:p-5 transition-all ${
                  isActive && !hasError ? `${source.color}` :
                  hasError              ? 'border-red-200 bg-red-50 dark:bg-red-900/20' :
                  isPending             ? 'border-amber-200 bg-amber-50 dark:bg-amber-900/20' :
                                         'border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e2535]'
                }`}>
                <div className="flex items-start gap-3 md:gap-4 flex-col md:flex-row">
                  {/* Icon */}
                  <div className="w-10 md:w-12 h-10 md:h-12 rounded-xl flex items-center justify-center shrink-0 bg-white dark:bg-[#1e2535] border border-slate-200 dark:border-white/[0.08]">
                    {source.icon}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <h3 className="font-semibold text-sm md:text-base text-slate-900 dark:text-slate-50">{source.label}</h3>

                      {isActive && !needsSetup && !needsSync && !tokenNeedsAttention && (
                        <span className="flex items-center gap-1 text-xs bg-emerald-100 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full font-medium">
                          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                          Conectado
                        </span>
                      )}
                      {isActive && tokenNeedsAttention && (
                        <span className="flex items-center gap-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                          ⚠ Reconexión necesaria
                        </span>
                      )}
                      {isActive && needsSync && !tokenExpired && (
                        <span className="flex items-center gap-1 text-xs bg-blue-100 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full font-medium">
                          ↻ Primer sync pendiente
                        </span>
                      )}
                      {isActive && needsSetup && (
                        <span className="flex items-center gap-1 text-xs bg-amber-100 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium">
                          ⚠ Configuración incompleta
                        </span>
                      )}
                      {hasError && (
                        <span className="flex items-center gap-1 text-xs bg-red-100 text-red-700 dark:text-red-400 px-2 py-0.5 rounded-full font-medium">
                          ⚠ Error de conexión
                        </span>
                      )}
                      {isPending && (
                        <span className="flex items-center gap-1 text-xs bg-amber-100 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium">
                          ⏳ Seleccionar propiedad
                        </span>
                      )}
                    </div>
                    <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mb-2">{source.description}</p>

                    {isActive && conn && (
                      <div className="text-xs text-slate-500 dark:text-slate-400 space-y-0.5">
                        {conn.external_name && (
                          <p><span className="text-slate-400">Propiedad:</span> {conn.external_name}</p>
                        )}
                        {tokenNeedsAttention ? (
                          <p className="text-red-600">
                            El token fue revocado. Reconecta la integración para restaurar el sync.
                          </p>
                        ) : conn.last_sync_at ? (
                          <p><span className="text-slate-400">Último sync:</span> {fmtDate(conn.last_sync_at)}</p>
                        ) : (
                          <p className="text-blue-600">Sin sync todavía — presiona &quot;Sync ahora&quot; para obtener tus primeros datos.</p>
                        )}
                        <p><span className="text-slate-400">Conectado:</span> {fmtDate(conn.created_at)}</p>
                      </div>
                    )}

                    {/* Mostrar last_error independientemente del status si existe */}
                    {conn?.last_error && (
                      <p className="text-xs text-red-600 bg-red-100 rounded-lg px-2 py-1 mt-2 font-mono break-all">
                        {conn.last_error}
                      </p>
                    )}

                    {isPending && conn && (
                      <div className="text-xs text-amber-700 dark:text-amber-400 mt-1 space-y-0.5">
                        <p>Los tokens OAuth están listos. Solo falta elegir qué propiedad conectar.</p>
                        {conn.token_expires_at && new Date(conn.token_expires_at) < new Date() && (
                          <p className="text-amber-600">El token de acceso expiró — se renovará automáticamente al completar la configuración.</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 md:gap-2 shrink-0 flex-wrap justify-end w-full md:w-auto">
                    {isActive && conn && (
                      <>
                        {!needsSetup && (
                          <a href={source.dashboardHref}
                            className="text-xs text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e2535] rounded-lg px-3 py-1.5 hover:bg-slate-50 dark:bg-[#1a2030] transition-colors">
                            {source.dashboardLabel} →
                          </a>
                        )}
                        {isOwnerOrAdmin && tokenNeedsAttention && (
                          <button
                            onClick={() => handleRefreshToken(conn)}
                            disabled={refreshing === conn.id}
                            className="text-xs text-orange-600 border border-orange-300 bg-orange-50 rounded-lg px-3 py-1.5 hover:bg-orange-100 transition-colors disabled:opacity-50 font-medium">
                            {refreshing === conn.id ? 'Renovando...' : '🔄 Renovar token'}
                          </button>
                        )}
                        {isOwnerOrAdmin && (
                          <button
                            onClick={() => handleManualSync(conn)}
                            disabled={syncing === conn.id}
                            className="text-xs text-blue-600 border border-blue-200 bg-blue-50 dark:bg-blue-900/20 rounded-lg px-3 py-1.5 hover:bg-blue-100 transition-colors disabled:opacity-50">
                            {syncing === conn.id ? 'Sincronizando...' : '↻ Sync ahora'}
                          </button>
                        )}
                        {isOwnerOrAdmin && (
                          <button
                            onClick={() => handleDisconnect(conn)}
                            disabled={disconnecting === conn.id}
                            className="text-xs text-red-500 border border-red-200 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-1.5 hover:bg-red-100 transition-colors disabled:opacity-50">
                            {disconnecting === conn.id ? 'Desconectando...' : 'Desconectar'}
                          </button>
                        )}
                      </>
                    )}

                    {!conn && isOwnerOrAdmin && (
                      <button
                        onClick={() => handleConnect(source.key)}
                        className="flex items-center gap-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-xl px-4 py-2 transition-colors">
                        <GoogleLogo className="w-4 h-4" />
                        Conectar con Google
                      </button>
                    )}

                    {hasError && isOwnerOrAdmin && (
                      <button
                        onClick={() => handleConnect(source.key)}
                        className="flex items-center gap-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-xl px-4 py-2 transition-colors">
                        <GoogleLogo className="w-4 h-4" />
                        Reconectar
                      </button>
                    )}

                    {/* Conexión pending: ya tiene tokens, solo falta seleccionar propiedad.
                        NUNCA iniciar nuevo OAuth — usar el connection_id existente. */}
                    {isPending && conn && isOwnerOrAdmin && (
                      <button
                        onClick={() => handleCompleteSetup(conn)}
                        className="flex items-center gap-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 rounded-xl px-4 py-2 transition-colors">
                        Seleccionar propiedad →
                      </button>
                    )}
                  </div>
                </div>

                {/* Conexiones error sin tokens (basura acumulada) — mostrar mini fila de limpieza */}
                {errorConns.length > 0 && isOwnerOrAdmin && (
                  <div className="mt-3 pt-3 border-t border-slate-200 dark:border-white/[0.08] flex items-center justify-between gap-3">
                    <p className="text-xs text-slate-400">
                      {errorConns.length} conexión{errorConns.length > 1 ? 'es' : ''} en error sin tokens
                      {' '}(residuos de intentos anteriores)
                    </p>
                    <div className="flex gap-2">
                      {errorConns.map(ec => (
                        <button
                          key={ec.id}
                          onClick={() => handleDeleteConnection(ec)}
                          disabled={deleting === ec.id}
                          className="text-xs text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-white/[0.08] rounded-lg px-2 py-1 hover:bg-red-50 dark:bg-red-900/20 hover:text-red-600 hover:border-red-200 transition-colors disabled:opacity-50">
                          {deleting === ec.id ? 'Eliminando...' : `Eliminar residuo`}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {/* ── Comunicación ──────────────────────────────────────────────── */}
          <div className="mt-10">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">Comunicación</p>

            {/* Mensajería card */}
            <div className={`border rounded-2xl p-5 transition-all ${
              mensajeriaActiva && inboxActivo ? 'border-violet-200 bg-violet-50' :
              mensajeriaActiva              ? 'border-amber-200 bg-amber-50 dark:bg-amber-900/20' :
                                             'border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e2535]'
            }`}>
              <div className="flex items-start gap-4">
                {/* Icon */}
                <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-white dark:bg-[#1e2535] border border-slate-200 dark:border-white/[0.08]">
                  <MensajeriaIcon className="w-7 h-7" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <h3 className="font-semibold text-slate-900 dark:text-slate-50">Mensajería</h3>
                    {mensajeriaActiva && inboxActivo ? (
                      <span className="flex items-center gap-1 text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium">
                        <span className="w-1.5 h-1.5 bg-violet-500 rounded-full" />
                        Activo
                      </span>
                    ) : mensajeriaActiva ? (
                      <span className="flex items-center gap-1 text-xs bg-amber-100 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium">
                        En configuración
                      </span>
                    ) : (
                      <span className="text-xs bg-slate-100 dark:bg-[#1a2030] text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full font-medium">
                        No disponible
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">
                    Bandeja de entrada omnicanal: WhatsApp, email, chat en vivo y más. Gestiona todas las conversaciones con tus clientes desde el dashboard.
                  </p>
                  {mensajeriaActiva && inboxActivo && (
                    <p className="text-xs text-violet-600">
                      La mensajería está activa. Ve a Ventas → Bandeja de entrada para usarla.
                    </p>
                  )}
                  {mensajeriaActiva && !inboxActivo && (
                    <p className="text-xs text-amber-600">
                      Tu bandeja de entrada está siendo configurada. Estará lista pronto.
                    </p>
                  )}
                </div>

                {/* Actions */}
                {mensajeriaActiva && inboxActivo && (
                  <div className="flex items-center gap-2 shrink-0">
                    <a href="/ventas/bandeja"
                      className="text-xs text-slate-600 dark:text-slate-300 dark:text-slate-300 border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e2535] rounded-lg px-3 py-1.5 hover:bg-slate-50 dark:bg-[#1a2030] transition-colors">
                      Ver bandeja →
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Coming soon */}
          <div className="mt-8">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">Próximamente</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
              {['Instagram', 'Facebook', 'LinkedIn', 'TikTok'].map(name => (
                <div key={name} className="border border-dashed border-slate-200 dark:border-white/[0.08] rounded-xl p-4 text-center">
                  <p className="text-sm font-medium text-slate-400">{name}</p>
                  <p className="text-xs text-slate-300 mt-1">En desarrollo</p>
                </div>
              ))}
            </div>
          </div>
        </div>

      ) : (
        /* ── Sync logs ──────────────────────────────────────────────────────── */
        <div className="bg-white dark:bg-[#1e2535] rounded-2xl border border-slate-200 dark:border-white/[0.08]">
          <div className="px-3 md:px-5 py-3 md:py-4 border-b border-slate-100 dark:border-white/[0.05]">
            <p className="text-xs md:text-sm font-semibold text-slate-700 dark:text-slate-200">Historial de sincronizaciones</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Últimas 20 ejecuciones del sync automático</p>
          </div>
          {syncJobs.length === 0 ? (
            <div className="py-12 md:py-16 text-center">
              <p className="text-xs md:text-sm text-slate-400">Sin sincronizaciones registradas</p>
              <p className="text-xs text-slate-300 mt-1">
                El primer sync automático se ejecutará esta noche a las 2 AM
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50 overflow-x-auto">
              {syncJobs.map(job => {
                const src = SOURCES.find(s => s.key === job.source)
                const statusConfig = ({
                  success: { label: 'Exitoso',  color: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' },
                  failed:  { label: 'Fallido',  color: 'bg-red-50 dark:bg-red-900/20 text-red-600' },
                  running: { label: 'En curso', color: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400' },
                  partial: { label: 'Parcial',  color: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400' },
                } as Record<string, { label: string; color: string }>)[job.status]
                  ?? { label: job.status, color: 'bg-slate-100 dark:bg-[#1a2030] text-slate-500' }

                return (
                  <div key={job.id} className="px-3 md:px-5 py-3 flex items-center gap-2 md:gap-4">
                    <div className="w-6 md:w-7 h-6 md:h-7 shrink-0">{src?.icon}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs md:text-sm font-medium text-slate-700 dark:text-slate-200">{src?.label ?? job.source}</p>
                      <p className="text-xs text-slate-400">
                        {job.date_from} → {job.date_to} · {fmtDate(job.started_at)}
                      </p>
                      {job.error_message && (
                        <p className="text-xs text-red-500 mt-0.5 truncate font-mono">
                          {job.error_message}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusConfig.color}`}>
                        {statusConfig.label}
                      </span>
                      {job.status === 'success' && (
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{job.records_inserted} registros</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Google Logo SVG ──────────────────────────────────────────────────────────

function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}

// ─── Mensajería Icon SVG ──────────────────────────────────────────────────────

function MensajeriaIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="8" fill="#7C3AED" fillOpacity="0.12"/>
      <path
        d="M16 6C10.477 6 6 10.253 6 15.5c0 2.84 1.254 5.394 3.266 7.174L8.5 26l4.027-1.607A10.8 10.8 0 0016 25c5.523 0 10-4.253 10-9.5S21.523 6 16 6z"
        fill="#7C3AED"
      />
      <circle cx="12" cy="15.5" r="1.5" fill="white"/>
      <circle cx="16" cy="15.5" r="1.5" fill="white"/>
      <circle cx="20" cy="15.5" r="1.5" fill="white"/>
    </svg>
  )
}
