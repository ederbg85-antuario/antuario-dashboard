// GET  /api/chatwoot/conversations/[id]/messages  — lista mensajes
// POST /api/chatwoot/conversations/[id]/messages  — envía mensaje

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient }        from '@supabase/ssr'
import { cookies }                   from 'next/headers'
import { isDemoUser, getDemoMessages } from '@/lib/demo-data'

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

    // ── Demo mode ────────────────────────────────────────────────────────────
    if (isDemoUser(user.id)) {
      return NextResponse.json(getDemoMessages(Number(id)))
    }

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

    // ── Demo mode: simulate sending ──────────────────────────────────────────
    if (isDemoUser(user.id)) {
      const body = await req.json()
      return NextResponse.json({
        id: Date.now(),
        content: body.content ?? '',
        message_type: 1,
        created_at: Math.floor(Date.now() / 1000),
        sender: { name: 'Carlos Mendoza', avatar_url: null },
      })
    }

    const cw = getChatwootCreds()
    if (!cw) return NextResponse.json({ error: 'Chatwoot no configurado', not_configured: true }, { status: 404 })

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'El mensaje no tiene un formato válido' }, { status: 400 })
    }

    // Los envíos con plantilla salen siempre como mensajes públicos del agente.
    // Validar aquí evita que el cliente pueda alterar el tipo de mensaje o enviar
    // una plantilla incompleta directamente contra el proxy.
    let payload = body
    if (body.template_params) {
      const template = body.template_params
      const hasRequiredTemplateData =
        typeof body.content === 'string' && body.content.trim().length > 0 &&
        typeof template.name === 'string' && template.name.trim().length > 0 &&
        typeof template.language === 'string' && template.language.trim().length > 0 &&
        typeof template.category === 'string' && template.category.trim().length > 0

      if (!hasRequiredTemplateData) {
        return NextResponse.json({ error: 'La plantilla seleccionada está incompleta' }, { status: 400 })
      }

      payload = {
        content: body.content.trim(),
        message_type: 'outgoing',
        private: false,
        content_type: 'text',
        template_params: {
          name: template.name.trim(),
          language: template.language.trim(),
          category: template.category.trim(),
          processed_params: template.processed_params ?? {},
        },
      }
    }
    const url  = `${cw.base_url}/api/v1/accounts/${cw.account_id}/conversations/${id}/messages`
    const res  = await fetch(url, {
      method: 'POST',
      headers: {
        'api_access_token': cw.api_access_token,
        'Content-Type':     'application/json',
      },
      body: JSON.stringify(payload),
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
