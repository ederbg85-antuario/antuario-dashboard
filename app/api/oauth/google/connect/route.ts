import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// GET /api/oauth/google/connect?source=ga4
// Construye la URL OAuth de Google y redirige al usuario

const SCOPES: Record<string, string> = {
  ga4:                     'https://www.googleapis.com/auth/analytics.readonly',
  search_console:          'https://www.googleapis.com/auth/webmasters.readonly',
  google_ads:              'https://www.googleapis.com/auth/adwords',
  google_business_profile: 'https://www.googleapis.com/auth/business.manage',
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const source = searchParams.get('source')

  // Validar source
  if (!source || !SCOPES[source]) {
    return NextResponse.json(
      { error: `source inválido. Debe ser: ${Object.keys(SCOPES).join(', ')}` },
      { status: 400 }
    )
  }

  // Verificar que el usuario está autenticado
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
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Obtener organization_id del usuario
  const { data: membership } = await supabase
    .from('memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!membership) {
    return NextResponse.redirect(new URL('/crear-organizacion', request.url))
  }

  // Solo owner/admin pueden conectar integraciones
  if (!['owner', 'admin'].includes(membership.role)) {
    return NextResponse.redirect(
      new URL('/configuracion/integraciones?error=unauthorized', request.url)
    )
  }

  // Construir state — codifica orgId + source + userId
  const state = Buffer.from(
    JSON.stringify({
      orgId:  membership.organization_id,
      source,
      userId: user.id,
    })
  ).toString('base64url') // base64url es más seguro que base64 para URLs

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin

  // Construir URL OAuth de Google
  const params = new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID!,
    redirect_uri:  `${baseUrl}/api/oauth/google/callback`,
    response_type: 'code',
    scope:         [
      'openid',
      'email',
      'profile',
      SCOPES[source],
    ].join(' '),
    access_type:   'offline',   // necesario para obtener refresh_token
    prompt:        'consent',   // forzar pantalla de consentimiento para siempre obtener refresh_token
    state,
  })

  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`

  return NextResponse.redirect(googleAuthUrl)
}
