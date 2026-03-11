import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

// POST /api/oauth/google/confirmar
// Body: { connection_id: string, property_id: string }
// Activa la conexión pending con la propiedad elegida por el usuario

// DELETE /api/oauth/google/confirmar
// Body: { connection_id: string }
// Cancela y elimina la conexión pending

// ─── Resolver nombre de propiedad por fuente ──────────────────────────────────

async function resolvePropertyName(
  source: string,
  propertyId: string,
  accessToken: string
): Promise<string> {
  try {
    if (source === 'search_console') {
      // Para Search Console el ID es la URL misma
      return propertyId
    }

    if (source === 'ga4') {
      const res = await fetch(
        `https://analyticsadmin.googleapis.com/v1beta/properties/${propertyId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      const data = await res.json()
      return data.displayName ?? propertyId
    }

    if (source === 'google_ads') {
      return `Cuenta Ads ${propertyId}`
    }

    if (source === 'gmb') {
      // El ID es el resource name completo (accounts/xxx/locations/yyy)
      return propertyId.split('/').pop() ?? propertyId
    }

    return propertyId
  } catch {
    return propertyId
  }
}

// ─── POST — Confirmar propiedad ───────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()

  // Verificar auth del usuario
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
  const { connection_id, property_id } = body

  if (!connection_id || !property_id) {
    return NextResponse.json({ message: 'connection_id y property_id son requeridos' }, { status: 400 })
  }

  // Admin client para leer el access_token
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Cargar la conexión pending
  const { data: connection } = await adminClient
    .from('marketing_connections')
    .select('id, source, access_token, connected_by, organization_id')
    .eq('id', connection_id)
    .eq('status', 'pending')
    .maybeSingle()

  if (!connection) {
    return NextResponse.json({ message: 'Sesión de conexión no encontrada o expirada' }, { status: 404 })
  }

  // Verificar que el usuario es quien inició el flujo
  if (connection.connected_by !== user.id) {
    return NextResponse.json({ message: 'No autorizado' }, { status: 403 })
  }

  // Resolver nombre legible de la propiedad
  const propertyName = await resolvePropertyName(
    connection.source,
    property_id,
    connection.access_token
  )

  // Si ya hay una conexión ACTIVA para esta org+source, actualizarla
  // y eliminar la pending — evita duplicados
  const { data: existingActive } = await adminClient
    .from('marketing_connections')
    .select('id')
    .eq('organization_id', connection.organization_id)
    .eq('source', connection.source)
    .eq('status', 'active')
    .maybeSingle()

  if (existingActive) {
    // Copiar tokens de la pending a la activa existente
    const { data: pendingFull } = await adminClient
      .from('marketing_connections')
      .select('access_token, refresh_token, token_expires_at')
      .eq('id', connection_id)
      .single()

    await adminClient
      .from('marketing_connections')
      .update({
        access_token:     pendingFull?.access_token,
        refresh_token:    pendingFull?.refresh_token,
        token_expires_at: pendingFull?.token_expires_at,
        external_id:      property_id,
        external_name:    propertyName,
        status:           'active',
        last_error:       null,
        updated_at:       new Date().toISOString(),
      })
      .eq('id', existingActive.id)

    // Eliminar la pending
    await adminClient
      .from('marketing_connections')
      .delete()
      .eq('id', connection_id)

  } else {
    // Activar la conexión pending directamente
    const { error: updateError } = await adminClient
      .from('marketing_connections')
      .update({
        status:        'active',
        external_id:   property_id,
        external_name: propertyName,
        last_error:    null,
        updated_at:    new Date().toISOString(),
      })
      .eq('id', connection_id)

    if (updateError) {
      console.error('Error activating connection:', updateError)
      return NextResponse.json(
        { message: `Error al guardar: ${updateError.message}` },
        { status: 500 }
      )
    }
  }

  return NextResponse.json({ ok: true, source: connection.source })
}

// ─── DELETE — Cancelar ────────────────────────────────────────────────────────

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
  if (!user) return NextResponse.json({ ok: true }) // silencioso

  const body = await request.json()
  const { connection_id } = body

  if (!connection_id) return NextResponse.json({ ok: true })

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Solo eliminar si es pending y del usuario
  await adminClient
    .from('marketing_connections')
    .delete()
    .eq('id', connection_id)
    .eq('status', 'pending')
    .eq('connected_by', user.id)

  return NextResponse.json({ ok: true })
}
