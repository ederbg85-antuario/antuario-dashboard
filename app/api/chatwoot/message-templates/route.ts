// GET /api/chatwoot/message-templates
// Lista las plantillas de WhatsApp aprobadas para la bandeja de la organización.

import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function GET() {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(values) {
            try {
              values.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
            } catch { /* Server Components cannot always write cookies. */ }
          },
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

    if (!membership) return NextResponse.json({ error: 'Sin organización activa' }, { status: 403 })

    const baseUrl = process.env.CHATWOOT_BASE_URL?.replace(/\/$/, '')
    const accountId = process.env.CHATWOOT_ACCOUNT_ID
    const token = process.env.CHATWOOT_API_TOKEN
    if (!baseUrl || !accountId || !token) {
      return NextResponse.json({ error: 'Chatwoot no configurado', not_configured: true }, { status: 404 })
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data: organization } = await admin
      .from('organizations')
      .select('chatwoot_inbox_id')
      .eq('id', membership.organization_id)
      .maybeSingle()

    const inboxId = organization?.chatwoot_inbox_id
    if (!inboxId) {
      return NextResponse.json(
        { error: 'Bandeja de entrada no configurada para esta organización', inbox_not_configured: true },
        { status: 404 }
      )
    }

    const response = await fetch(
      `${baseUrl}/api/v1/accounts/${accountId}/inboxes/${inboxId}/message_templates`,
      {
        headers: { api_access_token: token, 'Content-Type': 'application/json' },
        cache: 'no-store',
      }
    )

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      return NextResponse.json(
        { error: error?.message ?? 'No se pudieron cargar las plantillas de WhatsApp' },
        { status: response.status }
      )
    }

    const data = await response.json()
    const templates = Array.isArray(data?.payload) ? data.payload : []

    return NextResponse.json({
      templates,
      last_sync_attempt_at: data?.meta?.last_sync_attempt_at ?? null,
    })
  } catch (error) {
    console.error('[chatwoot/message-templates] GET error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
