// GET /api/chatwoot/connection — devuelve si Chatwoot está configurado vía env vars
// Las credenciales se manejan centralmente en variables de entorno (no por organización)

import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

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

  const baseUrl = process.env.CHATWOOT_BASE_URL
  const accountId = process.env.CHATWOOT_ACCOUNT_ID
  const token = process.env.CHATWOOT_API_TOKEN

  if (!baseUrl || !accountId || !token) {
    return NextResponse.json({ connection: null })
  }

  // Devolvemos que está configurado (sin exponer el token)
  return NextResponse.json({
    connection: {
      base_url: baseUrl,
      account_id: Number(accountId),
      connected_at: null,
    }
  })
}
