import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

// POST /api/marketing/sync
// Body: { connection_id: string }
// Dispara un sync manual de una conexión específica.
// Auto-renueva el access_token si está vencido antes de llamar a la Edge Function.

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(s) {
          try { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch { }
        },
      },
    }
  )

  // Verificar auth
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ message: 'No autorizado' }, { status: 401 })
  }

  const body = await request.json()
  const { connection_id } = body

  if (!connection_id) {
    return NextResponse.json({ message: 'connection_id requerido' }, { status: 400 })
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Verificar que la conexión pertenece a una org del usuario (incluir token_expires_at y refresh_token)
  const { data: connection } = await adminClient
    .from('marketing_connections')
    .select('id, source, organization_id, token_expires_at, refresh_token')
    .eq('id', connection_id)
    .eq('status', 'active')
    .maybeSingle()

  if (!connection) {
    return NextResponse.json({ message: 'Conexión no encontrada' }, { status: 404 })
  }

  // Verificar membership
  const { data: membership } = await supabase
    .from('memberships')
    .select('role')
    .eq('user_id', user.id)
    .eq('organization_id', connection.organization_id)
    .eq('status', 'active')
    .maybeSingle()

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ message: 'Sin permisos' }, { status: 403 })
  }

  // ── Auto-renovar token si está vencido o a punto de vencer (5 min de margen) ─
  const tokenExpiresSoon = connection.token_expires_at
    ? new Date(connection.token_expires_at) < new Date(Date.now() + 5 * 60 * 1000)
    : true

  if (tokenExpiresSoon && connection.refresh_token) {
    console.log('[sync] Token vencido/próximo a vencer — renovando antes del sync...')
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: connection.refresh_token,
        grant_type: 'refresh_token',
      }),
    })

    if (tokenRes.ok) {
      const { access_token, expires_in } = await tokenRes.json()
      await adminClient
        .from('marketing_connections')
        .update({
          access_token,
          token_expires_at: new Date(Date.now() + (expires_in ?? 3600) * 1000).toISOString(),
          status: 'active',
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', connection_id)
      console.log('[sync] Token renovado exitosamente')
    } else {
      const err = await tokenRes.json()
      console.error('[sync] No se pudo renovar el token:', err)
      if (err.error === 'invalid_grant') {
        await adminClient
          .from('marketing_connections')
          .update({ status: 'error', last_error: 'Refresh token revocado. Reconecta la integración.' })
          .eq('id', connection_id)
        return NextResponse.json(
          { message: 'El token fue revocado. Reconecta la integración desde Configuración → Integraciones.' },
          { status: 401 }
        )
      }
      // Continuar de todas formas — la Edge Function intentará con el token existente
    }
  }

  // Invocar Edge Function de Supabase para el sync.
  // Nueva función unificada: google-sync-data
  try {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const today = new Date()

    const fmt = (d: Date) => d.toISOString().split('T')[0]

    const syncBody = {
      connection_id: connection.id,
      source: connection.source,
      date_from: fmt(yesterday),
      date_to: fmt(today),
      manual: true,
    }

    const { data: fnData, error: fnError } = await supabase.functions.invoke(
      'google-sync-data',
      { body: syncBody }
    )

    if (fnError) {
      console.error('[sync] google-sync-data Edge Function error:', fnError)
      return NextResponse.json({
        message: 'Sync iniciado con advertencia. Puede tardar unos minutos en completarse.',
        warning: fnError.message,
      })
    }

    return NextResponse.json({
      message: 'Sync iniciado exitosamente con google-sync-data',
      data: fnData,
    })

  } catch (err) {
    console.error('[sync] Dispatch error:', err)
    return NextResponse.json(
      { message: 'Error al iniciar sync. Intenta de nuevo.' },
      { status: 500 }
    )
  }
}
