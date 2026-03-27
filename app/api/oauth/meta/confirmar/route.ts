import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

// POST /api/oauth/meta/confirmar
// Body: { connection_id: string, account_id: string, account_name: string }
// Activa la conexión pending con la cuenta publicitaria/página elegida

// DELETE /api/oauth/meta/confirmar
// Body: { connection_id: string }
// Cancela y elimina la conexión pending

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
  const { connection_id, account_id, account_name } = body

  if (!connection_id || !account_id) {
    return NextResponse.json(
      { message: 'connection_id y account_id son requeridos' },
      { status: 400 }
    )
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Verificar que la conexión pending existe y pertenece al usuario
  const { data: connection } = await adminClient
    .from('marketing_connections')
    .select('id, source, connected_by, organization_id, access_token, token_expires_at')
    .eq('id', connection_id)
    .eq('status', 'pending')
    .maybeSingle()

  if (!connection) {
    return NextResponse.json(
      { message: 'Sesión de conexión no encontrada o expirada' },
      { status: 404 }
    )
  }

  if (connection.connected_by !== user.id) {
    return NextResponse.json({ message: 'No autorizado' }, { status: 403 })
  }

  // Si ya existe una conexión ACTIVA para esta org+source, actualizarla
  const { data: existingActive } = await adminClient
    .from('marketing_connections')
    .select('id')
    .eq('organization_id', connection.organization_id)
    .eq('source', connection.source)
    .eq('status', 'active')
    .maybeSingle()

  const { data: pendingFull } = await adminClient
    .from('marketing_connections')
    .select('access_token, refresh_token, token_expires_at')
    .eq('id', connection_id)
    .single()

  if (existingActive) {
    await adminClient
      .from('marketing_connections')
      .update({
        access_token:     pendingFull?.access_token,
        refresh_token:    pendingFull?.refresh_token,
        token_expires_at: pendingFull?.token_expires_at,
        external_id:      account_id,
        external_name:    account_name ?? account_id,
        status:           'active',
        last_error:       null,
        updated_at:       new Date().toISOString(),
      })
      .eq('id', existingActive.id)

    await adminClient
      .from('marketing_connections')
      .delete()
      .eq('id', connection_id)

    return NextResponse.json({
      ok: true,
      source: connection.source,
      active_connection_id: existingActive.id,
    })
  } else {
    const { error: updateError } = await adminClient
      .from('marketing_connections')
      .update({
        status:        'active',
        external_id:   account_id,
        external_name: account_name ?? account_id,
        last_error:    null,
        updated_at:    new Date().toISOString(),
      })
      .eq('id', connection_id)

    if (updateError) {
      return NextResponse.json(
        { message: `Error al guardar: ${updateError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      ok: true,
      source: connection.source,
      active_connection_id: connection_id,
    })
  }
}

export async function DELETE(request: NextRequest) {
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
  if (!user) return NextResponse.json({ ok: true })

  const body = await request.json()
  const { connection_id } = body
  if (!connection_id) return NextResponse.json({ ok: true })

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  await adminClient
    .from('marketing_connections')
    .delete()
    .eq('id', connection_id)
    .eq('status', 'pending')
    .eq('connected_by', user.id)

  return NextResponse.json({ ok: true })
}
