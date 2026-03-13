import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// POST /api/marketing/sync
// Body: { connection_id: string }
// Dispara un sync manual de una conexión específica

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

  // Verificar auth
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ message: 'No autorizado' }, { status: 401 })
  }

  const body = await request.json()
  const { connection_id } = body

  if (!connection_id) {
    return NextResponse.json({ message: 'connection_id requerido' }, { status: 400 })
  }

  // Verificar que la conexión pertenece a una org del usuario
  const { data: connection } = await supabase
    .from('marketing_connections')
    .select('id, source, organization_id')
    .eq('id', connection_id)
    .eq('status', 'active')
    .maybeSingle()

  if (!connection) {
    return NextResponse.json({ message: 'Conexión no encontrada' }, { status: 404 })
  }

  // Verificar membership
  const { data: membership } = await supabase
    .from('memberships')
    .select('role')
    .eq('user_id', user.id)
    .eq('organization_id', connection.organization_id)
    .eq('status', 'active')
    .maybeSingle()

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ message: 'Sin permisos' }, { status: 403 })
  }

  // Invocar Edge Function de Supabase para el sync.
  // Nueva función unificada: google-sync-data
  try {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const today = new Date()

    const fmt = (d: Date) => d.toISOString().split('T')[0]

    const syncBody = {
      connection_id: connection.id,
      source:        connection.source,
      date_from:     fmt(yesterday),
      date_to:       fmt(today),
      manual:        true,
    }

    const { data: fnData, error: fnError } = await supabase.functions.invoke(
      'google-sync-data',
      { body: syncBody }
    )

    if (fnError) {
      console.error('[sync] google-sync-data Edge Function error:', fnError)
      return NextResponse.json({
        message: 'Sync iniciado con advertencia. Puede tardar unos minutos en completarse.',
        warning: fnError.message,
      })
    }

    return NextResponse.json({
      message: 'Sync iniciado exitosamente con google-sync-data',
      data:    fnData,
    })

  } catch (err) {
    console.error('[sync] Dispatch error:', err)
    return NextResponse.json(
      { message: 'Error al iniciar sync. Intenta de nuevo.' },
      { status: 500 }
    )
  }
}
