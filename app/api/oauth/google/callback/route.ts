import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// GET /api/oauth/google/callback
//
// Flujo actualizado:
// 1. Intercambia code por tokens
// 2. Guarda conexión con status='pending' (tokens seguros, sin propiedad aún)
// 3. Redirige a /oauth/seleccionar-propiedad para que el usuario elija
// 4. /api/oauth/google/confirmar activa la conexión con la propiedad elegida

type OAuthState = {
  orgId:  number
  source: string
  userId: string
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code  = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin
  const failUrl = (reason: string) =>
    `${baseUrl}/configuracion/integraciones?error=${encodeURIComponent(reason)}`

  if (error) return NextResponse.redirect(failUrl(error))
  if (!code || !state) return NextResponse.redirect(failUrl('missing_params'))

  // ── Decodificar state ──────────────────────────────────────────────────────
  let parsed: OAuthState
  try {
    const raw = state.replace(/-/g, '+').replace(/_/g, '/')
    parsed = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'))
  } catch {
    return NextResponse.redirect(failUrl('invalid_state'))
  }

  const { orgId, source, userId } = parsed
  if (!orgId || !source || !userId) {
    return NextResponse.redirect(failUrl('invalid_state_fields'))
  }

  // ── Intercambiar code por tokens ───────────────────────────────────────────
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri:  `${baseUrl}/api/oauth/google/callback`,
      grant_type:    'authorization_code',
    }),
  })

  if (!tokenRes.ok) {
    const err = await tokenRes.json()
    console.error('Token exchange failed:', err)
    return NextResponse.redirect(failUrl('token_exchange_failed'))
  }

  const tokens = await tokenRes.json()
  const { access_token, refresh_token, expires_in } = tokens
  const expiresAt = new Date(Date.now() + (expires_in ?? 3600) * 1000).toISOString()

  // ── Guardar como PENDING (sin propiedad aún) ───────────────────────────────
  // El usuario todavía no ha elegido qué propiedad conectar.
  // status='pending' → no aparece como "Conectado" en la UI.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Limpiar cualquier pending anterior para esta org+source
  await supabase
    .from('marketing_connections')
    .delete()
    .eq('organization_id', orgId)
    .eq('source', source)
    .eq('status', 'pending')

  const { data: pendingConn, error: insertError } = await supabase
    .from('marketing_connections')
    .insert({
      organization_id:  orgId,
      source,
      status:           'pending',
      access_token,
      refresh_token:    refresh_token ?? null,
      token_expires_at: expiresAt,
      connected_by:     userId,
      external_id:      null,
      external_name:    null,
      last_error:       null,
    })
    .select('id')
    .single()

  if (insertError || !pendingConn) {
    console.error('Error saving pending connection:', insertError)
    return NextResponse.redirect(failUrl(`db_error: ${insertError?.message ?? 'unknown'}`))
  }

  // ── Redirigir a selector de propiedad ──────────────────────────────────────
  return NextResponse.redirect(
    `${baseUrl}/oauth/seleccionar-propiedad?connection_id=${pendingConn.id}&source=${source}`
  )
}
