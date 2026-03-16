// GET /api/chatwoot/conversations?page=1&status=open|resolved|pending
// Proxy que lista conversaciones desde Chatwoot usando las credenciales de la organización del usuario.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient }        from '@supabase/ssr'
import { createClient }              from '@supabase/supabase-js'
import { cookies }                   from 'next/headers'

export async function GET(req: NextRequest) {
  try {
    // ── Auth ─────────────────────────────────────────────────────────────────
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(s) { try { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {} },
        },
      }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    // ── Org ───────────────────────────────────────────────────────────────────
    const { data: membership } = await supabase
      .from('memberships')
      .select('organization_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!membership) return NextResponse.json({ error: 'Sin organización' }, { status: 403 })
    const orgId = membership.organization_id

    // ── Chatwoot credentials ──────────────────────────────────────────────────
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data: cw } = await admin
      .from('chatwoot_connections')
      .select('base_url, account_id, api_access_token')
      .eq('organization_id', orgId)
      .maybeSingle()

    if (!cw) return NextResponse.json({ error: 'Chatwoot no configurado', not_configured: true }, { status: 404 })

    // ── Proxy to Chatwoot ─────────────────────────────────────────────────────
    const { searchParams } = new URL(req.url)
    const page     = searchParams.get('page')     ?? '1'
    const status   = searchParams.get('status')   ?? 'open'
    const search   = searchParams.get('search')   ?? ''
    const assignee = searchParams.get('assignee') ?? ''

    const qs = new URLSearchParams({ page, status })
    if (search)   qs.set('q', search)
    if (assignee) qs.set('assignee_type', assignee)

    const url = `${cw.base_url}/api/v1/accounts/${cw.account_id}/conversations?${qs}`
    const res = await fetch(url, {
      headers: {
        'api_access_token': cw.api_access_token,
        'Content-Type':     'application/json',
      },
      cache: 'no-store',
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return NextResponse.json({ error: err?.message ?? 'Chatwoot error', status: res.status }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (e) {
    console.error('[chatwoot/conversations] error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
