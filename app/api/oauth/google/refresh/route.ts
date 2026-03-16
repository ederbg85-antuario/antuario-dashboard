import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

// POST /api/oauth/google/refresh
// Body: { connection_id: string }
// Renueva el access_token usando el refresh_token almacenado.
// No requiere que el usuario vuelva a autorizar con Google.

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(s) {
          try { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ message: 'No autorizado' }, { status: 401 })
  }

  const body = await request.json()
  const { connection_id } = body

  if (!connection_id) {
    return NextResponse.json({ message: 'connection_id requerido' }, { status: 400 })
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Leer la conexión con su refresh_token
  const { data: conn, error: connError } = await adminClient
    .from('marketing_connections')
    .select('id, source, refresh_token, organization_id, status')
    .eq('id', connection_id)
    .in('status', ['active', 'error'])
    .maybeSingle()

  if (connError || !conn) {
    return NextResponse.json({ message: 'Conexión no encontrada' }, { status: 404 })
  }

  // Verificar que el usuario pertenece a la org
  const { data: membership } = await supabase
    .from('memberships')
    .select('role')
    .eq('user_id', user.id)
    .eq('organization_id', conn.organization_id)
    .eq('status', 'active')
    .maybeSingle()

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ message: 'Sin permisos' }, { status: 403 })
  }

  if (!conn.refresh_token) {
    return NextResponse.json(
      { message: 'No hay refresh_token almacenado. Debes reconectar la integración.' },
      { status: 422 }
    )
  }

  // Llamar a Google para renovar el access_token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: conn.refresh_token,
      grant_type:    'refresh_token',
    }),
  })

  if (!tokenRes.ok) {
    const err = await tokenRes.json()
    console.error('[refresh] Google token refresh failed:', err)

    // Si Google responde invalid_grant, el refresh_token fue revocado
    if (err.error === 'invalid_grant') {
      await adminClient
        .from('marketing_connections')
        .update({ status: 'error', last_error: 'Refresh token revocado. Reconecta la integración.' })
        .eq('id', connection_id)

      return NextResponse.json(
        { message: 'El token fue revocado por Google. Debes reconectar la integración.', code: 'invalid_grant' },
        { status: 401 }
      )
    }

    return NextResponse.json(
      { message: `Error de Google: ${err.error_description ?? err.error ?? 'desconocido'}` },
      { status: 502 }
    )
  }

  const { access_token, expires_in } = await tokenRes.json()
  const newExpiresAt = new Date(Date.now() + (expires_in ?? 3600) * 1000).toISOString()

  // Actualizar la conexión con el nuevo access_token y token_expires_at
  const { error: updateError } = await adminClient
    .from('marketing_connections')
    .update({
      access_token,
      token_expires_at: newExpiresAt,
      status:           'active',
      last_error:       null,
      updated_at:       new Date().toISOString(),
    })
    .eq('id', connection_id)

  if (updateError) {
    console.error('[refresh] Error updating token in DB:', updateError)
    return NextResponse.json({ message: 'Error al guardar el token renovado' }, { status: 500 })
  }

  return NextResponse.json({
    ok:              true,
    token_expires_at: newExpiresAt,
  })
}
