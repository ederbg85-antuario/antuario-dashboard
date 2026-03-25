import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

// POST /api/admin/invite
// Body: { email: string, organization_name?: string }
// Solo accesible por el super admin (SUPER_ADMIN_EMAIL en env vars)

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

  // Solo el super admin puede crear invitaciones
  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL
  if (!superAdminEmail || user.email !== superAdminEmail) {
    return NextResponse.json({ message: 'Sin permisos' }, { status: 403 })
  }

  const body = await request.json()
  const { email, organization_name } = body

  if (!email) {
    return NextResponse.json({ message: 'Email requerido' }, { status: 400 })
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Cancelar invitaciones pendientes anteriores para este email
  await adminClient
    .from('invitations')
    .update({ status: 'expired' })
    .eq('email', email.toLowerCase())
    .eq('status', 'pending')

  // Crear nueva invitaci�n
  const { data: invitation, error } = await adminClient
    .from('invitations')
    .insert({
      email:             email.toLowerCase(),
      organization_name: organization_name ?? null,
      invited_by:        user.id,
      status:            'pending',
      expires_at:        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select('token')
    .single()

  if (error || !invitation) {
    console.error('[invite] Error creating invitation:', error)
    return NextResponse.json({ message: 'Error al crear la invitaci�n' }, { status: 500 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://dashboard.antuario.mx'
  const inviteUrl = `${baseUrl}/registro?token=${invitation.token}`

  return NextResponse.json({ ok: true, invite_url: inviteUrl, token: invitation.token })
}

// GET /api/admin/invite?token=xxx  validar token (usado por la p�gina de registro)
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')

  if (!token) {
    return NextResponse.json({ valid: false, message: 'Token requerido' }, { status: 400 })
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: invitation } = await adminClient
    .from('invitations')
    .select('email, organization_name, status, expires_at')
    .eq('token', token)
    .maybeSingle()

  if (!invitation) {
    return NextResponse.json({ valid: false, message: 'Invitaci�n no encontrada' }, { status: 404 })
  }

  if (invitation.status !== 'pending') {
    return NextResponse.json({ valid: false, message: 'Esta invitaci�n ya fue usada o expir�' }, { status: 410 })
  }

  if (new Date(invitation.expires_at) < new Date()) {
    await adminClient.from('invitations').update({ status: 'expired' }).eq('token', token)
    return NextResponse.json({ valid: false, message: 'Esta invitaci�n expir�' }, { status: 410 })
  }

  return NextResponse.json({
    valid:             true,
    email:             invitation.email,
    organization_name: invitation.organization_name,
  })
}

// PATCH /api/admin/invite  marcar token como aceptado tras registro exitoso
export async function PATCH(request: NextRequest) {
  const body = await request.json()
  const { token } = body

  if (!token) return NextResponse.json({ ok: false }, { status: 400 })

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  await adminClient
    .from('invitations')
    .update({ status: 'accepted' })
    .eq('token', token)
    .eq('status', 'pending')

  return NextResponse.json({ ok: true })
}
