// POST /api/chatwoot/conversations/[id]/labels
// Actualiza las etiquetas de una conversación.
// Si viene contact_id, sincroniza contact_type en Antuario si alguna etiqueta mapea.

import { NextRequest, NextResponse }          from 'next/server'
import { createServerClient }                 from '@supabase/ssr'
import { createClient }                       from '@supabase/supabase-js'
import { cookies }                            from 'next/headers'
import { LABEL_TO_CONTACT_TYPE }              from '@/app/api/contacts/chatwoot-sync/route'
import { isDemoUser }                         from '@/lib/demo-data'

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
          getAll()  { return cookieStore.getAll() },
          setAll(s) { try { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {} },
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    // ── Demo mode ────────────────────────────────────────────────────────────
    if (isDemoUser(user.id)) {
      const body = await req.json()
      return NextResponse.json({ payload: body.labels ?? [] })
    }

    const { data: membership } = await supabase
      .from('memberships')
      .select('organization_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!membership) return NextResponse.json({ error: 'Sin organización' }, { status: 403 })

    const body = await req.json()
    const { labels, contact_id }: { labels: string[]; contact_id?: number } = body

    if (!Array.isArray(labels)) {
      return NextResponse.json({ error: 'labels debe ser un array' }, { status: 400 })
    }

    const baseUrl   = process.env.CHATWOOT_BASE_URL?.replace(/\/$/, '')
    const accountId = process.env.CHATWOOT_ACCOUNT_ID
    const token     = process.env.CHATWOOT_API_TOKEN

    if (!baseUrl || !accountId || !token) {
      return NextResponse.json({ error: 'Mensajería no configurada' }, { status: 404 })
    }

    // Actualizar etiquetas en Chatwoot
    const res = await fetch(
      `${baseUrl}/api/v1/accounts/${accountId}/conversations/${id}/labels`,
      {
        method:  'POST',
        headers: { 'api_access_token': token, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ labels }),
      }
    )

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return NextResponse.json({ error: err?.message ?? 'Error al actualizar etiquetas' }, { status: res.status })
    }

    const data = await res.json()

    // Sincronización inversa: Chatwoot label → Antuario contact_type
    if (contact_id) {
      const matchedType = labels
        .map(l => LABEL_TO_CONTACT_TYPE[l])
        .filter(Boolean)[0]

      if (matchedType) {
        const admin = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { autoRefreshToken: false, persistSession: false } }
        )
        await admin
          .from('contacts')
          .update({ contact_type: matchedType })
          .eq('id', contact_id)
          .eq('organization_id', membership.organization_id)
      }
    }

    return NextResponse.json(data)
  } catch (e) {
    console.error('[chatwoot/conversations/labels POST]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
