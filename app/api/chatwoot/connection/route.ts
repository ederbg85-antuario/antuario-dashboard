// GET  /api/chatwoot/connection  — obtener config actual
// POST /api/chatwoot/connection  — guardar / actualizar config
// DELETE /api/chatwoot/connection — desconectar

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient }        from '@supabase/ssr'
import { createClient }              from '@supabase/supabase-js'
import { cookies }                   from 'next/headers'

async function authAndOrg() {
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
  if (!user) return { error: 'No autenticado', status: 401 as const }

  const { data: membership } = await supabase
    .from('memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!membership) return { error: 'Sin organización', status: 403 as const }
  return { user, membership }
}

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET() {
  const ctx = await authAndOrg()
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data } = await admin
    .from('chatwoot_connections')
    .select('id, base_url, account_id, connected_at')
    .eq('organization_id', ctx.membership.organization_id)
    .maybeSingle()

  // No exponemos api_access_token en GET
  return NextResponse.json({ connection: data ?? null })
}

// ── POST — guardar / actualizar ───────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const ctx = await authAndOrg()
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })

  if (!['owner', 'admin'].includes(ctx.membership.role)) {
    return NextResponse.json({ error: 'Solo owners/admins pueden configurar Chatwoot' }, { status: 403 })
  }

  const { base_url, account_id, api_access_token } = await req.json()

  if (!base_url || !account_id) {
    return NextResponse.json({ error: 'Faltan campos requeridos: base_url, account_id' }, { status: 400 })
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Si no se envió token, usar el token existente (solo al actualizar)
  let tokenToSave: string = api_access_token ?? ''
  if (!tokenToSave) {
    const { data: existing } = await admin
      .from('chatwoot_connections')
      .select('api_access_token')
      .eq('organization_id', ctx.membership.organization_id)
      .maybeSingle()
    if (!existing?.api_access_token) {
      return NextResponse.json({ error: 'Se requiere el API Access Token para conectar por primera vez.' }, { status: 400 })
    }
    tokenToSave = existing.api_access_token
  }

  // Verificar que las credenciales son válidas antes de guardar
  const cleanUrl = base_url.replace(/\/$/, '')
  try {
    const testRes = await fetch(`${cleanUrl}/api/v1/profile`, {
      headers: { 'api_access_token': tokenToSave },
    })
    if (!testRes.ok && testRes.status === 404) {
      return NextResponse.json({ error: 'No se pudo conectar con Chatwoot. Verifica la URL.' }, { status: 400 })
    }
    // 401 significa URL correcta pero token inválido
    if (testRes.status === 401) {
      return NextResponse.json({ error: 'Token inválido. Verifica tu API Access Token en Chatwoot.' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: 'No se pudo conectar con Chatwoot. Verifica la URL.' }, { status: 400 })
  }

  const { error } = await admin
    .from('chatwoot_connections')
    .upsert({
      organization_id:  ctx.membership.organization_id,
      base_url:         cleanUrl,
      account_id:       Number(account_id),
      api_access_token: tokenToSave,
      connected_by:     ctx.user.id,
      updated_at:       new Date().toISOString(),
    }, { onConflict: 'organization_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// ── DELETE — desconectar ──────────────────────────────────────────────────────
export async function DELETE() {
  const ctx = await authAndOrg()
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })

  if (!['owner', 'admin'].includes(ctx.membership.role)) {
    return NextResponse.json({ error: 'Solo owners/admins pueden desconectar Chatwoot' }, { status: 403 })
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  await admin
    .from('chatwoot_connections')
    .delete()
    .eq('organization_id', ctx.membership.organization_id)

  return NextResponse.json({ ok: true })
}
