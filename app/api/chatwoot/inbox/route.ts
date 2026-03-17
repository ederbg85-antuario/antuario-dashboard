// GET  /api/chatwoot/inbox  → devuelve el chatwoot_inbox_id de la org actual
// PATCH /api/chatwoot/inbox  → actualiza el chatwoot_inbox_id (solo owner/admin)

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient }        from '@supabase/ssr'
import { createClient }              from '@supabase/supabase-js'
import { cookies }                   from 'next/headers'

async function getAuthAndOrg(req?: NextRequest) {
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
  if (!user) return { error: 'No autenticado', status: 401 }

  const { data: membership } = await supabase
    .from('memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!membership) return { error: 'Sin organización activa', status: 403 }

  return { user, membership, supabase }
}

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET() {
  try {
    const ctx = await getAuthAndOrg()
    if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
    const { membership } = ctx

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data: orgData } = await admin
      .from('organizations')
      .select('chatwoot_inbox_id')
      .eq('id', membership.organization_id)
      .maybeSingle()

    return NextResponse.json({
      inbox_id:     orgData?.chatwoot_inbox_id ?? null,
      org_id:       membership.organization_id,
      is_configured: !!orgData?.chatwoot_inbox_id,
    })
  } catch (e) {
    console.error('[chatwoot/inbox] GET error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// ── PATCH ─────────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const ctx = await getAuthAndOrg(req)
    if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
    const { membership } = ctx

    // Solo owner o admin pueden cambiar el inbox
    if (!['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Sin permisos. Solo owner o admin pueden configurar la bandeja.' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const inboxId = body.inbox_id

    // Validar: debe ser número entero positivo o null para desasignar
    if (inboxId !== null && inboxId !== undefined) {
      const n = Number(inboxId)
      if (!Number.isInteger(n) || n <= 0) {
        return NextResponse.json({ error: 'inbox_id debe ser un número entero positivo' }, { status: 400 })
      }
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { error } = await admin
      .from('organizations')
      .update({ chatwoot_inbox_id: inboxId ?? null })
      .eq('id', membership.organization_id)

    if (error) {
      console.error('[chatwoot/inbox] PATCH DB error:', error)
      return NextResponse.json({ error: 'Error al guardar la configuración' }, { status: 500 })
    }

    return NextResponse.json({
      ok:       true,
      inbox_id: inboxId ?? null,
      message:  inboxId ? `Bandeja #${inboxId} configurada correctamente` : 'Bandeja desasignada',
    })
  } catch (e) {
    console.error('[chatwoot/inbox] PATCH error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
