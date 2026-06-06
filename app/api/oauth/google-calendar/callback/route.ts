import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// GET /api/oauth/google-calendar/callback
//
// 1. Intercambia el code por tokens (incluye refresh_token)
// 2. Obtiene el email de la cuenta de Google conectada
// 3. Guarda/actualiza la conexión source='google_calendar' como ACTIVE
//    (sin paso de selección de propiedad — el calendario es 'primary')

type OAuthState = { orgId: number; userId: string; source: string }

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code  = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin
  const failUrl = (reason: string) =>
    `${baseUrl}/configuracion/integraciones?error=${encodeURIComponent(reason)}`
  const okUrl = `${baseUrl}/configuracion/integraciones?success=google_calendar`

  if (error) return NextResponse.redirect(failUrl(error))
  if (!code || !state) return NextResponse.redirect(failUrl('missing_params'))

  let parsed: OAuthState
  try {
    const raw = state.replace(/-/g, '+').replace(/_/g, '/')
    parsed = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'))
  } catch {
    return NextResponse.redirect(failUrl('invalid_state'))
  }

  const { orgId, userId } = parsed
  if (!orgId || !userId) return NextResponse.redirect(failUrl('invalid_state_fields'))

  // ── Intercambiar code por tokens ───────────────────────────────────────────
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri:  `${baseUrl}/api/oauth/google-calendar/callback`,
      grant_type:    'authorization_code',
    }),
  })

  if (!tokenRes.ok) {
    const err = await tokenRes.json().catch(() => ({}))
    console.error('[google-calendar] token exchange failed:', err)
    return NextResponse.redirect(failUrl('token_exchange_failed'))
  }

  const tokens = await tokenRes.json()
  const { access_token, refresh_token, expires_in, scope } = tokens
  const tokenExpiresAt = new Date(Date.now() + (expires_in ?? 3600) * 1000).toISOString()

  if (!refresh_token) {
    // Sin refresh_token no podremos renovar el acceso. Forzar reconsentimiento.
    return NextResponse.redirect(failUrl('no_refresh_token_reauthorize'))
  }

  // ── Obtener email de la cuenta conectada ───────────────────────────────────
  let accountEmail = 'Google Calendar'
  try {
    const uiRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    })
    if (uiRes.ok) {
      const ui = await uiRes.json()
      accountEmail = ui.email ?? accountEmail
    }
  } catch {}

  // ── Guardar conexión ACTIVE (reemplaza cualquier google_calendar previa) ────
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  await supabase
    .from('marketing_connections')
    .delete()
    .eq('organization_id', orgId)
    .eq('source', 'google_calendar')

  const { error: insertError } = await supabase
    .from('marketing_connections')
    .insert({
      organization_id:  orgId,
      source:           'google_calendar',
      status:           'active',
      access_token,
      refresh_token,
      token_expires_at: tokenExpiresAt,
      scopes:           scope ? String(scope).split(' ') : null,
      external_id:      'primary',
      external_name:    accountEmail,
      connected_by:     userId,
      last_error:       null,
    })

  if (insertError) {
    console.error('[google-calendar] db insert failed:', insertError)
    return NextResponse.redirect(failUrl(`db_error: ${insertError.message}`))
  }

  return NextResponse.redirect(okUrl)
}
