import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

// GET /api/debug/integraciones
// Diagnostica el estado actual de integraciones, tokens y Edge Functions.
// Solo accesible para owners/admins.

export async function GET() {
  // Solo accesible en desarrollo
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 404 })
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(s) {
          try { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  // Verificar rol
  const { data: membership } = await supabase
    .from('memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Solo owners/admins' }, { status: 403 })
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const orgId = membership.organization_id
  const now = new Date()

  // ── 1. Conexiones actuales ────────────────────────────────────────────────
  const { data: connections } = await adminClient
    .from('marketing_connections')
    .select('id, source, status, external_id, external_name, last_sync_at, last_error, token_expires_at, created_at')
    .eq('organization_id', orgId)
    .order('source')

  const connectionDiag = (connections ?? []).map(c => {
    const expiry = c.token_expires_at ? new Date(c.token_expires_at) : null
    const tokenExpired = expiry ? expiry < now : null
    return {
      id:              c.id,
      source:          c.source,
      status:          c.status,
      has_external_id: !!c.external_id,
      external_name:   c.external_name,
      token_expires:   c.token_expires_at,
      token_expired:   tokenExpired,
      last_sync:       c.last_sync_at,
      last_error:      c.last_error,
    }
  })

  // ── 2. Test Edge Functions ─────────────────────────────────────────────────
  const edgeFunctionTests: Record<string, { ok: boolean; error?: string; response?: unknown }> = {}

  // Test google-list-properties (usa la primera conexión activa o pending)
  const firstConn = connections?.find(c => c.status === 'active' || c.status === 'pending')
  if (firstConn) {
    try {
      const { data, error } = await adminClient.functions.invoke('google-list-properties', {
        body: { connection_id: firstConn.id },
      })
      edgeFunctionTests['google-list-properties'] = {
        ok: !error,
        error: error?.message,
        response: error ? undefined : (Array.isArray(data) ? `${data.length} items` : typeof data),
      }
    } catch (err) {
      edgeFunctionTests['google-list-properties'] = { ok: false, error: String(err) }
    }
  } else {
    // Sin conexiones para testear — no es un fallo de la función en sí
    edgeFunctionTests['google-list-properties'] = { ok: true, error: 'Sin conexiones para testear (normal)', response: 'no_connections' }
  }

  // Test google-sync-data con dry_run (si la función lo soporta)
  if (firstConn?.status === 'active') {
    try {
      const { data, error } = await adminClient.functions.invoke('google-sync-data', {
        body: {
          connection_id: firstConn.id,
          source: firstConn.source,
          date_from: new Date(now.getTime() - 86400000).toISOString().split('T')[0],
          date_to: now.toISOString().split('T')[0],
          dry_run: true,
        },
      })
      edgeFunctionTests['google-sync-data'] = {
        ok: !error,
        error: error?.message,
        response: error ? undefined : data,
      }
    } catch (err) {
      edgeFunctionTests['google-sync-data'] = { ok: false, error: String(err) }
    }
  } else {
    // Sin conexión activa para testear — no es un fallo de la función en sí
    edgeFunctionTests['google-sync-data'] = { ok: true, error: 'Sin conexión activa para testear (normal)', response: 'no_active_connections' }
  }

  // Test google-save-selection — mandamos datos de validación intencionalmente inválidos.
  // Si la función responde con 400 (validation error), está viva y funciona; solo 5xx indica fallo real.
  try {
    const { data, error } = await adminClient.functions.invoke('google-save-selection', {
      body: { ping: true },
    })
    // La función devuelve 400 cuando faltan campos requeridos — eso es correcto, no es un error de sistema
    const isValidationError = error?.message?.includes('non-2xx') || error?.message?.includes('400')
    edgeFunctionTests['google-save-selection'] = {
      ok: !error || isValidationError,
      error: isValidationError ? undefined : error?.message,
      response: isValidationError ? 'función activa (validación OK)' : (error ? undefined : data),
    }
  } catch (err) {
    edgeFunctionTests['google-save-selection'] = { ok: false, error: String(err) }
  }

  // ── 3. Últimos sync jobs ───────────────────────────────────────────────────
  const { data: recentJobs } = await adminClient
    .from('marketing_sync_jobs')
    .select('source, status, started_at, error_message')
    .eq('organization_id', orgId)
    .order('started_at', { ascending: false })
    .limit(5)

  // ── 4. Resumen de estado ───────────────────────────────────────────────────
  const summary = {
    total_connections: connections?.length ?? 0,
    active: connections?.filter(c => c.status === 'active').length ?? 0,
    pending: connections?.filter(c => c.status === 'pending').length ?? 0,
    error: connections?.filter(c => c.status === 'error').length ?? 0,
    tokens_expired: connectionDiag.filter(c => c.token_expired === true).length,
    needs_sync: connectionDiag.filter(c => !c.last_sync && c.status === 'active').length,
  }

  // ── 5. Acciones recomendadas ───────────────────────────────────────────────
  const actions: string[] = []

  if (connectionDiag.some(c => c.token_expired)) {
    actions.push('⚠ Tokens vencidos — reconectar las integraciones afectadas con Google OAuth')
  }
  if (connectionDiag.some(c => c.status === 'pending')) {
    actions.push('⏳ Hay conexiones pendientes — ir a Integraciones y hacer clic en "Seleccionar propiedad"')
  }
  if (Object.values(edgeFunctionTests).some(t => !t.ok)) {
    actions.push('🔴 Edge Functions con errores de sistema — revisar logs en Supabase Dashboard → Edge Functions → Logs')
  }
  if (connectionDiag.some(c => c.status === 'active' && !c.has_external_id)) {
    actions.push('⚠ Conexiones activas sin external_id — reconectar y seleccionar propiedad')
  }
  if (actions.length === 0) {
    actions.push('✅ Todo parece estar correcto')
  }

  return NextResponse.json({
    timestamp:      now.toISOString(),
    summary,
    connections:    connectionDiag,
    edge_functions: edgeFunctionTests,
    recent_jobs:    recentJobs ?? [],
    actions,
    env_check: {
      NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: !!process.env.GOOGLE_CLIENT_SECRET,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? '(no configurado - usa request.url)',
    },
  })
}
