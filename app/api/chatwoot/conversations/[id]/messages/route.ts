// GET  /api/chatwoot/conversations/[id]/messages  — lista mensajes
// POST /api/chatwoot/conversations/[id]/messages  — envía mensaje

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient }        from '@supabase/ssr'
import { cookies }                   from 'next/headers'

function getChatwootCreds() {
  const baseUrl   = process.env.CHATWOOT_BASE_URL?.replace(/\/$/, '')
  const accountId = process.env.CHATWOOT_ACCOUNT_ID
  const token     = process.env.CHATWOOT_API_TOKEN
  if (!baseUrl || !accountId || !token) return null
  return { base_url: baseUrl, account_id: accountId, api_access_token: token }
}

// ── GET: mensajes de una conversación ─────────────────────────────────────────
export async function GET(
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

    const cw = getChatwootCreds()
    if (!cw) return NextResponse.json({ error: 'Chatwoot no configurado', not_configured: true }, { status: 404 })

    const url = `${cw.base_url}/api/v1/accounts/${cw.account_id}/conversations/${id}/messages`
    const res = await fetch(url, {
      headers: { 'api_access_token': cw.api_access_token },
      cache: 'no-store',
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

// ── POST: enviar mensaje ───────────────────────────────────────────────────────
export async function POST(
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

    const cw = getChatwootCreds()
    if (!cw) return NextResponse.json({ error: 'Chatwoot no configurado', not_configured: true }, { status: 404 })

    const body = await req.json()
    const url  = `${cw.base_url}/api/v1/accounts/${cw.account_id}/conversations/${id}/messages`
    const res  = await fetch(url, {
      method: 'POST',
      headers: {
        'api_access_token': cw.api_access_token,
        'Content-Type':     'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return NextResponse.json({ error: err?.message ?? 'Error al enviar' }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
