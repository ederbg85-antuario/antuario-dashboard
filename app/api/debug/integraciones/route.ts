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

  // Diagnostics are read-only. A GET must never refresh credentials,
  // ingest metrics, or invoke a selection function as a hidden side effect.
  const edgeFunctionTests = {status:'not_run',message:'La sincronización se ejecuta explícitamente desde Integraciones.'}

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
    actions.push('⚠ Tokens vencidos — reconectar las integraciones afectadas desde Integraciones')
  }
  if (connectionDiag.some(c => c.status === 'pending')) {
    actions.push('⏳ Hay conexiones pendientes — ir a Integraciones y hacer clic en "Seleccionar propiedad"')
  }
  if (connectionDiag.some(c => c.status === 'active' && !c.has_external_id)) {
    actions.push('⚠ Conexiones activas sin external_id — reconectar y seleccionar propiedad')
  }
  if (actions.length === 0) {
    actions.push('✅ No se detectaron incidencias en los metadatos; las funciones externas no se probaron')
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
