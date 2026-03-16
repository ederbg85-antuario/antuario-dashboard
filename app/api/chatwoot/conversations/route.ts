// GET /api/chatwoot/conversations?page=1&status=open|resolved|pending
// Usa credenciales globales desde variables de entorno (multi-tenant vía inbox_id por org)

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

    // ── Credenciales desde env vars ───────────────────────────────────────────
    const baseUrl   = process.env.CHATWOOT_BASE_URL?.replace(/\/$/, '')
    const accountId = process.env.CHATWOOT_ACCOUNT_ID
    const token     = process.env.CHATWOOT_API_TOKEN

    if (!baseUrl || !accountId || !token) {
      return NextResponse.json({ error: 'Chatwoot no configurado', not_configured: true }, { status: 404 })
    }

    // ── Inbox por organización (multi-tenant) ─────────────────────────────────
    // Si la org tiene un inbox_id asignado, filtramos por él. Si no, mostramos todo.
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data: orgData } = await admin
      .from('organizations')
      .select('chatwoot_inbox_id')
      .eq('id', orgId)
      .maybeSingle()

    // ── Proxy to Chatwoot ─────────────────────────────────────────────────────
    const { searchParams } = new URL(req.url)
    const page     = searchParams.get('page')     ?? '1'
    const status   = searchParams.get('status')   ?? 'open'
    const search   = searchParams.get('search')   ?? ''
    const assignee = searchParams.get('assignee') ?? ''

    const qs = new URLSearchParams({ page, status })
    if (search)   qs.set('q', search)
    if (assignee) qs.set('assignee_type', assignee)

    // Filtrar por inbox si la organización tiene uno asignado
    const inboxId = orgData?.chatwoot_inbox_id
    if (inboxId) qs.set('inbox_id', String(inboxId))

    const url = `${baseUrl}/api/v1/accounts/${accountId}/conversations?${qs}`
    const res = await fetch(url, {
      headers: {
        'api_access_token': token,
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
