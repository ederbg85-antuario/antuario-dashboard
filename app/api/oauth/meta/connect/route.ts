import { createOAuthState } from '@/lib/oauth-state'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// GET /api/oauth/meta/connect?source=meta_ads | facebook | instagram
// Construye la URL OAuth de Meta (Facebook) y redirige al usuario

// Facebook Login: read-only page/Instagram insights. No publishing or message permissions.
const META_SCOPES: Record<string, string[]> = {
  meta_ads: [
    'ads_read',
    'business_management',
    'pages_show_list',
  ],
  facebook: [
    'pages_show_list',
    'pages_read_engagement',
  ],
  instagram: [
    'pages_show_list',
    'pages_read_engagement',
    'instagram_basic',
    'instagram_manage_insights',
  ],
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const source = searchParams.get('source')

  if (!source || !META_SCOPES[source]) {
    return NextResponse.json(
      { error: `source inválido. Debe ser: ${Object.keys(META_SCOPES).join(', ')}` },
      { status: 400 }
    )
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

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin

  // Codificar state con orgId, source, userId (mismo patrón que Google)
  const state = await createOAuthState('meta', {orgId:membership.organization_id,source,userId:user.id})

  const params = new URLSearchParams({
    client_id:     process.env.META_APP_ID!,
    redirect_uri:  `${baseUrl}/api/oauth/meta/callback`,
    scope:         META_SCOPES[source].join(','),
    response_type: 'code',
    state,
  })

  const metaAuthUrl = `https://www.facebook.com/v21.0/dialog/oauth?${params}`
  return NextResponse.redirect(metaAuthUrl)
}
