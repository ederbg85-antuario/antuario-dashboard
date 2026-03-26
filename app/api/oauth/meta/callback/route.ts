import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// GET /api/oauth/meta/callback
//
// Flujo:
// 1. Intercambia code por token de larga duración (long-lived token)
// 2. Guarda conexión con status='pending'
// 3. Redirige a /oauth/seleccionar-cuenta-meta para elegir cuenta/página

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

  // Decodificar state
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

  // ── Intercambiar code por short-lived token ────────────────────────────────
  const tokenUrl = new URL('https://graph.facebook.com/v21.0/oauth/access_token')
  tokenUrl.searchParams.set('client_id',     process.env.META_APP_ID!)
  tokenUrl.searchParams.set('client_secret', process.env.META_APP_SECRET!)
  tokenUrl.searchParams.set('redirect_uri',  `${baseUrl}/api/oauth/meta/callback`)
  tokenUrl.searchParams.set('code',          code)

  const shortTokenRes = await fetch(tokenUrl.toString())
  if (!shortTokenRes.ok) {
    const err = await shortTokenRes.json().catch(() => ({}))
    console.error('Meta short-lived token exchange failed:', err)
    return NextResponse.redirect(failUrl('token_exchange_failed'))
  }
  const { access_token: shortToken } = await shortTokenRes.json()

  // ── Convertir a long-lived token (60 días) ─────────────────────────────────
  const longTokenUrl = new URL('https://graph.facebook.com/v21.0/oauth/access_token')
  longTokenUrl.searchParams.set('grant_type',        'fb_exchange_token')
  longTokenUrl.searchParams.set('client_id',         process.env.META_APP_ID!)
  longTokenUrl.searchParams.set('client_secret',     process.env.META_APP_SECRET!)
  longTokenUrl.searchParams.set('fb_exchange_token', shortToken)

  const longTokenRes = await fetch(longTokenUrl.toString())
  if (!longTokenRes.ok) {
    const err = await longTokenRes.json().catch(() => ({}))
    console.error('Meta long-lived token exchange failed:', err)
    return NextResponse.redirect(failUrl('long_token_exchange_failed'))
  }

  const { access_token, expires_in } = await longTokenRes.json()
  // expires_in en segundos (normalmente ~5,184,000 = 60 días)
  const expiresAt = new Date(Date.now() + ((expires_in ?? 5_184_000) * 1000)).toISOString()

  // ── Guardar como PENDING ───────────────────────────────────────────────────
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Limpiar pending anterior para esta org+source
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
      refresh_token:    null,          // Meta usa long-lived tokens, no refresh tokens
      token_expires_at: expiresAt,
      connected_by:     userId,
      external_id:      null,
      external_name:    null,
      last_error:       null,
    })
    .select('id')
    .single()

  if (insertError || !pendingConn) {
    console.error('Error saving Meta pending connection:', insertError)
    return NextResponse.redirect(failUrl(`db_error: ${insertError?.message ?? 'unknown'}`))
  }

  // Redirigir al selector de cuenta Meta
  return NextResponse.redirect(
    `${baseUrl}/oauth/seleccionar-cuenta-meta?connection_id=${pendingConn.id}&source=${source}`
  )
}
