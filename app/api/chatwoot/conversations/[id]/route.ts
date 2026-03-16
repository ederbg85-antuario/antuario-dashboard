// PATCH /api/chatwoot/conversations/[id]  — actualizar estado (resolve, reopen, assign)

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient }        from '@supabase/ssr'
import { cookies }                   from 'next/headers'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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

    const { data: membership } = await supabase
      .from('memberships')
      .select('organization_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!membership) return NextResponse.json({ error: 'Sin organización' }, { status: 403 })

    // ── Credenciales desde env vars ───────────────────────────────────────────
    const baseUrl   = process.env.CHATWOOT_BASE_URL?.replace(/\/$/, '')
    const accountId = process.env.CHATWOOT_ACCOUNT_ID
    const token     = process.env.CHATWOOT_API_TOKEN

    if (!baseUrl || !accountId || !token) {
      return NextResponse.json({ error: 'Chatwoot no configurado' }, { status: 404 })
    }

    const body = await req.json()
    const url  = `${baseUrl}/api/v1/accounts/${accountId}/conversations/${id}`
    const res  = await fetch(url, {
      method: 'PATCH',
      headers: {
        'api_access_token': token,
        'Content-Type':     'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return NextResponse.json({ error: err?.message ?? 'Chatwoot error' }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
