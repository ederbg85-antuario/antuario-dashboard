import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// GET /api/oauth/google-calendar/connect
//
// Inicia el flujo OAuth de Google Calendar para que el Agente IA pueda
// agendar reuniones con enlace de Google Meet en el calendario de Antuario.
//
// A diferencia de /api/oauth/google/connect (GA4, Ads, etc.), aquí NO hay
// "propiedad" que seleccionar: el callback activa la conexión directamente.

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events'

export async function GET(request: NextRequest) {
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
  if (!user) return NextResponse.redirect(new URL('/login', request.url))

  const { data: membership } = await supabase
    .from('memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!membership) return NextResponse.redirect(new URL('/crear-organizacion', request.url))

  if (!['owner', 'admin'].includes(membership.role)) {
    return NextResponse.redirect(
      new URL('/configuracion/integraciones?error=unauthorized', request.url)
    )
  }

  const state = Buffer.from(
    JSON.stringify({ orgId: membership.organization_id, userId: user.id, source: 'google_calendar' })
  ).toString('base64url')

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin

  const params = new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID!,
    redirect_uri:  `${baseUrl}/api/oauth/google-calendar/callback`,
    response_type: 'code',
    scope:         ['openid', 'email', 'profile', CALENDAR_SCOPE].join(' '),
    access_type:   'offline',
    prompt:        'consent',
    state,
  })

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
}
