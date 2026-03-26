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
  const META_SOURCES = ['meta_ads', 'facebook', 'instagram']
  const isMeta = META_SOURCES.includes(connection.source)

  const tokenExpiresSoon = connection.token_expires_at
    ? new Date(connection.token_expires_at) < new Date(Date.now() + 5 * 60 * 1000)
    : true

  // Google sources: refresh via Google OAuth (refresh_token)
  if (tokenExpiresSoon && connection.refresh_token && !isMeta) {
    console.log('[sync] Token Google vencido/próximo a vencer — renovando...')
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
      console.log('[sync] Token Google renovado exitosamente')
    } else {
      const err = await tokenRes.json()
      console.error('[sync] No se pudo renovar el token Google:', err)
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
    }
  }

  // Meta sources: refresh long-lived token if expiring within 7 days
  // Meta long-lived tokens (60 days) can be refreshed before they expire
  if (isMeta && tokenExpiresSoon && connection.token_expires_at) {
    const expiresIn = new Date(connection.token_expires_at).getTime() - Date.now()
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
    // Only refresh if within 7 days of expiry (Meta requires token still be valid)
    if (expiresIn > 0 && expiresIn < sevenDaysMs) {
      console.log('[sync] Token Meta próximo a vencer — renovando long-lived token...')
      // Read current access_token for the refresh
      const { data: fullConn } = await adminClient
        .from('marketing_connections')
        .select('access_token')
        .eq('id', connection_id)
        .single()

      if (fullConn?.access_token) {
        const refreshUrl = new URL('https://graph.facebook.com/v21.0/oauth/access_token')
        refreshUrl.searchParams.set('grant_type', 'fb_exchange_token')
        refreshUrl.searchParams.set('client_id', process.env.META_APP_ID!)
        refreshUrl.searchParams.set('client_secret', process.env.META_APP_SECRET!)
        refreshUrl.searchParams.set('fb_exchange_token', fullConn.access_token)

        const metaRes = await fetch(refreshUrl.toString())
        if (metaRes.ok) {
          const { access_token, expires_in } = await metaRes.json()
          await adminClient
            .from('marketing_connections')
            .update({
              access_token,
              token_expires_at: new Date(Date.now() + (expires_in ?? 5_184_000) * 1000).toISOString(),
              status: 'active',
              last_error: null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', connection_id)
          console.log('[sync] Token Meta renovado exitosamente')
        } else {
          console.error('[sync] No se pudo renovar token Meta:', await metaRes.json().catch(() => ({})))
        }
      }
    } else if (expiresIn <= 0) {
      // Token already expired — can't refresh
      await adminClient
        .from('marketing_connections')
        .update({ status: 'error', last_error: 'Token de Meta expirado. Reconecta la integración.' })
        .eq('id', connection_id)
      return NextResponse.json(
        { message: 'El token de Meta expiró. Reconecta la integración desde Configuración → Integraciones.' },
        { status: 401 }
      )
    }
  }

  // Invocar Edge Function de Supabase para el sync.
  // Meta sources → meta-sync-data | Google sources → google-sync-data
  try {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const today = new Date()

    const fmt = (d: Date) => d.toISOString().split('T')[0]

    const syncBody = {
      connection_id: connection.id,
      source: connection.source,
      date_from: fmt(thirtyDaysAgo),
      date_to: fmt(today),
      manual: true,
    }

    const functionName = META_SOURCES.includes(connection.source)
      ? 'meta-sync-data'
      : 'google-sync-data'

    const { data: fnData, error: fnError } = await supabase.functions.invoke(
      functionName,
      { body: syncBody }
    )

    if (fnError) {
      console.error(`[sync] ${functionName} Edge Function error:`, fnError)
      return NextResponse.json({
        message: 'Error al ejecutar sync.',
        error: fnError.message,
      }, { status: 500 })
    }

    return NextResponse.json({
      message: `Sync iniciado exitosamente con ${functionName}`,
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
